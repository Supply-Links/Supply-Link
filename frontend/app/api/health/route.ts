import { NextResponse } from "next/server";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/stellar/client";
import { version } from "@/package.json";

const startedAt = Date.now();

async function pingRpc(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const contractReachable = await pingRpc(RPC_URL);

  return NextResponse.json({
    status: "ok",
    version,
    network: NETWORK_PASSPHRASE,
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    contractReachable,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
}
