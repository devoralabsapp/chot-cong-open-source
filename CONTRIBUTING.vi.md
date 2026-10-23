# Đóng góp

[English](CONTRIBUTING.md) | **Tiếng Việt**

Fork repository, tạo branch riêng và chạy local với Emulator theo README. Đóng góp code được đề xuất theo giấy phép MIT của dự án; dependency vẫn giữ giấy phép riêng.

Đọc AGENTS.md, docs/ARCHITECTURE.vi.md và tài liệu Next.js được cài trong node_modules/next/dist/docs trước khi sửa. Giữ integer VND, ngày Việt Nam, server UID/session/CSRF, snapshot giá, transaction và idempotency. Không gỡ guard demo/loopback để chạy test trên cloud.

Trước pull request chạy lint, typecheck, unit, build và test:emulator. Mô tả hành vi trước/sau, cách kiểm tra và giới hạn còn lại. Dùng dữ liệu giả, không đưa file .env, credential, dữ liệu người dùng, screenshot thật hoặc trace/cookie vào issue/PR. Không nâng dependency ngoài phạm vi thay đổi cần thiết.
