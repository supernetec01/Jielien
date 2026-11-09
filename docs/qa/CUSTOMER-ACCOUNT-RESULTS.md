# Bàn giao luồng tài khoản khách hàng — 2026-11-09

## Hành vi đã hoàn thành

1. Đăng ký tạo customer và phiên đăng nhập ngay, không OTP hoặc dịch vụ SMS/email. Họ tên, số điện thoại Việt Nam và mật khẩu bắt buộc; email tùy chọn. Không tự gán quyền nhân viên hoặc đánh dấu thông tin liên hệ đã xác minh.
2. Đổi mật khẩu khi đăng nhập vẫn cần mật khẩu cũ. Quên mật khẩu dùng link email một lần, 30 phút; link mới vô hiệu link cũ, reset thu hồi mọi phiên. Chỉ biết số điện thoại/email không cho phép đổi mật khẩu.
3. Khách chỉ có số điện thoại được admin hỗ trợ sau xác minh người sở hữu và nhập lại mật khẩu admin. API có CSRF, quyền `users.manage`, audit; không cho reset staff/admin. Tài khoản demo cũ chỉ được chuyển thành thường khi hoàn tất link hỗ trợ được cấp theo quy trình này.
4. Guest checkout vẫn hoạt động, bắt buộc đủ tên/điện thoại/địa chỉ/tỉnh thành/khu vực. Không gắn đơn guest vào tài khoản khi trùng thông tin liên hệ.
5. Admin → Tài khoản & Phân quyền → Xem khách hàng hiển thị hồ sơ, trạng thái, ngày tạo, địa chỉ, lịch sử và tổng giá trị đơn không hủy. Không trả mật khẩu, hash hoặc token; lịch sử chỉ gồm đơn thuộc tài khoản.

Theo quyết định bỏ OTP, contract đăng ký trả 201 và báo trùng 409 thay cho contract chống dò tồn tại trước đây. Riêng quên mật khẩu luôn dùng thông báo chung. Các tài liệu QA/OTP cũ trong thư mục này là bằng chứng lịch sử tại phiên bản tương ứng; phần đăng ký của chúng được thay thế bởi tài liệu này và [REGISTRATION.md](../REGISTRATION.md).

## Source và dữ liệu

- `server.mjs`, `lib/auth.mjs`, `lib/password-recovery.mjs`: API đăng ký, hồ sơ khách, reset và worker email.
- `public/account.js`, `public/admin.js`, `public/admin-workspace.css`: giao diện tài khoản và quản trị, giữ luồng/thiết kế hiện tại.
- `db/migrations/018_customer_recovery.sql`: bảng token và outbox mới, bổ sung không phá hủy dữ liệu. Migration 015–017 không sửa; module OTP/demo cũ không còn được chạy.
- Compose, production preflight và test fixtures cập nhật theo contract mới. Không sửa `.env`, không reset database/volume và không deploy Internet.

## Kết quả kiểm thử

Tất cả chạy với schema PostgreSQL tạm và sender email sandbox, Chromium thật cho UI. Logs ở [customer-evidence](customer-evidence/).

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | 78/78 |
| `npm run test:customer-flows` | 6/6 nhóm |
| `npm run test:management` | 11/11 nhóm |
| `npm run test:account` | 9/9 nhóm |
| `npm run test:bank` | 7/7 nhóm |
| `npm run test:usability` | 9/9 nhóm |
| `npm run test:commerce` | 13/13 nhóm |
| `npm run test:admin-access` | 6/6 nhóm |
| `npm run test:browser` | 14/14 nhóm |
| `npm run test:frontend-v3` | 12/12 nhóm |
| `npm run test:qa-fixes` | 4/4 nhóm |
| `npm run test:local` | 7/7 |

API kiểm tra validation, quyền/CSRF, liên hệ trùng, phone-only, phản hồi chung, hash token và payload mã hóa, dùng lại/hết hạn/thay thế link, tiêu thụ đồng thời, thay email/mật khẩu/vai trò, thu hồi nhiều phiên, retry giữa worker, xóa payload và chuyển tài khoản demo qua hỗ trợ. Browser đi qua cả đăng ký/đăng nhập, reset qua sandbox email, admin hỗ trợ với mật khẩu sai/đúng, guest COD và lỗi form.

Ảnh trong `docs/screenshots/customer-flows/` và `docs/screenshots/qa-fixes/account-*.png` sử dụng dữ liệu fixture giả: khách `buyer@example.test`, địa chỉ thử và đơn thử 450.000đ. Hồ sơ admin, quên mật khẩu, reset và tài khoản được chụp ở 320/375/768/1440/1920px; kiểm tra tràn trang bằng browser và xem ảnh desktop/mobile. Bảng đơn có vùng cuộn riêng trên điện thoại. Không chụp mật khẩu hoặc link hỗ trợ đang có hiệu lực.

## Vận hành và giới hạn

Source được đưa lên nhánh `feature/jielien-commerce-cms`; chưa đồng nghĩa đã merge `main` hay triển khai lên máy người dùng. Pull đúng nhánh rồi chạy `npm.cmd run local:start`; app tự áp dụng migration mới, giữ file cấu hình và volume cũ. Hướng dẫn đầy đủ ở [REGISTRATION.md](../REGISTRATION.md).

Đăng ký và mua hàng không cần dịch vụ gửi thư. Muốn tự khôi phục qua email thật cần `RESEND_API_KEY`, `PASSWORD_RESET_FROM_EMAIL`, origin HTTPS tin cậy và tên miền gửi được Resend xác thực. Khi chưa cấu hình, forgot trả thông báo chung nhưng không gửi thư; admin hỗ trợ vẫn dùng được. Không thực hiện gửi thật, thử DNS/HTTPS production hoặc Docker Desktop end-to-end trong đợt này. `test:local` là test helper cấu hình; không thay thế `test:local:stack`.

Quy trình xác minh khách qua hỗ trợ do cửa hàng thực hiện; checkbox của admin không tự chứng minh danh tính. Không đánh dấu số/email đã xác minh hoặc tự nhận đơn guest theo số điện thoại. Backup chứa khóa mã hóa cùng dữ liệu, cần bảo vệ như dữ liệu nhạy cảm. Link được xóa khỏi URL và chỉ giữ trong RAM; mở lại link gốc nếu refresh trang reset.
