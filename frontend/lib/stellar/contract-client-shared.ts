/**
 * Shared, non-network logic for MockContractClient and LiveContractClient (#614).
 *
 * Argument validation, ID/timestamp formatting, event pagination, and
 * error-shaping used to live independently in each implementation, which
 * meant a fix to one (e.g. how a `productId` is validated) could silently
 * drift from the other. Both clients import these helpers instead of
 * reimplementing them.
 */

import type { EventFilter, EventPage, TrackingEvent } from '@/lib/types';
import { mapContractError, type MappedContractError } from './contract-errors';

// ── Argument Validation ──────────────────────────────────────────────────

/**
 * Throws if `value` is not a non-empty string. Used for required entity
 * identifiers (productId, actor addresses, etc.) shared by both clients.
 */
export function requireNonEmptyId(value: string, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and must be a non-empty string`);
  }
  return value;
}

// ── ID / Timestamp Formatting ────────────────────────────────────────────

/**
 * Builds a deterministic mock transaction id in the
 * `mock_tx_<operation>[_<id>]_<timestamp>` shape used throughout
 * MockContractClient, so every mutating mock method formats ids the same way.
 */
export function formatMockTxId(operation: string, id?: string | number): string {
  const parts = id === undefined || id === '' ? [operation] : [operation, id];
  return ['mock_tx', ...parts, Date.now()].join('_');
}

// ── Event Filtering & Pagination ─────────────────────────────────────────

/** Filters tracking events by event type, actor, and timestamp range. */
export function applyFilter(events: TrackingEvent[], filter?: EventFilter): TrackingEvent[] {
  if (!filter) return events;

  return events.filter((e) => {
    if (filter.eventType && e.eventType !== filter.eventType) return false;
    if (filter.actor && e.actor.toLowerCase() !== filter.actor.toLowerCase()) return false;
    if (filter.fromTimestamp && e.timestamp < filter.fromTimestamp) return false;
    if (filter.toTimestamp && e.timestamp > filter.toTimestamp) return false;
    return true;
  });
}

/** Slices `events` into a single page and applies `filter`, per EventPage semantics. */
export function paginateEvents(
  events: TrackingEvent[],
  offset: number,
  limit: number,
  filter?: EventFilter,
): EventPage {
  const total = events.length;
  const rawPage = events.slice(offset, offset + limit);
  return { events: applyFilter(rawPage, filter), total, offset, limit };
}

/**
 * Repeatedly calls `fetchPage` until every page for a product has been
 * retrieved, concatenating the results. Both clients fetch a page
 * differently (an in-memory map vs. a Soroban RPC call) but the pagination
 * loop that walks `offset` forward until `total` is exhausted is identical.
 */
export async function collectAllEventPages(
  fetchPage: (offset: number, limit: number) => Promise<EventPage>,
  pageSize: number,
): Promise<TrackingEvent[]> {
  const first = await fetchPage(0, pageSize);
  const results: TrackingEvent[] = [...first.events];

  for (let offset = pageSize; offset < first.total; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    results.push(...page.events);
  }

  return results;
}

/** Orders tracking events chronologically, oldest first, for provenance reporting. */
export function sortEventsByTimestamp(events: TrackingEvent[]): TrackingEvent[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
}

// ── Error Shaping ────────────────────────────────────────────────────────

/**
 * A contract error that has been mapped to its stable code/key/message via
 * the catalog in `contract-errors.ts`, so callers can branch on `.code`
 * instead of matching on error message strings.
 */
export class ContractClientError extends Error {
  readonly code: MappedContractError['code'];
  readonly key: string;
  readonly httpStatus: number;
  readonly sourceError: unknown;

  constructor(mapped: MappedContractError, sourceError: unknown) {
    super(mapped.message);
    this.name = 'ContractClientError';
    this.code = mapped.code;
    this.key = mapped.key;
    this.httpStatus = mapped.httpStatus;
    this.sourceError = sourceError;
  }
}

/**
 * Maps a raw Soroban invocation error to a {@link ContractClientError} via
 * the shared error catalog. Errors that don't match a known contract error
 * code are returned unchanged so callers keep the original stack/context.
 */
export function toContractError(error: unknown): unknown {
  const mapped = mapContractError(error);
  return mapped ? new ContractClientError(mapped, error) : error;
}
