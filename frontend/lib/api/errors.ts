/**
 * Standardized API error envelope and error code catalog.
 * All API routes must use these helpers instead of ad-hoc { error: "..." } objects.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorrelationId } from './correlation';

// ── Error code catalog ────────────────────────────────────────────────────────

export const ErrorCode = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_FIELDS: 'MISSING_FIELDS',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  // 401
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  // 409
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 500
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Envelope types ────────────────────────────────────────────────────────────

export interface ApiErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    correlationId: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a standardized error response.
 * Never leaks stack traces or internal details to the client.
 */
export function apiError(
  request: NextRequest,
  status: number,
  code: ErrorCode,
  message: string,
  extraHeaders?: Record<string, string>,
): NextResponse<ApiErrorEnvelope> {
  const correlationId = getCorrelationId(request);
  const body: ApiErrorEnvelope = { error: { code, message, correlationId } };
  const res = NextResponse.json(body, { status });
  res.headers.set('X-Correlation-Id', correlationId);
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) res.headers.set(k, v);
  }
  return res;
}

/**
 * Attach correlation ID header to any successful response.
 */
export function withCorrelationId(request: NextRequest, response: NextResponse): NextResponse {
  response.headers.set('X-Correlation-Id', getCorrelationId(request));
  return response;
}
