import { describe, it, expect, vi } from 'vitest';
import { AlertSystem } from '../alertSystem';

function makeAlert(overrides: Partial<Parameters<AlertSystem['emit']>[0]> = {}) {
  return {
    productId: 'prod-1',
    severity: 'high' as const,
    detectorType: 'speed' as const,
    message: 'Test alert',
    metadata: {},
    ...overrides,
  };
}

describe('AlertSystem', () => {
  it('emits an alert that meets threshold', () => {
    const sys = new AlertSystem({ speedAnomalyMinSeverity: 'medium' });
    const alert = sys.emit(makeAlert({ severity: 'high' }));
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('high');
  });

  it('suppresses alert below threshold', () => {
    const sys = new AlertSystem({ speedAnomalyMinSeverity: 'high' });
    const alert = sys.emit(makeAlert({ severity: 'low' }));
    expect(alert).toBeNull();
  });

  it('assigns unique ids to alerts', () => {
    const sys = new AlertSystem();
    const a = sys.emit(makeAlert());
    const b = sys.emit(makeAlert({ productId: 'prod-2' }));
    expect(a!.id).not.toBe(b!.id);
  });

  it('calls subscriber on emit', () => {
    const sys = new AlertSystem();
    const cb = vi.fn();
    sys.subscribe(cb);
    sys.emit(makeAlert());
    expect(cb).toHaveBeenCalledOnce();
  });

  it('unsubscribe removes the callback', () => {
    const sys = new AlertSystem();
    const cb = vi.fn();
    const unsub = sys.subscribe(cb);
    unsub();
    sys.emit(makeAlert());
    expect(cb).not.toHaveBeenCalled();
  });

  it('deduplicates rapid-fire alerts for same product+detector', () => {
    const sys = new AlertSystem();
    sys.emit(makeAlert());
    sys.emit(makeAlert()); // same product + detector within 60s
    expect(sys.getAlerts().length).toBe(1);
  });

  it('does not deduplicate alerts for different products', () => {
    const sys = new AlertSystem();
    sys.emit(makeAlert({ productId: 'prod-1' }));
    sys.emit(makeAlert({ productId: 'prod-2' }));
    expect(sys.getAlerts().length).toBe(2);
  });

  it('acknowledge marks alert as acknowledged', () => {
    const sys = new AlertSystem();
    const alert = sys.emit(makeAlert())!;
    expect(sys.acknowledge(alert.id)).toBe(true);
    expect(sys.getAlerts()[0].acknowledged).toBe(true);
  });

  it('acknowledge returns false for unknown id', () => {
    const sys = new AlertSystem();
    expect(sys.acknowledge('nonexistent')).toBe(false);
  });

  it('getUnacknowledgedAlerts excludes acknowledged alerts', () => {
    const sys = new AlertSystem();
    const alert = sys.emit(makeAlert())!;
    sys.acknowledge(alert.id);
    expect(sys.getUnacknowledgedAlerts().length).toBe(0);
  });

  it('getCriticalAlerts returns only critical unacknowledged', () => {
    const sys = new AlertSystem({ speedAnomalyMinSeverity: 'low' });
    sys.emit(makeAlert({ severity: 'high' }));
    sys.emit(makeAlert({ productId: 'prod-2', severity: 'critical' }));
    expect(sys.getCriticalAlerts().length).toBe(1);
  });

  it('acknowledgeForProduct clears all alerts for that product', () => {
    const sys = new AlertSystem();
    sys.emit(makeAlert({ productId: 'prod-1' }));
    sys.emit(makeAlert({ productId: 'prod-2' }));
    sys.acknowledgeForProduct('prod-1');
    expect(sys.getUnacknowledgedAlerts('prod-1').length).toBe(0);
    expect(sys.getUnacknowledgedAlerts('prod-2').length).toBe(1);
  });

  it('updateThresholds changes filtering at runtime', () => {
    const sys = new AlertSystem({ speedAnomalyMinSeverity: 'critical' });
    expect(sys.emit(makeAlert({ severity: 'high' }))).toBeNull();
    sys.updateThresholds({ speedAnomalyMinSeverity: 'low' });
    expect(sys.emit(makeAlert({ productId: 'prod-2', severity: 'high' }))).not.toBeNull();
  });

  it('ml_score detector emits alert when fraudScore meets threshold', () => {
    const sys = new AlertSystem({ mlFraudScoreThreshold: 60 });
    const alert = sys.emit({
      productId: 'prod-1',
      severity: 'high',
      detectorType: 'ml_score',
      message: 'ML score high',
      metadata: { fraudScore: 75 },
    });
    expect(alert).not.toBeNull();
  });

  it('ml_score detector suppresses when fraudScore is below threshold', () => {
    const sys = new AlertSystem({ mlFraudScoreThreshold: 60 });
    const alert = sys.emit({
      productId: 'prod-1',
      severity: 'high',
      detectorType: 'ml_score',
      message: 'ML score low',
      metadata: { fraudScore: 40 },
    });
    expect(alert).toBeNull();
  });
});
