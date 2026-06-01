/**
 * Read Access Audit Log Service.
 *
 * Records read access events for sensitive product verification requests.
 * Logs actor, timestamp, requested product IDs, and request context.
 * Privacy-aware: no raw PII is stored beyond what is necessary for audit.
 *
 * In production, logs should be persisted to an append-only store (e.g.
 * Vercel KV, a database, or a SIEM-compatible log sink).
 */

export type AccessActor = {
  /** Wallet address or API key identifier (truncated for privacy). */
  id: string;
  /** Actor type. */
  type: 'wallet' | 'api_key' | 'anonymous';
  /** Hashed IP address (SHA-256 hex, first 16 chars) for privacy. */
  ipHash?: string;
};

export type SensitiveOperation =
  | 'product.read'
  | 'product.verify'
  | 'certification.read'
  | 'attestation.read'
  | 'private_metadata.read'
  | 'insurance.read'
  | 'revocation.read';

export interface ReadAccessLog {
  /** Unique log entry ID. */
  id: string;
  /** The operation that was performed. */
  operation: SensitiveOperation;
  /** Product IDs that were accessed. */
  productIds: string[];
  /** Actor who performed the read. */
  actor: AccessActor;
  /** Unix ms timestamp of the access. */
  timestamp: number;
  /** HTTP method and path (sanitised — no query params with PII). */
  requestPath: string;
  /** HTTP response status code. */
  responseStatus: number;
  /** Correlation ID for cross-service tracing. */
  correlationId?: string;
  /** Additional context (non-PII). */
  metadata?: Record<string, string | number | boolean>;
}

export interface ReadAccessQuery {
  productId?: string;
  actorId?: string;
  operation?: SensitiveOperation;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  offset?: number;
}

export interface ReadAccessQueryResult {
  logs: ReadAccessLog[];
  total: number;
}

// ── In-memory store (replace with append-only DB in production) ───────────────

const logStore: ReadAccessLog[] = [];

// ── Logging ───────────────────────────────────────────────────────────────────

/**
 * Record a read access event. This is the primary entry point for all
 * sensitive read operations.
 */
export function recordReadAccess(params: {
  operation: SensitiveOperation;
  productIds: string[];
  actor: AccessActor;
  requestPath: string;
  responseStatus: number;
  correlationId?: string;
  metadata?: Record<string, string | number | boolean>;
}): ReadAccessLog {
  const id = `ral-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const entry: ReadAccessLog = {
    id,
    operation: params.operation,
    productIds: params.productIds,
    actor: params.actor,
    timestamp: Date.now(),
    requestPath: params.requestPath,
    responseStatus: params.responseStatus,
    correlationId: params.correlationId,
    metadata: params.metadata,
  };

  logStore.push(entry);

  // Emit structured log for external ingestion (SIEM, log aggregator)
  console.log(`[READ_AUDIT] ${JSON.stringify(entry)}`);

  return entry;
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Query the read access log with optional filters.
 * Results are sorted newest-first.
 */
export function queryReadAccessLogs(query: ReadAccessQuery = {}): ReadAccessQueryResult {
  const {
    productId,
    actorId,
    operation,
    fromTimestamp,
    toTimestamp,
    limit = 50,
    offset = 0,
  } = query;

  let filtered = logStore.slice(); // copy

  if (productId) {
    filtered = filtered.filter((l) => l.productIds.includes(productId));
  }
  if (actorId) {
    filtered = filtered.filter((l) => l.actor.id === actorId);
  }
  if (operation) {
    filtered = filtered.filter((l) => l.operation === operation);
  }
  if (fromTimestamp !== undefined) {
    filtered = filtered.filter((l) => l.timestamp >= fromTimestamp);
  }
  if (toTimestamp !== undefined) {
    filtered = filtered.filter((l) => l.timestamp <= toTimestamp);
  }

  // Sort newest-first
  filtered.sort((a, b) => b.timestamp - a.timestamp);

  const total = filtered.length;
  const logs = filtered.slice(offset, offset + limit);

  return { logs, total };
}

/** Get a single log entry by ID. */
export function getReadAccessLog(id: string): ReadAccessLog | null {
  return logStore.find((l) => l.id === id) ?? null;
}

/** Get all log entries for a specific product. */
export function getProductAccessHistory(productId: string): ReadAccessLog[] {
  return logStore
    .filter((l) => l.productIds.includes(productId))
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getReadAuditStats(): {
  totalLogs: number;
  uniqueProducts: number;
  uniqueActors: number;
  operationBreakdown: Record<SensitiveOperation, number>;
} {
  const operationBreakdown = {} as Record<SensitiveOperation, number>;

  for (const log of logStore) {
    operationBreakdown[log.operation] = (operationBreakdown[log.operation] ?? 0) + 1;
  }

  return {
    totalLogs: logStore.length,
    uniqueProducts: new Set(logStore.flatMap((l) => l.productIds)).size,
    uniqueActors: new Set(logStore.map((l) => l.actor.id)).size,
    operationBreakdown,
  };
}

// ── Privacy helpers ───────────────────────────────────────────────────────────

/**
 * Truncate a wallet address for privacy-safe logging.
 * Returns first 6 + last 4 chars: "GABCD...WXYZ"
 */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Build an AccessActor from a wallet address.
 */
export function actorFromWallet(walletAddress: string): AccessActor {
  return {
    id: truncateAddress(walletAddress),
    type: 'wallet',
  };
}

/**
 * Build an AccessActor from an API key identifier.
 */
export function actorFromApiKey(keyId: string): AccessActor {
  return {
    id: keyId.slice(0, 8) + '...',
    type: 'api_key',
  };
}

/**
 * Build an anonymous AccessActor (public / unauthenticated access).
 */
export function anonymousActor(ipHash?: string): AccessActor {
  return {
    id: 'anonymous',
    type: 'anonymous',
    ipHash,
  };
}
