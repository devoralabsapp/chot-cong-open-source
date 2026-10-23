import { describe, expect, it } from "vitest";
import type { TeachingSession } from "@/domain";
import type { Statement } from "@/domain/statements";
import {
  billingFilterSchema,
  matchesSession,
  matchesStatement,
  normalizeSearch,
  searchSchema,
  statementFilterSchema,
  storedStatementStatus,
} from "@/domain/list-filters";
const statement = (
  paidVnd: number,
  status = "issued",
  dueDate = "2026-10-15",
) => ({ status, totalVnd: 1600000, paidVnd, dueDate }) as Statement;
const session = (
  status: string,
  billable: boolean,
  billedStatementId: string | null = null,
) => ({ status, billable, billedStatementId }) as TeachingSession;
describe("Tìm tên tiếng Việt và lọc trạng thái hiển thị", () => {
  it("tìm tên từng phần không phân biệt hoa thường/dấu, Đ và Unicode tổ hợp", () => {
    expect(normalizeSearch("  ĐẶNG   Hồng Ánh  ")).toBe("dang hong anh");
    expect(normalizeSearch("Đặng Hồng Ánh")).toBe("dang hong anh");
    expect(searchSchema.parse(undefined)).toBe("");
    expect(() => searchSchema.parse("a".repeat(101))).toThrow();
    expect(
      normalizeSearch("Nguyễn [An].*").includes(normalizeSearch("[An].*")),
    ).toBe(true);
  });
  it("chỉ completed + billable + chưa khóa vào buổi chưa lập bảng; miễn phí không gồm buổi hủy", () => {
    expect(matchesSession(session("completed", true), "all", "unbilled")).toBe(
      true,
    );
    for (const value of [
      session("planned", true),
      session("cancelled", false),
      session("completed", false),
      session("completed", true, "statement"),
    ])
      expect(matchesSession(value, "all", "unbilled")).toBe(false);
    expect(
      matchesSession(session("completed", false), "completed", "free"),
    ).toBe(true);
    expect(matchesSession(session("cancelled", false), "all", "free")).toBe(
      false,
    );
    expect(
      matchesSession(session("completed", true, "statement"), "all", "billed"),
    ).toBe(true);
    expect(matchesSession(session("planned", true), "completed", "all")).toBe(
      false,
    );
    expect(() => billingFilterSchema.parse("owner-path")).toThrow();
  });
  it("phân biệt chưa thu/một phần/đủ và quá hạn sau ngày đến hạn, không tính nháp/hủy", () => {
    const today = "2026-10-16";
    expect(matchesStatement(statement(0), "unpaid", today)).toBe(true);
    expect(matchesStatement(statement(1000000), "partial", today)).toBe(true);
    expect(matchesStatement(statement(1600000), "paid", today)).toBe(true);
    expect(matchesStatement(statement(1000000), "outstanding", today)).toBe(
      true,
    );
    expect(matchesStatement(statement(1000000), "overdue", today)).toBe(true);
    expect(
      matchesStatement(statement(0, "issued", today), "overdue", today),
    ).toBe(false);
    expect(matchesStatement(statement(1600000), "overdue", today)).toBe(false);
    for (const status of ["draft", "void"])
      for (const filter of [
        "unpaid",
        "partial",
        "paid",
        "overdue",
        "outstanding",
      ])
        expect(matchesStatement(statement(0, status), filter, today)).toBe(
          false,
        );
    expect(storedStatementStatus("overdue")).toBe("issued");
    expect(storedStatementStatus("draft")).toBe("draft");
    expect(() => statementFilterSchema.parse("deleted")).toThrow();
  });
});
