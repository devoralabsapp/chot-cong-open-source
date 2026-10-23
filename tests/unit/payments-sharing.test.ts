import { expect, it } from "vitest";
import { paymentInputSchema } from "@/domain/payments";
import {
  shareCreateInputSchema,
  shareTokenSchema,
  publicStatementSchema,
} from "@/domain/sharing";
import { shareRateBuckets } from "@/lib/server/share-rate-limit";
it("tiền thu nguyên dương, phương thức có giới hạn, không nhận owner/tổng/snapshot từ client", () => {
  const valid = {
    amountVnd: 1000000,
    receivedDate: "2026-10-16",
    method: "transfer",
  };
  expect(paymentInputSchema.parse(valid).amountVnd).toBe(1000000);
  for (const amountVnd of [
    0,
    -1,
    0.1,
    Number.MAX_SAFE_INTEGER + 1,
    100000000001,
  ])
    expect(paymentInputSchema.safeParse({ ...valid, amountVnd }).success).toBe(
      false,
    );
  for (const extra of [
    { ownerId: "other" },
    { statementId: "other" },
    { paidVnd: 1 },
    { method: "bank-auto" },
    { receivedDate: "2026-02-30" },
  ])
    expect(paymentInputSchema.safeParse({ ...valid, ...extra }).success).toBe(
      false,
    );
});
it("link cần 32 byte base64url và xác nhận phiên bản/hash xem trước; client không chọn token/hạn", () => {
  expect(shareTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
  for (const token of ["A".repeat(42), "A".repeat(44), "A".repeat(42) + "/"])
    expect(shareTokenSchema.safeParse(token).success).toBe(false);
  const input = { version: 1, previewHash: "a".repeat(64) };
  expect(shareCreateInputSchema.safeParse(input).success).toBe(true);
  for (const extra of [
    { token: "A".repeat(43) },
    { expiresAt: "2100-01-01" },
    { ownerId: "other" },
  ])
    expect(
      shareCreateInputSchema.safeParse({ ...input, ...extra }).success,
    ).toBe(false);
});
it("schema công khai chỉ cho phép tên, ngày, tiền và thông tin nhận tiền đã chọn", () => {
  const value = {
    teacherName: "Mai",
    recipientName: "Lan",
    number: "CC-2026-000001",
    issueDate: "2026-10-16",
    dueDate: "2026-10-23",
    items: [{ sessionDate: "2026-10-15", amountVnd: 200000 }],
    totalVnd: 200000,
    paidVnd: 100000,
    remainingVnd: 100000,
    payments: [{ receivedDate: "2026-10-16", amountVnd: 100000 }],
    bankDetails: null,
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
  expect(publicStatementSchema.safeParse(value).success).toBe(true);
  expect(
    publicStatementSchema.safeParse({ ...value, phone: "0900000000" }).success,
  ).toBe(false);
  expect(
    publicStatementSchema.safeParse({
      ...value,
      items: [{ ...value.items[0], sessionId: "private" }],
    }).success,
  ).toBe(false);
  expect(
    publicStatementSchema.safeParse({
      ...value,
      payments: [{ ...value.payments[0], privateNote: "private" }],
    }).success,
  ).toBe(false);
});
it("giới hạn truy cập dùng bucket hữu hạn, không lưu IP/token và đổi cửa sổ theo phút/ngày", () => {
  const buckets = shareRateBuckets("192.0.2.1", 60000);
  expect(buckets[0].id).toMatch(/^ip-[0-9a-f]{3}$/);
  expect(JSON.stringify(buckets)).not.toContain("192.0.2.1");
  expect(shareRateBuckets("192.0.2.1", 119999)).toEqual(buckets);
  expect(shareRateBuckets("192.0.2.1", 120000)[0].window).toBe(
    buckets[0].window + 1,
  );
  expect(shareRateBuckets("192.0.2.1", 86400000)[2].window).toBe(1);
});
