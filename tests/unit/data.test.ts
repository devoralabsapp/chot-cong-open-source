import { expect, it } from "vitest";
import { csvCell, csvLine } from "@/domain/csv";
import {
  deletionInputSchema,
  DELETE_CONFIRMATION,
  exportInputSchema,
  exportPageInputSchema,
} from "@/domain/data";
it("CSV giữ dấu, quote/dấu phẩy/xuống dòng và dùng CRLF; VND vẫn là integer", () => {
  expect(csvCell('Lan, "Hà"\nBuổi đàn')).toBe('"Lan, ""Hà""\nBuổi đàn"');
  expect(csvLine([200000, null, "Hằng"])).toBe('"200000","","Hằng"\r\n');
});
it("ô text có thể thành công thức được thêm tab trong quotes, kể cả whitespace/control/fullwidth", () => {
  for (const value of [
    "=1+2",
    "+84900000000",
    "-1+2",
    "@SUM(1)",
    "  =1",
    "\t=1",
    "\r=1",
    "\n=1",
    "\0=1",
    "＝1",
    "＋1",
    "－1",
    "＠SUM(1)",
    "\uFEFF=1",
  ])
    expect(csvCell(value)).toBe('"\t' + value + '"');
  expect(csvCell("Lan = 1")).toBe('"Lan = 1"');
});
it("export không nhận UID/path/readTime từ client; cursor chỉ là ID, phân trang có giới hạn", () => {
  expect(exportInputSchema.safeParse({ dataset: "all" }).success).toBe(true);
  for (const value of [
    { dataset: "all", ownerId: "other" },
    { dataset: "shareTokens" },
    { dataset: "students", readTime: "2026-01-01" },
  ])
    expect(exportInputSchema.safeParse(value).success).toBe(false);
  for (const value of [
    { dataset: "students", cursor: "../../other" },
    { dataset: "profile", ownerId: "other" },
    { dataset: "sessions", limit: 101 },
  ])
    expect(exportPageInputSchema.safeParse(value).success).toBe(false);
});
it("xóa cần đủ xác nhận và Google ID token, không nhận UID/job/operator từ client", () => {
  const valid = {
    confirmation: DELETE_CONFIRMATION,
    acknowledged: true,
    idToken: "fresh-google-token",
  };
  expect(deletionInputSchema.safeParse(valid).success).toBe(true);
  for (const extra of [
    { confirmation: "xóa" },
    { acknowledged: false },
    { idToken: "" },
    { ownerUid: "other" },
    { operator: true },
    { jobId: "other" },
  ])
    expect(deletionInputSchema.safeParse({ ...valid, ...extra }).success).toBe(
      false,
    );
});
