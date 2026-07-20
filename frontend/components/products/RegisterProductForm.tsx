"use client";

import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/state/store";
import { addProduct } from "@/lib/mock/products";
import type { Product } from "@/lib/types";

export function RegisterProductForm({ onSuccess }: { onSuccess?: (product: Product) => void }) {
  const walletAddress = useStore((s: { walletAddress: string | null }) => s.walletAddress);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !origin.trim()) return;
    setSubmitting(true);
    const product: Product = {
      id: `prod-${Date.now().toString(36)}`,
      name: name.trim(),
      origin: origin.trim(),
      owner: walletAddress || "GUNKNOWNOWNERABCDEFGHIJKLMNOPQRSTUVWXYZ",
      timestamp: Date.now(),
      active: true,
      authorizedActors: walletAddress ? [walletAddress] : [],
      ownershipHistory: walletAddress
        ? [{ owner: walletAddress, transferredAt: Date.now() }]
        : [],
    };
    addProduct(product);
    setName("");
    setOrigin("");
    setSubmitting(false);
    onSuccess?.(product);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-[var(--muted)] mb-1 block">Product Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Organic Coffee Beans"
          required
          className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          data-testid="register-name-input"
        />
      </div>
      <div>
        <label className="text-xs text-[var(--muted)] mb-1 block">Origin</label>
        <input
          type="text"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="e.g. Ethiopia"
          required
          className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          data-testid="register-origin-input"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 disabled:opacity-40"
        data-testid="register-submit"
      >
        Register Product
      </button>
    </form>
  );
}
