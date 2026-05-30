"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Search, Download } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { getReadLogs } from "@/lib/stellar/client";
import { MOCK_READ_LOGS, MOCK_PRODUCTS } from "@/lib/mock/products";
import type { ReadAccessLog } from "@/lib/types";

const PURPOSE_LABELS: Record<string, string> = {
  INSURANCE_VERIFY: "Insurance Verification",
  AUDIT: "Audit",
  OWNERSHIP_CHECK: "Ownership Check",
  CLAIM_REVIEW: "Claim Review",
  COMPLIANCE: "Compliance Review",
};

const PURPOSE_COLORS: Record<string, string> = {
  INSURANCE_VERIFY: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950 dark:border-violet-800",
  AUDIT: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950 dark:border-blue-800",
  OWNERSHIP_CHECK: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-800",
  CLAIM_REVIEW: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800",
  COMPLIANCE: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950 dark:border-red-800",
};

function purposeLabel(p: string) { return PURPOSE_LABELS[p] ?? p; }
function purposeColor(p: string) {
  return PURPOSE_COLORS[p] ?? "text-[var(--muted)] bg-[var(--muted-bg)] border-[var(--card-border)]";
}

function LogSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-[var(--muted-bg)] rounded-lg" />
      ))}
    </div>
  );
}

export default function AuditPage() {
  const { walletAddress, readAccessLogs, setReadAccessLogs } = useStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("ALL");

  // Flatten all logs from the store into a single list
  const allLogs: ReadAccessLog[] = Object.values(readAccessLogs).flat();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (walletAddress) {
          // Attempt to fetch logs for each known product
          const results = await Promise.allSettled(
            MOCK_PRODUCTS.map((p) => getReadLogs(p.id, walletAddress))
          );
          results.forEach((result, i) => {
            if (result.status === "fulfilled" && result.value.length > 0) {
              setReadAccessLogs(MOCK_PRODUCTS[i].id, result.value);
            } else {
              // Fall back to mock data
              const mock = MOCK_READ_LOGS[MOCK_PRODUCTS[i].id] ?? [];
              if (mock.length > 0) setReadAccessLogs(MOCK_PRODUCTS[i].id, mock);
            }
          });
        } else {
          // No wallet — seed mock data
          Object.entries(MOCK_READ_LOGS).forEach(([productId, logs]) => {
            setReadAccessLogs(productId, logs);
          });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const filtered = allLogs.filter((log) => {
    const matchesSearch =
      search === "" ||
      log.productId.toLowerCase().includes(search.toLowerCase()) ||
      log.accessor.toLowerCase().includes(search.toLowerCase()) ||
      log.purpose.toLowerCase().includes(search.toLowerCase());
    const matchesPurpose = purposeFilter === "ALL" || log.purpose === purposeFilter;
    return matchesSearch && matchesPurpose;
  });

  // Sort newest first
  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

  function exportCsv() {
    const header = "Product ID,Accessor,Purpose,Timestamp\n";
    const rows = sorted
      .map(
        (l) =>
          `"${l.productId}","${l.accessor}","${purposeLabel(l.purpose)}","${new Date(l.timestamp).toISOString()}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supply-link-audit-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <ClipboardList size={22} className="text-violet-500" />
            Audit Log
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Read-access events recorded on-chain for sensitive product records.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={sorted.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-sm font-medium text-[var(--foreground)] transition-colors disabled:opacity-40 self-start sm:self-auto"
          aria-label="Export audit log as CSV"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {/* Privacy notice */}
      <div className="text-xs text-[var(--muted)] bg-[var(--muted-bg)] rounded-xl px-4 py-3 mb-6">
        Access logs are immutable on-chain records. Accessor addresses are pseudonymous Stellar public keys
        and are not linked to personal identity. Only product owners can query the full trail for their products.
        This view shows logs available to the connected wallet.
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Search by product ID, accessor, or purpose…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <select
          value={purposeFilter}
          onChange={(e) => setPurposeFilter(e.target.value)}
          className="border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Filter by purpose"
        >
          <option value="ALL">All Purposes</option>
          {Object.entries(PURPOSE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Entries", value: allLogs.length },
          { label: "Filtered", value: sorted.length },
          { label: "Unique Products", value: new Set(allLogs.map((l) => l.productId)).size },
          { label: "Unique Accessors", value: new Set(allLogs.map((l) => l.accessor)).size },
        ].map(({ label, value }) => (
          <div key={label} className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[var(--foreground)]">{value}</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Log table */}
      {loading ? (
        <LogSkeleton />
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)]">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No audit log entries found.</p>
          {!walletAddress && (
            <p className="text-xs mt-1">Connect your wallet to load on-chain logs.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
          <table className="w-full text-sm" role="table" aria-label="Audit log entries">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Product ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Accessor
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Purpose
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((log, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--muted-bg)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-[var(--foreground)]">{log.productId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-xs text-[var(--foreground)]"
                      title={log.accessor}
                    >
                      {log.accessor.slice(0, 8)}…{log.accessor.slice(-6)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${purposeColor(log.purpose)}`}
                    >
                      {purposeLabel(log.purpose)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
