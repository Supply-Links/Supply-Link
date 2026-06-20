'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, RefreshCw, AlertCircle, Search, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReadAccessLog, SensitiveOperation } from '@/lib/services/readAccessAudit';
import { queryReadAccessLogs, getReadAuditStats } from '@/lib/services/readAccessAudit';

// ── Operation label map ───────────────────────────────────────────────────────

const OPERATION_LABELS: Record<SensitiveOperation, string> = {
  'product.read': 'Product Read',
  'product.verify': 'Product Verify',
  'certification.read': 'Certification Read',
  'attestation.read': 'Attestation Read',
  'private_metadata.read': 'Private Metadata',
  'insurance.read': 'Insurance Read',
  'revocation.read': 'Revocation Read',
};

const OPERATION_BADGE: Record<SensitiveOperation, string> = {
  'product.read': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'product.verify': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'certification.read': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'attestation.read': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'private_metadata.read': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'insurance.read': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'revocation.read': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: ReadAccessLog }) {
  const ts = new Date(log.timestamp).toLocaleString();
  const statusColor =
    log.responseStatus >= 200 && log.responseStatus < 300
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <tr className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--muted-bg)] transition-colors">
      <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">{ts}</td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${OPERATION_BADGE[log.operation] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {OPERATION_LABELS[log.operation] ?? log.operation}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs font-mono text-[var(--foreground)] max-w-[120px] truncate">
        {log.actor.id}
        <span className="ml-1 text-[var(--muted)] font-sans">({log.actor.type})</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-[var(--muted)] max-w-[140px] truncate hidden md:table-cell">
        {log.productIds.join(', ')}
      </td>
      <td className="px-4 py-2.5 text-xs text-[var(--muted)] hidden lg:table-cell truncate max-w-[160px]">
        {log.requestPath}
      </td>
      <td className={`px-4 py-2.5 text-xs font-semibold ${statusColor}`}>
        {log.responseStatus}
      </td>
    </tr>
  );
}

// ── Stats row ─────────────────────────────────────────────────────────────────

interface StatsRowProps {
  totalLogs: number;
  uniqueProducts: number;
  uniqueActors: number;
}

function StatsRow({ totalLogs, uniqueProducts, uniqueActors }: StatsRowProps) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {[
        { label: 'Total accesses', value: totalLogs },
        { label: 'Unique products', value: uniqueProducts },
        { label: 'Unique actors', value: uniqueActors },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-center"
        >
          <p className="text-lg font-bold text-[var(--foreground)]">{value}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface ReadAccessAuditLogProps {
  /** Filter to a specific product ID. */
  productId?: string;
  /** Maximum rows to display. */
  limit?: number;
}

/**
 * Displays the read access audit log for sensitive product operations.
 * Supports filtering by product ID, actor, and operation type.
 */
export function ReadAccessAuditLog({ productId, limit = 50 }: ReadAccessAuditLogProps) {
  const t = useTranslations('readAccessAuditLog');
  const [logs, setLogs] = useState<ReadAccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActor, setSearchActor] = useState('');
  const [filterOp, setFilterOp] = useState<SensitiveOperation | ''>('');
  const [stats, setStats] = useState({ totalLogs: 0, uniqueProducts: 0, uniqueActors: 0 });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const result = queryReadAccessLogs({
        productId,
        actorId: searchActor.trim() || undefined,
        operation: filterOp || undefined,
        limit,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setStats(getReadAuditStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [productId, searchActor, filterOp, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section aria-label={t('title')}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-[var(--muted)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t('title')}
            {total > 0 && (
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                ({total} {t('entries')})
              </span>
            )}
          </h3>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
          aria-label={t('refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      {!productId && (
        <StatsRow
          totalLogs={stats.totalLogs}
          uniqueProducts={stats.uniqueProducts}
          uniqueActors={stats.uniqueActors}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchActor}
            onChange={(e) => setSearchActor(e.target.value)}
            placeholder={t('filterByActor')}
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
        <div className="relative">
          <Filter
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden="true"
          />
          <select
            value={filterOp}
            onChange={(e) => setFilterOp(e.target.value as SensitiveOperation | '')}
            className="pl-7 pr-2 py-1.5 text-xs rounded border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            <option value="">{t('allOperations')}</option>
            {(Object.keys(OPERATION_LABELS) as SensitiveOperation[]).map((op) => (
              <option key={op} value={op}>
                {OPERATION_LABELS[op]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mb-4">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {!loading && logs.length === 0 && (
        <p className="text-sm text-[var(--muted)]">{t('noEntries')}</p>
      )}

      {logs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
                <th className="px-4 py-2.5 text-xs font-medium">{t('colTimestamp')}</th>
                <th className="px-4 py-2.5 text-xs font-medium">{t('colOperation')}</th>
                <th className="px-4 py-2.5 text-xs font-medium">{t('colActor')}</th>
                <th className="px-4 py-2.5 text-xs font-medium hidden md:table-cell">{t('colProducts')}</th>
                <th className="px-4 py-2.5 text-xs font-medium hidden lg:table-cell">{t('colPath')}</th>
                <th className="px-4 py-2.5 text-xs font-medium">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--muted)]">
        {t('privacyNote')}
      </p>
    </section>
  );
}

export default ReadAccessAuditLog;
