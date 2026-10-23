import { expect, test } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";
test("360px: chọn 8 buổi → retry cùng khóa → nháp → phát hành → khóa → hủy → lập lại", async ({
  page,
  context,
}) => {
  const token = await googleToken();
  const csrf = await context.request.get("/api/auth/csrf");
  const { token: csrfToken } = await csrf.json();
  const headers = { Origin: origin, "x-csrf-token": csrfToken };
  expect(
    (
      await context.request.post("/api/auth/session", {
        headers,
        data: { idToken: token.idToken },
      })
    ).ok(),
  ).toBeTruthy();
  const create = async (path: string, body: unknown) => {
    const response = await context.request.post(path, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: body,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const student = await create("/api/students", {
    displayName: "Lan bảng kê",
    defaultRateVnd: 200000,
  });
  for (let i = 1; i <= 8; i++)
    await create("/api/sessions", {
      studentId: student.id,
      sessionDate: `2026-10-${String(i).padStart(2, "0")}`,
      status: "completed",
      billable: true,
    });
  await create("/api/sessions", {
    studentId: student.id,
    sessionDate: "2026-10-09",
    status: "cancelled",
    billable: false,
  });
  await page.goto(`/app/statements/new?studentId=${student.id}`);
  await page.getByLabel("Từ ngày", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Đến ngày", { exact: true }).fill("2026-10-31");
  await expect(page.getByRole("checkbox", { name: /^Buổi / })).toHaveCount(8);
  await page
    .getByRole("button", { name: "Chọn các buổi đang hiện", exact: true })
    .click();
  await expect(
    page.getByText("Đã chọn 8/100 buổi", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("draft-total")).toContainText("1.600.000");
  const keys: string[] = [];
  await page.route("**/api/statements", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nội dung vẫn được giữ" }),
  ).toBeVisible();
  await expect(
    page.getByText("Đã chọn 8/100 buổi", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await page.waitForURL(/\/app\/statements\/[a-f0-9-]+$/);
  const statementUrl = page.url();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(page.getByTestId("statement-total")).toContainText("1.600.000");
  await expect(
    page.getByRole("heading", { name: "Xem trước bản nháp", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Phát hành bảng kê", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^CC-\d{4}-\d+/ }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("statement-total")).toContainText("1.600.000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto(`/app/students/${student.id}`);
  await expect(
    page
      .locator(".status-completed")
      .first()
      .locator("..")
      .getByRole("button", { name: "Sửa", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator(".status-cancelled")
      .locator("..")
      .getByRole("button", { name: "Sửa", exact: true }),
  ).toBeEnabled();
  await page.goto(statementUrl);
  await page.locator("summary").filter({ hasText: "Hủy bảng kê" }).click();
  await page
    .getByLabel("Lý do hủy", { exact: true })
    .fill("Đối chiếu lại kỳ học thử");
  await page
    .getByRole("button", { name: "Xác nhận hủy bảng kê", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bảng kê đã hủy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Lập bảng kê mới", exact: true })
    .click();
  await page.getByLabel("Từ ngày", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Đến ngày", { exact: true }).fill("2026-10-31");
  await expect(page.getByRole("checkbox", { name: /^Buổi / })).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/app/statements");
  await expect(
    page.getByRole("link", { name: /CC-.*Lan bảng kê/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
