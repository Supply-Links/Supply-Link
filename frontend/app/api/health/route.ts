import { NextRequest, NextResponse } from "next/server";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/stellar/client";
import { version } from "@/package.json";
import { withCors, handleOptions } from "@/lib/api/cors";
import { checkNetworkConfig } from "@/lib/network-config";

const startedAt = Date.now();

// ── Rate limiter ──────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

// ── Probe types ───────────────────────────────────────────────────────────────
export type ProbeStatus = "ok" | "degraded" | "down";

export interface ProbeResult {
  status: ProbeStatus;
  latencyMs: number;
  error?: string;
}

// ── Individual probes ─────────────────────────────────────────────────────────

/** Ping the Soroban RPC with a bounded timeout. */
export async function probeRpc(url: string, timeoutMs = 4000): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.ok ? "ok" : "degraded", latencyMs: Date.now() - start };
  } catch (e) {
    return { status: "down", latencyMs: Date.now() - start, error: String(e) };
  }
}

/**
 * Probe Vercel Blob by issuing a HEAD request to the blob store endpoint.
 * Requires BLOB_READ_WRITE_TOKEN in the environment.
 */
export async function probeBlob(timeoutMs = 3000): Promise<ProbeResult> {
  const start = Date.now();
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return { status: "degraded", latencyMs: 0, error: "BLOB_READ_WRITE_TOKEN not set" };
  }
  try {
    const res = await fetch("https://blob.vercel-storage.com", {
      method: "HEAD",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 200 or 405 both indicate the service is reachable
    const ok = res.status < 500;
    return { status: ok ? "ok" : "degraded", latencyMs: Date.now() - start };
  } catch (e) {
    return { status: "down", latencyMs: Date.now() - start, error: String(e) };
  }
}

/**
 * Probe KV store (Vercel KV / Upstash Redis) via a lightweight PING.
 * Requires KV_REST_API_URL and KV_REST_API_TOKEN in the environment.
 */
export async function probeKv(timeoutMs = 3000): Promise<ProbeResult> {
  const start = Date.now();
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return { status: "degraded", latencyMs: 0, error: "KV_REST_API_URL or KV_REST_API_TOKEN not set" };
  }
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.ok ? "ok" : "degraded", latencyMs: Date.now() - start };
  } catch (e) {
    return { status: "down", latencyMs: Date.now() - start, error: String(e) };
  }
}

/** Validate that required environment variables are present. */
export function probeEnvConfig(): ProbeResult {
  const required = ["NEXT_PUBLIC_CONTRACT_ID", "NEXT_PUBLIC_STELLAR_NETWORK"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === 0) return { status: "ok", latencyMs: 0 };
  return { status: "degraded", latencyMs: 0, error: `Missing env vars: ${missing.join(", ")}` };
}

/** Validate network/contract configuration parity against the expected matrix. */
export function probeNetworkConfig(): ProbeResult & { effectiveConfig?: object; drifts?: string[] } {
  const result = checkNetworkConfig();
  if (result.valid) {
    return { status: "ok", latencyMs: 0, effectiveConfig: result.effectiveConfig };
  }
  return {
    status: "degraded",
    latencyMs: 0,
    error: `Configuration drift: ${result.drifts.length} issue(s) detected`,
    drifts: result.drifts,
    effectiveConfig: result.effectiveConfig,
  };
}

// ── Aggregate helpers ─────────────────────────────────────────────────────────

function worstStatus(...statuses: ProbeStatus[]): ProbeStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  return "ok";
}

// ── Route handlers ────────────────────────────────────────────────────────────

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return withCors(
      request,
      NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      )
    );
  }

  // Run all readiness probes in parallel
  const [rpc, blob, kv] = await Promise.all([
    probeRpc(RPC_URL),
    probeBlob(),
    probeKv(),
  ]);
  const env = probeEnvConfig();
  const config = probeNetworkConfig();

  // Liveness: the process is alive (always ok if we reach here)
  const liveness: ProbeStatus = "ok";

  // Readiness: RPC, env, and config parity must not be down
  const readiness: ProbeStatus = worstStatus(rpc.status, env.status, config.status);

  const httpStatus = readiness === "down" ? 503 : 200;

  return withCors(
    request,
    NextResponse.json(
      {
        liveness,
        readiness,
        version,
        network: NETWORK_PASSPHRASE,
        contractId: CONTRACT_ID,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
        dependencies: { rpc, blob, kv, env, config },
      },
      { status: httpStatus }
    )
  );
}
