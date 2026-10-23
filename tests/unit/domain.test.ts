import { describe, it, expect } from "vitest";
import {
  dateSchema,
  moneySchema,
  sessionAmount,
  sessionInputSchema,
  studentInputSchema,
  vietnamToday,
} from "@/domain";
describe("Quy tắc ngày và tiền", () => {
  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-1-01",
    "1899-12-31",
    "2101-01-01",
  ])("từ chối ngày sai %s", (v) =>
    expect(dateSchema.safeParse(v).success).toBe(false),
  );
  it("chấp nhận ngày nhuận", () =>
    expect(dateSchema.parse("2028-02-29")).toBe("2028-02-29"));
  it("đổi ngày đúng ranh giới Việt Nam", () => {
    expect(vietnamToday(new Date("2026-10-14T16:59:59Z"))).toBe("2026-10-14");
    expect(vietnamToday(new Date("2026-10-14T17:00:00Z"))).toBe("2026-10-15");
  });
  it.each([-1, 0.5, NaN, Infinity, 1_000_000_001, Number.MAX_SAFE_INTEGER + 1])(
    "từ chối tiền sai %s",
    (v) => expect(moneySchema.safeParse(v).success).toBe(false),
  );
  it("chỉ tính buổi hoàn thành có phí", () => {
    expect(
      sessionAmount({ status: "completed", billable: true, rateVnd: 200000 }),
    ).toBe(200000);
    for (const status of ["planned", "cancelled"] as const)
      expect(sessionAmount({ status, billable: true, rateVnd: 200000 })).toBe(
        0,
      );
    expect(
      sessionAmount({ status: "completed", billable: false, rateVnd: 200000 }),
    ).toBe(0);
  });
  it("buổi hủy không thể tính phí", () =>
    expect(
      sessionInputSchema.safeParse({
        studentId: "a",
        sessionDate: "2026-10-15",
        status: "cancelled",
        billable: true,
      }).success,
    ).toBe(false));
  it("không nhận ownerId/path/trường tiền tính sẵn từ client", () => {
    expect(
      studentInputSchema.safeParse({
        displayName: "Lan",
        defaultRateVnd: 200000,
        ownerId: "another",
      }).success,
    ).toBe(false);
    expect(
      sessionInputSchema.safeParse({
        studentId: "../other",
        sessionDate: "2026-10-15",
        status: "completed",
        billable: true,
      }).success,
    ).toBe(false);
  });
});
