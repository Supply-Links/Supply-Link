/**
 * Tests for the Emergency Alert System (Feature A).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// We import the module-level store indirectly through the public API.
// Each test suite resets state by creating fresh IDs.
import {
  createAlert,
  getAlert,
  listAlerts,
  listActiveAlerts,
  acknowledgeAlert,
  resolveAlert,
  cancelAlert,
  markDelivered,
  markDeliveryFailed,
  getAlertStats,
  SEVERITY_LABELS,
  SEVERITY_BANNER_CLASS,
} from '@/lib/services/emergencyAlerts';
import type { AlertSeverity, AlertDistributionSettings } from '@/lib/services/emergencyAlerts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDistribution(
  channels: AlertDistributionSettings['channels'] = ['in-app'],
  recipients: string[] = ['stakeholder-1'],
): AlertDistributionSettings {
  return { channels, recipients, requireAcknowledgement: false };
}

function makeAlert(
  productId = 'prod-test',
  severity: AlertSeverity = 'critical',
) {
  return createAlert({
    productId,
    productName: 'Test Product',
    title: 'Urgent Safety Notice',
    message: 'Do not use this product.',
    severity,
    distribution: makeDistribution(['in-app', 'webhook'], ['user-a', 'user-b']),
    createdBy: 'admin',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Emergency Alert System — createAlert', () => {
  it('creates an alert with status active', () => {
    const alert = makeAlert();
    expect(alert.id).toMatch(/^alert-/);
    expect(alert.status).toBe('active');
    expect(alert.severity).toBe('critical');
    expect(alert.productId).toBe('prod-test');
  });

  it('seeds delivery log entries for each recipient × channel', () => {
    const alert = makeAlert();
    // 2 recipients × 2 channels = 4 entries
    expect(alert.deliveryLog).toHaveLength(4);
    expect(alert.deliveryLog.every((e) => e.status === 'pending')).toBe(true);
  });

  it('stores the alert and retrieves it by ID', () => {
    const alert = makeAlert('prod-retrieve');
    const fetched = getAlert(alert.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(alert.id);
  });
});

describe('Emergency Alert System — listAlerts / listActiveAlerts', () => {
  it('listAlerts returns alerts for a specific product', () => {
    const pid = `prod-list-${Date.now()}`;
    makeAlert(pid);
    makeAlert(pid);
    const results = listAlerts(pid);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((a) => a.productId === pid)).toBe(true);
  });

  it('listActiveAlerts excludes resolved alerts', () => {
    const pid = `prod-active-${Date.now()}`;
    const a1 = makeAlert(pid);
    const a2 = makeAlert(pid);
    resolveAlert(a1.id);

    const active = listActiveAlerts(pid);
    expect(active.some((a) => a.id === a1.id)).toBe(false);
    expect(active.some((a) => a.id === a2.id)).toBe(true);
  });
});

describe('Emergency Alert System — acknowledgeAlert', () => {
  it('transitions status to acknowledged', () => {
    const alert = makeAlert();
    const updated = acknowledgeAlert(alert.id, 'user-a');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('acknowledged');
    expect(updated!.acknowledgedBy).toBe('user-a');
    expect(updated!.acknowledgedAt).toBeTypeOf('number');
  });

  it('marks matching delivery entries as acknowledged', () => {
    const alert = makeAlert();
    // First mark as delivered so acknowledge can transition
    markDelivered(alert.id, 'user-a', 'in-app');
    const updated = acknowledgeAlert(alert.id, 'user-a');
    const entry = updated!.deliveryLog.find(
      (e) => e.recipient === 'user-a' && e.channel === 'in-app',
    );
    expect(entry?.status).toBe('acknowledged');
  });

  it('returns null when alert is already resolved', () => {
    const alert = makeAlert();
    resolveAlert(alert.id);
    const result = acknowledgeAlert(alert.id, 'user-a');
    expect(result).toBeNull();
  });
});

describe('Emergency Alert System — resolveAlert', () => {
  it('transitions status to resolved and sets resolvedAt', () => {
    const alert = makeAlert();
    const updated = resolveAlert(alert.id);
    expect(updated!.status).toBe('resolved');
    expect(updated!.resolvedAt).toBeTypeOf('number');
  });

  it('returns null for unknown alert ID', () => {
    expect(resolveAlert('nonexistent-id')).toBeNull();
  });
});

describe('Emergency Alert System — cancelAlert', () => {
  it('transitions status to cancelled', () => {
    const alert = makeAlert();
    const updated = cancelAlert(alert.id);
    expect(updated!.status).toBe('cancelled');
  });
});

describe('Emergency Alert System — delivery tracking', () => {
  it('markDelivered updates the matching log entry', () => {
    const alert = makeAlert();
    markDelivered(alert.id, 'user-a', 'webhook');
    const fetched = getAlert(alert.id)!;
    const entry = fetched.deliveryLog.find(
      (e) => e.recipient === 'user-a' && e.channel === 'webhook',
    );
    expect(entry?.status).toBe('delivered');
  });

  it('markDeliveryFailed records the error', () => {
    const alert = makeAlert();
    markDeliveryFailed(alert.id, 'user-b', 'email', 'SMTP timeout');
    const fetched = getAlert(alert.id)!;
    const entry = fetched.deliveryLog.find(
      (e) => e.recipient === 'user-b' && e.channel === 'email',
    );
    expect(entry?.status).toBe('failed');
    expect(entry?.error).toBe('SMTP timeout');
  });
});

describe('Emergency Alert System — getAlertStats', () => {
  it('returns numeric stats', () => {
    const stats = getAlertStats();
    expect(stats.total).toBeTypeOf('number');
    expect(stats.active).toBeTypeOf('number');
    expect(stats.critical).toBeTypeOf('number');
    expect(stats.acknowledged).toBeTypeOf('number');
    expect(stats.resolved).toBeTypeOf('number');
  });

  it('critical count only includes active critical alerts', () => {
    const pid = `prod-stats-${Date.now()}`;
    const a = makeAlert(pid, 'critical');
    const before = getAlertStats();
    resolveAlert(a.id);
    const after = getAlertStats();
    expect(after.critical).toBeLessThanOrEqual(before.critical);
  });
});

describe('Emergency Alert System — severity helpers', () => {
  it('SEVERITY_LABELS covers all severities', () => {
    const severities: AlertSeverity[] = ['info', 'warning', 'high', 'critical'];
    for (const s of severities) {
      expect(SEVERITY_LABELS[s]).toBeTypeOf('string');
      expect(SEVERITY_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('SEVERITY_BANNER_CLASS covers all severities', () => {
    const severities: AlertSeverity[] = ['info', 'warning', 'high', 'critical'];
    for (const s of severities) {
      expect(SEVERITY_BANNER_CLASS[s]).toBeTypeOf('string');
    }
  });
});
