# Triển khai LAN trên Windows / Docker Desktop

Cần Node.js >=24.11, Docker Desktop Linux containers đang chạy, máy chủ không sleep.
Một máy chủ chạy app và PostgreSQL; nhân viên chỉ mở trình duyệt tới máy này, không chạy stack riêng.
Mọi máy đọc/ghi chung PostgreSQL; refresh để thấy thay đổi (không có realtime push).

Trước cập nhật: sao lưu bằng `npm run db:backup` nếu phiên bản đã hỗ trợ; phiên bản cũ dùng Docker exec pg_dump và công cụ lưu binary an toàn. Giữ riêng bản sao `.env.local` an toàn cùng backup, không thay mật khẩu. Không xóa volume, không reset database.
Kiểm tra `git status --short`; chỉ khi sạch chạy `git pull --ff-only origin main` sau khi PR đã merge. Push GitHub không tự cập nhật localhost.
Giữ nguyên `.env.local`, chỉ thêm/sửa:

```dotenv
JIELIEN_BIND_IP=0.0.0.0
JIELIEN_PORT=3001
```

Mặc định không cấu hình bind vẫn chỉ localhost. Chạy:

```powershell
npm run local:start
npm run local:status
docker compose --env-file .env.local -f compose.yaml config --quiet
Invoke-RestMethod http://localhost:3001/api/health
ipconfig
```

Health phải có status ok, database postgresql. Không công bố đầu ra compose config chứa mật khẩu.
IT xác định card Ethernet/Wi-Fi và IPv4 thực tế qua ipconfig; không dùng 0.0.0.0 làm URL.
IT chạy PowerShell Administrator có chủ đích (ứng dụng không tự chỉnh firewall):

```powershell
New-NetFirewallRule -DisplayName 'Jielien LAN 3001' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Private -RemoteAddress LocalSubnet
```

Chỉ dùng mạng công ty tin cậy, không mở router/UPnP/tunnel hay cổng DB.
Máy khác cùng LAN mở `http://<IP_THUC_TE>:3001`; kiểm tra `Test-NetConnection <IP_THUC_TE> -Port 3001`.
Đăng nhập trên hai máy, cập nhật SKU/đơn/tồn ở máy một, refresh máy hai xác minh dữ liệu chung.
Nếu không vào được: kiểm tra Docker Desktop, health, bind, firewall profile Private, Guest Wi-Fi/AP isolation, VLAN, VPN và IP DHCP thay đổi. Nhờ IT đặt DHCP reservation. Không tắt firewall toàn bộ.
LAN E2E và firewall thực tế cần IT xác nhận tại công ty.

HTTP LAN chỉ dành thử nghiệm trên mạng tin cậy. Với dữ liệu thật/mật khẩu: triển khai HTTPS nội bộ hoặc VPN; checklist HTTPS gồm reverse proxy TLS, domain/DNS, NODE_ENV=production, COOKIE_SECURE=true, firewall hạn chế, rate limit, backup, monitoring và kiểm thử cookie/CSRF. Nhiệm vụ này không mở Internet.

Rollback: dừng đúng app, checkout bản code tương thích và rebuild bằng local:start; giữ `.env.local`, data và volume. Không hạ schema bằng cách xóa DB; dùng forward fix cho migration đã áp dụng.

## Vai trò nhân viên

Admin vào **Tài khoản & Phân quyền**, tìm tài khoản đã đăng ký, chọn vai trò và xác nhận lưu. Không có mật khẩu admin mặc định; dùng `npm run local:admin` cho admin đầu tiên. Quyền thay đổi có hiệu lực request kế tiếp; vô hiệu hóa thu hồi mọi phiên. Không được tước quyền/khóa admin hoạt động cuối cùng.

| Role | Quyền |
|---|---|
| admin | Tất cả, bao gồm quản lý tài khoản |
| boss | Đọc dashboard, catalog, orders, inventory, audit |
| sales | Đọc dashboard/catalog/orders; sửa đơn và đối soát thanh toán |
| warehouse | Đọc orders/inventory; điều chỉnh tồn; không xác nhận thanh toán |
| content | Đọc dashboard/catalog; sửa SKU |
| viewer | Chỉ đọc catalog quản trị |
| customer | Mua hàng, tài khoản và đơn cá nhân |

Nhiều role cộng dồn quyền. Không role mới nào có users.manage. Dashboard chứa thống kê doanh thu và khách hàng tổng hợp; không trả hồ sơ khách. Orders chứa thông tin giao hàng nên chỉ cấp cho người cần xử lý đơn.

## Backup và kiểm chứng khôi phục

Sau khi cập nhật helper (trước khi rebuild app/migration), chạy `npm run db:backup` trên host khi DB cũ còn đang chạy. Script gọi pg_dump -Fc trong db, stream binary qua Node, kiểm tra exit code/header/kích thước, chỉ rename file .partial khi thành công. Không dùng PowerShell 5.1 `>` để ghi dump. Backup chứa dữ liệu nhạy cảm: phân quyền thư mục host, mã hóa bản sao, không commit hoặc gửi log. Header hợp lệ chưa chứng minh khôi phục được: cần restore drill.

Task Scheduler: tạo task chạy hàng ngày, Program `node.exe` (đường dẫn đầy đủ), Arguments `scripts/backup.mjs`, Start in thư mục repo trên host; chọn tài khoản có quyền Docker và ghi backup, Docker Desktop phải chạy. Theo dõi exit code, cảnh báo thất bại; sao chép file .dump đã hoàn tất sang NAS/ổ ngoài được kiểm soát quyền, kiểm tra checksum và retention theo chính sách công ty. Không tự xóa backup trong script.

Restore drill chỉ vào database thử mới, không thay live. Ví dụ PowerShell, thay đường dẫn bằng backup cần kiểm tra; tên database phải mới, không dùng jielien. Nếu createdb báo đã tồn tại, dừng, chọn tên mới, không bỏ qua lỗi:

```powershell
$dbContainer = docker compose --env-file .env.local -f compose.yaml ps -q db
docker cp .\data\backups\postgresql\TEN_BACKUP.dump "${dbContainer}:/tmp/jielien-drill.dump"
docker compose --env-file .env.local -f compose.yaml exec -T db pg_restore --list /tmp/jielien-drill.dump
# Chỉ tiếp tục nếu archive đọc được và database thử CHƯA tồn tại:
docker compose --env-file .env.local -f compose.yaml exec -T db createdb -U jielien jielien_restore_drill_2026
# Kiểm tra exit code createdb là 0 trước lệnh sau:
docker compose --env-file .env.local -f compose.yaml exec -T db pg_restore --exit-on-error --no-owner -U jielien -d jielien_restore_drill_2026 /tmp/jielien-drill.dump
docker compose --env-file .env.local -f compose.yaml exec -T db psql -U jielien -d jielien_restore_drill_2026 -c 'SELECT count(*) FROM schema_migrations; SELECT count(*) FROM orders; SELECT count(*) FROM users;'
```

Đối chiếu số lượng, migration và nghiệp vụ trên môi trường test riêng trước khi tin cậy backup. Không chạy app live trỏ sang DB drill; không dùng pg_restore --clean lên database vận hành. IT kiểm soát việc dọn bản sao chứa PII sau drill.

## Chỉnh sửa đồng thời

SKU có rowVersion. Giao diện gửi phiên bản đã đọc; nếu có người khác lưu trước, API trả 409, UI đóng form cũ và tải lại danh sách để người dùng xem bản mới trước khi sửa lại. Client API tự viết cũng phải gửi rowVersion từ GET products. Đơn hàng/tồn tiếp tục dùng transaction và row lock như trước. Refresh để cập nhật dữ liệu từ máy khác.
