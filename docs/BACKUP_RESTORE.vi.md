# Sao lưu và diễn tập khôi phục local

[English](BACKUP_RESTORE.md) | **Tiếng Việt**

## Trạng thái và giới hạn

Source bao gồm công cụ **chỉ chạy trên Emulator**, không có chế độ cloud hoặc endpoint backup công khai. Source cố định `demo-chotcong`, target cố định `demo-chotcong-restore` trên cùng Firestore Emulator loopback. Guard độc lập từ chối project thật/host ngoài loopback trước SDK I/O. Đã chuẩn bị cơ chế bảo trì ở backend; không bật bảo trì production trong mốc này.

**Chưa có backup production, lịch hằng ngày, nơi lưu lâu dài, retention hoặc diễn tập cloud.** `/tmp` chỉ dành cho dữ liệu giả. GitHub artifacts, CSV/ZIP người dùng và Emulator export không thay backup production. Mỗi đơn vị tự triển khai cần xác định phương án backup/retention của mình trước khi lưu dữ liệu thật.

## Định dạng và dữ liệu

- File `.ccbackup` phiên bản 1: manifest source project/database/namespace, loại snapshot/ledger, thời điểm bắt đầu/kết thúc, UUID và toàn bộ documents. Không nén; giới hạn 64 MiB/100.000 vị trí document, vượt giới hạn thì báo lỗi, không xuất một bản thiếu.
- Mã hóa AES-256-GCM với key ngẫu nhiên 32 byte, IV mới mỗi file, header làm authenticated data. Sai key, đổi byte hoặc cắt file bị từ chối. Key `.cckey` là khóa mã hóa bản sao của ứng dụng, không phải service-account key của Google; phải cất riêng; không có key thì không khôi phục được. Không ghi plaintext ra đĩa hoặc log.
- File mới 0600, xuất bằng atomic link không ghi đè. CLI buộc đường dẫn nằm ngoài checkout, từ chối symlink file và file có quyền đọc rộng. Thư mục/key cần được người vận hành bảo vệ; mã hóa không thay quản lý quyền truy cập và retention.
- Codec phân biệt map/array/primitive/Timestamp (seconds + nanoseconds)/bytes/GeoPoint. Schema nghiệp vụ dùng ID chuỗi; từ chối DocumentReference vì SDK đọc thành đường dẫn tương đối, không giữ project/database gốc để chuyển an toàn. Từ chối kiểu chưa hỗ trợ, số không hữu hạn, số nguyên không an toàn; không âm thầm đổi kiểu. Firestore lưu thời gian với độ chính xác microsecond; codec giữ nguyên giá trị SDK đọc được.
- Duyệt cả document cha không tồn tại và subcollections chưa biết. SDK phân trang danh sách tên; nội dung đọc tối đa 100 document/lần. Bao gồm students, sessions, statements, payments, audit, counters, operationRequests, shareTokens, accountDeletions và subcollections bổ sung trong namespace.
- Không sao lưu `operations` (khóa vận hành) hoặc `shareRateLimits` (counter tạm). Snapshot có dataExports để bảo toàn nguồn, nhưng restore bỏ job xuất cũ vì readTime không dùng lại được ở database đích.
- **Không xuất/khôi phục Firebase Auth, mật khẩu, credential hoặc cấu hình IAM/Rules/indexes.** Source code cấu hình vẫn ở Git. Đây là bản sao dữ liệu Firestore của ứng dụng; chưa phải phương án khôi phục khi mất cả Firebase project/Auth. Phải xác nhận phạm vi sự cố và liên kết UID/Auth trước cloud restore.

## Tính nhất quán và bảo trì

`apps/chotcong/operations/maintenance` là khóa bền, không có TTL tự mở. Business transaction, tạo profile, phát hành link, bắt đầu/claim job xóa đều đọc khóa trước ghi. API riêng tư trả 503 với thông báo giữ form; public link trả màn hình chung không khả dụng. Rate counters vẫn chạy và bị loại khỏi snapshot.

Tạo khóa cũng đọc các job có leaseUntil > epoch trong transaction. Job đang xóa, kể cả lease đã cũ, phải hoàn thành/recover trước; tránh chụp trong lúc recursiveDelete/Auth worker còn chạy ngoài transaction. Sau khi đóng ghi, dữ liệu không đổi trong suốt quá trình duyệt, nên không phụ thuộc giới hạn thời gian readTime lịch sử.

Tất cả instance backend phải cùng source đã hỗ trợ khóa. Admin SDK/Console/seed/migration khác bỏ qua guard ứng dụng: người vận hành phải dừng các writer đó. Namespace không phải ranh giới IAM khi dùng chung Firebase project.

Backup hoàn tất/lỗi thông thường đều nhả đúng khóa của lần chạy. Process bị kill có thể để lại khóa: đọc thông tin khóa, xác minh không còn job chạy, tìm và xóa file tạm chưa publish rồi mới dùng lệnh release bên dưới. Không tự xóa `accountDeletions` để mở ghi.

## Chạy diễn tập local

Cần Node 24, Emulator đang chạy theo README, `.env.local` chỉ trỏ demo/loopback và dữ liệu giả. Cài đặt chạy trong terminal thứ hai:

```bash
mkdir -m 700 /tmp/chotcong-backup-rehearsal
npm run backup:local -- keygen --out /tmp/chotcong-backup-rehearsal/recovery.cckey
npm run backup:local -- create --key /tmp/chotcong-backup-rehearsal/recovery.cckey --out /tmp/chotcong-backup-rehearsal/snapshot.ccbackup
npm run backup:local -- verify --key /tmp/chotcong-backup-rehearsal/recovery.cckey --input /tmp/chotcong-backup-rehearsal/snapshot.ccbackup
npm run backup:local -- ledger --key /tmp/chotcong-backup-rehearsal/recovery.cckey --out /tmp/chotcong-backup-rehearsal/deletions.ccbackup
npm run backup:local -- restore --key /tmp/chotcong-backup-rehearsal/recovery.cckey --input /tmp/chotcong-backup-rehearsal/snapshot.ccbackup --ledger /tmp/chotcong-backup-rehearsal/deletions.ccbackup
```

`verify` xác thực mã hóa và manifest; **restore mới kiểm tra toàn bộ codec và đối chiếu tài chính**. Target phải trống, chỉ cho phép có dấu xóa đã giữ từ trước; tool không ghi đè ứng dụng đã phục hồi thành công. Nếu target có dữ liệu không quen, dừng và điều tra, không xóa để ép tool chạy.

Ledger bắt buộc mới hơn snapshot và không quá 24 giờ. Khi restore, tool còn đóng ghi source, đọc lại dấu xóa mới nhất và giữ khóa source đến hết kiểm tra target; không để khoảng trống giữa lưu ledger và bắt đầu phục hồi. Công cụ hiện yêu cầu source Emulator còn đọc được. Trường hợp nguồn đã mất hoàn toàn cần quy trình cloud riêng với ledger chống hồi sinh được bảo vệ độc lập, chưa được triển khai.

Khôi phục ghép dấu xóa từ snapshot, ledger, target và source hiện tại; bỏ cả user tree tương ứng, kể cả phần đã ghi ở lần restore dở. Không tạo lại Auth user. Giữ trạng thái xóa, bỏ lease và đổi proofHash để mã tiếp tục cũ không dùng lại; job chưa xong cần quy trình xác thực/operator recovery theo quy trình operator của bản triển khai. Mọi shareTokens bị bỏ, mọi statement pointer đặt null, giáo viên phải tạo link mới.

Đối chiếu trước ghi và sau phục hồi: tổng từng bảng kê, payments/paidVnd/activePaymentCount, học viên, giá/ngày/khóa buổi, counter/mã duy nhất, công nợ và học phí chưa lập bảng. Sau ghi còn so sánh **toàn bộ trường** qua codec, không chỉ tổng tiền. Chỉ mở khóa target khi mọi kiểm tra qua.

Lỗi giữa batch giữ khóa restore ở target. Chạy lại cùng snapshot (UUID giữ nguyên) và ledger mới để tiếp tục; tool không tự mở target có dữ liệu dở. Khóa backup source có thể nhả sau lỗi vì source không bị ghi dữ liệu nghiệp vụ. Nếu source process chết để lại khóa backup, dùng đúng UUID đã log sau khi kiểm tra job:

```bash
npm run backup:local -- release --lock UUID_CUA_KHOA_BACKUP
```

Lệnh release không mở khóa restore. Nếu archive/codec/sổ tiền lỗi, giữ target đóng và điều tra; không đổi UUID hoặc tự xóa khóa để vượt kiểm tra. Không sửa trực tiếp snapshot đã mã hóa.
