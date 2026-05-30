"use client";

import { ShieldCheck, ShieldOff, ShieldAlert } from "lucide-react";
import type { InsuranceCoverage } from "@/lib/types";

interface InsuranceStatusBadgeProps {
  coverage: InsuranceCoverage | null | undefined;
  /** If true, renders a compact inline badge; otherwise renders a larger card-style badge. */
  compact?: boolean;
}

function getCoverageStatus(coverage: InsuranceCoverage | null | undefined): {
  label: string;
  color: string;
  icon: React.ReactNode;
  description: string;
} {
  if (!coverage) {
    return {
      label: "No Coverage",
      color: "text-[var(--muted)] bg-[var(--muted-bg)] border-[var(--card-border)]",
      icon: <ShieldOff size={14} />,
      description: "No insurance coverage has been recorded for this product.",
    };
  }

  const now = new Date();
  const until = new Date(coverage.validUntil);
  const from = new Date(coverage.validFrom);
  const daysUntilExpiry = Math.ceil((until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (now < from) {
    return {
      label: "Pending",
      color: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950 dark:border-blue-800",
      icon: <ShieldAlert size={14} />,
      description: `Coverage starts ${coverage.validFrom}.`,
    };
  }

  if (now > until) {
    return {
      label: "Expired",
      color: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950 dark:border-red-800",
      icon: <ShieldOff size={14} />,
      description: `Coverage expired on ${coverage.validUntil}.`,
    };
  }

  if (daysUntilExpiry <= 30) {
    return {
      label: "Expiring Soon",
      color: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-800",
      icon: <ShieldAlert size={14} />,
      description: `Coverage expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}.`,
    };
  }

  return {
    label: "Active",
    color: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800",
    icon: <ShieldCheck size={14} />,
    description: `Covered until ${coverage.validUntil}.`,
  };
}

export function InsuranceStatusBadge({ coverage, compact = false }: InsuranceStatusBadgeProps) {
  const { label, color, icon, description } = getCoverageStatus(coverage);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}
        title={description}
      >
        {icon}
        {label}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border ${color}`}>
      {icon}
      <span>{label}</span>
      <span className="text-xs font-normal opacity-75">— {description}</span>
    </div>
  );
}
