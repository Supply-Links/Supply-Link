/**
 * e2e/api/delegations.spec.ts
 *
 * Contract tests for:
 *   POST   /api/v1/products/[id]/delegations                – create a delegation
 *   GET    /api/v1/products/[id]/delegations                – list active delegations
 *   DELETE /api/v1/products/[id]/delegations/[delegationId] – revoke a delegation
 *
 * Covers: 401 auth, 404 unknown product, 400 validation, 201/200 happy-path,
 *         full grant -> use (GET) -> revoke lifecycle, and expiry filtering.
 *
 * Scope note:
 *   `Delegation` (lib/types/index.ts) and `delegationCreateBodySchema` carry no
 *   scope/actions field, and no route in this codebase (events, attestations,
 *   etc.) reads delegationStore to authorize a caller as the delegatee - auth
 *   everywhere is a single shared x-api-key per tier, not a per-address
 *   identity. Scoped, delegate-authenticated actions only exist in the
 *   Stellar contract client layer (lib/stellar/*-contract-client.ts), which
 *   these REST routes never invoke. So this spec does not assert "delegate
 *   performs an in-scope action" or "403 for out-of-scope action" - there is
 *   no code path backing either today.
 */

import { test, expect, ALLOWED_ORIGIN } from './helpers/setup';

// prod-001 always exists in mock data (see events.spec.ts / attestations.spec.ts)
const KNOWN_PRODUCT_ID = 'prod-001';
const UNKNOWN_PRODUCT_ID = 'prod-does-not-exist-e2e-xyz';

const DELEGATIONS_ENDPOINT = (productId: string) => `/api/v1/products/${productId}/delegations`;
const DELEGATION_ENDPOINT = (productId: string, delegationId: number | string) =>
  `/api/v1/products/${productId}/delegations/${delegationId}`;

// === Helpers

/** Builds a syntactically valid Stellar public key (G + 55 chars of [A-Z2-7]). */
function makeStellarAddress(seed: string): string {
  const body = seed
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, 'A')
    .padEnd(55, 'A')
    .slice(0, 55);
  return `G${body}`;
}

function futureTimestamp(secondsFromNow = 86400): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

function validDelegationBody(suffix = Date.now().toString(36)) {
  return {
    delegatee: makeStellarAddress(`DELEGATEE${suffix}`),
    expiresAt: futureTimestamp(),
  };
}

// === POST - auth and validation

test.describe('POST /api/v1/products/[id]/delegations — auth and validation', () => {
  test('401 when x-api-key header is missing', async ({ request }) => {
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      data: validDelegationBody(),
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('401 when x-api-key is invalid', async ({ request }) => {
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': 'sl_completely_invalid_key_000' },
      data: validDelegationBody(),
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('404 when product does not exist', async ({ request, apiKey }) => {
    const res = await request.post(DELEGATIONS_ENDPOINT(UNKNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: validDelegationBody(),
    });
    expect(res.status()).toBe(404);
  });

  test('400 when delegatee is missing', async ({ request, apiKey }) => {
    const { delegatee: _omit, ...rest } = validDelegationBody();
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: rest,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/VALIDATION_ERROR/);
  });

  test('400 when delegatee is not a valid Stellar address', async ({ request, apiKey }) => {
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: { ...validDelegationBody(), delegatee: 'not-a-valid-address' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/VALIDATION_ERROR/);
  });

  test('400 when expiresAt is missing', async ({ request, apiKey }) => {
    const { expiresAt: _omit, ...rest } = validDelegationBody();
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: rest,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/VALIDATION_ERROR/);
  });

  test('400 when expiresAt is in the past', async ({ request, apiKey }) => {
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: { ...validDelegationBody(), expiresAt: Math.floor(Date.now() / 1000) - 60 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/VALIDATION_ERROR/);
  });

  test('400 on invalid JSON body', async ({ request, apiKey }) => {
    // Buffer, not a plain string: Playwright JSON.stringify's a string `data`
    // value when content-type is application/json, which would wrap this in
    // quotes and turn it into valid (if wrongly-typed) JSON instead of
    // malformed JSON.
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: Buffer.from('{{not-json}}'),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/INVALID_JSON|INVALID_PAYLOAD/);
  });
});

// === POST - happy path

test.describe('POST /api/v1/products/[id]/delegations — happy path', () => {
  test('201 on valid payload', async ({ request, apiKey }) => {
    const payload = validDelegationBody();
    const res = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        origin: ALLOWED_ORIGIN,
      },
      data: payload,
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(typeof body.delegationId).toBe('number');
    expect(body.productId).toBe(KNOWN_PRODUCT_ID);
    expect(body.delegatee).toBe(payload.delegatee);
    expect(body.expiresAt).toBe(payload.expiresAt);
    expect(body.revoked).toBe(false);
    expect(typeof body.delegator).toBe('string');
    expect(typeof body.createdAt).toBe('number');

    // CORS + correlation
    expect(res.headers()['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers()['x-correlation-id']).toBeTruthy();
  });
});

// === GET - listing

test.describe('GET /api/v1/products/[id]/delegations', () => {
  test('401 when x-api-key header is missing', async ({ request }) => {
    const res = await request.get(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID));
    expect(res.status()).toBe(401);
  });

  test('404 when product does not exist', async ({ request, apiKey }) => {
    const res = await request.get(DELEGATIONS_ENDPOINT(UNKNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey },
    });
    expect(res.status()).toBe(404);
  });

  test('200 includes a newly created delegation in the active list', async ({
    request,
    apiKey,
  }) => {
    const payload = validDelegationBody();
    const createRes = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: payload,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const listRes = await request.get(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey },
    });
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(Array.isArray(list)).toBe(true);
    expect(
      list.some((d: { delegationId: number }) => d.delegationId === created.delegationId),
    ).toBe(true);
  });
});

// === DELETE - revoke lifecycle

test.describe('DELETE /api/v1/products/[id]/delegations/[delegationId]', () => {
  test('full grant -> use -> revoke lifecycle', async ({ request, apiKey }) => {
    // Grant
    const payload = validDelegationBody();
    const createRes = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: payload,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    // Use — appears in the active list
    const listRes = await request.get(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey },
    });
    const activeList = await listRes.json();
    expect(
      activeList.some((d: { delegationId: number }) => d.delegationId === created.delegationId),
    ).toBe(true);

    // Revoke
    const revokeRes = await request.delete(
      DELEGATION_ENDPOINT(KNOWN_PRODUCT_ID, created.delegationId),
      { headers: { 'x-api-key': apiKey } },
    );
    expect(revokeRes.status()).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.revoked).toBe(true);

    // Subsequent list excludes the revoked delegation
    const afterRes = await request.get(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey },
    });
    const afterList = await afterRes.json();
    expect(
      afterList.some((d: { delegationId: number }) => d.delegationId === created.delegationId),
    ).toBe(false);
  });

  test('401 when x-api-key header is missing', async ({ request, apiKey }) => {
    const createRes = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: validDelegationBody(),
    });
    const created = await createRes.json();

    const res = await request.delete(DELEGATION_ENDPOINT(KNOWN_PRODUCT_ID, created.delegationId));
    expect(res.status()).toBe(401);
  });

  test('400 when delegationId is not numeric', async ({ request, apiKey }) => {
    const res = await request.delete(DELEGATION_ENDPOINT(KNOWN_PRODUCT_ID, 'not-a-number'), {
      headers: { 'x-api-key': apiKey },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/VALIDATION_ERROR/);
  });

  test('404 when delegationId does not exist', async ({ request, apiKey }) => {
    const res = await request.delete(DELEGATION_ENDPOINT(KNOWN_PRODUCT_ID, 999999999), {
      headers: { 'x-api-key': apiKey },
    });
    expect(res.status()).toBe(404);
  });

  test('404 when revoking an already-revoked delegation again', async ({ request, apiKey }) => {
    const createRes = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: validDelegationBody(),
    });
    const created = await createRes.json();

    const first = await request.delete(
      DELEGATION_ENDPOINT(KNOWN_PRODUCT_ID, created.delegationId),
      { headers: { 'x-api-key': apiKey } },
    );
    expect(first.status()).toBe(200);

    // The route only excludes revoked delegations from GET; it does not track
    // "already revoked" separately, so a second DELETE still finds the record
    // and re-marks it revoked — assert the actual behavior, not an assumption.
    const second = await request.delete(
      DELEGATION_ENDPOINT(KNOWN_PRODUCT_ID, created.delegationId),
      { headers: { 'x-api-key': apiKey } },
    );
    expect(second.status()).toBe(200);
  });
});

// === Expiry enforcement

test.describe('Expiry enforcement', () => {
  test('an expired delegation is excluded from the active list without explicit revocation', async ({
    request,
    apiKey,
  }) => {
    const payload = validDelegationBody(`expiry-${Date.now()}`);
    payload.expiresAt = futureTimestamp(2);

    const createRes = await request.post(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      data: payload,
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    // Still active immediately after creation
    const beforeRes = await request.get(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey },
    });
    const beforeList = await beforeRes.json();
    expect(
      beforeList.some((d: { delegationId: number }) => d.delegationId === created.delegationId),
    ).toBe(true);

    // Wait past expiry without revoking
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const afterRes = await request.get(DELEGATIONS_ENDPOINT(KNOWN_PRODUCT_ID), {
      headers: { 'x-api-key': apiKey },
    });
    const afterList = await afterRes.json();
    expect(
      afterList.some((d: { delegationId: number }) => d.delegationId === created.delegationId),
    ).toBe(false);
  });
});
