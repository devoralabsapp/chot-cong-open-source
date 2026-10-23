# Kiến trúc và quy tắc nghiệp vụ

Next.js App Router, React, TypeScript, Tailwind 4, Firebase Authentication và Cloud Firestore. Node 24; dependencies pin exact theo lockfile. Không tự đổi bundler/dependency khi sửa một lỗi nghiệp vụ.

| Thư mục | Nội dung |
|---|---|
| `src/app` | Trang và API Node |
| `src/domain` | Schema, tiền, ngày, bảng kê và dữ liệu xuất |
| `src/lib/firebase` | Auth client, Admin server và OIDC/WIF |
| `src/lib/server` | Repository, session, giao thức HTTP, transaction |
| `src/features` | Giao diện học viên/lớp/buổi/bảng kê/thu tiền/chia sẻ |
| `firebase` | Rules, indexes và kiểm thử Rules độc lập |
| `tests/integration` | HTTP/backend hai UID, transaction và các ca dữ liệu |
| `tests/e2e` | Chromium, popup thật của Auth Emulator, retry và reload |

## Ranh giới dữ liệu

Mọi thao tác nghiệp vụ qua API server. UID chỉ lấy từ session Firebase đã kiểm tra thu hồi; không nhận ownerId/path do browser cung cấp. Dữ liệu riêng trong `apps/chotcong/users/{uid}`. Admin SDK bỏ qua Rules, nên kiểm tra backend hai UID khác với kiểm tra Rules deny client.

Cookie phiên HttpOnly/Lax, Secure trên HTTPS, tối đa 5 ngày. Browser Auth dùng bộ nhớ, ID token recent-auth đổi lấy cookie rồi sign out client. Mutation kiểm tra Origin/CSRF, strict payload/body limit, khóa idempotency UUID. Không cache xác minh phiên giữa các request; không lưu token/học phí vào browser storage hoặc log.

## Bất biến

- Tiền nguyên VND và safe integer; ngày nghiệp vụ YYYY-MM-DD theo Việt Nam; Timestamp hệ thống do server tạo, có schemaVersion.
- Đổi đơn giá học viên/lớp không đổi buổi đã lưu. Lớp tối đa 50 người, chỉ tính người được chọn; mỗi người có dòng học phí và bảng kê riêng.
- Transaction đọc hết trước ghi. Tạo result ID ngoài callback; callback có thể retry. Payload giống và cùng request ID trả cùng kết quả; cùng ID nhưng payload khác bị từ chối.
- Bảng kê tối đa 100 buổi đủ điều kiện. Phát hành chốt snapshot/counter và khóa billedStatementId cùng transaction. Nháp không là khoản phải thu; hủy chỉ khi không có khoản thu hợp lệ.
- Thu tiền không vượt số thiếu; vô hiệu hóa giữ lịch sử, đối chiếu paidVnd/count với payments.
- Link dùng mã ngẫu nhiên ở fragment `/s#token`; browser gửi POST body, server chỉ giữ hash. Có preview/expiry/rotation/revoke và allowlist nội dung công khai. Không log mã, cookie hoặc headers.
- Export phân trang cùng server readTime; ZIP/CSV không phải backup Firestore. Xóa tài khoản là state machine có lease/checkpoint và khóa ghi/link; không xóa tài khoản thật để chạy thử.

## Giới hạn

Không thanh toán ngân hàng tự động, lịch lặp, gói trả trước hoặc phân quyền trung tâm. Manifest chỉ là lối mở nhanh; không service worker/offline cache. Kiểm thử Emulator không chứng minh index/IAM/OAuth hoặc khả năng cài app trên thiết bị thật. Kiểm thử cloud cần staging riêng và dữ liệu giả.
