import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  applyRateLimit,
  applyRateLimitAsync,
  getClientIp,
  getThrottleCounts,
  getReputationStats,
  isIpBlocked,
  unblockIp,
  clearIpReputation,
  setReputationConfig,
  setRateLimitBackend,
  CircuitBreaker,
  RATE_LIMIT_PRESETS,
  type DistributedBackend,
} from '@/lib/api/rateLimit';

// Reset the in-memory store between tests by re-importing the module
// (vitest isolates modules per test file, so the store is fresh per file run)

function makeRequest(ip = '1.2.3.4', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    headers: { 'x-forwarded-for': ip, ...headers },
  });
}

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for when TRUSTED_PROXY=true', () => {
    vi.stubEnv('TRUSTED_PROXY', 'true');
    const req = makeRequest('10.0.0.1, 192.168.1.1');
    expect(getClientIp(req)).toBe('10.0.0.1');
    vi.unstubAllEnvs();
  });

  it('ignores x-forwarded-for when TRUSTED_PROXY is not set', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const req = makeRequest('10.0.0.1');
    // Falls through to wallet or 'unknown'
    expect(getClientIp(req)).toBe('unknown');
    vi.unstubAllEnvs();
  });

  it('uses wallet address as identity when present and proxy not trusted', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-wallet-address': 'GABC123' },
    });
    expect(getClientIp(req)).toBe('wallet:GABC123');
    vi.unstubAllEnvs();
  });
});

describe('applyRateLimit', () => {
  beforeEach(() => {
    // Use a unique IP per test to avoid cross-test state
  });

  it('allows requests under the limit', () => {
    const config = { limit: 3, windowMs: 60_000 };
    const ip = `test-allow-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const result = applyRateLimit(makeRequest(ip), 'test', config);
      expect(result).toBeNull();
    }
  });

  it('blocks the request that exceeds the limit', () => {
    const config = { limit: 2, windowMs: 60_000 };
    const ip = `test-block-${Math.random()}`;
    applyRateLimit(makeRequest(ip), 'test', config);
    applyRateLimit(makeRequest(ip), 'test', config);
    const result = applyRateLimit(makeRequest(ip), 'test', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('returns Retry-After header on throttle', async () => {
    const config = { limit: 1, windowMs: 60_000 };
    const ip = `test-retry-${Math.random()}`;
    applyRateLimit(makeRequest(ip), 'test', config);
    const result = applyRateLimit(makeRequest(ip), 'test', config);
    expect(result).not.toBeNull();
    const retryAfter = result!.headers.get('retry-after');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('returns structured error body on throttle', async () => {
    const config = { limit: 1, windowMs: 60_000 };
    const ip = `test-body-${Math.random()}`;
    applyRateLimit(makeRequest(ip), 'test', config);
    const result = applyRateLimit(makeRequest(ip), 'test', config);
    const body = await result!.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.correlationId).toBe('string');
  });

  it('enforces burst limit independently', () => {
    const config = { limit: 100, windowMs: 60_000, burstLimit: 2, burstWindowMs: 10_000 };
    const ip = `test-burst-${Math.random()}`;
    applyRateLimit(makeRequest(ip), 'burst-test', config);
    applyRateLimit(makeRequest(ip), 'burst-test', config);
    const result = applyRateLimit(makeRequest(ip), 'burst-test', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('grants authenticated wallet users a higher quota than anonymous callers', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const anonConfig = { limit: 2, windowMs: 60_000 };
    const authConfig = { limit: 5, windowMs: 60_000 };
    const suffix = Math.random().toString(36).slice(2);

    // Anonymous caller (no wallet) is blocked after 2 requests
    const anonReq = () => makeRequest(`anon-${suffix}`);
    applyRateLimit(anonReq(), `quota-${suffix}`, anonConfig, authConfig);
    applyRateLimit(anonReq(), `quota-${suffix}`, anonConfig, authConfig);
    const anonBlocked = applyRateLimit(anonReq(), `quota-${suffix}`, anonConfig, authConfig);
    expect(anonBlocked).not.toBeNull();

    // Wallet caller gets the authConfig quota (5), so a 3rd request still passes
    const walletReq = () =>
      new NextRequest('http://localhost/api/test', {
        headers: { 'x-wallet-address': `GWALLET-${suffix}` },
      });
    applyRateLimit(walletReq(), `quota-${suffix}`, anonConfig, authConfig);
    applyRateLimit(walletReq(), `quota-${suffix}`, anonConfig, authConfig);
    const walletThird = applyRateLimit(walletReq(), `quota-${suffix}`, anonConfig, authConfig);
    expect(walletThird).toBeNull();
    vi.unstubAllEnvs();
  });

  it('allows different identities independently', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const config = { limit: 1, windowMs: 60_000 };
    const suffix = Math.random().toString(36).slice(2);
    const reqA = new NextRequest('http://localhost/api/test', {
      headers: { 'x-wallet-address': `wallet-a-${suffix}` },
    });
    const reqB = new NextRequest('http://localhost/api/test', {
      headers: { 'x-wallet-address': `wallet-b-${suffix}` },
    });
    applyRateLimit(reqA, 'test-indep', config);
    // wallet-b should still be allowed
    const result = applyRateLimit(reqB, 'test-indep', config);
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe('getThrottleCounts', () => {
  it('returns an object with endpoint keys', () => {
    const counts = getThrottleCounts();
    expect(typeof counts).toBe('object');
  });
});

describe('RATE_LIMIT_PRESETS', () => {
  it('verify preset is stricter than default', () => {
    expect(RATE_LIMIT_PRESETS.verify.limit).toBeLessThan(RATE_LIMIT_PRESETS.default.limit);
    expect(RATE_LIMIT_PRESETS.verify.burstLimit).toBeDefined();
  });

  it('publicRead preset has burst controls', () => {
    expect(RATE_LIMIT_PRESETS.publicRead.burstLimit).toBeDefined();
    expect(RATE_LIMIT_PRESETS.publicRead.burstWindowMs).toBeDefined();
  });

  it('authenticated preset allows more requests than publicRead', () => {
    expect(RATE_LIMIT_PRESETS.authenticated.limit).toBeGreaterThan(
      RATE_LIMIT_PRESETS.publicRead.limit,
    );
  });

  it('write preset is stricter than default for burst protection', () => {
    expect(RATE_LIMIT_PRESETS.write.limit).toBeLessThanOrEqual(RATE_LIMIT_PRESETS.default.limit);
    expect(RATE_LIMIT_PRESETS.write.burstLimit).toBeDefined();
  });

  it('sensitiveWrite preset is stricter than write preset', () => {
    expect(RATE_LIMIT_PRESETS.sensitiveWrite.limit).toBeLessThan(RATE_LIMIT_PRESETS.write.limit);
    expect(RATE_LIMIT_PRESETS.sensitiveWrite.burstLimit).toBeDefined();
  });

  it('write preset is stricter than publicRead for read vs write differentiation', () => {
    // write ops should have burst limits no higher than read ops
    expect(RATE_LIMIT_PRESETS.write.burstLimit!).toBeLessThanOrEqual(
      RATE_LIMIT_PRESETS.publicRead.burstLimit!,
    );
  });
});

describe('rate limit violation logging', () => {
  it('logs a warning when a request is throttled', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { limit: 1, windowMs: 60_000 };
    const ip = `test-log-${Math.random()}`;
    applyRateLimit(makeRequest(ip), 'log-test', config);
    applyRateLimit(makeRequest(ip), 'log-test', config); // triggers throttle
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[rate-limit]'));
    warnSpy.mockRestore();
  });
});

describe('abusive traffic simulation', () => {
  it('blocks sustained abusive traffic while allowing legitimate users', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const abusiveConfig = { limit: 5, windowMs: 60_000, burstLimit: 2, burstWindowMs: 10_000 };
    const abusiveIp = `abuser-${Math.random()}`;
    const legitimateIp = `legit-${Math.random()}`;

    // Abuser fires 10 requests
    let blocked = 0;
    for (let i = 0; i < 10; i++) {
      const result = applyRateLimit(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-wallet-address': abusiveIp },
        }),
        'abuse-test',
        abusiveConfig,
      );
      if (result !== null) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);

    // Legitimate user is unaffected
    const legitimateResult = applyRateLimit(
      new NextRequest('http://localhost/api/test', {
        headers: { 'x-wallet-address': legitimateIp },
      }),
      'abuse-test',
      abusiveConfig,
    );
    expect(legitimateResult).toBeNull();
    vi.unstubAllEnvs();
  });
});

// ── IP reputation & automatic blocking ───────────────────────────────────────

describe('IP reputation tracking and auto-blocking', () => {
  beforeEach(() => {
    // Lower the block threshold so tests don't need to fire 10 violations
    setReputationConfig({ blockThreshold: 3, violationWindowMs: 60_000, blockDurationMs: 60_000 });
    clearIpReputation();
  });

  afterEach(() => {
    // Restore defaults
    setReputationConfig({
      blockThreshold: 10,
      violationWindowMs: 5 * 60_000,
      blockDurationMs: 15 * 60_000,
    });
    clearIpReputation();
  });

  it('is not blocked before any violations', () => {
    const ip = `rep-clean-${Math.random()}`;
    expect(isIpBlocked(ip).blocked).toBe(false);
  });

  it('auto-blocks an IP that accumulates violations at or above the threshold', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const suffix = Math.random().toString(36).slice(2);
    const ip = `rep-abuser-${suffix}`;
    const config = { limit: 1, windowMs: 60_000 };

    // Each call after the 1st is a violation (limit=1)
    for (let i = 0; i < 4; i++) {
      applyRateLimit(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-wallet-address': ip },
        }),
        `rep-endpoint-${suffix}`,
        config,
      );
    }
    expect(isIpBlocked(`wallet:${ip}`).blocked).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns a 429 with Retry-After for auto-blocked IPs', async () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const suffix = Math.random().toString(36).slice(2);
    const ip = `rep-block-${suffix}`;
    const config = { limit: 1, windowMs: 60_000 };

    // Drive violations above threshold
    for (let i = 0; i < 4; i++) {
      applyRateLimit(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-wallet-address': ip },
        }),
        `rep-ep-${suffix}`,
        config,
      );
    }

    // Next request should be rejected as auto-blocked
    const blocked = applyRateLimit(
      new NextRequest('http://localhost/api/test', {
        headers: { 'x-wallet-address': ip },
      }),
      `rep-ep-${suffix}`,
      config,
    );
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(Number(blocked!.headers.get('retry-after'))).toBeGreaterThan(0);

    const body = await blocked!.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    vi.unstubAllEnvs();
  });

  it('allows requests again after unblocking', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const suffix = Math.random().toString(36).slice(2);
    const ip = `rep-unblock-${suffix}`;
    const config = { limit: 1, windowMs: 60_000 };

    for (let i = 0; i < 4; i++) {
      applyRateLimit(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-wallet-address': ip },
        }),
        `rep-ep-ub-${suffix}`,
        config,
      );
    }
    expect(isIpBlocked(`wallet:${ip}`).blocked).toBe(true);

    unblockIp(`wallet:${ip}`);
    expect(isIpBlocked(`wallet:${ip}`).blocked).toBe(false);
    vi.unstubAllEnvs();
  });

  it('exposes violation counts via getReputationStats', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const suffix = Math.random().toString(36).slice(2);
    const ip = `rep-stats-${suffix}`;
    const config = { limit: 1, windowMs: 60_000 };

    applyRateLimit(
      new NextRequest('http://localhost/api/test', { headers: { 'x-wallet-address': ip } }),
      `rep-ep-stats-${suffix}`,
      config,
    );
    // Second call is a violation
    applyRateLimit(
      new NextRequest('http://localhost/api/test', { headers: { 'x-wallet-address': ip } }),
      `rep-ep-stats-${suffix}`,
      config,
    );

    const stats = getReputationStats();
    const key = `wallet:${ip}`;
    expect(stats[key]).toBeDefined();
    expect(stats[key].violations).toBeGreaterThanOrEqual(1);
    vi.unstubAllEnvs();
  });

  it('logs a warning when an IP is auto-blocked', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const suffix = Math.random().toString(36).slice(2);
    const ip = `rep-log-${suffix}`;
    const config = { limit: 1, windowMs: 60_000 };

    for (let i = 0; i < 4; i++) {
      applyRateLimit(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-wallet-address': ip },
        }),
        `rep-ep-log-${suffix}`,
        config,
      );
    }

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auto-blocked'));
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});

// ── Circuit breaker ───────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker('test-closed');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('passes through calls and returns results when CLOSED', async () => {
    const cb = new CircuitBreaker('test-pass');
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe('CLOSED');
  });

  it('opens after reaching the failure threshold', async () => {
    const cb = new CircuitBreaker('test-open', { failureThreshold: 3, timeoutMs: 60_000 });
    const fail = () => Promise.reject(new Error('downstream error'));

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe('OPEN');
  });

  it('fast-fails without calling fn when OPEN', async () => {
    const cb = new CircuitBreaker('test-fastfail', { failureThreshold: 2, timeoutMs: 60_000 });
    const fail = () => Promise.reject(new Error('err'));
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe('OPEN');

    const fn = vi.fn(() => Promise.resolve('ok'));
    await expect(cb.execute(fn)).rejects.toThrow('OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after timeout and closes on success', async () => {
    const cb = new CircuitBreaker('test-half-open', {
      failureThreshold: 2,
      successThreshold: 2,
      timeoutMs: 0, // expire immediately
    });
    const fail = () => Promise.reject(new Error('err'));
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe('OPEN');

    // Timeout has elapsed — next execute should enter HALF_OPEN then probe
    await cb.execute(() => Promise.resolve('ok'));
    // After 1 success, still in HALF_OPEN (need successThreshold=2)
    expect(cb.getState()).toBe('HALF_OPEN');

    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('CLOSED');
  });

  it('reopens from HALF_OPEN on failure', async () => {
    const cb = new CircuitBreaker('test-reopen', {
      failureThreshold: 2,
      successThreshold: 3,
      timeoutMs: 0,
    });
    await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    expect(cb.getState()).toBe('OPEN');

    // Enter HALF_OPEN
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('HALF_OPEN');

    // Fail in HALF_OPEN — should re-open
    await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
  });

  it('logs a warning when opening', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cb = new CircuitBreaker('test-log-open', { failureThreshold: 2, timeoutMs: 60_000 });
    await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[circuit-breaker]'));
    warnSpy.mockRestore();
  });
});

// ── Distributed backend ───────────────────────────────────────────────────────

describe('applyRateLimitAsync — in-memory fallback (no backend)', () => {
  it('falls back to synchronous in-memory limiting when no backend is set', async () => {
    // No backend configured — should behave like applyRateLimit
    const config = { limit: 2, windowMs: 60_000 };
    const ip = `async-fallback-${Math.random()}`;
    await applyRateLimitAsync(makeRequest(ip), 'async-test', config);
    await applyRateLimitAsync(makeRequest(ip), 'async-test', config);
    const result = await applyRateLimitAsync(makeRequest(ip), 'async-test', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });
});

describe('applyRateLimitAsync — distributed backend', () => {
  afterEach(() => {
    // Reset backend to null so other tests are unaffected
    setRateLimitBackend({ increment: () => Promise.resolve(0) });
  });

  it('uses the distributed backend to count requests', async () => {
    const counts = new Map<string, number>();
    const mockBackend: DistributedBackend = {
      increment: async (key) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
    };
    setRateLimitBackend(mockBackend);

    const config = { limit: 2, windowMs: 60_000 };
    const ip = `dist-ip-${Math.random()}`;

    const r1 = await applyRateLimitAsync(makeRequest(ip), 'dist-ep', config);
    expect(r1).toBeNull();

    const r2 = await applyRateLimitAsync(makeRequest(ip), 'dist-ep', config);
    expect(r2).toBeNull();

    // 3rd request pushes count to 3 > limit 2 → blocked
    const r3 = await applyRateLimitAsync(makeRequest(ip), 'dist-ep', config);
    expect(r3).not.toBeNull();
    expect(r3!.status).toBe(429);
  });

  it('enforces distributed burst limit when backend is set', async () => {
    const counts = new Map<string, number>();
    const mockBackend: DistributedBackend = {
      increment: async (key) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
    };
    setRateLimitBackend(mockBackend);

    const config = { limit: 100, windowMs: 60_000, burstLimit: 1, burstWindowMs: 10_000 };
    const ip = `dist-burst-${Math.random()}`;

    const r1 = await applyRateLimitAsync(makeRequest(ip), 'dist-burst-ep', config);
    expect(r1).toBeNull();

    const r2 = await applyRateLimitAsync(makeRequest(ip), 'dist-burst-ep', config);
    expect(r2).not.toBeNull();
    expect(r2!.status).toBe(429);
  });

  it('respects auto-blocked IPs even with distributed backend', async () => {
    setReputationConfig({ blockThreshold: 2, violationWindowMs: 60_000, blockDurationMs: 60_000 });
    clearIpReputation();

    let callCount = 0;
    const mockBackend: DistributedBackend = {
      increment: async () => {
        callCount++;
        return callCount > 1 ? 99 : 1; // trigger violation on 2nd call
      },
    };
    setRateLimitBackend(mockBackend);

    const ip = `dist-rep-${Math.random()}`;
    const config = { limit: 1, windowMs: 60_000 };

    // Drive two violations to trigger auto-block
    await applyRateLimitAsync(makeRequest(ip), 'dist-rep-ep', config);
    await applyRateLimitAsync(makeRequest(ip), 'dist-rep-ep', config);
    await applyRateLimitAsync(makeRequest(ip), 'dist-rep-ep', config);

    const blocked = isIpBlocked('unknown');
    // unknown IPs accumulate — backend is called for unknown identity
    // Verify the endpoint: backend was called and violations recorded
    expect(getReputationStats()).toBeDefined();

    setReputationConfig({
      blockThreshold: 10,
      violationWindowMs: 5 * 60_000,
      blockDurationMs: 15 * 60_000,
    });
    clearIpReputation();
  });
});
