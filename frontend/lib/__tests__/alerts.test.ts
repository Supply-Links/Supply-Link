import { describe, it, expect, beforeEach } from "vitest";
import {
  MOCK_RECALL_ALERTS,
  getActiveAlertByProductId,
} from "@/lib/mock/products";
import type { RecallAlert } from "@/lib/types";

// ── Helper ────────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<RecallAlert> = {}): RecallAlert {
  return {
    productId: "prod-test",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    severity: "HIGH",
    title: "Test Alert",
    description: "Test description",
    timestamp: Date.now(),
    channels: "banner,email",
    active: true,
    ...overrides,
  };
}

// ── Mock data tests ───────────────────────────────────────────────────────────

describe("MOCK_RECALL_ALERTS", () => {
  it("contains at least one alert", () => {
    expect(MOCK_RECALL_ALERTS.length).toBeGreaterThan(0);
  });

  it("prod-001 has an active CRITICAL alert", () => {
    const alert = MOCK_RECALL_ALERTS.find(
      (a) => a.productId === "prod-001" && a.active
    );
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("CRITICAL");
  });
});

describe("getActiveAlertByProductId", () => {
  it("returns the active alert for a product that has one", () => {
    const alert = getActiveAlertByProductId("prod-001");
    expect(alert).toBeDefined();
    expect(alert!.active).toBe(true);
  });

  it("returns undefined for a product with no alert", () => {
    const alert = getActiveAlertByProductId("prod-999-nonexistent");
    expect(alert).toBeUndefined();
  });
});

// ── Alert severity ordering ───────────────────────────────────────────────────

describe("Alert severity values", () => {
  const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

  it("all severity levels are defined", () => {
    for (const sev of SEVERITY_ORDER) {
      const alert = makeAlert({ severity: sev });
      expect(alert.severity).toBe(sev);
    }
  });
});

// ── Alert shape validation ────────────────────────────────────────────────────

describe("RecallAlert shape", () => {
  it("has all required fields", () => {
    const alert = makeAlert();
    expect(alert).toHaveProperty("productId");
    expect(alert).toHaveProperty("issuer");
    expect(alert).toHaveProperty("severity");
    expect(alert).toHaveProperty("title");
    expect(alert).toHaveProperty("description");
    expect(alert).toHaveProperty("timestamp");
    expect(alert).toHaveProperty("channels");
    expect(alert).toHaveProperty("active");
  });

  it("channels is a comma-separated string", () => {
    const alert = makeAlert({ channels: "banner,email,webhook" });
    const parts = alert.channels.split(",").map((c) => c.trim());
    expect(parts).toContain("banner");
    expect(parts).toContain("email");
    expect(parts).toContain("webhook");
  });

  it("active flag can be toggled", () => {
    const active = makeAlert({ active: true });
    const resolved = { ...active, active: false };
    expect(active.active).toBe(true);
    expect(resolved.active).toBe(false);
  });
});

// ── Alert propagation logic ───────────────────────────────────────────────────

describe("Alert propagation", () => {
  it("only active alerts are surfaced", () => {
    const alerts: RecallAlert[] = [
      makeAlert({ productId: "p1", active: true }),
      makeAlert({ productId: "p2", active: false }),
      makeAlert({ productId: "p3", active: true }),
    ];
    const active = alerts.filter((a) => a.active);
    expect(active).toHaveLength(2);
    expect(active.every((a) => a.active)).toBe(true);
  });

  it("CRITICAL alerts are included in active set", () => {
    const alerts: RecallAlert[] = [
      makeAlert({ severity: "CRITICAL", active: true }),
      makeAlert({ severity: "LOW", active: false }),
    ];
    const critical = alerts.filter((a) => a.active && a.severity === "CRITICAL");
    expect(critical).toHaveLength(1);
  });

  it("resolving an alert sets active to false", () => {
    const alert = makeAlert({ active: true });
    const resolved = { ...alert, active: false };
    expect(resolved.active).toBe(false);
  });

  it("issuing a new alert replaces the previous one for the same product", () => {
    const existing = makeAlert({ productId: "p1", title: "Old Alert", active: true });
    const newAlert = makeAlert({ productId: "p1", title: "New Alert", active: true });

    // Simulate store logic: new alert replaces existing for same product
    let alerts: RecallAlert[] = [existing];
    alerts = [newAlert, ...alerts.filter((a) => a.productId !== newAlert.productId)];

    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("New Alert");
  });
});
