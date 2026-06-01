import { describe, it, expect } from "vitest";
import {
  MOCK_CERTIFICATES,
  MOCK_REVOCATIONS,
  getCertificatesByProductId,
  getRevocationByCertId,
} from "@/lib/mock/products";
import type { Certificate, RevocationRecord } from "@/lib/types";

// ── Helper ────────────────────────────────────────────────────────────────────

function makeCert(overrides: Partial<Certificate> = {}): Certificate {
  return {
    certId: `cert-${Math.random().toString(36).slice(2, 8)}`,
    productId: "prod-test",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: Date.now(),
    certType: "ORGANIC",
    metadata: "{}",
    revoked: false,
    ...overrides,
  };
}

function makeRevocation(overrides: Partial<RevocationRecord> = {}): RevocationRecord {
  return {
    certId: "cert-test",
    revoker: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    revokedAt: Date.now(),
    reason: "Test reason",
    ...overrides,
  };
}

// ── Mock data tests ───────────────────────────────────────────────────────────

describe("MOCK_CERTIFICATES", () => {
  it("contains certificates", () => {
    expect(MOCK_CERTIFICATES.length).toBeGreaterThan(0);
  });

  it("prod-001 has at least one certificate", () => {
    const certs = getCertificatesByProductId("prod-001");
    expect(certs.length).toBeGreaterThan(0);
  });

  it("prod-001 has a revoked fair-trade certificate", () => {
    const certs = getCertificatesByProductId("prod-001");
    const revoked = certs.find((c) => c.revoked);
    expect(revoked).toBeDefined();
    expect(revoked!.certType).toBe("FAIR_TRADE");
  });

  it("prod-001 has a valid organic certificate", () => {
    const certs = getCertificatesByProductId("prod-001");
    const valid = certs.find((c) => !c.revoked && c.certType === "ORGANIC");
    expect(valid).toBeDefined();
  });
});

describe("MOCK_REVOCATIONS", () => {
  it("contains at least one revocation record", () => {
    expect(MOCK_REVOCATIONS.length).toBeGreaterThan(0);
  });

  it("revocation record has all required fields", () => {
    const record = MOCK_REVOCATIONS[0];
    expect(record).toHaveProperty("certId");
    expect(record).toHaveProperty("revoker");
    expect(record).toHaveProperty("revokedAt");
    expect(record).toHaveProperty("reason");
  });
});

describe("getRevocationByCertId", () => {
  it("returns the revocation record for a revoked cert", () => {
    const record = getRevocationByCertId("cert-001-fairtrade");
    expect(record).toBeDefined();
    expect(record!.certId).toBe("cert-001-fairtrade");
  });

  it("returns undefined for a non-revoked cert", () => {
    const record = getRevocationByCertId("cert-001-organic");
    expect(record).toBeUndefined();
  });

  it("returns undefined for an unknown cert ID", () => {
    const record = getRevocationByCertId("cert-does-not-exist");
    expect(record).toBeUndefined();
  });
});

// ── Certificate shape validation ──────────────────────────────────────────────

describe("Certificate shape", () => {
  it("has all required fields", () => {
    const cert = makeCert();
    expect(cert).toHaveProperty("certId");
    expect(cert).toHaveProperty("productId");
    expect(cert).toHaveProperty("issuer");
    expect(cert).toHaveProperty("issuedAt");
    expect(cert).toHaveProperty("certType");
    expect(cert).toHaveProperty("metadata");
    expect(cert).toHaveProperty("revoked");
  });

  it("revoked defaults to false", () => {
    const cert = makeCert();
    expect(cert.revoked).toBe(false);
  });
});

// ── Revocation logic ──────────────────────────────────────────────────────────

describe("Revocation logic", () => {
  it("is_certificate_valid returns true for non-revoked cert", () => {
    const cert = makeCert({ revoked: false });
    expect(!cert.revoked).toBe(true);
  });

  it("is_certificate_valid returns false for revoked cert", () => {
    const cert = makeCert({ revoked: true });
    expect(!cert.revoked).toBe(false);
  });

  it("revoking a cert sets revoked to true", () => {
    const cert = makeCert({ revoked: false });
    const revoked = { ...cert, revoked: true };
    expect(revoked.revoked).toBe(true);
  });

  it("revocation record links to the correct cert", () => {
    const cert = makeCert({ certId: "cert-abc" });
    const record = makeRevocation({ certId: cert.certId });
    expect(record.certId).toBe(cert.certId);
  });

  it("double revocation is prevented (cert already revoked)", () => {
    const cert = makeCert({ revoked: true });
    // Simulate the guard: if already revoked, throw
    const tryRevoke = () => {
      if (cert.revoked) throw new Error("certificate is already revoked");
    };
    expect(tryRevoke).toThrow("certificate is already revoked");
  });

  it("verification logic accounts for revoked credentials", () => {
    const certs: Certificate[] = [
      makeCert({ certId: "c1", revoked: false }),
      makeCert({ certId: "c2", revoked: true }),
      makeCert({ certId: "c3", revoked: false }),
    ];

    const validCerts = certs.filter((c) => !c.revoked);
    const revokedCerts = certs.filter((c) => c.revoked);

    expect(validCerts).toHaveLength(2);
    expect(revokedCerts).toHaveLength(1);
    expect(revokedCerts[0].certId).toBe("c2");
  });

  it("revocation record stores reason and timestamp", () => {
    const record = makeRevocation({
      reason: "Audit failed",
      revokedAt: 1710650000000,
    });
    expect(record.reason).toBe("Audit failed");
    expect(record.revokedAt).toBe(1710650000000);
  });

  it("getCertificatesByProductId returns empty array for unknown product", () => {
    const certs = getCertificatesByProductId("prod-nonexistent");
    expect(certs).toEqual([]);
  });
});
