# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-journey.spec.ts >> Full journey >> register product, add tracking event, verify on public page
- Location: e2e/full-journey.spec.ts:9:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('tracking-product-select').locator('option').filter({ hasText: 'E2E Product 1784560000313' })
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByTestId('tracking-product-select').locator('option').filter({ hasText: 'E2E Product 1784560000313' })
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - heading "Tracking" [level=1] [ref=e4]
      - button "Add Event" [ref=e5]:
        - img [ref=e6]
        - text: Add Event
    - generic [ref=e7]:
      - text: Select Product
      - combobox [ref=e8]:
        - option "Organic Coffee Beans — prod-001" [selected]
        - option "Fair Trade Cocoa — prod-002"
    - generic [ref=e9]:
      - generic [ref=e10]:
        - paragraph [ref=e11]: Organic Coffee Beans
        - paragraph [ref=e12]: "Origin: Ethiopia"
      - text: Active
      - link "Verify" [ref=e13] [cursor=pointer]:
        - /url: /en/verify/prod-001
        - img [ref=e14]
        - text: Verify
    - generic [ref=e18]:
      - heading "Event History(4)" [level=2] [ref=e19]:
        - text: Event History
        - generic [ref=e20]: (4)
      - list [ref=e21]:
        - listitem [ref=e22]:
          - generic [ref=e23]: Harvest3/9/2024, 4:00:00 PM
          - paragraph [ref=e24]: Yirgacheffe, Ethiopia
          - paragraph [ref=e25]: GACTOR1A…234567
          - button "Show metadata" [ref=e27]:
            - img [ref=e28]
            - text: Show metadata
        - listitem [ref=e30]:
          - generic [ref=e31]: Processing3/11/2024, 11:33:20 PM
          - paragraph [ref=e32]: Addis Ababa, Ethiopia
          - paragraph [ref=e33]: GACTOR1A…234567
          - button "Show metadata" [ref=e35]:
            - img [ref=e36]
            - text: Show metadata
        - listitem [ref=e38]:
          - generic [ref=e39]: Shipping3/14/2024, 7:06:40 AM
          - paragraph [ref=e40]: Port of Djibouti
          - paragraph [ref=e41]: GACTOR2A…234567
          - button "Show metadata" [ref=e43]:
            - img [ref=e44]
            - text: Show metadata
        - listitem [ref=e46]:
          - generic [ref=e47]: Retail3/16/2024, 2:40:00 PM
          - paragraph [ref=e48]: Amsterdam, Netherlands
          - paragraph [ref=e49]: GABC1234…UVWXYZ
          - button "Show metadata" [ref=e51]:
            - img [ref=e52]
            - text: Show metadata
  - button "Open Next.js Dev Tools" [ref=e59] [cursor=pointer]:
    - img [ref=e60]
  - alert [ref=e63]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { setupWalletMock } from "./support/wallet-mock";
  3  | 
  4  | test.describe("Full journey", () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await setupWalletMock(page);
  7  |   });
  8  | 
  9  |   test("register product, add tracking event, verify on public page", async ({ page }) => {
  10 |     const productName = `E2E Product ${Date.now()}`;
  11 |     const productOrigin = "Test Origin";
  12 | 
  13 |     await page.goto("/en");
  14 |     await expect(page.getByTestId("landing-title")).toHaveText("Supply-Link");
  15 |     await expect(page.getByTestId("landing-cta")).toBeVisible();
  16 | 
  17 |     await page.getByTestId("wallet-connect-button").click();
  18 |     await expect(page.getByTestId("wallet-status")).toContainText("GABC");
  19 | 
  20 |     await page.getByTestId("landing-nav-products").click();
  21 |     await expect(page.getByTestId("products-page")).toBeVisible();
  22 | 
  23 |     await page.getByTestId("register-name-input").fill(productName);
  24 |     await page.getByTestId("register-origin-input").fill(productOrigin);
  25 |     await page.getByTestId("register-submit").click();
  26 | 
  27 |     const newProductCard = page.getByTestId("product-card").filter({ hasText: productName }).first();
  28 |     await expect(newProductCard).toBeVisible();
  29 | 
  30 |     const selectedProductHref = await newProductCard.getAttribute("href");
  31 |     const productId = selectedProductHref?.split("/").pop();
  32 | 
  33 |     expect(productId).toBeTruthy();
  34 | 
  35 |     await newProductCard.click();
  36 |     await expect(page.getByTestId("product-detail")).toBeVisible();
  37 |     await expect(page.getByTestId("product-name")).toHaveText(productName);
  38 | 
  39 |     await page.goto("/en/tracking");
  40 |     await expect(page.getByTestId("tracking-page")).toBeVisible();
  41 | 
  42 |     const trackingSelect = page.getByTestId("tracking-product-select");
  43 |     await expect(trackingSelect).toBeVisible();
> 44 |     await expect(trackingSelect.locator("option", { hasText: productName })).toHaveCount(1);
     |                                                                              ^ Error: expect(locator).toHaveCount(expected) failed
  45 |     await trackingSelect.selectOption(productId!);
  46 | 
  47 |     await page.getByTestId("add-event-button").click();
  48 |     await page.getByTestId("event-type-select").selectOption("SHIPPING");
  49 |     await page.getByTestId("event-location-input").fill("Rotterdam");
  50 |     await page.getByTestId("event-metadata-input").fill('{"vessel": "MV Stellar"}');
  51 |     await page.getByTestId("event-submit").click();
  52 | 
  53 |     await expect(page.getByTestId("event-timeline")).toContainText("Rotterdam");
  54 | 
  55 |     await page.getByTestId("tracking-verify-link").click();
  56 |     await expect(page.getByTestId("verify-page")).toBeVisible();
  57 |     await expect(page.getByTestId("verify-product-name")).toHaveText(productName);
  58 |     await expect(page.getByTestId("verify-events")).toContainText("Rotterdam");
  59 |   });
  60 | });
  61 | 
```