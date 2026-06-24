import { createHmac } from 'crypto';
import type { Webhook, WebhookPayload, WebhookDeliveryAttempt } from './types';
import { recordDeliveryAttempt, updateWebhookDelivery } from './storage';
import {
  WEBHOOK_MAX_RETRY_ATTEMPTS,
  WEBHOOK_INITIAL_BACKOFF_MS,
  WEBHOOK_MAX_BACKOFF_MS,
  WEBHOOK_REQUEST_TIMEOUT_MS,
  WEBHOOK_MAX_PAYLOAD_SIZE,
  WEBHOOK_RETRYABLE_STATUS_CODES,
  WEBHOOK_BACKOFF_JITTER,
} from './config';

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(payload: WebhookPayload, secret: string): string {
  const payloadString = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(payloadString).digest('hex');
  return signature;
}

/**
 * Verify webhook signature (for testing/validation)
 */
export function verifyWebhookSignature(
  payload: WebhookPayload,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret);
  // Use timing-safe comparison to prevent timing attacks
  return compareStrings(signature, expectedSignature);
}

/**
 * Timing-safe string comparison
 */
function compareStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Calculate exponential backoff with jitter
 * Allows custom max retries through the retryPolicy parameter
 */
export function calculateBackoffDelay(attemptNumber: number, _maxRetries?: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, then cap at max
  const exponentialDelay = WEBHOOK_INITIAL_BACKOFF_MS * Math.pow(2, attemptNumber - 1);
  const cappedDelay = Math.min(exponentialDelay, WEBHOOK_MAX_BACKOFF_MS);

  // Add random jitter (±WEBHOOK_BACKOFF_JITTER)
  const jitter = cappedDelay * WEBHOOK_BACKOFF_JITTER * (Math.random() - 0.5);
  return Math.round(cappedDelay + jitter);
}

export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  nextRetryIn?: number;
}

/**
 * Send a webhook payload to a single webhook URL
 * Returns whether the delivery was successful
 */
export async function sendWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
  attemptNumber: number = 1,
  subscriptionId?: string,
  maxRetries?: number,
): Promise<DeliveryResult> {
  const effectiveMaxRetries = maxRetries ?? WEBHOOK_MAX_RETRY_ATTEMPTS;

  // Guard: reject oversized payloads before sending
  const payloadString = JSON.stringify(payload);
  if (payloadString.length > WEBHOOK_MAX_PAYLOAD_SIZE) {
    return {
      success: false,
      errorMessage: `Payload size ${payloadString.length} bytes exceeds limit of ${WEBHOOK_MAX_PAYLOAD_SIZE} bytes`,
    };
  }

  try {
    const signature = generateWebhookSignature(payload, webhook.secret);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': String(payload.timestamp),
        'X-Webhook-ID': payload.id,
      },
      body: payloadString,
      signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
    });

    const success = response.ok;
    // Only schedule a retry for retryable status codes (e.g. 429, 5xx)
    const isRetryable = WEBHOOK_RETRYABLE_STATUS_CODES.includes(response.status);
    const shouldRetry = !success && isRetryable && attemptNumber < effectiveMaxRetries;
    const nextRetryIn = shouldRetry ? calculateBackoffDelay(attemptNumber, maxRetries) : undefined;

    const deliveryAttempt: WebhookDeliveryAttempt = {
      webhookId: webhook.id,
      subscriptionId,
      payloadId: payload.id,
      status: success ? 'success' : shouldRetry ? 'pending' : 'failed',
      statusCode: response.status,
      attemptNumber,
      nextRetryAt: nextRetryIn !== undefined ? Date.now() + nextRetryIn : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await recordDeliveryAttempt(deliveryAttempt);
    await updateWebhookDelivery(webhook.id, response.status, success);

    if (success) {
      return { success: true, statusCode: response.status };
    }

    const errorText = await response.text().catch(() => '');
    return {
      success: false,
      statusCode: response.status,
      errorMessage: errorText || `HTTP ${response.status}`,
      nextRetryIn,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const shouldRetry = attemptNumber < effectiveMaxRetries;
    const nextRetryIn = shouldRetry ? calculateBackoffDelay(attemptNumber, maxRetries) : undefined;

    const deliveryAttempt: WebhookDeliveryAttempt = {
      webhookId: webhook.id,
      subscriptionId,
      payloadId: payload.id,
      status: shouldRetry ? 'pending' : 'failed',
      errorMessage,
      attemptNumber,
      nextRetryAt: nextRetryIn !== undefined ? Date.now() + nextRetryIn : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await recordDeliveryAttempt(deliveryAttempt);
    await updateWebhookDelivery(webhook.id, 0, false);

    return { success: false, errorMessage, nextRetryIn };
  }
}

/**
 * Broadcast a webhook payload to all active webhooks
 */
export async function broadcastWebhook(
  webhooks: Webhook[],
  payload: WebhookPayload,
): Promise<{
  successful: number;
  failed: number;
  details: Array<{
    webhookId: string;
    success: boolean;
    error?: string;
  }>;
}> {
  const activeWebhooks = webhooks.filter((w) => w.active);

  const results = await Promise.all(
    activeWebhooks.map(async (webhook) => {
      const result = await sendWebhook(webhook, payload);
      return {
        webhookId: webhook.id,
        success: result.success,
        error: result.errorMessage,
      };
    }),
  );

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return { successful, failed, details: results };
}
