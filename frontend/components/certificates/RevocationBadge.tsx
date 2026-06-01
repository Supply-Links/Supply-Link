import { ShieldOff, ShieldCheck } from "lucide-react";
import type { RevocationRecord } from "@/lib/types";

interface RevocationBadgeProps {
  revoked: boolean;
  revocation?: RevocationRecord;
  /** Show compact inline badge vs full detail block */
  compact?: boolean;
}

export function RevocationBadge({ revoked, revocation, compact = false }: RevocationBadgeProps) {
  if (!revoked) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <ShieldCheck size={11} aria-hidden="true" />
        Valid
      </span>
    );
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <ShieldOff size={11} aria-hidden="true" />
        Revoked
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3">
      <div className="flex items-center gap-2 mb-1">
        <ShieldOff size={14} className="text-red-600 dark:text-red-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">
          Certificate Revoked
        </span>
      </div>
      {revocation && (
        <div className="text-xs text-[var(--muted)] space-y-0.5 ml-5">
          <p>
            <span className="font-medium">Reason:</span> {revocation.reason}
          </p>
          <p>
            <span className="font-medium">Revoked at:</span>{" "}
            {new Date(revocation.revokedAt).toLocaleString()}
          </p>
          <p className="font-mono break-all">
            <span className="font-medium font-sans">By:</span>{" "}
            {revocation.revoker.slice(0, 8)}…{revocation.revoker.slice(-6)}
          </p>
        </div>
      )}
    </div>
  );
}
