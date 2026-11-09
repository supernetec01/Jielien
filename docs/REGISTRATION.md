# Tài khoản khách hàng và khôi phục mật khẩu

## Đăng ký không OTP

Khách nhập họ tên, số điện thoại Việt Nam và mật khẩu; email không bắt buộc. Đăng ký thành công tạo tài khoản `customer` và đăng nhập ngay. Không thuê SMS, không cần cấu hình email để đăng ký. Hệ thống kiểm tra định dạng và trùng thông tin, không coi số điện thoại/email nhập vào là đã xác minh quyền sở hữu. Request không thể tự cấp quyền nhân viên/admin.

`POST /api/auth/register` trả HTTP 201 cùng user, CSRF token và cookie HttpOnly. Thông tin trùng trả 409; vì vậy luồng đăng ký không che giấu việc định danh đã tồn tại. Endpoint OTP `/api/auth/register/verify` đã bỏ (404). Các biến `AUTH_VERIFICATION_*` và `AUTH_DEMO_*` cũ không còn được dùng; có thể xóa các dòng đó khỏi cấu hình sau khi cập nhật. Giữ nguyên cấu hình database và volume.

## Đổi và quên mật khẩu

- Đã đăng nhập: đổi mật khẩu vẫn cần mật khẩu hiện tại.
- Quên mật khẩu: nhập số điện thoại hoặc email. Với tài khoản khách hợp lệ có email, link chỉ gửi đến **email đang lưu**, không gửi tới địa chỉ tùy ý trong request.
- Tài khoản chỉ có số điện thoại, email không nhận được thư hoặc chưa cấu hình gửi email: liên hệ cửa hàng để xác minh và hỗ trợ. Chỉ biết số điện thoại/email không đủ để đổi mật khẩu.

API `POST /api/auth/password/forgot` nhận `{identifier}` và trả 202 cùng thông báo chung cho tài khoản có/không tồn tại, nhân viên, tài khoản chỉ có số điện thoại và trường hợp chưa cấu hình email. HTTP 202 không xác nhận thư đã tới hộp thư. Có giới hạn theo IP; tài khoản nhận tối đa 5 yêu cầu/giờ, cách nhau ít nhất 60 giây.

Link dùng một lần trong 30 phút. Link mới vô hiệu link cũ. `POST /api/auth/password/reset` nhận `{token,newPassword}`; thành công trả 204, thu hồi mọi phiên cũ và yêu cầu đăng nhập lại. Thay mật khẩu, email, vai trò hoặc khóa tài khoản có thể làm link mất hiệu lực. Luồng này chỉ áp dụng cho khách hàng, không khôi phục admin/nhân viên. Token nằm trong fragment URL, bị xóa khỏi thanh địa chỉ ngay khi trang đọc và chỉ giữ trong bộ nhớ; nếu tải lại trang, hãy mở lại link gốc trong email. Không lưu token/mật khẩu vào localStorage.

## Bật gửi email thật (Resend)

Chỉ cần phần này khi muốn khách tự nhận link qua email. Tạo tài khoản Resend, xác thực tên miền gửi thư bằng các bản ghi DNS mà nhà cung cấp yêu cầu, tạo API key gửi email với quyền tối thiểu và đặt trong file môi trường bị Git ignore hoặc secret của server:

```dotenv
PUBLIC_BASE_URL=https://ten-mien-cua-ban.vn
RESEND_API_KEY=<API key riêng, không commit>
PASSWORD_RESET_FROM_EMAIL=Jielien <support@ten-mien-cua-ban.vn>
```

Thay các giá trị mẫu trước khi dùng. `PUBLIC_BASE_URL` phải là origin HTTPS tin cậy, không chứa đường dẫn, query hoặc thông tin đăng nhập. Compose production lấy origin từ `SITE_DOMAIN`; không thêm URL localhost vào cấu hình production. Compose local truyền các biến trên nếu được cấp. Không cấu hình nửa chừng: để cả API key và email gửi trống khi chưa dùng, vì chỉ đặt một biến sẽ khiến app từ chối khởi động.

Rebuild/khởi động lại app sau khi cập nhật. `npm run production:check` yêu cầu cấu hình email để sẵn sàng vận hành công khai, nhưng không chứng minh DNS hay thư được giao thành công. Trước khi mở cho khách, thử trên staging bằng hộp thư do bạn kiểm soát, kiểm tra spam, quota, tên miền gửi và link quay về đúng website. Bộ test repo dùng sender sandbox, không gửi email thật.

Worker trong app đọc outbox mỗi 5 giây, gửi bằng REST API Resend, timeout 5 giây, không theo redirect, có idempotency key và tối đa 5 lượt thử trong thời hạn link. Các replica chia sẻ lease 30 giây và claim bằng `SKIP LOCKED`. Không có SMS bridge hoặc endpoint public xem token.

Database lưu hash token; payload outbox chứa link được mã hóa AES-GCM và xóa sau khi gửi thành công/hết lượt thử. Khóa mã hóa hiện nằm trong cùng database nên backup vẫn là dữ liệu nhạy cảm, chưa tách KMS. Cần theo dõi outbox pending/dead và log lỗi tổng quát; không log payload hay link để debug.

## Admin xem và hỗ trợ khách hàng

Vào **Admin → Tài khoản & Phân quyền → Xem khách hàng**. Người có quyền `users.manage` xem tên, điện thoại, email, trạng thái, ngày tạo, địa chỉ đã lưu và lịch sử đơn đặt bằng tài khoản (20 đơn/trang). Tổng giá trị tính trên đơn không hủy; không phải số tiền đã thu. Không trả mật khẩu/hash/token. Đơn guest xem trong mục Đơn hàng.

Khi khách không tự khôi phục được, admin phải xác minh người yêu cầu qua quy trình hỗ trợ của cửa hàng, tích xác nhận và nhập lại mật khẩu admin. Sau đó tạo link một lần, chuyển riêng cho đúng người đã xác minh. Không xác nhận quyền sở hữu chỉ bằng việc người yêu cầu biết số điện thoại/email. API yêu cầu quyền, CSRF, mật khẩu admin hiện tại và ghi nhật ký; không cho reset tài khoản có quyền nhân viên/admin.

Tài khoản `is_demo=true` từ phiên bản OTP demo cũ không tự được mở lại chỉ vì bỏ cấu hình OTP. Admin có thể dùng quy trình hỗ trợ trên; chỉ khi link được dùng thành công, tài khoản mới chuyển thành customer thường và phiên cũ bị thu hồi. Không tự ghi nhận số/email đã xác minh, không reset database để chuyển đổi.

## Mua không cần tài khoản

Guest checkout được giữ nguyên, bắt buộc tên người nhận, số điện thoại, địa chỉ chi tiết, tỉnh/thành phố và khu vực. Không tự tạo tài khoản hoặc gắn đơn guest vào tài khoản chỉ vì trùng số điện thoại/email. Đơn có tài khoản chỉ được liên kết bằng phiên đăng nhập hợp lệ.

## Cập nhật trên Windows

Trong thư mục repo, giữ/commit thay đổi local trước khi pull nếu có xung đột:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
npm.cmd run local:start
```

Mở `http://localhost:3001/tai-khoan?mode=register`. `local:start` rebuild và tự áp dụng migration mới `018_customer_recovery.sql`. Không xóa volume, `.env.local` hay lịch sử migration 015–017. Đăng ký và guest checkout hoạt động khi chưa có Resend. Trên localhost chưa cấu hình email, dùng quy trình admin hỗ trợ để kiểm tra link reset; không có hộp thư/route xem email thử trong app.

## Kiểm thử

`npm test` kiểm tra API, migration, chống dùng lại link, thu hồi phiên, race condition và phân quyền. `npm run test:customer-flows` kiểm tra các luồng mới qua Chromium, cùng viewport 320/375/768/1440/1920px. Dùng database/schema thử riêng; sender inject trong test không gửi thư thật. Xem [kết quả bàn giao](qa/CUSTOMER-ACCOUNT-RESULTS.md).
