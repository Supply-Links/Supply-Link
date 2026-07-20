import { test, expect } from "@playwright/test";
import { setupWalletMock } from "./support/wallet-mock";

test.describe("Full journey", () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMock(page);
  });

  test("register product, add tracking event, verify on public page", async ({ page }) => {
    const productName = `E2E Product ${Date.now()}`;
    const productOrigin = "Test Origin";

    // 1. Visit landing page
    await page.goto("/");
    await expect(page.getByTestId("landing-title")).toHaveText("Supply-Link");

    // 2. Connect wallet
    await page.getByTestId("wallet-connect-button").click();
    await expect(page.getByTestId("wallet-status")).toBeVisible();

    // 3. Navigate to products page
    await page.evaluate(() => {
      const link = document.querySelector('[data-testid="landing-nav-products"]') as HTMLAnchorElement;
      if (link) link.click();
    });
    await expect(page.getByTestId("products-page")).toBeVisible();

    // 4. Register a new product
    await page.getByTestId("register-name-input").fill(productName);
    await page.getByTestId("register-origin-input").fill(productOrigin);
    await page.getByTestId("register-submit").click();

    // Wait for the new product card to appear and extract its ID
    const newProductCard = page.getByTestId("product-card").filter({ hasText: productName });
    await expect(newProductCard).toBeVisible();

    const selectedProductId = await page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll('[data-testid="product-card"]'));
      const card = cards.find((c) => c.textContent?.includes(name));
      const idText = card?.querySelector('.font-mono')?.textContent;
      return idText?.replace("ID: ", "").trim();
    }, productName);

    expect(selectedProductId).toBeTruthy();

    // 5. Open product detail
    await newProductCard.evaluate((card) => (card as HTMLAnchorElement).click());
    await expect(page.getByTestId("product-detail")).toBeVisible();
    await expect(page.getByTestId("product-name")).toHaveText(productName);

    // 6. Navigate to tracking page
    await page.evaluate(() => {
      const link = document.querySelector('[data-testid="sidebar-link-tracking"]') as HTMLAnchorElement;
      if (link) link.click();
    });
    await expect(page.getByTestId("tracking-page")).toBeVisible();

    // 7. Select the newly registered product
    await page.getByTestId("tracking-product-select").selectOption(selectedProductId);

    // 8. Add a tracking event
    await page.getByTestId("add-event-button").click();
    await page.getByTestId("event-type-select").selectOption("SHIPPING");
    await page.getByTestId("event-location-input").fill("Rotterdam");
    await page.getByTestId("event-metadata-input").fill('{"vessel": "MV Stellar"}');
    await page.getByTestId("event-submit").click();

    // 9. Assert event appears on tracking page
    await expect(page.getByTestId("event-timeline")).toContainText("Rotterdam");

    // 10. Navigate to public verify page via client-side link
    await page.evaluate(() => {
      const link = document.querySelector('[data-testid="tracking-verify-link"]') as HTMLAnchorElement;
      if (link) link.click();
    });
    await expect(page.getByTestId("verify-page")).toBeVisible();
    await expect(page.getByTestId("verify-product-name")).toHaveText(productName);

    // 11. Assert event appears on verify page
    await expect(page.getByTestId("verify-events")).toContainText("Rotterdam");
  });
});
