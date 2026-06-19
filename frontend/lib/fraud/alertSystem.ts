/**
 * Real-time fraud alert system.
 *
 * Provides a pub/sub mechanism for emitting, subscribing to, and acknowledging
 * fraud alerts. Configurable thresholds control which severity levels generate alerts.
 * Designed to integrate with the existing notification infrastructure.
 */

export type FraudAlertDetectorType =
  | 'speed'
  | 'location'
  | 'pattern'
  | 'ml_score'
  | 'collaborative';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FraudAlert {
  id: string;
  productId: string;
  severity: AlertSeverity;
  detectorType: FraudAlertDetectorType;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
}

export interface AlertThresholds {
  /** Minimum severity from speed detector to emit an alert */
  speedAnomalyMinSeverity: AlertSeverity;
  /** Minimum severity from location detector to emit an alert */
  locationAnomalyMinSeverity: AlertSeverity;
  /** Minimum severity from pattern detector to emit an alert */
  patternMinSeverity: AlertSeverity;
  /** ML fraud score (0–100) above which an alert is emitted */
  mlFraudScoreThreshold: number;
  /** Collaborative filter risk score (0–100) above which an alert is emitted */
  collaborativeRiskThreshold: number;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DEFAULT_THRESHOLDS: AlertThresholds = {
  speedAnomalyMinSeverity: 'medium',
  locationAnomalyMinSeverity: 'medium',
  patternMinSeverity: 'medium',
  mlFraudScoreThreshold: 60,
  collaborativeRiskThreshold: 50,
};

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class AlertSystem {
  private alerts: FraudAlert[] = [];
  private thresholds: AlertThresholds;
  private subscribers: Array<(alert: FraudAlert) => void> = [];

  constructor(thresholds: Partial<AlertThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /** Register a callback that fires whenever a new alert is emitted. Returns an unsubscribe fn. */
  subscribe(callback: (alert: FraudAlert) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  /** Emit an alert if it clears the configured threshold for its detector type. */
  emit(
    alert: Omit<FraudAlert, 'id' | 'timestamp' | 'acknowledged'>,
  ): FraudAlert | null {
    if (!this.meetsThreshold(alert.detectorType, alert.severity, alert.metadata)) {
      return null;
    }

    // Deduplicate: skip if an unacknowledged alert for the same product + detector
    // with the same or higher severity was emitted in the last 60 seconds
    const sixtySecondsAgo = Date.now() - 60_000;
    const duplicate = this.alerts.find(
      (a) =>
        !a.acknowledged &&
        a.productId === alert.productId &&
        a.detectorType === alert.detectorType &&
        SEVERITY_RANK[a.severity] >= SEVERITY_RANK[alert.severity] &&
        new Date(a.timestamp).getTime() > sixtySecondsAgo,
    );
    if (duplicate) return duplicate;

    const full: FraudAlert = {
      ...alert,
      id: generateId(),
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    this.alerts.push(full);
    for (const sub of this.subscribers) sub(full);
    return full;
  }

  /** Acknowledge an alert by ID. Returns true if the alert was found. */
  acknowledge(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  /** Acknowledge all alerts for a given product. */
  acknowledgeForProduct(productId: string): void {
    for (const alert of this.alerts) {
      if (alert.productId === productId) alert.acknowledged = true;
    }
  }

  getAlerts(productId?: string): FraudAlert[] {
    return productId ? this.alerts.filter((a) => a.productId === productId) : [...this.alerts];
  }

  getUnacknowledgedAlerts(productId?: string): FraudAlert[] {
    return this.getAlerts(productId).filter((a) => !a.acknowledged);
  }

  getCriticalAlerts(): FraudAlert[] {
    return this.alerts.filter((a) => a.severity === 'critical' && !a.acknowledged);
  }

  /** Update thresholds at runtime without recreating the system. */
  updateThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  getThresholds(): AlertThresholds {
    return { ...this.thresholds };
  }

  private meetsThreshold(
    detector: FraudAlertDetectorType,
    severity: AlertSeverity,
    metadata: Record<string, unknown>,
  ): boolean {
    switch (detector) {
      case 'speed':
        return SEVERITY_RANK[severity] >= SEVERITY_RANK[this.thresholds.speedAnomalyMinSeverity];
      case 'location':
        return SEVERITY_RANK[severity] >= SEVERITY_RANK[this.thresholds.locationAnomalyMinSeverity];
      case 'pattern':
        return SEVERITY_RANK[severity] >= SEVERITY_RANK[this.thresholds.patternMinSeverity];
      case 'ml_score': {
        const score = typeof metadata.fraudScore === 'number' ? metadata.fraudScore : 0;
        return score >= this.thresholds.mlFraudScoreThreshold;
      }
      case 'collaborative': {
        const score = typeof metadata.riskScore === 'number' ? metadata.riskScore : 0;
        return score >= this.thresholds.collaborativeRiskThreshold;
      }
      default:
        return false;
    }
  }
}

export const defaultAlertSystem = new AlertSystem();
