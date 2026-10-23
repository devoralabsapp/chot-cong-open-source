import { expect, test } from "@playwright/test";
import { origin } from "../integration/helpers";

test("popup bị chặn → đóng lỗi/thử lại với browser storage bị chặn → Google Emulator → cookie server", async ({
  page,
  context,
}) => {
  await context.addInitScript(
    ({ origin }) => {
      if (location.origin !== origin) return;
      // Real browser restrictions, no fake Firebase result/session/token.
      for (const key of ["localStorage", "sessionStorage", "indexedDB"])
        Object.defineProperty(window, key, {
          configurable: true,
          get() {
            throw new DOMException(
              "Storage unavailable for test",
              "SecurityError",
            );
          },
        });
      let denied = false;
      const open = window.open.bind(window);
      window.open = ((...args: Parameters<typeof window.open>) => {
        if (!denied) {
          denied = true;
          return null;
        }
        return open(...args);
      }) as typeof window.open;
    },
    { origin },
  );
  await context.route(
    /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
  await context.route(/^https:\/\/apis\.google\.com\//, async (route) => {
    await route.fulfill({ response: await route.fetch({ timeout: 15000 }) });
  });
  await page.goto("/login");
  const button = page.getByRole("button", {
    name: "Tiếp tục với Google",
  });
  await button.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Cho phép popup" }),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  expect((await context.request.get("/api/profile")).status()).toBe(401);
  const popupPromise = page.waitForEvent("popup");
  await button.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup
    .locator("#email-input")
    .fill(`recovery-${crypto.randomUUID()}@example.test`);
  await popup.locator("#display-name-input").fill("Cô Lan thử lại");
  const relayElement = await page.waitForSelector(
    'iframe[src*="/emulator/auth/iframe"]',
    { state: "attached" },
  );
  const relay = await relayElement!.contentFrame();
  await relay!.waitForFunction(
    "Boolean(window.parentContainer)",
    {},
    { timeout: 20000, polling: 100 },
  );
  await popup
    .getByRole("button", { name: "Sign in with Google.com", exact: true })
    .click();
  await page.waitForURL("**/app");
  await expect(
    page.getByText("Học viên đang học", { exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "chotcong_session",
    )?.httpOnly,
  ).toBe(true);
  expect((await context.request.get("/api/profile")).status()).toBe(200);
  expect(
    await page.evaluate(() => {
      try {
        void localStorage;
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});
