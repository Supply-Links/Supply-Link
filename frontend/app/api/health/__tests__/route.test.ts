import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stellar/client", () => ({
  CONTRACT_ID: "CTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  RPC_URL: "https://soroban-testnet.stellar.org",
}));

vi.mock("@/package.json", () => ({ version: "0.1.0" }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper: build a minimal NextRequest-like object
function makeRequest(ip = "127.0.0.1") {
  return {
    headers: { get: (h: string) => (h === "x-forwarded-for" ? ip : null) },
  } as unknown as import("next/server").NextRequest;
}

describe("probeRpc", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok when RPC responds 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const { probeRpc } = await import("../route");
    const result = await probeRpc("https://soroban-testnet.stellar.org");
    expect(result.status).toBe("ok");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns degraded when RPC responds non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { probeRpc } = await import("../route");
    const result = await probeRpc("https://soroban-testnet.stellar.org");
    expect(result.status).toBe("degraded");
  });

  it("returns down when RPC throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    const { probeRpc } = await import("../route");
    const result = await probeRpc("https://soroban-testnet.stellar.org");
    expect(result.status).toBe("down");
    expect(result.error).toBeDefined();
  });
});

describe("probeBlob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns degraded when BLOB_READ_WRITE_TOKEN is missing", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { probeBlob } = await import("../route");
    const result = await probeBlob();
    expect(result.status).toBe("degraded");
    expect(result.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
  });

  it("returns ok when blob endpoint is reachable", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockFetch.mockResolvedValueOnce({ status: 200 });
    const { probeBlob } = await import("../route");
    const result = await probeBlob();
    expect(result.status).toBe("ok");
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("returns down when blob endpoint throws", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const { probeBlob } = await import("../route");
    const result = await probeBlob();
    expect(result.status).toBe("down");
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
});

describe("probeKv", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns degraded when KV env vars are missing", async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const { probeKv } = await import("../route");
    const result = await probeKv();
    expect(result.status).toBe("degraded");
    expect(result.error).toMatch(/KV_REST_API/);
  });

  it("returns ok when KV ping succeeds", async () => {
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "kv-token";
    mockFetch.mockResolvedValueOnce({ ok: true });
    const { probeKv } = await import("../route");
    const result = await probeKv();
    expect(result.status).toBe("ok");
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("returns down when KV ping throws", async () => {
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "kv-token";
    mockFetch.mockRejectedValueOnce(new Error("refused"));
    const { probeKv } = await import("../route");
    const result = await probeKv();
    expect(result.status).toBe("down");
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });
});

describe("probeEnvConfig", () => {
  it("returns ok when required env vars are present", async () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = "CTEST";
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    const { probeEnvConfig } = await import("../route");
    expect(probeEnvConfig().status).toBe("ok");
  });

  it("returns degraded when a required env var is missing", async () => {
    const saved = process.env.NEXT_PUBLIC_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_CONTRACT_ID;
    const { probeEnvConfig } = await import("../route");
    const result = probeEnvConfig();
    expect(result.status).toBe("degraded");
    expect(result.error).toMatch(/NEXT_PUBLIC_CONTRACT_ID/);
    process.env.NEXT_PUBLIC_CONTRACT_ID = saved;
  });
});

describe("GET /api/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns liveness ok and readiness ok when all probes pass", async () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = "CTEST";
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    // rpc probe + blob probe (no token → degraded, but blob is non-critical)
    mockFetch.mockResolvedValueOnce({ ok: true }); // rpc
    // blob has no token → no fetch call
    // kv has no token → no fetch call

    const { GET } = await import("../route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.liveness).toBe("ok");
    expect(body.readiness).toBe("ok");
    expect(body.dependencies.rpc.status).toBe("ok");
    expect(body.dependencies.env.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 503 when RPC is down", async () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = "CTEST";
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    mockFetch.mockRejectedValueOnce(new Error("timeout")); // rpc down

    const { GET } = await import("../route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.readiness).toBe("down");
    expect(body.dependencies.rpc.status).toBe("down");
  });

  it("includes per-dependency latency in response", async () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = "CTEST";
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { GET } = await import("../route");
    const body = await (await GET(makeRequest())).json();

    expect(typeof body.dependencies.rpc.latencyMs).toBe("number");
    expect(typeof body.dependencies.blob.latencyMs).toBe("number");
    expect(typeof body.dependencies.kv.latencyMs).toBe("number");
    expect(typeof body.dependencies.env.latencyMs).toBe("number");
  });

  it("returns 429 when rate limited", async () => {
    const { GET } = await import("../route");
    // Exhaust the rate limit for a unique IP
    const ip = "10.0.0.99";
    for (let i = 0; i < 10; i++) {
      mockFetch.mockResolvedValue({ ok: true });
      await GET(makeRequest(ip));
    }
    const res = await GET(makeRequest(ip));
    expect(res.status).toBe(429);
  });
});
