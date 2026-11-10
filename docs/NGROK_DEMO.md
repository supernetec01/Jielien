# Chia sẻ demo Jielien bằng ngrok

Repo dùng SDK Node chính thức `@ngrok/ngrok` (đã khóa phiên bản trong package-lock), không cần cài CLI ngrok toàn hệ thống. Cần Node.js 24.11+ trên máy mở tunnel và tài khoản ngrok của bạn. Máy phải bật, website/database phải chạy và kết nối Internet được giữ trong suốt buổi demo.

## Windows: chia sẻ website Docker đang chạy

Mở Docker Desktop, rồi PowerShell trong thư mục repo:

```powershell
git pull --ff-only origin main
npm.cmd ci
```

Mở https://dashboard.ngrok.com/get-started/your-authtoken, đăng nhập ngrok, lấy authtoken. Tạo file riêng:

```powershell
notepad .env.ngrok
```

Nội dung file (thay giá trị mẫu bằng token của bạn):

```dotenv
NGROK_AUTHTOKEN=THAY_BANG_AUTHTOKEN_CUA_BAN
# Cổng website trên máy bạn. Bỏ dòng này nếu dùng JIELIEN_PORT trong .env.local hoặc mặc định 3001.
NGROK_LOCAL_PORT=3001
# Nếu tài khoản ngrok yêu cầu/chọn hostname cố định đã cấp, thêm hostname đó:
# NGROK_DOMAIN=ten-duoc-cap.ngrok-free.app
# Tùy chọn bảo vệ bằng mật khẩu riêng của buổi demo, nếu tài khoản ngrok hỗ trợ:
# NGROK_BASIC_AUTH=khach-demo:MAT_KHAU_RIENG
```

`.env.ngrok` đã được Git ignore. Không commit, chụp màn hình hoặc gửi token vào chat. Nếu chọn tên miền, chỉ nhập hostname, không có `https://` hoặc đường dẫn.

Chạy trong terminal thứ nhất:

```powershell
$env:JIELIEN_COOKIE_SECURE="true"
$env:JIELIEN_DEMO_MODE="true"
npm.cmd run local:start
```

`local:start` build lại app, giữ nguyên `.env.local`, dữ liệu và volume cũ. Cookie được đặt Secure cho HTTPS; vì vậy khi demo, đăng nhập qua URL HTTPS ngrok. Các thay đổi/đơn thử trên website Docker này ghi vào database đang dùng; dùng dữ liệu mẫu khi giới thiệu cho khách. Nhãn demo không tự reset hay đổi nội dung cửa hàng.

Mở terminal thứ hai ở cùng thư mục:

```powershell
npm.cmd run demo:ngrok
```

Terminal in:

```text
Demo Jielien: https://...ngrok-free.app
```

Gửi **link HTTPS vừa in**, không gửi `localhost`, cho khách. Khách có thể cần bấm Visit Site tại trang thông báo của ngrok gói miễn phí. Không cần mở cổng modem, firewall Internet hoặc PostgreSQL.

Để dừng link, Ctrl+C ở terminal ngrok. Website Docker vẫn chạy. Muốn quay về dùng đăng nhập HTTP localhost như trước, mở terminal đầu, rồi:

```powershell
Remove-Item Env:JIELIEN_COOKIE_SECURE -ErrorAction SilentlyContinue
Remove-Item Env:JIELIEN_DEMO_MODE -ErrorAction SilentlyContinue
npm.cmd run local:start
```

Nếu hai biến này đã được ghi vào `.env.local`, sửa về `false` tại đó rồi rebuild. Không xóa volume/database. URL được cấp phụ thuộc tài khoản và gói ngrok; không coi đây là hosting luôn hoạt động khi máy tắt.

## Cloud: bản demo tách riêng khỏi database cửa hàng

Trong cloud workspace đã có Node và PostgreSQL:

```bash
npm ci
npm run db:local
npm run demo:server
```

Server này chỉ nghe `127.0.0.1:3001`, tạo schema `jielien_ngrok_demo` riêng và nạp catalog fixture một lần. Không reset/nạp đè schema cửa hàng, không tạo tài khoản Admin mặc định. Các lần chạy tiếp theo giữ thay đổi của bản demo. `NGROK_DEMO_SCHEMA` có thể đặt schema demo khác có prefix `jielien_ngrok_demo_`. Đây là script demo được gọi rõ ràng, không thay đổi quy tắc production mặc định không seed.

Cấp `NGROK_AUTHTOKEN` qua phần secrets/environment settings của cloud, rồi ở terminal khác:

```bash
npm run demo:ngrok
```

Cloud này đang giới hạn kết nối ra ngoài. Tại lần chuẩn bị 2026-11-10:

- SDK đã cài và load được native module.
- PostgreSQL/demo server tại cổng 3001 trả health `ok`, có catalog mẫu, `demoMode=true`.
- Chưa có secret `NGROK_AUTHTOKEN`.
- Probe tới `https://connect.ngrok-agent.com` bị proxy trả `403 Forbidden`; chưa mở được tunnel công khai.

Để mở từ cloud, cần cấp secret trong settings và cấu hình kết nối ra máy chủ ngrok (`connect.ngrok-agent.com:443`, cùng các endpoint agent thực tế mà tài khoản sử dụng). Native agent cần luồng kết nối phù hợp với chính sách proxy/TCP của môi trường; chỉ thêm hostname vào HTTP allowlist có thể chưa đủ. Không tắt xác minh TLS hoặc vượt chính sách mạng để thử. Sau khi môi trường cho phép, chạy lại và kiểm tra URL thật trước khi gửi cho khách. Mở từ Windows cá nhân không bị ràng buộc bởi chính sách outbound của workspace cloud này.

## Cổng, đăng nhập và lỗi thường gặp

- `NGROK_LOCAL_PORT` ưu tiên cao hơn `JIELIEN_PORT` trong `.env.local`. Mặc định 3001. `demo:ngrok` kiểm tra `/api/health` là Jielien/PostgreSQL trước khi mở tunnel.
- `Thiếu NGROK_AUTHTOKEN`: nhập token vào `.env.ngrok` hoặc secrets rồi chạy lại.
- `Chưa kết nối được Jielien`: chạy website trước, kiểm tra cổng hoặc `npm run local:logs`.
- Token sai/bị thu hồi: tạo/cập nhật token trên dashboard ngrok. Script che token nếu xuất hiện trong thông báo lỗi.
- Hostname chưa được cấp/gói không hỗ trợ: bỏ `NGROK_DOMAIN` để dùng hostname mặc định hoặc nhập hostname đúng từ dashboard.
- `origin_denied`: giữ Host công khai mặc định của ngrok; không thêm cấu hình rewrite Host thành localhost. Cơ chế CSRF/Origin vẫn được giữ nguyên.
- Nếu muốn thử email khôi phục mật khẩu qua demo: cấu hình sender và `PUBLIC_BASE_URL` bằng URL HTTPS công khai đúng, rồi restart app. Lệnh mở tunnel không tự bật gửi email hoặc sửa cấu hình sender.
- Không bật SEO indexing cho link thử. Dữ liệu/ảnh tự nhập và chức năng còn thiếu vẫn theo [backlog](CHUC_NANG_CHUA_TRIEN_KHAI.md).

## Kiểm chứng

`npm run test:ngrok`: validate cổng/hostname, health check, từ chối thiếu token trước khi kết nối, che bí mật, adapter HTTPS/đóng listener, và HTTP integration mô phỏng Host công khai + Origin HTTPS để kiểm tra đăng nhập/cookie Secure/CSRF; chặn Origin khác. Adapter ngrok được mock do chưa có token và kết nối cloud bị chặn. Chưa có kiểm chứng tunnel Internet thực tế và chưa có URL để chia sẻ.

Kết quả kiểm chứng tại lần bàn giao: `npm test` 84/84, `npm run test:ngrok` 4/4, `npm run test:local` 7/7. Chromium mở demo cổng 3001, hiển thị 8 sản phẩm trang chủ và không có lỗi JavaScript. Chạy nhầm thêm server vào cổng đang dùng báo lỗi rồi thoát, giữ nguyên server demo hiện có.
