import { ApiError } from "@/lib/client-api";

export function authErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  const missingState =
    error instanceof Error && /missing initial state/i.test(error.message);
  if (code === "auth/popup-blocked")
    return "Trình duyệt đã chặn cửa sổ đăng nhập. Cho phép popup cho Chốt Công, đóng cửa sổ lỗi cũ rồi nhấn nút Google lại từ trang này.";
  if (code === "auth/popup-closed-by-user")
    return "Cửa sổ đăng nhập đã đóng. Nếu cửa sổ đó báo lỗi, hãy đóng hẳn rồi nhấn nút Google lại từ trang này.";
  if (
    missingState ||
    code === "auth/missing-initial-state" ||
    code === "auth/web-storage-unsupported"
  )
    return "Trình duyệt không giữ được trạng thái đăng nhập. Đóng cửa sổ lỗi, mở lại Chốt Công bằng Safari hoặc Chrome rồi bắt đầu lại từ nút Google. Nếu đang ở trong Zalo/Facebook, hãy mở bằng trình duyệt bên ngoài.";
  if (code === "auth/cancelled-popup-request")
    return "Một lần đăng nhập khác đang được mở. Đóng các cửa sổ đăng nhập cũ rồi thử lại một lần.";
  if (code === "auth/network-request-failed" || error instanceof TypeError)
    return "Chưa kết nối được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.";
  if (
    code === "auth/unauthorized-domain" ||
    code === "auth/operation-not-allowed"
  )
    return "Cấu hình đăng nhập chưa sẵn sàng cho trang này. Vui lòng liên hệ người hỗ trợ Chốt Công.";
  return "Chưa thể hoàn tất đăng nhập Google. Đóng cửa sổ đăng nhập cũ rồi thử lại từ trang này.";
}
