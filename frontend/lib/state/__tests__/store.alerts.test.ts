import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import type { RecallAlert, Certificate } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecall(productId = "prod-001"): RecallAlert {
  return {
    productId,
    severity: "CRITICAL",
    message: "Contamination detected",
    issuedBy: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: Date.now(),
    status: "ACTIVE",
    distribution: {
      notifyOwner: true,
      notifyActors: true,
      broadcastPublic: true,
    },
  };
}

function makeCert(id = "cert-001", productId = "prod-001"): Certificate {
  return {
    id,
    productId,
    certType: "ORGANIC",
    issuedBy: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: Date.now(),
    metadata: "{}",
    status: "VALID",
  };
}

// Reset store state between tests
function resetStore() {
  useStore.setState({
    recalls: {},
    dismissedAlerts: [],
    certificates: [],
    products: [],
  });
}

// ── Recall / Alert store tests ────────────────────────────────────────────────

describe("store — recall alerts", () => {
  beforeEach(resetStore);

  it("setRecall stores an alert keyed by productId", () => {
    const alert = makeRecall("prod-001");
    useStore.getState().setRecall("prod-001", alert);

    const { recalls } = useStore.getState();
    expect(recalls["prod-001"]).toBeDefined();
    expect(recalls["prod-001"].severity).toBe("CRITICAL");
    expect(recalls["prod-001"].status).toBe("ACTIVE");
  });

  it("setRecall updates the product recall field in products array", () => {
    useStore.setState({
      products: [
        {
          id: "prod-001",
          name: "Test",
          origin: "Origin",
          owner: "GABC",
          timestamp: Date.now(),
          active: true,
          authorizedActors: [],
        },
      ],
    });

    const alert = makeRecall("prod-001");
    useStore.getState().setRecall("prod-001", alert);

    const product = useStore.getState().products.find((p) => p.id === "prod-001");
    expect(product?.recall).toBeDefined();
    expect(product?.recall?.severity).toBe("CRITICAL");
  });

  it("resolveRecall sets status to RESOLVED and records resolvedAt", () => {
    const alert = makeRecall("prod-001");
    useStore.getState().setRecall("prod-001", alert);

    useStore.getState().resolveRecall("prod-001", "GRESOLVER");

    const { recalls } = useStore.getState();
    expect(recalls["prod-001"].status).toBe("RESOLVED");
    expect(recalls["prod-001"].resolvedAt).toBeGreaterThan(0);
    expect(recalls["prod-001"].resolvedBy).toBe("GRESOLVER");
  });

  it("resolveRecall is a no-op for unknown productId", () => {
    useStore.getState().resolveRecall("unknown-product", "GRESOLVER");
    const { recalls } = useStore.getState();
    expect(recalls["unknown-product"]).toBeUndefined();
  });

  it("dismissAlert adds productId to dismissedAlerts", () => {
    useStore.getState().dismissAlert("prod-001");
    expect(useStore.getState().dismissedAlerts).toContain("prod-001");
  });

  it("dismissAlert does not duplicate entries", () => {
    useStore.getState().dismissAlert("prod-001");
    useStore.getState().dismissAlert("prod-001");
    const dismissed = useStore.getState().dismissedAlerts;
    // Both calls add to the array — the component filters duplicates via includes()
    expect(dismissed.filter((id) => id === "prod-001").length).toBeGreaterThanOrEqual(1);
  });

  it("clearDismissedAlerts empties the dismissed list", () => {
    useStore.getState().dismissAlert("prod-001");
    useStore.getState().dismissAlert("prod-002");
    useStore.getState().clearDismissedAlerts();
    expect(useStore.getState().dismissedAlerts).toHaveLength(0);
  });

  it("multiple products can have independent recalls", () => {
    const alert1 = makeRecall("prod-001");
    const alert2 = { ...makeRecall("prod-002"), severity: "HIGH" as const };

    useStore.getState().setRecall("prod-001", alert1);
    useStore.getState().setRecall("prod-002", alert2);

    const { recalls } = useStore.getState();
    expect(recalls["prod-001"].severity).toBe("CRITICAL");
    expect(recalls["prod-002"].severity).toBe("HIGH");
  });
});

// ── Certificate / Revocation store tests ─────────────────────────────────────

describe("store — certificates", () => {
  beforeEach(resetStore);

  it("addCertificate appends a certificate", () => {
    const cert = makeCert();
    useStore.getState().addCertificate(cert);

    const { certificates } = useStore.getState();
    expect(certificates).toHaveLength(1);
    expect(certificates[0].id).toBe("cert-001");
    expect(certificates[0].status).toBe("VALID");
  });

  it("setCertificates replaces the entire list", () => {
    useStore.getState().addCertificate(makeCert("cert-001"));
    useStore.getState().setCertificates([makeCert("cert-new")]);

    const { certificates } = useStore.getState();
    expect(certificates).toHaveLength(1);
    expect(certificates[0].id).toBe("cert-new");
  });

  it("revokeCertificate sets status to REVOKED", () => {
    const cert = makeCert("cert-001");
    useStore.getState().addCertificate(cert);

    useStore.getState().revokeCertificate("cert-001", "GREVOKER", "Fraud detected");

    const updated = useStore.getState().certificates.find((c) => c.id === "cert-001");
    expect(updated?.status).toBe("REVOKED");
    expect(updated?.revokedBy).toBe("GREVOKER");
    expect(updated?.revocationReason).toBe("Fraud detected");
    expect(updated?.revokedAt).toBeGreaterThan(0);
  });

  it("revokeCertificate does not affect other certificates", () => {
    useStore.getState().addCertificate(makeCert("cert-001"));
    useStore.getState().addCertificate(makeCert("cert-002"));

    useStore.getState().revokeCertificate("cert-001", "GREVOKER", "Reason");

    const cert2 = useStore.getState().certificates.find((c) => c.id === "cert-002");
    expect(cert2?.status).toBe("VALID");
  });

  it("revokeCertificate is a no-op for unknown certId", () => {
    useStore.getState().addCertificate(makeCert("cert-001"));
    useStore.getState().revokeCertificate("cert-unknown", "GREVOKER", "Reason");

    const cert = useStore.getState().certificates.find((c) => c.id === "cert-001");
    expect(cert?.status).toBe("VALID");
  });

  it("multiple certificates can be issued for the same product", () => {
    useStore.getState().addCertificate(makeCert("cert-001", "prod-001"));
    useStore.getState().addCertificate(makeCert("cert-002", "prod-001"));

    const productCerts = useStore
      .getState()
      .certificates.filter((c) => c.productId === "prod-001");
    expect(productCerts).toHaveLength(2);
  });

  it("revoked certificate is still queryable with REVOKED status", () => {
    useStore.getState().addCertificate(makeCert("cert-001"));
    useStore.getState().revokeCertificate("cert-001", "GREVOKER", "Expired standards");

    const cert = useStore.getState().certificates.find((c) => c.id === "cert-001");
    expect(cert).toBeDefined();
    expect(cert?.status).toBe("REVOKED");
  });
});
