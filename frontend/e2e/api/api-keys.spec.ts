/**
 * e2e/api/api-keys.spec.ts
 *
 * Contract tests for the API key lifecycle and its effect on the rest of the
 * public API:
 *   POST   /api/v1/api-keys          — issue a key
 *   GET    /api/v1/api-keys          — list keys (admin)
 *   GET    /api/v1/api-keys/[keyId]  — key details + usage
 *   DELETE /api/v1/api-keys/[keyId]  — revoke a key
 *
 * These endpoints are gated by the static INTERNAL_API_KEY (authenticateApiRequest),
 * while the keys they issue are registry-backed (authenticateRegistryKey) and are
 * asserted directly against two real protected routes:
 *   POST /api/v1/attestations   — requires 'auditor' tier or higher
 *   GET  /api/v1/events/export  — requires 'partner' tier or higher
 *
 * Covers:
 *   1. Issuance returns the plaintext key once; it is never returned again by GET.
 *   2. Tier enforcement against the two routes above (not mocked).
 *   3. Revocation invalidates a key for the very next request.
 *   4. Rate limiting is tracked per key and tied to the key's tier limit
 *      (API_KEY_TIER_LIMITS in apiKeyRegistry.ts): a lower tier hits its
 *      request-limit window sooner than a higher tier.
 */

import type { APIRequestContext } from '@playwright/test';
import { test, expect, ALLOWED_ORIGIN } from './helpers/setup';

const API_KEYS_ENDPOINT = '/api/v1/api-keys';
const ATTESTATIONS_ENDPOINT = '/api/v1/attestations';
const EVENTS_EXPORT_ENDPOINT = '/api/v1/events/export';
const KNOWN_PRODUCT_ID = 'prod-001';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Tier = 'partner' | 'internal' | 'auditor';

async function issueKey(
  request: APIRequestContext,
  internalKey: string,
  tier: Tier,
  namePrefix: string,
): Promise<{ keyId: string; key: string }> {
  const res = await request.post(API_KEYS_ENDPOINT, {
    headers: { 'x-api-key': internalKey, 'content-type': 'application/json' },
    data: {
      name: `${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tier,
      owner: 'e2e-api-keys-spec',
      description: 'Ephemeral key for the api-keys.spec.ts e2e suite',
      expiresInDays: 1,
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return { keyId: body.keyId, key: body.key };
}

function validAttestationBody(suffix = Date.now().toString(36)) {
  return {
    productId: KNOWN_PRODUCT_ID,
    issuerAddress: `GKEYSPEC${suffix}ABCDEFGHIJKLMNOPQRSTUVWXY`,
    issuerName: `E2E API-Keys Auditor ${suffix}`,
    trustLevel: 'verified',
    attestationType: 'audit',
    summary: `E2E api-keys tier check ${suffix}`,
    signedReference: `sha256:e2e-api-keys-ref-${suffix}`,
    expiresInDays: 30,
  };
}

/**
 * Fire `count` POSTs at ATTESTATIONS_ENDPOINT with `key`, each carrying a unique
 * x-forwarded-for value so the endpoint's own IP-based rate limiter (keyed by
 * client identity) never trips — isolating the per-key tier limit enforced
 * inside authenticateRegistryKey. No content-type/body is sent, so a request
 * that clears the tier limit deterministically fails validation (never 429)
 * while a request over the tier limit deterministically returns 429 — this
 * also avoids creating real attestation records for a 1000+ request burst.
 */
async function burstAuth(
  request: APIRequestContext,
  key: string,
  count: number,
  identityPrefix: string,
): Promise<{ status: number; retryAfter: string | null }[]> {
  const CONCURRENCY = 40;
  const results: { status: number; retryAfter: string | null }[] = [];

  for (let start = 0; start < count; start += CONCURRENCY) {
    const batchSize = Math.min(CONCURRENCY, count - start);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, offset) => {
        const n = start + offset;
        return request
          .post(ATTESTATIONS_ENDPOINT, {
            headers: {
              'x-api-key': key,
              'x-forwarded-for': `198.51.100.${n % 256}-${identityPrefix}-${Math.floor(n / 256)}`,
            },
          })
          .then((res) => ({
            status: res.status(),
            retryAfter: res.headers()['retry-after'] ?? null,
          }));
      }),
    );
    results.push(...batch);
  }

  return results;
}

// ── Issuance & plaintext-once ─────────────────────────────────────────────────

test.describe('POST /api/v1/api-keys — issuance', () => {
  test('201 issues a key and returns the plaintext key once', async ({ request, internalKey }) => {
    const res = await request.post(API_KEYS_ENDPOINT, {
      headers: {
        'x-api-key': internalKey,
        'content-type': 'application/json',
        origin: ALLOWED_ORIGIN,
      },
      data: {
        name: `e2e-issue-once-${Date.now()}`,
        tier: 'partner',
        owner: 'e2e-api-keys-spec',
      },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(typeof body.keyId).toBe('string');
    expect(body.key).toMatch(/^sl_partner_[0-9a-f]{64}$/);
    expect(body.tier).toBe('partner');

    expect(res.headers()['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers()['x-correlation-id']).toBeTruthy();
  });

  test('401 without internal-tier auth', async ({ request, apiKey }) => {
    const res = await request.post(API_KEYS_ENDPOINT, {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: { name: 'should-fail', tier: 'partner', owner: 'e2e' },
    });
    expect(res.status()).toBe(401);
  });

  test('plaintext key is never returned again by GET /api/v1/api-keys/[keyId]', async ({
    request,
    internalKey,
  }) => {
    const { keyId, key: plaintext } = await issueKey(request, internalKey, 'partner', 'e2e-noleak');

    const res = await request.get(`${API_KEYS_ENDPOINT}/${keyId}`, {
      headers: { 'x-api-key': internalKey },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.key).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(plaintext);
  });

  test('plaintext key is never leaked via GET /api/v1/api-keys (list)', async ({
    request,
    internalKey,
  }) => {
    const { key: plaintext } = await issueKey(request, internalKey, 'auditor', 'e2e-noleak-list');

    const res = await request.get(API_KEYS_ENDPOINT, {
      headers: { 'x-api-key': internalKey },
    });
    expect(res.status()).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain(plaintext);
  });
});

// ── Tier enforcement against real protected routes ────────────────────────────

test.describe('tier enforcement — real protected routes', () => {
  test('auditor-tier key succeeds on the auditor-tier-or-lower route', async ({
    request,
    internalKey,
  }) => {
    const { key } = await issueKey(request, internalKey, 'auditor', 'e2e-tier-auditor');

    const res = await request.post(ATTESTATIONS_ENDPOINT, {
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      data: validAttestationBody(),
    });
    expect(res.status()).toBe(201);
  });

  test('auditor-tier key is rejected on the higher partner-tier route', async ({
    request,
    internalKey,
  }) => {
    const { key } = await issueKey(request, internalKey, 'auditor', 'e2e-tier-auditor-reject');

    const res = await request.get(`${EVENTS_EXPORT_ENDPOINT}?productId=${KNOWN_PRODUCT_ID}`, {
      headers: { 'x-api-key': key },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('partner-tier key succeeds on its own tier route', async ({ request, internalKey }) => {
    const { key } = await issueKey(request, internalKey, 'partner', 'e2e-tier-partner');

    const res = await request.get(`${EVENTS_EXPORT_ENDPOINT}?productId=${KNOWN_PRODUCT_ID}`, {
      headers: { 'x-api-key': key },
    });
    expect(res.status()).toBe(200);
  });

  test('partner-tier key also succeeds on the lower auditor-tier route', async ({
    request,
    internalKey,
  }) => {
    const { key } = await issueKey(request, internalKey, 'partner', 'e2e-tier-partner-lower');

    const res = await request.post(ATTESTATIONS_ENDPOINT, {
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      data: validAttestationBody(),
    });
    expect(res.status()).toBe(201);
  });
});

// ── Revocation ─────────────────────────────────────────────────────────────────

test.describe('DELETE /api/v1/api-keys/[keyId] — revocation', () => {
  test('revoking a key invalidates it on the very next request', async ({
    request,
    internalKey,
  }) => {
    const { keyId, key } = await issueKey(request, internalKey, 'auditor', 'e2e-revoke');

    // Works before revocation
    const before = await request.post(ATTESTATIONS_ENDPOINT, {
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      data: validAttestationBody('before-revoke'),
    });
    expect(before.status()).toBe(201);

    // Revoke
    const revokeRes = await request.delete(`${API_KEYS_ENDPOINT}/${keyId}`, {
      headers: { 'x-api-key': internalKey },
    });
    expect(revokeRes.status()).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.revoked).toBe(true);

    // Immediately rejected on the very next request
    const after = await request.post(ATTESTATIONS_ENDPOINT, {
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      data: validAttestationBody('after-revoke'),
    });
    expect(after.status()).toBe(401);

    // Reflected in the key record
    const detail = await request.get(`${API_KEYS_ENDPOINT}/${keyId}`, {
      headers: { 'x-api-key': internalKey },
    });
    const detailBody = await detail.json();
    expect(detailBody.revoked).toBe(true);
    expect(detailBody.revokedAt).toBeGreaterThan(0);
  });

  test('404 when revoking an unknown keyId', async ({ request, internalKey }) => {
    const res = await request.delete(`${API_KEYS_ENDPOINT}/kid_does_not_exist`, {
      headers: { 'x-api-key': internalKey },
    });
    expect(res.status()).toBe(404);
  });
});

// ── Rate limiting tied to key tier ─────────────────────────────────────────────

test.describe('rate limiting — tied to key tier', () => {
  test('a lower-tier key hits its request limit sooner than a higher-tier key', async ({
    request,
    internalKey,
  }) => {
    test.setTimeout(90_000);

    // API_KEY_TIER_LIMITS: auditor = 500 req/window, partner = 1000 req/window.
    // 520 requests crosses the auditor ceiling with margin while staying well
    // under the partner ceiling, so the two keys are expected to diverge.
    const BURST = 520;

    const [auditor, partner] = await Promise.all([
      issueKey(request, internalKey, 'auditor', 'e2e-rl-auditor'),
      issueKey(request, internalKey, 'partner', 'e2e-rl-partner'),
    ]);

    const [auditorResults, partnerResults] = await Promise.all([
      burstAuth(request, auditor.key, BURST, 'auditor'),
      burstAuth(request, partner.key, BURST, 'partner'),
    ]);

    const auditorThrottled = auditorResults.filter((r) => r.status === 429);
    const partnerThrottled = partnerResults.filter((r) => r.status === 429);

    // The auditor-tier key (500/window) must have hit its limit within the burst.
    expect(auditorThrottled.length).toBeGreaterThan(0);
    expect(auditorThrottled[0].retryAfter).toBeTruthy();

    // The partner-tier key (1000/window) must NOT have been throttled within
    // the same burst size — it has strictly more headroom than the auditor tier.
    expect(partnerThrottled.length).toBe(0);
  });
});
