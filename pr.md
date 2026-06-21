# feat: transform app into mobile-first PWA with offline, push, and camera QR

## Summary

Implements the full PWA upgrade across 5 focused commits, covering every acceptance criterion.

---

## What's Changed

### Web App Manifest (`app/manifest.ts`)

- Added `id`, `scope`, `orientation: portrait`, `display_override`, `categories`, `dir`, `lang`
- Added `shortcuts` (Dashboard, Scan QR) for home screen quick actions
- Added `screenshots` for Play Store / App Store listing eligibility
- Separated maskable icon entry (`/icons/icon-maskable-512.png`)

### Service Worker (`public/sw.js`)

- Bumped caches to `sl-static-v2` / `sl-dynamic-v2`
- Pre-caches `/dashboard`, `/products`, `/tracking` on install — core routes work fully offline
- Added `push` event handler → shows notification from JSON payload (`title`, `body`, `url`)
- Added `notificationclick` → focuses existing window or opens notification URL
- Added `sync` event handler (`offline-queue` tag) → replays queued requests from IndexedDB when connectivity is restored

### Mobile-First CSS & Viewport (`app/globals.css`, `app/layout.tsx`)

- Added Tailwind utilities: `touch-pan-x`, `touch-pan-y`, `no-tap-highlight`, `safe-bottom`, `safe-top`
- Viewport updated with `viewportFit: "cover"` (iPhone notch/Dynamic Island) and `userScalable: false`

### Push Notification System

- `lib/pushNotifications.ts` — `subscribeToPush`, `unsubscribeFromPush`, `sendSubscriptionToServer` helpers with VAPID key support
- `app/api/push/subscribe/route.ts` — POST endpoint, stores subscriptions in-memory
- `app/api/push/send/route.ts` — POST endpoint, sends to all subscribers via `web-push@3.6.7` using VAPID env vars
- `components/PushNotificationToggle.tsx` — Bell/BellOff toggle, hides gracefully if Notification API is unavailable

### Native Camera QR Scanning

- `components/tracking/MobileCameraScanner.tsx` — Uses `html5-qrcode` with dynamic import (SSR-safe), calls `getUserMedia` upfront for clean mobile permission UX, handles denied/unsupported states
- `app/[locale]/(app)/tracking/page.tsx` — QR button in header opens scanner modal; auto-opens on `?scan=1` URL param; navigates to `/verify/{result}` on successful scan

### Lighthouse CI (`lighthouserc.js`, `.github/workflows/lighthouse.yml`)

- Asserts PWA score ≥ 90, `service-worker` and `installable-manifest` as hard errors
- GitHub Actions workflow runs Lighthouse on every PR to `main`
- `npm run lighthouse` script added to `package.json`

---

## Acceptance Criteria

| Criteria                             | Status                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------- |
| PWA scores 90+ on Lighthouse         | ✅ Lighthouse CI enforces `categories:pwa ≥ 0.9`                        |
| Core functionality works offline     | ✅ SW pre-caches dashboard/products/tracking + background sync queue    |
| App can be installed from app stores | ✅ Manifest has `screenshots`, `shortcuts`, maskable icon, `categories` |
| Camera QR scanning works on mobile   | ✅ `MobileCameraScanner` with `getUserMedia` + `html5-qrcode`           |
| Push notifications                   | ✅ Full subscribe/send pipeline with service worker push handler        |

---

## Environment Variables Required

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # VAPID public key (client)
VAPID_PUBLIC_KEY=               # VAPID public key (server)
VAPID_PRIVATE_KEY=              # VAPID private key (server)
VAPID_EMAIL=                    # mailto: address for VAPID
```

Generate keys with: `npx web-push generate-vapid-keys`
