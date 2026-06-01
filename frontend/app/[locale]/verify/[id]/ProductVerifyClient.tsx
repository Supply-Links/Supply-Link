'use client';

import { useEffect, useState } from 'react';
import { recordScan } from '@/lib/services/scanTracking';
import type { Product } from '@/lib/types';
import { EmergencyAlertBanner } from '@/components/products/EmergencyAlertBanner';
import { listActiveAlerts } from '@/lib/services/emergencyAlerts';
import { acknowledgeAlert } from '@/lib/services/emergencyAlerts';
import type { EmergencyAlert } from '@/lib/services/emergencyAlerts';

interface ProductVerifyClientProps {
  product: Product;
  children: React.ReactNode;
}

export default function ProductVerifyClient({ product, children }: ProductVerifyClientProps) {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  useEffect(() => {
    // Load active emergency alerts for this product
    setAlerts(listActiveAlerts(product.id));
  }, [product.id]);

  useEffect(() => {
    // Record this scan for recall notifications
    const recordProductScan = async () => {
      try {
        // Get client IP (requires x-forwarded-for or similar from middleware)
        const response = await fetch('/api/client-ip');
        const { ip } = await response.json();

        if (ip) {
          await recordScan(product.id, ip);
        }
      } catch {
        // Silently fail - don't disrupt user experience
        console.debug('Could not record scan');
      }
    };

    recordProductScan();
  }, [product.id]);

  function handleAcknowledge(alertId: string) {
    acknowledgeAlert(alertId, 'public-viewer');
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  function handleDismiss(alertId: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  return (
    <>
      {/* Emergency alert banners — shown above everything else */}
      {alerts.length > 0 && (
        <div className="max-w-2xl mx-auto px-6 pt-4">
          <EmergencyAlertBanner
            alerts={alerts}
            onAcknowledge={handleAcknowledge}
            onDismiss={handleDismiss}
          />
        </div>
      )}

      {/* RECALLED Banner for deactivated products */}
      {!product.active && (
        <div className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-4 mb-6 rounded-lg border-2 border-red-800">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <h2 className="text-lg font-bold mb-1">PRODUCT RECALLED</h2>
                <p className="text-sm text-red-50">
                  This product has been recalled and removed from sale. Do not use this product.
                  Please return it or dispose of it safely.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {children}
    </>
  );
}
