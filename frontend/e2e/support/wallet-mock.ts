import { type Page } from "@playwright/test";

export const MOCK_WALLET_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";

export async function setupWalletMock(page: Page) {
  await page.addInitScript((address) => {
    window.localStorage.removeItem("supply-link-mock-data");
    (window as any).__MOCK_WALLET__ = address;
    (window as any).freighterApi = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(address),
      signTransaction: (tx: string) => Promise.resolve(tx),
      signTransactionV2: (tx: string) => Promise.resolve(tx),
    };
  }, MOCK_WALLET_ADDRESS);
}
