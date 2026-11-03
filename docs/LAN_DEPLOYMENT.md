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
