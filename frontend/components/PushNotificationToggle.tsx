'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  subscribeToPush,
  unsubscribeFromPush,
  sendSubscriptionToServer,
} from '@/lib/pushNotifications';

export default function PushNotificationToggle() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      setSupported(true);
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => setEnabled(!!sub)),
      );
    }
  }, []);

  if (!supported) return null;

  async function toggle() {
    if (enabled) {
      await unsubscribeFromPush();
      setEnabled(false);
    } else {
      const sub = await subscribeToPush();
      if (sub) {
        await sendSubscriptionToServer(sub);
        setEnabled(true);
      }
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={enabled ? 'Disable push notifications' : 'Enable push notifications'}
    >
      {enabled ? <Bell size={20} /> : <BellOff size={20} />}
    </button>
  );
}
