import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispatchWebhook,
  propagateAlert,
  formatSeverity,
  severityStyles,
  type WebhookPayload,
} from "../notify";
import type { RecallAlert } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAlert(
  overrides: Partial<RecallAlert> = {}
): RecallAlert {
  return {
    productId: "prod-001",
    severity: "CRITICAL",
    message: "Contamination detected in batch #42",
    issuedBy: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1710000000000,
    status: "ACTIVE",
    distribution: {
      webhookUrl: "https://example.com/webhook",
      notifyOwner: true,
      notifyActors: true,
      broadcastPublic: true,
    },
    ...overrides,
  };
}

// ── dispatchWebhook ───────────────────────────────────────────────────────────

describe("dispatchWebhook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true on a 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const payload: WebhookPayload = {
      event: "recall.issued",
      alert: makeAlert(),
      timestamp: Date.now(),
    };

    const result = await dispatchWebhook("https://example.com/hook", payload);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns ok:false with error message on non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const payload: WebhookPayload = {
      event: "recall.issued",
      alert: makeAlert(),
      timestamp: Date.now(),
    };

    const result = await dispatchWebhook("https://example.com/hook", payload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns ok:false with error message on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network unreachable"));

    const payload: WebhookPayload = {
      event: "recall.issued",
      alert: makeAlert(),
      timestamp: Date.now(),
    };

    const result = await dispatchWebhook("https://example.com/hook", payload);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Network unreachable");
  });

  it("sends correct headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch;

    const alert = makeAlert({ severity: "HIGH" });
    const payload: WebhookPayload = {
      event: "recall.issued",
      alert,
      timestamp: Date.now(),
    };

    await dispatchWebhook("https://example.com/hook", payload);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["X-Supply-Link-Event"]).toBe("recall.issued");
    expect(options.headers["X-Supply-Link-Severity"]).toBe("HIGH");
    expect(options.method).toBe("POST");
  });
});

// ── propagateAlert ────────────────────────────────────────────────────────────

describe("propagateAlert", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches webhook when webhookUrl is set", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const alert = makeAlert();
    const result = await propagateAlert(alert, "recall.issued");

    expect(result.webhookSent).toBe(true);
    expect(result.webhookError).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("skips webhook when no webhookUrl is configured", async () => {
    global.fetch = vi.fn();

    const alert = makeAlert({
      distribution: {
        notifyOwner: true,
        notifyActors: true,
        broadcastPublic: false,
      },
    });

    const result = await propagateAlert(alert, "recall.issued");

    expect(result.webhookSent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("captures webhook error in result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const alert = makeAlert();
    const result = await propagateAlert(alert, "recall.issued");

    expect(result.webhookSent).toBe(false);
    expect(result.webhookError).toContain("503");
  });

  it("defaults event to recall.issued", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch;

    const alert = makeAlert();
    await propagateAlert(alert);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.event).toBe("recall.issued");
  });
});

// ── formatSeverity ────────────────────────────────────────────────────────────

describe("formatSeverity", () => {
  it("formats CRITICAL with emoji prefix", () => {
    expect(formatSeverity("CRITICAL")).toContain("CRITICAL");
    expect(formatSeverity("CRITICAL")).toContain("🚨");
  });

  it("formats HIGH with warning emoji", () => {
    expect(formatSeverity("HIGH")).toContain("HIGH");
    expect(formatSeverity("HIGH")).toContain("⚠️");
  });

  it("formats MEDIUM", () => {
    expect(formatSeverity("MEDIUM")).toContain("MEDIUM");
  });

  it("formats LOW", () => {
    expect(formatSeverity("LOW")).toContain("LOW");
  });
});

// ── severityStyles ────────────────────────────────────────────────────────────

describe("severityStyles", () => {
  it("returns red styles for CRITICAL", () => {
    const styles = severityStyles("CRITICAL");
    expect(styles.badge).toContain("red");
    expect(styles.banner).toContain("red");
  });

  it("returns orange styles for HIGH", () => {
    const styles = severityStyles("HIGH");
    expect(styles.badge).toContain("orange");
  });

  it("returns yellow styles for MEDIUM", () => {
    const styles = severityStyles("MEDIUM");
    expect(styles.badge).toContain("yellow");
  });

  it("returns blue styles for LOW", () => {
    const styles = severityStyles("LOW");
    expect(styles.badge).toContain("blue");
  });

  it("returns all required style keys", () => {
    const styles = severityStyles("CRITICAL");
    expect(styles).toHaveProperty("banner");
    expect(styles).toHaveProperty("badge");
    expect(styles).toHaveProperty("icon");
    expect(styles).toHaveProperty("border");
  });
});
