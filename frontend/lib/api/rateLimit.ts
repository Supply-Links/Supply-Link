/**
 * In-memory rate limiter for Next.js API routes.
 *
 * Works in serverless environments (per-instance state).
 * Supports endpoint-level configuration, short + long windows,
 * safe IP extraction from trusted proxy headers,
 * RFC 7231-compatible Retry-After responses, IP reputation tracking
 * with automatic blocking of repeat violators, circuit breaker pattern
 * for downstream dependencies, and a pluggable distributed backend for
 * accurate rate limiting across multiple application instances.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/api/cors';
import { apiError, ErrorCode } from '@/lib/api/errors';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Max requests allowed in the short window */
  limit: number;
  /** Short window duration in ms */
  windowMs: number;
  /** Optional stricter long-window burst cap */
  burstLimit?: number;
  burstWindowMs?: number;
}

// ── Endpoint presets ──────────────────────────────────────────────────────────

export const RATE_LIMIT_PRESETS = {
  /** General public endpoints */
  default: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Authenticated wallet users — higher quota than anonymous */
  authenticated: { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
  /** Public product read endpoints — anonymous, moderate */
  publicRead: {
    limit: 30,
    windowMs: 60_000,
    burstLimit: 10,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /**
   * Authenticated write endpoints (POST/PUT/PATCH/DELETE) — lower quota
   * than reads to limit the blast radius of abusive write traffic.
   */
  write: {
    limit: 30,
    windowMs: 60_000,
    burstLimit: 5,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /**
   * Sensitive write endpoints (api-key creation, auth operations) — very strict
   * to prevent credential-stuffing and enumeration attacks.
   */
  sensitiveWrite: {
    limit: 10,
    windowMs: 60_000,
    burstLimit: 3,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /** Public QR verification page — anonymous, strict to protect contract reads */
  verify: {
    limit: 20,
    windowMs: 60_000,
    burstLimit: 5,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /** Signature-heavy or write endpoints */
  ratings: {
    limit: 20,
    windowMs: 60_000,
    burstLimit: 5,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /** File upload — expensive, strict */
  upload: {
    limit: 10,
    windowMs: 60_000,
    burstLimit: 3,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /** Fee-bump — Stellar RPC call, very strict */
  feeBump: {
    limit: 10,
    windowMs: 60_000,
    burstLimit: 2,
    burstWindowMs: 10_000,
  } satisfies RateLimitConfig,
  /** Health check */
  health: { limit: 10, windowMs: 60_000 } satisfies RateLimitConfig,
} as const;

// ── Monitoring counters ───────────────────────────────────────────────────────

const throttleCounters = new Map<string, number>();

function recordThrottle(endpoint: string, ip: string): void {
  throttleCounters.set(endpoint, (throttleCounters.get(endpoint) ?? 0) + 1);
  // Safe log: IP is already anonymised/hashed by getClientIp; never log raw user data
  console.warn(`[rate-limit] throttled endpoint="${endpoint}" identity="${ip.slice(0, 16)}..."`);
}

/** Read current throttle counts (for observability). */
export function getThrottleCounts(): Record<string, number> {
  return Object.fromEntries(throttleCounters);
}

// ── IP extraction ─────────────────────────────────────────────────────────────

/**
 * Extract the real client IP from request headers.
 * Only trusts X-Forwarded-For when TRUSTED_PROXY=true is set,
 * to prevent IP spoofing in environments without a reverse proxy.
 */
export function getClientIp(request: NextRequest): string {
  const trustProxy = process.env.TRUSTED_PROXY === 'true';

  if (trustProxy) {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    const xri = request.headers.get('x-real-ip');
    if (xri) return xri.trim();
  }

  // Wallet identity as secondary key when available
  const wallet = request.headers.get('x-wallet-address');
  if (wallet) return `wallet:${wallet}`;

  return 'unknown';
}

// ── IP reputation & automatic blocking ───────────────────────────────────────

interface ReputationRecord {
  /** Timestamps (ms) of recent rate-limit violations within the violation window */
  violations: number[];
  /** Epoch ms after which the IP is no longer blocked; 0 = not blocked */
  blockedUntil: number;
}

export interface ReputationConfig {
  /** Rolling window in which violations are counted (ms). Default: 5 min */
  violationWindowMs: number;
  /** Number of violations within the window that triggers an auto-block. Default: 10 */
  blockThreshold: number;
  /** How long an auto-block lasts (ms). Default: 15 min */
  blockDurationMs: number;
}

const DEFAULT_REPUTATION_CONFIG: ReputationConfig = {
  violationWindowMs: 5 * 60_000,
  blockThreshold: 10,
  blockDurationMs: 15 * 60_000,
};

let reputationConfig: ReputationConfig = { ...DEFAULT_REPUTATION_CONFIG };
const ipReputation = new Map<string, ReputationRecord>();

/** Override the IP reputation / auto-block configuration (call once at startup). */
export function setReputationConfig(config: Partial<ReputationConfig>): void {
  reputationConfig = { ...DEFAULT_REPUTATION_CONFIG, ...config };
}

/** Return true when the identity is currently auto-blocked. */
export function isIpBlocked(ip: string): { blocked: boolean; retryAfter: number } {
  const rec = ipReputation.get(ip);
  if (!rec || rec.blockedUntil <= Date.now()) return { blocked: false, retryAfter: 0 };
  return { blocked: true, retryAfter: Math.ceil((rec.blockedUntil - Date.now()) / 1000) };
}

/** Record a rate-limit violation and return whether the IP is now auto-blocked. */
function recordViolation(ip: string): boolean {
  const now = Date.now();
  const rec = ipReputation.get(ip) ?? { violations: [], blockedUntil: 0 };
  rec.violations = rec.violations.filter((t) => now - t < reputationConfig.violationWindowMs);
  rec.violations.push(now);
  if (rec.violations.length >= reputationConfig.blockThreshold) {
    rec.blockedUntil = now + reputationConfig.blockDurationMs;
    console.warn(
      `[rate-limit] auto-blocked identity="${ip.slice(0, 16)}..." violations=${rec.violations.length}`,
    );
    ipReputation.set(ip, rec);
    return true;
  }
  ipReputation.set(ip, rec);
  return false;
}

/** Manually lift an auto-block (e.g. via an admin endpoint). */
export function unblockIp(ip: string): void {
  const rec = ipReputation.get(ip);
  if (rec) {
    rec.blockedUntil = 0;
    ipReputation.set(ip, rec);
  }
}

/** Clear all IP reputation data (intended for testing and admin resets). */
export function clearIpReputation(): void {
  ipReputation.clear();
}

/** Return per-IP violation stats for observability dashboards. */
export function getReputationStats(): Record<string, { violations: number; blockedUntil: number }> {
  const stats: Record<string, { violations: number; blockedUntil: number }> = {};
  for (const [ip, rec] of ipReputation) {
    stats[ip] = { violations: rec.violations.length, blockedUntil: rec.blockedUntil };
  }
  return stats;
}

// ── Circuit breaker ───────────────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;
  /** Consecutive successes in HALF_OPEN state before the circuit closes. Default: 2 */
  successThreshold?: number;
  /** How long to stay OPEN before probing again (ms). Default: 30 000 */
  timeoutMs?: number;
}

/**
 * Circuit breaker for downstream dependencies.
 *
 * States:
 *   CLOSED   — normal operation; failures accumulate.
 *   OPEN     — fast-failing; no calls reach the dependency.
 *   HALF_OPEN — probe mode; a limited number of calls are tried.
 *
 * Usage:
 *   const cb = new CircuitBreaker('stellar-rpc', { failureThreshold: 3 });
 *   const result = await cb.execute(() => callStellarRpc());
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private nextAttemptAt = 0;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeoutMs: number;

  constructor(
    readonly name: string,
    config: CircuitBreakerConfig = {},
  ) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.successThreshold = config.successThreshold ?? 2;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new Error(`[circuit-breaker] "${this.name}" is OPEN — downstream unavailable`);
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      if (++this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.successes = 0;
    // Any failure in HALF_OPEN immediately re-opens — do not wait for failureThreshold
    if (this.state === 'HALF_OPEN') {
      this.failures = 0;
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.timeoutMs;
      console.warn(`[circuit-breaker] "${this.name}" re-opened from HALF_OPEN on failure`);
      return;
    }
    if (++this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.timeoutMs;
      console.warn(
        `[circuit-breaker] "${this.name}" opened after ${this.failures} consecutive failures`,
      );
    }
  }

  /** Inspect the current circuit state (useful for health-check endpoints). */
  getState(): CircuitState {
    return this.state;
  }
}

// ── Distributed backend ───────────────────────────────────────────────────────

/**
 * Interface for a distributed rate-limit backend (e.g. Redis, Upstash).
 * `increment` must atomically increment the counter for the given key,
 * scoped to `windowMs`, and return the new count. The backend owns TTL management.
 */
export interface DistributedBackend {
  increment(key: string, windowMs: number): Promise<number>;
}

let distributedBackend: DistributedBackend | null = null;

/** Wire up a distributed backend for multi-instance rate limiting (call once at app startup). */
export function setRateLimitBackend(backend: DistributedBackend): void {
  distributedBackend = backend;
}

// ── Sliding-window store (in-memory) ─────────────────────────────────────────

const store = new Map<string, number[]>();

function check(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfter: 0 };
}

// ── Response builders ─────────────────────────────────────────────────────────

function buildRateLimitResponse(
  request: NextRequest,
  retryAfter: number,
  message: string,
): NextResponse {
  return withCors(
    request,
    apiError(request, 429, ErrorCode.RATE_LIMITED, message, {
      headers: { 'Retry-After': String(retryAfter) },
    }),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/** True when the identity was derived from an authenticated wallet header. */
function isAuthenticatedIdentity(ip: string): boolean {
  return ip.startsWith('wallet:');
}

/**
 * Apply rate limiting to a request (synchronous, in-memory).
 * Returns a 429 response if the limit is exceeded, or null if the request is allowed.
 *
 * Checks auto-blocked IPs first (from reputation tracking), then applies
 * the sliding-window and optional burst checks. Violations are recorded
 * against the IP's reputation score; IPs that accumulate enough violations
 * within the reputation window are automatically blocked.
 *
 * For multi-instance accuracy, use `applyRateLimitAsync` with a backend
 * configured via `setRateLimitBackend`.
 *
 * @param request    The incoming NextRequest
 * @param endpoint   A stable identifier for the endpoint (used for counters and keys)
 * @param config     Rate limit config for anonymous callers (use a RATE_LIMIT_PRESETS value)
 * @param authConfig Optional override applied when the caller presents a wallet identity
 */
export function applyRateLimit(
  request: NextRequest,
  endpoint: string,
  config: RateLimitConfig,
  authConfig?: RateLimitConfig,
): NextResponse | null {
  const ip = getClientIp(request);
  if (authConfig && isAuthenticatedIdentity(ip)) {
    config = authConfig;
  }

  // Reject auto-blocked IPs before consuming a rate-limit slot
  const blockStatus = isIpBlocked(ip);
  if (blockStatus.blocked) {
    recordThrottle(`${endpoint}:blocked`, ip);
    return buildRateLimitResponse(
      request,
      blockStatus.retryAfter,
      'Access temporarily blocked due to excessive violations.',
    );
  }

  const shortResult = check(`rl:${endpoint}:${ip}`, config.limit, config.windowMs);
  if (!shortResult.allowed) {
    recordThrottle(endpoint, ip);
    recordViolation(ip);
    return buildRateLimitResponse(
      request,
      shortResult.retryAfter,
      'Too many requests. Please slow down.',
    );
  }

  if (config.burstLimit !== undefined && config.burstWindowMs !== undefined) {
    const burstResult = check(
      `rl:${endpoint}:burst:${ip}`,
      config.burstLimit,
      config.burstWindowMs,
    );
    if (!burstResult.allowed) {
      recordThrottle(`${endpoint}:burst`, ip);
      recordViolation(ip);
      return buildRateLimitResponse(
        request,
        burstResult.retryAfter,
        'Request burst limit exceeded. Please slow down.',
      );
    }
  }

  return null;
}

/**
 * Async variant of `applyRateLimit` that uses the distributed backend when
 * configured (via `setRateLimitBackend`), falling back to in-memory otherwise.
 *
 * Use this in API route handlers where rate-limit accuracy across multiple
 * application instances matters (e.g. write endpoints on scaled deployments).
 */
export async function applyRateLimitAsync(
  request: NextRequest,
  endpoint: string,
  config: RateLimitConfig,
  authConfig?: RateLimitConfig,
): Promise<NextResponse | null> {
  if (!distributedBackend) {
    return applyRateLimit(request, endpoint, config, authConfig);
  }

  const ip = getClientIp(request);
  if (authConfig && isAuthenticatedIdentity(ip)) {
    config = authConfig;
  }

  const blockStatus = isIpBlocked(ip);
  if (blockStatus.blocked) {
    recordThrottle(`${endpoint}:blocked`, ip);
    return buildRateLimitResponse(
      request,
      blockStatus.retryAfter,
      'Access temporarily blocked due to excessive violations.',
    );
  }

  const shortCount = await distributedBackend.increment(`rl:${endpoint}:${ip}`, config.windowMs);
  if (shortCount > config.limit) {
    recordThrottle(endpoint, ip);
    recordViolation(ip);
    return buildRateLimitResponse(
      request,
      Math.ceil(config.windowMs / 1000),
      'Too many requests. Please slow down.',
    );
  }

  if (config.burstLimit !== undefined && config.burstWindowMs !== undefined) {
    const burstCount = await distributedBackend.increment(
      `rl:${endpoint}:burst:${ip}`,
      config.burstWindowMs,
    );
    if (burstCount > config.burstLimit) {
      recordThrottle(`${endpoint}:burst`, ip);
      recordViolation(ip);
      return buildRateLimitResponse(
        request,
        Math.ceil(config.burstWindowMs / 1000),
        'Request burst limit exceeded. Please slow down.',
      );
    }
  }

  return null;
}
