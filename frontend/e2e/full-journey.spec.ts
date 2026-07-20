import { test, expect } from "@playwright/test";
import { setupWalletMock } from "./support/wallet-mock";

test.describe("Full journey", () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMock(page);
  });

  test("register product, add tracking event, verify on public page", async ({ page }) => {
    const productName = `E2E Product ${Date.now()}`;
    const productOrigin = "Test Origin";

    await page.goto("/en");
    await expect(page.getByTestId("landing-title")).toHaveText("Supply-Link");
    await expect(page.getByTestId("landing-cta")).toBeVisible();

    await page.getByTestId("wallet-connect-button").click();
    await expect(page.getByTestId("wallet-status")).toContainText("GABC");

    await page.getByTestId("landing-nav-products").click();
    await expect(page.getByTestId("products-page")).toBeVisible();

    await page.getByTestId("register-name-input").fill(productName);
    await page.getByTestId("register-origin-input").fill(productOrigin);
    await page.getByTestId("register-submit").click();

    const newProductCard = page.getByTestId("product-card").filter({ hasText: productName }).first();
    await expect(newProductCard).toBeVisible();

    const selectedProductHref = await newProductCard.getAttribute("href");
    const productId = selectedProductHref?.split("/").pop();

    expect(productId).toBeTruthy();

    await newProductCard.click();
    await expect(page.getByTestId("product-detail")).toBeVisible();
    await expect(page.getByTestId("product-name")).toHaveText(productName);

    await page.goto("/en/tracking");
    await expect(page.getByTestId("tracking-page")).toBeVisible();

    const trackingSelect = page.getByTestId("tracking-product-select");
    await expect(trackingSelect).toBeVisible();
    await expect(trackingSelect.locator("option", { hasText: productName })).toHaveCount(1);
    await trackingSelect.selectOption(productId!);

    await page.getByTestId("add-event-button").click();
    await page.getByTestId("event-type-select").selectOption("SHIPPING");
    await page.getByTestId("event-location-input").fill("Rotterdam");
    await page.getByTestId("event-metadata-input").fill('{"vessel": "MV Stellar"}');
    await page.getByTestId("event-submit").click();

    await expect(page.getByTestId("event-timeline")).toContainText("Rotterdam");

    await page.getByTestId("tracking-verify-link").click();
    await expect(page.getByTestId("verify-page")).toBeVisible();
    await expect(page.getByTestId("verify-product-name")).toHaveText(productName);
    await expect(page.getByTestId("verify-events")).toContainText("Rotterdam");
  });
});
