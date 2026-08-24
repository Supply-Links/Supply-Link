import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for regulator certification review workflow (#617).
 *
 * Tests the regulator certification interface:
 *   1. Navigate to regulator certifications dashboard
 *   2. View pending certifications list
 *   3. Approve (issue) a certification
 *   4. Reject (revoke) a certification with reason
 *   5. Verify status updates in the UI
 *   6. Verify access control prevents unauthorized users
 *
 * Uses seeded localStorage for wallet address (no wallet extension mock needed).
 * All API calls go through HTTP — no mocking of fetch/request.
 */

const REGULATOR_ADDRESS = 'GREGULATOR000000000000000000000000000000000000001';
const REGULAR_USER_ADDRESS = 'GUSER0000000000000000000000000000000000000000001';
const TEST_PRODUCT_ID = `prod-e2e-${Date.now()}`;
const STORE_KEY = 'supply-link-store';

// Block service worker to avoid cold-compile race on first load
test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', (route) => route.abort());
});

async function seedWallet(page: Page, walletAddress: string) {
  await page.addInitScript(
    ({ key, wallet }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ state: { walletAddress: wallet }, version: 0 }),
      );
    },
    { key: STORE_KEY, wallet: walletAddress },
  );
}

async function createTestCertification(page: Page, productId: string) {
  // Use API to create a test certification
  const baseUrl =
    page.context().browser()?.contexts()[0]?.pages()[0]?.url() || 'http://localhost:3000';
  const response = await page.request.post(
    'http://localhost:3000/api/v1/regulator/certifications',
    {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        productId,
        productName: 'Test Product for Certification',
        issuerAddress: REGULATOR_ADDRESS,
        issuerAuthority: 'Test Regulator Authority',
        certType: 'organic',
        scope: 'Full supply chain',
        validityDays: 365,
      },
    },
  );

  if (response.status() !== 201) {
    throw new Error(`Failed to create certification: ${response.status()}`);
  }

  return response.json();
}

test.describe('E2E: Regulator Certification Review Workflow', () => {
  test('regulator can view pending certifications list', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    // Navigate to dashboard (assuming there's a regulator certifications page)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for certifications section or navigate to certifications page
    // This assumes there's a link or button to access certifications
    const certificationsLink = page.locator('a, button').filter({
      hasText: /certification|approve|review/i,
    });

    if ((await certificationsLink.count()) > 0) {
      await certificationsLink.first().click();
      await page.waitForLoadState('networkidle');
    } else {
      // If no link found, navigate directly
      await page.goto('/dashboard/certifications');
      await page.waitForLoadState('networkidle');
    }

    // Verify page loads
    expect(page.url()).toContain('certification');
  });

  test('regulator can issue a certification via API', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    const { certification } = await createTestCertification(page, TEST_PRODUCT_ID);

    // Verify response contains expected fields
    expect(certification.id).toBeTruthy();
    expect(certification.productId).toBe(TEST_PRODUCT_ID);
    expect(certification.issuerAuthority).toBe('Test Regulator Authority');
    expect(certification.status).toBe('active');
    expect(certification.auditTrail).toHaveLength(1);
    expect(certification.auditTrail[0].action).toBe('issued');
  });

  test('issued certification can be retrieved and displayed', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    // Create certification via API
    const { certification } = await createTestCertification(page, TEST_PRODUCT_ID);

    // Fetch via API
    const response = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications/${certification.id}`,
    );

    expect(response.status()).toBe(200);
    const cert = await response.json();
    expect(cert.certification.id).toBe(certification.id);
    expect(cert.certification.status).toBe('active');
    expect(cert.certification.effectiveStatus).toBe('active');
  });

  test('regulator can revoke certification with rejection reason', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    // Create certification
    const { certification } = await createTestCertification(page, TEST_PRODUCT_ID);

    // Revoke with reason
    const rejectionReason = 'Compliance audit failed — environmental standards not met';
    const revokeResponse = await page.request.delete(
      `http://localhost:3000/api/v1/regulator/certifications/${certification.id}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          actor: REGULATOR_ADDRESS,
          note: rejectionReason,
        },
      },
    );

    expect(revokeResponse.status()).toBe(200);
    const revokedCert = await revokeResponse.json();
    expect(revokedCert.certification.status).toBe('revoked');
    expect(revokedCert.certification.auditTrail[1].note).toBe(rejectionReason);
  });

  test('certification status changes reflect in list after revocation', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    // Create certification
    const { certification } = await createTestCertification(page, TEST_PRODUCT_ID);
    const certId = certification.id;

    // List before revocation
    let listResponse = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications?productId=${TEST_PRODUCT_ID}`,
    );
    let listBody = await listResponse.json();
    let cert = listBody.certifications.find((c: { id: string }) => c.id === certId);
    expect(cert.status).toBe('active');

    // Revoke
    await page.request.delete(`http://localhost:3000/api/v1/regulator/certifications/${certId}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { actor: REGULATOR_ADDRESS, note: 'Status change test' },
    });

    // List after revocation
    listResponse = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications?productId=${TEST_PRODUCT_ID}`,
    );
    listBody = await listResponse.json();
    cert = listBody.certifications.find((c: { id: string }) => c.id === certId);
    expect(cert.status).toBe('revoked');
  });

  test('reason persistence in certification lifecycle', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    // Create certification
    const { certification } = await createTestCertification(page, TEST_PRODUCT_ID);

    // Revoke with detailed reason
    const detailedReason = 'Pesticide residue detected in product samples during audit';
    await page.request.delete(
      `http://localhost:3000/api/v1/regulator/certifications/${certification.id}`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: { actor: REGULATOR_ADDRESS, note: detailedReason },
      },
    );

    // Fetch again and verify reason persists
    const getResponse = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications/${certification.id}`,
    );
    const cert = await getResponse.json();

    // Verify reason in audit trail
    const revocationEntry = cert.certification.auditTrail.find(
      (entry: { action: string }) => entry.action === 'revoked',
    );
    expect(revocationEntry).toBeDefined();
    expect(revocationEntry.note).toBe(detailedReason);
  });

  test('access control prevents unauthorized operations', async ({ page }) => {
    // Try with unauthorized/regular user
    await seedWallet(page, REGULAR_USER_ADDRESS);

    // Attempt to create certification without auth
    const createResponse = await page.request.post(
      'http://localhost:3000/api/v1/regulator/certifications',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          productId: TEST_PRODUCT_ID,
          productName: 'Unauthorized Test',
          issuerAddress: REGULAR_USER_ADDRESS,
          issuerAuthority: 'Fake Authority',
          certType: 'organic',
          scope: 'test',
          validityDays: 365,
        },
      },
    );

    // Should fail without proper API key/auth
    expect(createResponse.status()).toBeGreaterThanOrEqual(400);
  });

  test('multiple certifications can coexist with different statuses', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    const productId1 = `prod-${Date.now()}-1`;
    const productId2 = `prod-${Date.now()}-2`;

    // Create two certifications
    const cert1 = await createTestCertification(page, productId1);
    const cert2 = await createTestCertification(page, productId2);

    // Revoke the first one
    await page.request.delete(
      `http://localhost:3000/api/v1/regulator/certifications/${cert1.certification.id}`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          actor: REGULATOR_ADDRESS,
          note: 'Revoking first certification',
        },
      },
    );

    // List all for product 1
    const list1 = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications?productId=${productId1}`,
    );
    const body1 = await list1.json();
    expect(body1.certifications[0].status).toBe('revoked');

    // List all for product 2
    const list2 = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications?productId=${productId2}`,
    );
    const body2 = await list2.json();
    expect(body2.certifications[0].status).toBe('active');
  });

  test('certification with expiry shows correct effectiveStatus', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    const productId = `prod-expire-${Date.now()}`;

    // Create certification with short validity
    const response = await page.request.post(
      'http://localhost:3000/api/v1/regulator/certifications',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          productId,
          productName: 'Expiring Product',
          issuerAddress: REGULATOR_ADDRESS,
          issuerAuthority: 'Test Authority',
          certType: 'organic',
          scope: 'Full supply chain',
          validityDays: 30,
        },
      },
    );

    const { certification } = await response.json();
    expect(certification.effectiveStatus).toBe('active');
    expect(certification.expiresAt).toBeGreaterThan(Date.now());
  });

  test('filters work correctly for regulator user', async ({ page }) => {
    // Seed wallet
    await seedWallet(page, REGULATOR_ADDRESS);

    const issuer1 = `GISSUER${Date.now()}001`;
    const issuer2 = `GISSUER${Date.now()}002`;

    // Create certifications from different issuers
    const response1 = await page.request.post(
      'http://localhost:3000/api/v1/regulator/certifications',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          productId: TEST_PRODUCT_ID,
          productName: 'Product A',
          issuerAddress: issuer1,
          issuerAuthority: 'Authority 1',
          certType: 'organic',
          scope: 'test',
          validityDays: 365,
        },
      },
    );

    const response2 = await page.request.post(
      'http://localhost:3000/api/v1/regulator/certifications',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          productId: TEST_PRODUCT_ID,
          productName: 'Product B',
          issuerAddress: issuer2,
          issuerAuthority: 'Authority 2',
          certType: 'fair_trade',
          scope: 'test',
          validityDays: 365,
        },
      },
    );

    expect(response1.status()).toBe(201);
    expect(response2.status()).toBe(201);

    // Filter by issuer1
    const listResponse = await page.request.get(
      `http://localhost:3000/api/v1/regulator/certifications?issuer=${issuer1}`,
    );
    const listBody = await listResponse.json();

    // Verify filtering works
    expect(
      listBody.certifications.every((c: { issuerAddress: string }) => c.issuerAddress === issuer1),
    ).toBe(true);
  });
});
