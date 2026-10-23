import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/firebase/auth-errors";
import { ApiError } from "@/lib/client-api";

describe("Thông báo lỗi đăng nhập an toàn và có cách thử lại", () => {
  it("phân biệt chặn popup, đóng popup và thiếu trạng thái/bộ nhớ", () => {
    expect(authErrorMessage({ code: "auth/popup-blocked" })).toContain(
      "Cho phép popup",
    );
    expect(authErrorMessage({ code: "auth/popup-closed-by-user" })).toContain(
      "Cửa sổ đăng nhập đã đóng",
    );
    for (const error of [
      { code: "auth/web-storage-unsupported" },
      { code: "auth/missing-initial-state" },
      new Error("Unable to process request due to missing initial state"),
    ]) {
      const message = authErrorMessage(error);
      expect(message).toContain("trạng thái đăng nhập");
      expect(message).toContain("Safari hoặc Chrome");
    }
  });
  it("không đưa thông báo SDK/customData hoặc email/token thô ra UI", () => {
    const error = Object.assign(
      new Error("sensitive-id-token secret@example.test"),
      {
        code: "auth/unexpected-error",
        customData: { email: "secret@example.test" },
      },
    );
    const message = authErrorMessage(error);
    expect(message).not.toMatch(/sensitive|secret|@/);
    expect(message).toContain("thử lại");
  });
  it("giữ lỗi API đã được server làm sạch, phân biệt mất mạng/cấu hình", () => {
    expect(authErrorMessage(new ApiError(503, "Sổ đang được bảo trì."))).toBe(
      "Sổ đang được bảo trì.",
    );
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toContain(
      "Kiểm tra mạng",
    );
    expect(authErrorMessage({ code: "auth/unauthorized-domain" })).toContain(
      "Cấu hình đăng nhập",
    );
  });
});
