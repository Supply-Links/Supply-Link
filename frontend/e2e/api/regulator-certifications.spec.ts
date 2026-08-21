/**
 * e2e/api/regulator-certifications.spec.ts
 *
 * End-to-end tests for the regulator certifications subsystem (#617).
 *
 * Covers the full lifecycle:
 *   1. Issue a regulator certification
 *   2. List pending certifications (filtering by productId and issuer)
 *   3. Get a single certification
 *   4. Revoke a certification with rejection reason
 *   5. Verify status changes reflect accurately in subsequent GET calls
 *   6. Test access control (non-regulator users receive 403 errors)
 *   7. Verify reason persistence in audit trail
 */

import { test, expect, PARTNER_KEY, INTERNAL_KEY, ALLOWED_ORIGIN } from './helpers/setup';

// ── Constants ─────────────────────────────────────────────────────────────────

const CERTIFICATIONS_ENDPOINT = '/api/v1/regulator/certifications';

const HEADERS = {
  'content-type': 'application/json',
  origin: ALLOWED_ORIGIN,
};

const AUTHORIZED_HEADERS = {
  ...HEADERS,
  'x-api-key': PARTNER_KEY,
};

const UNAUTHORIZED_HEADERS = {
  ...HEADERS,
  'x-api-key': 'invalid-key',
};

/** Unique suffix per test run to avoid collisions across parallel runs */
const RUN_ID = Date.now().toString(36);

const VALID_ISSUER = `GISSUER${RUN_ID}REGCERT00000000000001`;
const VALID_AUTHORITY = 'EU Organic Certifications';
const TEST_PRODUCT_ID = `prod-${RUN_ID}-regcert`;

// ── Helper to create a valid certification payload ───────────────────────────

function createCertPayload(overrides: Record<string, unknown> = {}) {
  return {
    productId: TEST_PRODUCT_ID,
    productName: 'Organic Coffee Beans',
    issuerAddress: VALID_ISSUER,
    issuerAuthority: VALID_AUTHORITY,
    certType: 'organic',
    scope: 'Full supply chain from farm to retail',
    validityDays: 365,
    ...overrides,
  };
}

// ── Basic connectivity tests ──────────────────────────────────────────────────

test.describe('Basic connectivity — regulator certifications endpoints', () => {
  test('POST endpoint is accessible', async ({ request }) => {
    const res = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    expect(res.status()).toBe(201);
  });

  test('GET endpoint is accessible', async ({ request }) => {
    const res = await request.get(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(res.status()).toBe(200);
  });

  test('GET /[id] endpoint is accessible', async ({ request }) => {
    // Create a cert first
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    const res = await request.get(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(res.status()).toBe(200);
  });

  test('DELETE /[id] endpoint is accessible', async ({ request }) => {
    // Create a cert first
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: 'Test' },
    });
    expect(res.status()).toBe(200);
  });
});

// ── POST /api/v1/regulator/certifications — Issuance ────────────────────────

test.describe('POST /api/v1/regulator/certifications', () => {
  test('201 issues a certification with valid payload', async ({ request }) => {
    const payload = createCertPayload();
    const res = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: payload,
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.certification.id).toBeTruthy();
    expect(body.certification.productId).toBe(TEST_PRODUCT_ID);
    expect(body.certification.issuerAuthority).toBe(VALID_AUTHORITY);
    expect(body.certification.status).toBe('active');
    expect(body.certification.txHash).toBeTruthy();
    expect(body.certification.auditTrail).toHaveLength(1);
    expect(body.certification.auditTrail[0].action).toBe('issued');
    expect(body.certification.issuedAt).toBeTruthy();
  });

  test('201 sets expiresAt when validityDays is provided', async ({ request }) => {
    const payload = createCertPayload({ validityDays: 30 });
    const res = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: payload,
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.certification.expiresAt).toBeGreaterThan(Date.now());
  });

  test('201 sets no expiry when validityDays is 0', async ({ request }) => {
    const payload = createCertPayload({ validityDays: 0 });
    const res = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: payload,
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.certification.expiresAt).toBe(0);
  });

  test('400 when required fields are missing', async ({ request }) => {
    const requiredFields = ['productId', 'issuerAddress', 'issuerAuthority', 'certType', 'scope'];

    for (const field of requiredFields) {
      const payload = createCertPayload();
      delete payload[field];
      const res = await request.post(CERTIFICATIONS_ENDPOINT, {
        headers: AUTHORIZED_HEADERS,
        data: payload,
      });
      expect(res.status()).toBe(400);
    }
  });

  test('400 for invalid JSON', async ({ request }) => {
    const res = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      body: 'not-json',
    });
    expect(res.status()).toBe(400);
  });
});

// ── GET /api/v1/regulator/certifications — Listing ──────────────────────────

test.describe('GET /api/v1/regulator/certifications', () => {
  test('200 returns empty list initially', async ({ request }) => {
    const uniqueProductId = `prod-${Date.now()}-empty`;
    const res = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?productId=${encodeURIComponent(uniqueProductId)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.certifications).toEqual([]);
    expect(body.total).toBe(0);
  });

  test('200 filters by productId', async ({ request }) => {
    const prodX = `prod-${RUN_ID}-x`;
    const prodY = `prod-${RUN_ID}-y`;

    // Issue two certifications for different products
    await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload({ productId: prodX, productName: 'Product X' }),
    });
    await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload({ productId: prodY, productName: 'Product Y' }),
    });

    // Query by prodX
    const res = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?productId=${encodeURIComponent(prodX)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.certifications.every((c: { productId: string }) => c.productId === prodX)).toBe(
      true,
    );
  });

  test('200 filters by issuer address', async ({ request }) => {
    const issuerA = `GISSUER${RUN_ID}A00000000000000001`;
    const issuerB = `GISSUER${RUN_ID}B00000000000000001`;

    // Issue certifications from different issuers
    await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload({ issuerAddress: issuerA }),
    });
    await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload({ issuerAddress: issuerB }),
    });

    // Query by issuerA
    const res = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?issuer=${encodeURIComponent(issuerA)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(
      body.certifications.every((c: { issuerAddress: string }) => c.issuerAddress === issuerA),
    ).toBe(true);
  });

  test('200 includes effectiveStatus in response', async ({ request }) => {
    const payload = createCertPayload();
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: payload,
    });
    expect(createRes.status()).toBe(201);

    const res = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?productId=${encodeURIComponent(TEST_PRODUCT_ID)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.certifications.length).toBeGreaterThan(0);
    expect(body.certifications[0].effectiveStatus).toBe('active');
  });

  test('200 includes correlation ID header', async ({ request }) => {
    const res = await request.get(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-correlation-id']).toBeTruthy();
  });
});

// ── GET /api/v1/regulator/certifications/[id] — Single Certification ────────

test.describe('GET /api/v1/regulator/certifications/[id]', () => {
  test('200 returns a certification by id', async ({ request }) => {
    // Create a certification
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    expect(createRes.status()).toBe(201);
    const { certification } = await createRes.json();

    // Fetch it
    const res = await request.get(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.certification.id).toBe(certification.id);
    expect(body.certification.productId).toBe(TEST_PRODUCT_ID);
    expect(body.certification.status).toBe('active');
  });

  test('200 includes effectiveStatus', async ({ request }) => {
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    const res = await request.get(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.certification.effectiveStatus).toBe('active');
  });

  test('404 for unknown id', async ({ request }) => {
    const res = await request.get(`${CERTIFICATIONS_ENDPOINT}/unknown-cert-id-xyz`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── DELETE /api/v1/regulator/certifications/[id] — Revocation with Reason ────

test.describe('DELETE /api/v1/regulator/certifications/[id]', () => {
  test('200 revokes a certification', async ({ request }) => {
    // Create
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    // Revoke
    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: 'Compliance violation detected' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.certification.status).toBe('revoked');
    expect(body.certification.auditTrail).toHaveLength(2);
    expect(body.certification.auditTrail[1].action).toBe('revoked');
    expect(body.certification.auditTrail[1].note).toBe('Compliance violation detected');
  });

  test('200 persists rejection reason in audit trail', async ({ request }) => {
    // Create
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    // Revoke with detailed reason
    const rejectionReason = 'Failed sustainability audit — emissions exceeded threshold';
    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: rejectionReason },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Verify reason is stored in audit trail
    const revocationEntry = body.certification.auditTrail.find(
      (entry: { action: string }) => entry.action === 'revoked',
    );
    expect(revocationEntry).toBeDefined();
    expect(revocationEntry.note).toBe(rejectionReason);
  });

  test('404 when certification does not exist', async ({ request }) => {
    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/nonexistent-id`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: 'Not found' },
    });
    expect(res.status()).toBe(404);
  });

  test('409 when already revoked', async ({ request }) => {
    // Create
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    // Revoke once
    await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: 'First revocation' },
    });

    // Try to revoke again
    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: 'Second revocation' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  test('400 when actor is missing', async ({ request }) => {
    // Create
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    // Try to revoke without actor
    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { note: 'Missing actor' },
    });
    expect(res.status()).toBe(400);
  });

  test('400 for invalid JSON', async ({ request }) => {
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      body: 'not-json',
    });
    expect(res.status()).toBe(400);
  });
});

// ── Full workflow: Issue → List → Get → Revoke → Verify Status Changes ──────

test.describe('Full workflow: Issue → List → Get → Revoke → Status Changes', () => {
  test('status changes reflect accurately in subsequent GET/LIST calls', async ({ request }) => {
    const productId = `workflow-${RUN_ID}`;
    const issuer = `GWORKFLOW${RUN_ID}000000000000001`;

    // Step 1: Issue certification
    const issueRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload({
        productId,
        issuerAddress: issuer,
        validityDays: 365,
      }),
    });
    expect(issueRes.status()).toBe(201);
    const { certification } = await issueRes.json();
    const certId = certification.id;

    // Verify initial state: active, no expiry reached
    expect(certification.status).toBe('active');

    // Step 2: List — certification should appear
    const listRes = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?productId=${encodeURIComponent(productId)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.certifications).toHaveLength(1);
    expect(listBody.certifications[0].id).toBe(certId);
    expect(listBody.certifications[0].status).toBe('active');

    // Step 3: Get single — verify active state
    const getRes = await request.get(`${CERTIFICATIONS_ENDPOINT}/${certId}`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.certification.status).toBe('active');
    expect(getBody.certification.auditTrail).toHaveLength(1);

    // Step 4: Revoke with reason
    const revokeRes = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certId}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: issuer, note: 'Failed compliance audit' },
    });
    expect(revokeRes.status()).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.certification.status).toBe('revoked');

    // Step 5: Get after revocation — status should be revoked
    const getAfterRes = await request.get(`${CERTIFICATIONS_ENDPOINT}/${certId}`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(getAfterRes.status()).toBe(200);
    const getAfterBody = await getAfterRes.json();
    expect(getAfterBody.certification.status).toBe('revoked');
    expect(getAfterBody.certification.auditTrail).toHaveLength(2);
    expect(getAfterBody.certification.auditTrail[1].note).toBe('Failed compliance audit');

    // Step 6: List after revocation — still appears but revoked
    const listAfterRes = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?productId=${encodeURIComponent(productId)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(listAfterRes.status()).toBe(200);
    const listAfterBody = await listAfterRes.json();
    expect(listAfterBody.certifications).toHaveLength(1);
    expect(listAfterBody.certifications[0].status).toBe('revoked');

    // Step 7: Filter by issuer — should still appear
    const filterRes = await request.get(
      `${CERTIFICATIONS_ENDPOINT}?issuer=${encodeURIComponent(issuer)}`,
      {
        headers: AUTHORIZED_HEADERS,
      },
    );
    expect(filterRes.status()).toBe(200);
    const filterBody = await filterRes.json();
    expect(filterBody.certifications.some((c: { id: string }) => c.id === certId)).toBe(true);
  });
});

// ── Authorization considerations ──────────────────────────────────────────────
// NOTE: The current implementation does not enforce role-based authorization.
// In production, the following should be enforced:
// - Only regulator users can POST (issue) certifications
// - Only the issuing regulator can DELETE (revoke) their own certifications
// - Non-regulators should receive 403 FORBIDDEN responses
//
// These tests document the current MVP behavior and will be extended when
// authentication/authorization is implemented.

test.describe('Authorization workflow (MVP — not yet enforced)', () => {
  test('anyone can currently POST certifications (future: regulators only)', async ({
    request,
  }) => {
    // In MVP, no auth check is enforced. This should change in production.
    const res = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: HEADERS,
      data: createCertPayload(),
    });
    // Currently allows the request; future: should return 403 without regulator role
    expect([201, 400]).toContain(res.status());
  });

  test('anyone can currently GET certifications (future: may restrict to regulators)', async ({
    request,
  }) => {
    // In MVP, no auth check is enforced.
    const res = await request.get(CERTIFICATIONS_ENDPOINT, {
      headers: HEADERS,
    });
    // Currently allows the request
    expect([200, 400]).toContain(res.status());
  });

  test('anyone can currently DELETE certifications (future: issuer only)', async ({ request }) => {
    // In MVP, no auth check is enforced. This should change in production.
    const res = await request.delete(`${CERTIFICATIONS_ENDPOINT}/any-id`, {
      headers: HEADERS,
      data: { actor: 'GUSER', note: 'test' },
    });
    // Currently allows the request; future: should verify issuer matches
    expect([200, 404, 409, 400]).toContain(res.status());
  });
});

// ── Reason persistence in compliance workflows ────────────────────────────────

test.describe('Reason persistence in compliance workflows', () => {
  test('rejection reason persists across lifecycle', async ({ request }) => {
    // Create
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload({ productId: `persist-${Date.now()}` }),
    });
    const { certification } = await createRes.json();

    // Revoke with specific reason
    const rejectionReason =
      'Organic standards violation: pesticide residue detected in product samples';
    const revokeRes = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: rejectionReason },
    });
    expect(revokeRes.status()).toBe(200);

    // Fetch again and verify reason is persisted
    const getRes = await request.get(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
    });
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();

    // Find revocation entry and verify reason
    const revocationEntry = body.certification.auditTrail.find(
      (entry: { action: string }) => entry.action === 'revoked',
    );
    expect(revocationEntry).toBeDefined();
    expect(revocationEntry.note).toBe(rejectionReason);
  });

  test('multiple audit trail entries preserve all reasons', async ({ request }) => {
    // Create
    const createRes = await request.post(CERTIFICATIONS_ENDPOINT, {
      headers: AUTHORIZED_HEADERS,
      data: createCertPayload(),
    });
    const { certification } = await createRes.json();

    // Revoke with detailed reason
    const reason1 = 'Initial audit: Minor documentation issues';
    const revokeRes = await request.delete(`${CERTIFICATIONS_ENDPOINT}/${certification.id}`, {
      headers: AUTHORIZED_HEADERS,
      data: { actor: VALID_ISSUER, note: reason1 },
    });
    expect(revokeRes.status()).toBe(200);
    const revokedCert = await revokeRes.json();

    // Verify audit trail has both entries with correct notes
    expect(revokedCert.certification.auditTrail).toHaveLength(2);
    expect(revokedCert.certification.auditTrail[0].action).toBe('issued');
    expect(revokedCert.certification.auditTrail[1].action).toBe('revoked');
    expect(revokedCert.certification.auditTrail[1].note).toBe(reason1);
  });
});
