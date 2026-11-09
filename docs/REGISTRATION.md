# Đăng ký có xác minh — cấu hình và vận hành

Đăng ký public không còn tạo tài khoản/phiên ngay. Đăng ký mới và thông tin đã tồn tại nhận cùng HTTP 202 và thông báo chung. Sau khi chứng minh quyền sở hữu số điện thoại (và email nếu cung cấp), hệ thống mới tạo customer và cấp cookie HttpOnly. Tài khoản hiện có giữ nguyên mật khẩu/quyền/phiên; không tự đánh dấu số/email cũ là đã xác minh.

## Chuẩn bị dịch vụ gửi mã

Ứng dụng cung cấp adapter webhook HTTPS để kết nối một bridge gửi SMS/email. Bridge là thành phần bên ngoài cần cấu hình với nhà cung cấp bạn chọn; repo không chứa tài khoản SMS hay gửi email/SMS thật mặc định.

Đặt qua cấu hình an toàn của server hoặc file môi trường được Git ignore:

- `AUTH_VERIFICATION_WEBHOOK_URL`: URL HTTPS của bridge, không chứa user/password trong URL.
- `AUTH_VERIFICATION_WEBHOOK_TOKEN`: bearer token riêng, không đưa lên Git hoặc chat.

Compose local/production đã truyền hai biến vào app. Nếu dùng native Node, cấp vào môi trường tiến trình. Khởi động lại/rebuild app sau khi cập nhật source/cấu hình. `npm run production:check` kiểm tra đầu vào; không chứng minh provider gửi/nhận thành công.

**Thiếu cấu hình:** đăng ký trả 503 giống nhau cho mọi định danh; không tạo pending/user hay phiên. Đăng nhập tài khoản cũ và guest checkout vẫn hoạt động. Không có OTP mặc định, endpoint xem OTP hoặc chế độ bỏ qua xác minh. Trước khi bật cho người dùng cần kiểm thử bridge/provider sandbox rồi staging end-to-end.

## Contract bridge

App gửi `POST`, `Content-Type: application/json`, `Authorization: Bearer <token>`, `Idempotency-Key: <challengeId>`, timeout 5 giây và không đi theo redirect. Payload:

```json
{
  "id": "opaque-challenge-id",
  "phone": "0912345678",
  "code": "6-digit-sms-code",
  "email": "buyer@example.test",
  "emailCode": "6-digit-email-code",
  "purpose": "signup",
  "expiresAt": 1800000000000
}
```

Email/emailCode là null nếu không cung cấp email. Mỗi mã phải gửi **riêng tới đúng kênh**: code chỉ SMS tới phone, emailCode chỉ email tới email; không gộp hai mã vào SMS hoặc một email vì sẽ mất bằng chứng sở hữu độc lập. Không gửi nếu đã quá expiresAt. Response 2xx chỉ sau khi đã tiếp nhận bền vững cả hai yêu cầu gửi; lỗi trả non-2xx để app retry.

Bridge cần dùng idempotency bền vững theo `(id,channel)`, bảo vệ endpoint bằng token, che OTP/số/email trong access/error log và không gọi dịch vụ thật trong test. Một kênh đã gửi và kênh kia lỗi thì retry không được gửi lặp kênh đã thành công. Đây là at-least-once delivery, không hứa exactly-once chỉ bằng HTTP.

Worker chạy trong app, poll 5 giây, lease 30 giây, retry backoff tối đa 5 lượt trong thời hạn mã. Các replica claim bằng SKIP LOCKED và cập nhật có kiểm tra generation attempt. Payload outbox mã hóa AES-GCM bằng key riêng trong bảng nội bộ; OTP kiểm tra bằng HMAC ràng buộc challenge/recipient/kênh. Mã không lưu plaintext trong database. Khi bridge chấp nhận, payload bị xóa; challenge cũ được dọn sau 24 giờ quá hạn.

DB backup có cả khóa mã hóa trong bảng nội bộ nên phải bảo vệ backup như dữ liệu nhạy cảm; chưa tách khóa sang KMS. Cần giám sát outbox pending/dead, lỗi bridge, độ trễ gửi và quota/chi phí nhà cung cấp. Không log payload để debug.

## Contract API

- `POST /api/auth/register`: họ tên, số VN bắt buộc, email tùy chọn và mật khẩu. HTTP 202 có message/challengeId/expiresIn/resendAfter/emailVerificationRequired, không Set-Cookie và không userId. Cờ emailVerificationRequired chỉ phản ánh email trong request, không phản ánh tài khoản tồn tại.
- `POST /api/auth/register/verify`: challengeId, code và emailCode nếu có email. HTTP 201 + cookie/session chỉ sau khi mọi mã đúng; lỗi trả 400/invalid_verification chung. Mỗi challenge dùng một lần, có hiệu lực 5 phút và tối đa 5 lượt thử.
- Gửi lại: gọi lại register từ giao diện sau 60 giây. Challenge cũ cùng số bị vô hiệu; tối đa 5 yêu cầu/15 phút theo từng số/email. Việc yêu cầu lại không đổi mật khẩu tài khoản cũ. Rate limit IP độc lập vẫn áp dụng.
- Sau reload trang nhập mã, người dùng có thể bắt đầu lại sau cooldown; mật khẩu/pending signup không lưu vào localStorage hoặc sessionStorage.

Các API nội bộ `createAuth(...).register` phục vụ fixture/import được ủy quyền, không được mở thành endpoint public khác. `phone_verified_at`/`email_verified_at` của tài khoản legacy vẫn null. Việc đổi email trong hồ sơ vẫn có chính sách xác thực lại bằng mật khẩu như trước; nếu email thay đổi, cờ xác minh được xóa. Xác minh lại email sau cập nhật hồ sơ, quên/reset mật khẩu và MFA là các hạng mục tiếp theo, chưa được triển khai trong đợt sửa 4 bug này.

## Giới hạn đăng nhập

PostgreSQL lưu quota theo key HMAC, không lưu raw identifier/IP trong bảng rate limit. Các tiến trình dùng cùng DB chia sẻ quota; không cần Redis. Mặc định tối đa 120 request/IP/phút và 15 thất bại hoặc request đang kiểm tra trên cặp IP + định danh/15 phút. Login thành công chỉ nhả quota của chính lượt đó, không xóa lỗi của người khác; lỗi DB không làm bỏ qua limiter. HTTP 429 có Retry-After.

Forwarded IP từ client không được tin mặc định. Khi app ở sau proxy, remoteAddress có thể là IP của proxy: ngân sách burst khi đó áp dụng chung; cần kiểm tra tải và cấu hình kiến trúc proxy trước public. Đợt này không tự tin X-Forwarded-For để đổi giới hạn. Các ngưỡng có thể inject qua createApp(loginLimitOptions) khi chạy service theo entrypoint riêng; CLI hiện dùng mặc định trên.

## Chạy kiểm thử

`npm test` gồm test registration, CMS và login quota; `npm run test:qa-fixes` kiểm tra storefront setting và signup thật qua Chromium với provider sandbox inject trong tests/support/app.mjs. Test sandbox không có route lấy mã public và không được import từ production server.
