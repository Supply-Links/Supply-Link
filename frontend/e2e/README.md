# E2E Tests

## Setup

Install dependencies and browsers:

```bash
npm install
npx playwright install chromium firefox webkit
```

## Running tests

```bash
npm run test:e2e
```

This runs the full-journey spec across Chromium, Firefox, and WebKit using Playwright's built-in webServer. The dev server starts automatically in mock mode via the Playwright webServer configuration, so no external chain or wallet is required.

## Wallet mock strategy

Playwright injects a fake `window.freighterApi` via `page.addInitScript` before the app loads. The mock implements:

- `isConnected()` → resolves `true`
- `getPublicKey()` → resolves a deterministic fake address
- `signTransaction()` / `signTransactionV2()` → resolves with the input tx

`lib/stellar/client.ts` also checks `window.__MOCK_WALLET__` as a fallback so the mock works regardless of how `@stellar/freighter-api` resolves its runtime dependency.

## Selectors

All critical UI elements expose `data-testid` hooks. Tests avoid brittle text or placeholder matches. Targets include:

- `landing-title`
- `wallet-connect-button` / `wallet-status`
- `landing-nav-products` / `landing-nav-tracking`
- `products-page`, `product-card`
- `register-name-input`, `register-origin-input`, `register-submit`
- `tracking-page`, `tracking-product-select`, `add-event-button`
- `event-type-select`, `event-location-input`, `event-metadata-input`, `event-submit`
- `event-timeline`, `event-item`
- `verify-page`, `verify-product-name`, `verify-events`

## CI

In CI, Playwright runs with `retries: 2` and `workers: 1`. The webServer is not reused so each run starts a fresh dev server. Screenshots are captured on failure.
