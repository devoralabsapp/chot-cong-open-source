import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { googleToken, origin } from "../integration/helpers";

test("360px: ZIP đủ dữ liệu → retry tải → Google xác nhận xóa → mất response → mở lại tiếp tục", async ({
  page,
  context,
}) => {
  const sub = crypto.randomUUID(),
    email = `${sub}@example.test`,
    token = await googleToken(sub);
  const csrf = await context.request.get("/api/auth/csrf"),
    csrfToken = (await csrf.json()).token;
  const headers = { Origin: origin, "x-csrf-token": csrfToken };
  expect(
    (
      await context.request.post("/api/auth/session", {
        headers,
        data: { idToken: token.idToken },
      })
    ).ok(),
  ).toBeTruthy();
  const create = async (path: string, data: unknown) => {
    const response = await context.request.post(path, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  await create("/api/students", {
    displayName: 'Lan, "Hà"\nHọc đàn',
    defaultRateVnd: 200000,
    phone: "+84900000000",
    privateNote: "=1+2",
  });
  await context.route(
    /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
  await context.route(/^https:\/\/apis\.google\.com\//, async (route) => {
    await route.fulfill({ response: await route.fetch({ timeout: 15000 }) });
  });
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Lấy lại dữ liệu", exact: true }),
  ).toBeVisible();
  const keys: string[] = [],
    exportUrls: string[] = [];
  await page.route("**/api/exports", async (route) => {
    if (route.request().method() === "POST")
      keys.push(route.request().headers()["idempotency-key"]);
    await route.continue();
  });
  await page.route("**/api/exports/*", async (route) => {
    exportUrls.push(route.request().url());
    if (exportUrls.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Tải dữ liệu về máy", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Bấm tải lại để tiếp tục" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Tải dữ liệu về máy", exact: true })
    .click();
  const download = await downloadPromise,
    path = await download.path();
  expect(download.suggestedFilename()).toMatch(
    /^chot-cong-du-lieu-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  expect(keys).toHaveLength(1);
  expect(exportUrls[0]).toBe(exportUrls[1]);
  const files = unzipSync(readFileSync(path!));
  expect(Object.keys(files).sort()).toEqual(
    [
      "profile.csv",
      "students.csv",
      "classes.csv",
      "lessons.csv",
      "appearance.csv",
      "sessions.csv",
      "statements.csv",
      "statementItems.csv",
      "payments.csv",
      "auditEvents.csv",
      "du-lieu-goc.json",
      "HUONG-DAN.txt",
    ].sort(),
  );
  const csv = strFromU8(files["students.csv"]),
    json = JSON.parse(strFromU8(files["du-lieu-goc.json"]));
  expect(Array.from(files["students.csv"].subarray(0, 3))).toEqual([
    239, 187, 191,
  ]);
  expect(csv).toContain('Lan, ""Hà""\nHọc đàn');
  expect(csv).toContain('"\t=1+2"');
  expect(csv).toContain('"\t+84900000000"');
  expect(json.data.students[0]).toMatchObject({
    displayName: 'Lan, "Hà"\nHọc đàn',
    privateNote: "=1+2",
    defaultRateVnd: 200000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/screenshots/data-settings.png",
    fullPage: true,
  });
  const deleteButton = page.getByRole("button", {
    name: "Xác nhận bằng Google và xóa tài khoản",
    exact: true,
  });
  await expect(deleteButton).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Tôi đã tải dữ liệu cần giữ hoặc không cần giữ lại",
      exact: true,
    })
    .check();
  await page
    .getByLabel("Nhập XÓA TÀI KHOẢN để xác nhận", { exact: true })
    .fill("XÓA TÀI KHOẢN");
  let stepCalls = 0;
  await page.route("**/api/account/deletion", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    stepCalls++;
    if (stepCalls === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  const popupPromise = page.waitForEvent("popup");
  await deleteButton.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
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
  await popup.getByText(email, { exact: true }).click();
  await page.waitForURL("**/account/deletion");
  await expect(
    page.getByRole("button", { name: "Tiếp tục xóa", exact: true }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (value) => value.name === "chotcong_deletion",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Đã xóa tài khoản", exact: true }),
  ).toBeVisible();
  expect((await context.request.get("/api/profile")).status()).toBe(401);
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).hash).toBe("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
