# Báo lỗi bảo mật

Không đăng secret, token, cookie, dữ liệu học viên hoặc chi tiết khai thác một hệ thống đang vận hành vào issue công khai. Nếu repository bật GitHub Private Vulnerability Reporting, dùng mục Security → Report a vulnerability. Nếu chưa có kênh riêng, chỉ tạo issue xin cách liên hệ mà không đưa chi tiết nhạy cảm.

Mã nguồn được cung cấp theo MIT, không kèm cam kết SLA hoặc lịch hỗ trợ. Người tự triển khai chịu trách nhiệm cấu hình Firebase/IAM/Rules/indexes, OAuth, HTTPS, quyền truy cập, backup và cập nhật dependency. Emulator và test có guard chỉ dành cho dữ liệu giả local/CI.

Bản public được xuất với lịch sử Git mới, cấu hình demo và placeholder cloud. Không commit .env.local, kho credential, dữ liệu Emulator, ảnh vận hành hoặc browser traces. Nếu vô tình công khai secret, thu hồi/rotate ngay; xóa file ở commit mới không loại bỏ nó khỏi lịch sử Git.
