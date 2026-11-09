# Phương án nâng cấp — đề xuất để AI triển khai

Đây là backlog tính năng, không tính vào 4 bug đã tái hiện. Chọn giải pháp phù hợp Node.js ESM/PostgreSQL hiện tại, không cần chuyển framework. Các hợp đồng dưới đây là mặc định đề xuất, cần ghi lại quyết định trước thay đổi.

## Các phần chủ hệ thống cần chuẩn bị

| Hạng mục | Cần chuẩn bị | AI làm ngay được | Cần xác nhận ngoài code |
|---|---|---|---|
| Định danh | Chọn số/email, đường recovery cho account không có email, chính sách legacy | Migration additive, adapter, flow local, fixture | Kênh bắt buộc và cách chuyển đổi account cũ |
| Email | Provider có sandbox; domain gửi; SPF/DKIM/DMARC; sender; template VN | Provider interface, mock, outbox, integration test | Secret provider, DNS, gửi/nhận thực tế |
| SMS OTP | Provider/brandname, sandbox, quota/ngân sách | Challenge service, mock, rate limit | Duyệt sender/brandname, độ trễ/chi phí và số test |
| Hạ tầng | HTTPS domain, reverse proxy, Redis, worker và monitoring | Config example, adapters, health, test | Secret/cert/proxy CIDR thật, staging E2E |
| MFA | Chính sách admin recovery | TOTP và backup code, UI, test clock | Ai có quyền hỗ trợ khôi phục, audit và vận hành |
| OAuth | Google project trước nếu cần; callback HTTPS | OIDC adapter/mock/callback tests | Client ID/secret, consent screen, domain/callback |
| Lưu giữ dữ liệu | Quy định giữ đơn/chứng từ và ẩn danh | Data map và migration hỗ trợ | Chính sách retention và phục hồi/xóa |

Không đưa secret vào tài liệu, Git hoặc chat. `.env.example` chỉ ghi tên biến và giá trị rỗng/mẫu; mapping biến cuối cùng phải theo adapter được chọn. Không có provider thật thì ghi “local/mock verified; staging blocked”, không làm provider giả báo thành công ở production.

## Giai đoạn và dependency

| ID | Mức | Nội dung | Phụ thuộc | Điều kiện nghiệm thu chính |
|---|---|---|---|---|
| UPG-01 | P1 | Challenge và verification nền tảng | Chính sách định danh/legacy | Dùng một lần, expiry, purpose/recipient, atomic consume, không fake verified |
| UPG-02 | P1 | Email/SMS adapter + transactional outbox | Provider sandbox cho staging | Retry có giới hạn, idempotency, không ghi secret, monitoring lỗi |
| UPG-03 | P1 | Quên/reset mật khẩu | UPG-01/02 | Generic response, token mạnh, thu hồi phiên và challenge cũ |
| UPG-04 | P1 | Danh sách và thu hồi phiên | Auth hiện có | Chỉ xem/thu hồi phiên của mình, revoke-all và reauth |
| UPG-05 | P2 | Admin TOTP/backup code | UPG-03/04 và recovery policy | Enrollment xác nhận, OTP chống replay, backup dùng một lần |
| UPG-06 | P2 | Hoàn thiện SMS OTP | UPG-01/02 | Cooldown/quota/giới hạn thử/cost cap, không SMS bombing |
| UPG-07 | P3 | Social login | UPG-01 và cấu hình provider | OIDC state/nonce/PKCE; liên kết sau chứng minh quyền sở hữu |
| UPG-08 | P3 | Đổi số điện thoại | UPG-01/06 | Reauth + verify số mới + atomic unique check + thông báo số cũ |
| UPG-09 | P3 | Xóa tài khoản | Chính sách retention | Xác thực lại, revoke sessions, ẩn danh đúng phạm vi, audit |
| UPG-10 | P3 | Hoàn tiền tách khỏi hoàn hàng | Quy trình tài chính/đối soát | Quyền tài chính, idempotency, không hoàn quá số đã thu |
| UPG-11 | P3 | Avatar khách hàng | Nhu cầu sản phẩm | Owner-only, decode/re-encode, giới hạn byte/pixel, không upload script |

BUG-01 cần UPG-01/02 đi cùng, không phải bản vá đổi thông báo độc lập. Sửa BUG-02/03/04 có thể hoàn thành trước. Thông báo thay đổi mật khẩu/email/số được triển khai trong UPG-02/03/08; không tạo thêm luồng gửi trực tiếp bỏ qua outbox.

## Thiết kế nền tảng UPG-01/02

- Migration mới thêm metadata verified_at riêng cho email/số, trạng thái onboarding tách trạng thái active/inactive, bảng challenge và outbox. Số migration lấy tiếp theo HEAD; hiện baseline đến 010.
- Challenge gợi ý: id opaque; user_id nullable cho yêu cầu chưa tạo user; recipient chuẩn hóa; purpose allowlist; secret_hash/HMAC; expires_at; consumed_at; failed_attempts; resend_after; generation/version; created_at. Không trả user_id/existence flag ra public.
- Token email: randomBytes tối thiểu 32, base64url, lưu SHA-256; OTP ngắn dùng HMAC có secret server để hạn chế dò offline. Không dùng Math.random. Không log token, OTP, session, URL reset đầy đủ.
- TTL đề xuất: reset email 15–30 phút; OTP 3–5 phút, tối đa 5 lần thử, resend tối thiểu 60 giây + quota giờ/ngày; đây chưa phải chính sách đã được chốt. Clock injection phục vụ test.
- Resend làm mất hiệu lực generation cũ; consume/attempt/quota trong transaction hoặc atomic storage. Ràng buộc purpose + recipient + subject; OTP signup không dùng reset.
- Outbox ghi cùng transaction thay đổi challenge. Worker có claim/lease, timeout, retries/backoff, dead-letter; payload có TTL và mã hóa nếu cần lưu dữ liệu gửi nhạy cảm. Thiết kế at-least-once, dùng idempotency provider khi hỗ trợ; không hứa exactly-once delivery chỉ bằng DB.
- Nếu provider lỗi: phản hồi public không lộ tài khoản tồn tại; quan sát trạng thái gửi và hướng dẫn retry chung. Không rollback dữ liệu đã commit theo cách gửi tin trùng vô hạn.
- Cấu hình production thiếu key/provider cần fail rõ, không dùng dev inbox và không bỏ qua verify. Dev inbox chỉ local, không public và không bật mặc định khi deploy.

## UPG-03 — Contract reset đề xuất

- `POST /api/auth/password/forgot`: 202 chung cho định danh có/không tồn tại; limiter theo IP và HMAC định danh, chi phí gửi giới hạn.
- `POST /api/auth/password/reset`: token + newPassword; không cần session, không mở API account password hiện có cho anonymous. Kiểm tra origin/schema; token trong POST body khi consume, không log body.
- Token lỗi/hết hạn/đã dùng trả thông báo invalid challenge chung; không trả user data. Trang nhận link tránh token gửi sang analytics/Referer; đặt Referrer-Policy phù hợp và cân nhắc đổi URL bằng history sau nhận token.
- Transaction khóa user/challenge, đặt bcrypt hash theo giới hạn 10 ký tự/72 byte hiện có (nếu đổi policy thì document), consume tất cả reset challenge cũ, revoke mọi session và ghi audit không secret.
- Token request mới vô hiệu link cũ theo policy; không invalidate active sessions chỉ vì có người yêu cầu forgot. Email thông báo sau đổi thành công qua outbox.

## UPG-04/05 — Session và MFA

- Session list chỉ metadata tối thiểu, không raw token/hash hoặc CSRF; session opaque ID phải kiểm ownership. Với IP/user-agent, hạn chế lưu và có retention.
- Revoke-all có thể giữ hoặc thu hồi current session theo contract rõ; thao tác nhạy cảm cần reauth gần đây. Không dùng generic account update cho phép tự gán role.
- TOTP secret mã hóa bằng key tách DB; enrollment chưa bật cho tới khi xác nhận mã đúng. Recovery code random mạnh, hash riêng và consume atomically. Lưu counter/time-step gần nhất để chặn replay; giới hạn thử và cửa sổ lệch giờ nhỏ.
- Login sau password đúng nhưng chưa qua MFA chỉ có pre-auth challenge hạn chế TTL, không cấp session đầy đủ. Các API admin bị chặn đến khi MFA đủ.
- Password reset không tự tắt MFA. Mất thiết bị có recovery flow/audit, không bypass bằng email tùy ý. Không bật enforce admin MFA toàn hệ thống trước khi có đường enrollment/recovery được test.

## UPG-07–11 — Lưu ý thực hiện

- OIDC dùng thư viện được duy trì; validate issuer/audience/signature/state/nonce/redirect allowlist, PKCE khi phù hợp. Định danh provider theo issuer+subject; không auto-link email chưa verified; link/unlink yêu cầu session và reauth, không để account mất mọi phương thức đăng nhập.
- Đổi số: xác minh số mới không làm mất phương thức cũ trước commit; kiểm unique ở transaction; revoke/refresh session theo policy, thông báo kênh cũ.
- Xóa tài khoản: giữ chứng từ bắt buộc theo chính sách, ẩn danh dữ liệu phù hợp; không cascade xóa orders/audit bừa bãi. UI nói đúng hiệu lực xử lý.
- Refund: return tăng tồn không đồng nghĩa đã trả tiền. Theo dõi refund riêng, số đã thu/trả, finance permission, trạng thái thực nhận/chi, chống bấm lặp và concurrent refund. Không giả lập chuyển tiền thật đã thành công.
- Avatar: tái dùng primitive decode ảnh an toàn hiện có, tách ownership user và media admin; chỉ JPEG/PNG/WebP được decode/re-encode, giới hạn pixel/byte và reject nội dung giả.
