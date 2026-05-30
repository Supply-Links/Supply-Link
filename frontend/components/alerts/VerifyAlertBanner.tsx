"use client";

import { useStore } from "@/lib/state/store";
import { EmergencyAlertBanner } from "./EmergencyAlertBanner";

interface VerifyAlertBannerProps {
  productId: string;
}

/**
 * Public-facing alert banner for the verification page.
 * Reads recall state from the store (populated when the product owner
 * issues a recall with broadcastPublic: true).
 */
export function VerifyAlertBanner({ productId }: VerifyAlertBannerProps) {
  const { recalls } = useStore();
  const alert = recalls[productId];

  if (!alert || alert.status !== "ACTIVE") return null;
  if (!alert.distribution.broadcastPublic) return null;

  return (
    <div className="mb-6">
      <EmergencyAlertBanner alert={alert} />
    </div>
  );
}
