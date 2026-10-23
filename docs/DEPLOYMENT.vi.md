# Tự triển khai bằng hạ tầng của bạn

[English](DEPLOYMENT.md) | **Tiếng Việt**

Local/CI dùng `demo-chotcong` và loopback, không credential cloud. Để deploy bản riêng, bạn phải cung cấp Firebase/Vercel/IAM của mình. Giữ `.env.local` dùng Emulator; không tải biến production về file này.

## Chuẩn bị

1. Tạo Firebase project riêng, bật Google provider và Web App. Chọn location Firestore trước khi tạo database. Kiểm tra hạn mức và chi phí của dịch vụ bạn định bật.
2. Tạo Vercel project từ fork/repository của bạn, Node 24, `npm ci`, `npm run build`. Dùng một hostname HTTPS ổn định. Đặt APP_ORIGIN đúng origin; thêm hostname vào authorized domains của Firebase Auth.
3. Rà soát/deploy `firebase/firestore.rules` và `firebase/firestore.indexes.json` vào đúng project. Rules chặn mọi client; Admin API vẫn cần isolation theo UID. Chờ composite indexes READY. Nếu project dùng chung ứng dụng khác, phải rà soát Rules/indexes hiện hữu, không ghi đè hoặc xóa cấu hình lạ.
4. Thiết lập quyền backend theo phần WIF bên dưới, cấu hình đủ biến, build lại để chốt NEXT_PUBLIC config. Giữ login khóa khi cấu hình thiếu.

## Biến môi trường trên hosting

Lấy giá trị web config từ Firebase Web App của bạn, đặt:

- `APP_ORIGIN`: HTTPS origin của bản triển khai.
- `FIREBASE_PROJECT_ID` và `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: cùng project thật của bạn.
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` và các web app identifier nếu có.
- `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=false`; không có `FIREBASE_AUTH_EMULATOR_HOST` hoặc `FIRESTORE_EMULATOR_HOST`.
- `FIREBASE_ADMIN_AUTH_MODE=vercel-oidc`.
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: resource name đầy đủ của provider do bạn tạo.
- `GCP_SERVICE_ACCOUNT_EMAIL`: service account trong cùng Firebase project.
- `NODE_OPTIONS=--experimental-require-module` cho runtime Vercel dùng Firebase Admin ESM.

Không đưa credential vào NEXT_PUBLIC. Không copy OIDC token cũ, không hardcode access token hoặc commit service-account key. Ở môi trường Node ngoài Vercel, adapter hỗ trợ ADC từ GOOGLE_APPLICATION_CREDENTIALS; cất credential ngoài checkout và dùng hệ thống quản lý secret của môi trường đó. Emulator chỉ dành cho local/CI.

## Vercel OIDC / Workload Identity Federation

Ứng dụng hiện chỉ cho OIDC trên môi trường kỹ thuật **Production** của Vercel project đã được trust. Preview không dùng production identity. Để thử staging, dùng Firebase project và Vercel project staging riêng; không nới trust project production cho mọi preview.

Script `scripts/gcp/setup-vercel-wif.sh` là template quản trị: sau khi rà soát IAM, cung cấp **định danh của bạn**:

```bash
export CC_PROJECT_ID=your-firebase-project
export CC_PROJECT_NUMBER=YOUR_NUMERIC_PROJECT_NUMBER
export CC_VERCEL_TEAM_SLUG=your-team
export CC_VERCEL_TEAM_ID=YOUR_TEAM_ID
export CC_VERCEL_PROJECT_NAME=your-vercel-project
export CC_VERCEL_PROJECT_ID=YOUR_VERCEL_PROJECT_ID
bash scripts/gcp/setup-vercel-wif.sh --print-config
```

Dùng ID chính xác do Google/Vercel trả về, thay tất cả placeholder. `--print-config` chỉ in định danh không bí mật. Script từ chối thiếu/sai định dạng. Để thực sự tạo API/pool/provider/service account và cấp quyền dữ liệu/Auth, cần gcloud đã xác thực có quyền quản trị, rồi đặt `CC_CONFIRM_PROJECT` bằng đúng CC_PROJECT_ID và chạy không tham số. Đây là thao tác IAM có tác động thật: đọc script, kiểm tra project number và quyền trước khi chạy. Script dừng nếu provider hiện hữu khác cấu hình; không tạo private key.

Trust ràng buộc issuer/audience team, immutable team ID/project ID, environment production và subject chính xác. Không cấp Owner/Editor cho runtime. Quyền Datastore User/Firebase Auth Admin vẫn rộng ở cấp project; dùng project riêng khi cần cách ly dữ liệu.

## Áp dụng cấu hình và preflight

Thông thường dùng Firebase Console/CLI có chọn project rõ ràng sau khi rà soát. Helper `scripts/gcp/apply-firestore-config.ts` được giữ để tham khảo cơ chế apply an toàn: **target đang là placeholder `your-firebase-project`, project number `000000000000`**. Trước khi dùng cloud helper, đổi cả hai hằng số/allowlist sang định danh của bạn và cập nhật fixture unit tương ứng. Không để placeholder làm target thực.

Helper chỉ chạy khi FIREBASE_APPLY_CONFIG bằng đúng target cố định, Vercel Production/OIDC đầy đủ, không Emulator. Nó từ chối Rules lạ, chỉ thêm index thiếu, giữ cấu hình không liên quan và chờ READY. Nếu chọn đường này, cấp quyền Rules/indexes có giới hạn cho đúng project trong thời gian áp dụng, rồi gỡ quyền cấu hình và FIREBASE_APPLY_CONFIG khi xong. Build bình thường chỉ đọc.

Prebuild kiểm tra token exchange, Auth read, Firestore và query/index trong namespace UID ngẫu nhiên không tồn tại; không tạo user hoặc dữ liệu học phí. Build qua không thay Google OAuth thật, quyền ghi hoặc kiểm thử hai tài khoản/thu hồi phiên.

## Xác minh sau triển khai

```bash
npm run check:public -- https://your-app.example
```

Dùng origin của bạn; mặc định lệnh chỉ hướng về localhost. Lệnh public smoke chỉ đọc: trang công khai, 5 trang riêng/10 API anonymous, HTTPS cookies/cache/referrer, manifest/icons; không xác thực hoặc ghi business data.

Trên staging với dữ liệu giả, kiểm tra Google login A/B, HTTP không truy cập chéo UID, client Rules bị từ chối, revoke phiên A không ảnh hưởng B, giá/bảng kê/thu tiền đúng, link rotate/revoke, export/delete/recovery. Kiểm tra thiết bị thật và cách nhận hỗ trợ trước mời người dùng. Tự xác định backup/retention/khôi phục phù hợp; source hiện chỉ có công cụ diễn tập backup Emulator, không backup cloud tự động.
