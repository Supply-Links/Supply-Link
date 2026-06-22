'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { RecallBroadcast, RecallNotification } from '@/lib/services/recallBroadcastService';

interface RecallState {
  productId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  stakeholders: string[];
  broadcasts: RecallBroadcast[];
  notifications: RecallNotification[];
  stats: {
    totalBroadcasts: number;
    activeBroadcasts: number;
    resolvedBroadcasts: number;
    totalNotifications: number;
    acknowledgedNotifications: number;
  } | null;
  loading: boolean;
  error: string | null;
}

const severityColors = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export function RecallBroadcastChannel() {
  const t = useTranslations('recall');
  const [state, setState] = useState<RecallState>({
    productId: '',
    reason: '',
    severity: 'high',
    stakeholders: [],
    broadcasts: [],
    notifications: [],
    stats: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    loadBroadcasts();
    loadNotifications();
  }, []);

  const loadBroadcasts = async () => {
    try {
      const res = await fetch('/api/v1/products/recall/broadcast?active=true');
      if (res.ok) {
        const data = await res.json();
        setState((s) => ({ ...s, broadcasts: data.broadcasts }));
      }
    } catch (err) {
      console.error('Failed to load broadcasts:', err);
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/v1/products/recall/notifications');
      if (res.ok) {
        const data = await res.json();
        setState((s) => ({ ...s, notifications: data.notifications, stats: data.stats }));
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  const handleInitiateBroadcast = async () => {
    if (!state.productId || !state.reason || state.stakeholders.length === 0) {
      setState((s) => ({ ...s, error: 'Fill all required fields' }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch('/api/v1/products/recall/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: state.productId,
          reason: state.reason,
          severity: state.severity,
          stakeholders: state.stakeholders,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to initiate broadcast');
      }

      const broadcast = await res.json();
      setState((s) => ({
        ...s,
        broadcasts: [broadcast, ...s.broadcasts],
        productId: '',
        reason: '',
        severity: 'high',
        stakeholders: [],
        loading: false,
      }));

      loadNotifications();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to initiate broadcast',
        loading: false,
      }));
    }
  };

  const handleAcknowledge = async (broadcastId: string) => {
    try {
      const res = await fetch('/api/v1/products/recall/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId }),
      });

      if (res.ok) {
        loadNotifications();
      }
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900">{t('emergencyRecall')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t('productId')}</label>
            <input
              type="text"
              placeholder="prod-001"
              value={state.productId}
              onChange={(e) => setState((s) => ({ ...s, productId: e.target.value }))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('recallReason')}</label>
            <textarea
              placeholder={t('recallReasonPlaceholder')}
              value={state.reason}
              onChange={(e) => setState((s) => ({ ...s, reason: e.target.value }))}
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('severity')}</label>
              <select
                value={state.severity}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    severity: e.target.value as 'low' | 'medium' | 'high' | 'critical',
                  }))
                }
                className="w-full px-3 py-2 border rounded"
              >
                <option value="low">{t('severityLow')}</option>
                <option value="medium">{t('severityMedium')}</option>
                <option value="high">{t('severityHigh')}</option>
                <option value="critical">{t('severityCritical')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('stakeholders')}</label>
              <input
                type="text"
                placeholder={t('stakeholdersPlaceholder')}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    stakeholders: e.target.value.split(',').map((s) => s.trim()),
                  }))
                }
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>

          <Button
            onClick={handleInitiateBroadcast}
            disabled={state.loading}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {state.loading ? t('broadcasting') : t('initiateBroadcast')}
          </Button>

          {state.error && <div className="text-red-600 text-sm">{state.error}</div>}
        </CardContent>
      </Card>

      {state.stats && (
        <Card>
          <CardHeader>
            <CardTitle>{t('broadcastStats')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{state.stats.totalBroadcasts}</div>
                <div className="text-sm text-gray-600">{t('totalBroadcasts')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {state.stats.activeBroadcasts}
                </div>
                <div className="text-sm text-gray-600">{t('active')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {state.stats.resolvedBroadcasts}
                </div>
                <div className="text-sm text-gray-600">{t('resolved')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{state.stats.totalNotifications}</div>
                <div className="text-sm text-gray-600">{t('notifications')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {state.stats.acknowledgedNotifications}
                </div>
                <div className="text-sm text-gray-600">{t('acknowledged')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('activeBroadcasts')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {state.broadcasts.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('noActiveBroadcasts')}</p>
            ) : (
              state.broadcasts.map((broadcast) => (
                <div key={broadcast.id} className="border rounded p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{broadcast.productName}</h4>
                      <p className="text-sm text-gray-600">{broadcast.reason}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${severityColors[broadcast.severity]}`}
                    >
                      {broadcast.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <p>{t('stakeholdersCount', { count: broadcast.stakeholders.length })}</p>
                    <p>
                      {t('delivered')}:{' '}
                      {broadcast.broadcastLog.filter((e) => e.status === 'delivered').length}
                    </p>
                    <p>
                      {t('acknowledged')}:{' '}
                      {broadcast.broadcastLog.filter((e) => e.status === 'acknowledged').length}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('yourNotifications')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {state.notifications.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('noNotifications')}</p>
            ) : (
              state.notifications.map((notification) => (
                <div
                  key={notification.broadcastId}
                  className={`border rounded p-4 ${notification.acknowledged ? 'bg-gray-50' : 'bg-yellow-50'}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{notification.productName}</h4>
                      <p className="text-sm text-gray-600">{notification.reason}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${severityColors[notification.severity]}`}
                    >
                      {notification.severity.toUpperCase()}
                    </span>
                  </div>
                  {!notification.acknowledged && (
                    <Button
                      size="sm"
                      onClick={() => handleAcknowledge(notification.broadcastId)}
                      className="mt-2"
                    >
                      {t('acknowledge')}
                    </Button>
                  )}
                  {notification.acknowledged && (
                    <p className="text-sm text-green-600 mt-2">✓ {t('acknowledged')}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
