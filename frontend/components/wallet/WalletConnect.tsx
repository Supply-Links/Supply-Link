"use client";

import { useState } from "react";
import { getWalletAddress } from "@/lib/stellar/client";
import { useStore } from "@/lib/state/store";

export function WalletConnect() {
  const { walletAddress, setWalletAddress } = useStore();
  const [loading, setLoading] = useState(false);

  async function connect() {
    setLoading(true);
    try {
      const address = await getWalletAddress();
      setWalletAddress(address);
    } finally {
      setLoading(false);
    }
  }

  if (walletAddress) {
    return (
      <span className="text-sm font-mono text-green-600" data-testid="wallet-status">
        {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
      </span>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={loading}
      className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50"
      data-testid="wallet-connect-button"
    >
      {loading ? "Connecting…" : "Connect Freighter"}
    </button>
  );
}
