# CODEX TASK — Nâng cấp Jielien để triển khai LAN và sử dụng dữ liệu chung

## Vai trò và mục tiêu

Bạn là senior full-stack engineer + DevOps engineer được giao chỉnh sửa trực tiếp repository `https://github.com/supernetec01/Jielien.git`, nhánh `main`. Đọc source thực tế trước khi sửa và làm việc trên nhánh mới, ví dụ `feature/lan-team-access`; tạo PR khi hoàn tất (nếu môi trường hỗ trợ). Không chỉ trả lời bằng hướng dẫn: **hãy sửa mã nguồn, thêm tests, chạy các kiểm tra có thể thực hiện và báo cáo kết quả**.

Mục tiêu trước mắt: hiện website chạy ở `http://localhost:3001` trên một máy Windows dùng Docker Desktop; cần cho các thiết bị **trong cùng mạng LAN công ty** truy cập từ trình duyệt, có thể đăng nhập, xem, cập nhật dữ liệu trên **một PostgreSQL chung**. Không cần mua domain/VPS, không mở website ra Internet và không mở cổng PostgreSQL cho các máy nhân viên. Mục tiêu tiếp theo: thêm quản lý tài khoản nhân viên, phân quyền, sao lưu, chống ghi đè, và giữ cấu trúc sẵn sàng triển khai HTTPS/public trong tương lai.

## Hiện trạng đã xác định — kiểm chứng lại trong repo trước khi code

- `compose.yaml`: `app.ports` đang bind `127.0.0.1:${JIELIEN_PORT:-3001}:3001`; `db` là `postgres:17-bookworm`, database lưu bằng volume `postgres_data`; `app` chạy cổng 3001 và đọc `.env.local` qua helper.
- `server.mjs`: Node HTTP server đang `listen(port, "0.0.0.0")` **bên trong container**, có API auth, CSRF, admin và `/api/health`; frontend gọi API theo same-origin nên LAN không cần đổi thành URL cứng.
- `scripts/local.mjs`: lệnh `npm run local:init|start|stop|status|logs|admin` quản lý Docker Compose, tự tạo `.env.local` có mật khẩu PostgreSQL, kiểm tra `LOCAL_DATABASE_URL`.
- `lib/database.mjs`, `db/store.mjs`, `db/migrations/*.sql`: PostgreSQL, migration có checksum, transaction và audit log; **phải giữ nguyên dữ liệu đang có**.
- `lib/auth.mjs`: đăng nhập, session, xác thực, role/permission; migration `001_core.sql` chỉ seed role `customer`, `admin`, với quyền `catalog.manage`, `orders.manage`, `inventory.manage`, `users.manage`, `audit.read`.
- `public/admin.js`: có dashboard, chỉnh giá/trạng thái SKU, đơn hàng, tồn kho, nhật ký; chưa có UI quản lý role nhân viên. `server.mjs` dùng quyền `*.manage` cho cả thao tác GET quản trị.
- `docs/LOCAL_WINDOWS.md`: hướng dẫn Windows/Docker. `package.json` yêu cầu Node `>=24.11.0` dù doc cũ có đoạn nói 18 — thống nhất lại tài liệu, không hạ yêu cầu Node.

## Các nguyên tắc BẮT BUỘC

1. Không xóa, reset, reseed, ghi đè dữ liệu vận hành. **Cấm** `docker compose down -v`, `docker volume rm`, `DROP DATABASE`, `TRUNCATE` và chạy test trên DB production. Giữ nguyên `.env.local` cũ, `postgres_data`, `data/store.sqlite`, đơn hàng, khách hàng, audit và file import legacy. Không đổi mật khẩu PostgreSQL đã khởi tạo.
2. Không hard-code mật khẩu, IP công ty, token, tài khoản, domain hoặc giá trị nhận tiền. Không commit `.env.local`, file backup, dữ liệu cá nhân. Không ghi password/token vào log.
3. Giữ cổng mặc định `3001`; không chiếm `3000`. Giữ `localhost` hoạt động như trước. PostgreSQL **không publish** port `5432` ra host/LAN. Không thêm port forwarding, UPnP, tunnel public hay expose Internet.
4. Thay đổi nhỏ, tương thích ngược khi có thể; thêm migration mới cho thay đổi DB, **không chỉnh sửa migration đã áp dụng**. Kiểm thử kết quả và nếu thiếu dependency/môi trường thì báo rõ chưa chạy được, tuyệt đối không nói đã kiểm thử khi chưa chạy.
5. Tách rõ chế độ LAN thử nghiệm dùng HTTP với triển khai production HTTPS. Không tự gắn `NODE_ENV=production` khi HTTP LAN còn `COOKIE_SECURE=false`. Khi có dữ liệu khách thật/mật khẩu trên nhiều máy, khuyến nghị triển khai HTTPS nội bộ hoặc VPN và chỉ dùng mạng tin cậy đã giới hạn firewall.

## P0 — Bật LAN an toàn (phải hoàn thành trước)

**P0.1. Docker Compose**: sửa `app.ports` theo cấu hình điều khiển được, ví dụ:

```yaml
ports:
  - "${JIELIEN_BIND_IP:-127.0.0.1}:${JIELIEN_PORT:-3001}:3001"
```

Khi không khai báo biến: vẫn chỉ truy cập `localhost` như cũ. Khi `JIELIEN_BIND_IP=0.0.0.0` trong `.env.local`: được phép truy cập LAN theo địa chỉ IPv4 thực tế của máy host. Không thay đổi service DB networking. Bổ sung `restart: unless-stopped` cho app và db nếu phù hợp, ghi rõ Docker Desktop phải chạy và Windows không được sleep; tránh gây khởi động lại gây mất dữ liệu.

**P0.2. Cấu hình và helper**: sửa `scripts/local.mjs` để `local:init` vẫn giữ file cũ, template mới chỉ gợi ý bind mặc định localhost; hỗ trợ tùy chọn `JIELIEN_BIND_IP`, `JIELIEN_PORT` mà không làm hỏng validator mật khẩu và URL DB. Validate IP/port có thông báo dễ hiểu; không in secret. `local:start` hiển thị `http://localhost:3001` và hướng dẫn LAN URL bằng IP thực tế (không hiển thị `0.0.0.0` như URL truy cập); khi nhiều card mạng, nêu cách lấy IPv4 qua `ipconfig` thay vì đoán IP.

**P0.3. Tài liệu Windows**: tạo `docs/LAN_DEPLOYMENT.md` hướng dẫn từng bước: backup trước khi sửa; cập nhật code an toàn (`git status`, `git pull --ff-only` khi working tree sạch); chỉnh `.env.local`; `npm run local:start`; `docker compose ... ps` / `npm run local:status`; thử `http://localhost:3001/api/health`; chạy `ipconfig`; cấu hình firewall chỉ cho phép TCP `3001`, profile Private, `RemoteAddress LocalSubnet`; truy cập `http://<IP_THUC_TE>:3001` trên PC/điện thoại cùng LAN; thử `Test-NetConnection <IP> -Port 3001`; chẩn đoán Guest Wi-Fi, AP isolation, VLAN, VPN, Windows Firewall, Docker, IP thay đổi. Gợi ý đặt DHCP reservation cho IP máy chủ. Không tự chạy lệnh thay đổi firewall trong ứng dụng: chỉ tài liệu cho IT/Admin chạy có chủ đích.

**P0.4. Không phá các API**: frontend phải dùng URL tương đối/same origin; kiểm tra login, cookie, CSRF, đọc danh mục, admin, thay đổi SKU/tồn/đơn khi vào bằng IP LAN. Không hard-code `localhost` vào fetch hoặc redirect. Giữ `GET /api/health` trả `{status:"ok",database:"postgresql"}` nếu DB khỏe.

## P1 — Phân quyền nhân viên và quản lý từ giao diện

Hiện app có `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, nhưng chỉ có `customer/admin`. Thực hiện RBAC thực sự cho nhân viên với migration **mới** (ví dụ `003_staff_rbac.sql`), dùng idempotent inserts và không đụng `001_core.sql`/`002_bank_transfers.sql`:

- Role: `boss`, `sales`, `warehouse`, `content`, `viewer` và giữ nguyên `admin`, `customer`. Role `admin` giữ tất cả quyền. Role mới có quyền tối thiểu theo nghiệp vụ.
- Tách quyền **đọc** và **sửa**. Có thể thêm `dashboard.read`, `catalog.read`, `orders.read`, `inventory.read`, `users.read` nếu cần. Các API GET quản trị chỉ đòi read permission phù hợp, PATCH/POST phải require `*.manage`. Không cấp quyền `users.manage` cho bất kỳ role nào ngoài `admin` trừ khi có yêu cầu rõ ràng. Không mở dữ liệu PII đơn hàng/khách cho role chỉ xem sản phẩm.
- Gợi ý mapping ban đầu: `boss` đọc dashboard/catalog/orders/inventory/audit; `sales` đọc dashboard/catalog/orders và sửa trạng thái đơn; `warehouse` đọc orders/inventory, điều chỉnh tồn (không tự xác nhận thanh toán); `content` đọc dashboard/catalog và cập nhật SKU; `viewer` chỉ xem thông tin sản phẩm được phép. Admin có toàn quyền. Ghi rõ bảng role-permission thực tế trong docs.
- Bổ sung API chỉ dành cho `users.manage` để liệt kê tài khoản và vai trò, gán/thu hồi role, vô hiệu hóa tài khoản; validate dữ liệu, CSRF, audit đầy đủ `actor`, `target`, thay đổi, thời gian. Không trả `password_hash`, session token, CSRF của người khác.
- Không cho nhân viên tự nâng cấp quyền qua `/api/auth/register` hoặc sửa request. Không cho xóa/thu hồi quyền `admin` cuối cùng; ngăn tự khóa bản thân nếu là admin cuối. Khi vô hiệu hóa tài khoản thì thu hồi phiên đăng nhập và backend phải từ chối phiên đã bị khóa. Cập nhật quyền phải có hiệu lực ở các request kế tiếp.
- Thêm giao diện `Tài khoản & Phân quyền` trong `public/admin.js`, chỉ admin có `users.manage` truy cập. Có bảng người dùng, tìm kiếm, vai trò, trạng thái, xác nhận khi thay đổi quyền và thông báo lỗi có ích. Menu chỉ hiển thị quyền tương ứng, **backend vẫn là nơi bắt buộc kiểm quyền**.
- Không tạo mật khẩu admin mặc định; giữ `npm run local:admin`. Khách tự đăng ký vẫn chỉ có role `customer`.

## P2 — An toàn dữ liệu, ghi đồng thời và vận hành

**P2.1. Chống ghi đè chỉnh sửa**: lệnh sửa giá/trạng thái SKU `PATCH /api/admin/variants/:id` cần optimistic concurrency (`row_version` integer hoặc cơ chế tương đương, migration mới). Khi người A đọc bản cũ rồi người B đã sửa, A lưu phải nhận HTTP `409 conflict`, thông báo trên admin UI và tải lại bản mới; không ghi đè âm thầm. Không phá transaction/row locks sẵn có cho đơn hàng và tồn kho.

**P2.2. Backup PostgreSQL**: tạo script cross-platform để chạy trên Windows qua Node + Docker, chẳng hạn `npm run db:backup`, gọi `pg_dump -Fc` bên trong service `db`, ghi **binary stream** ra file timestamp trong `data/backups/postgresql/` hoặc thư mục git-ignored. Không dùng PowerShell 5.1 `>` để lưu trực tiếp binary pg_dump vì rủi ro mã hóa/chuyển đổi dữ liệu. Dùng file tạm, chỉ rename sau khi dump thành công; có kiểm tra file hợp lệ, exit code, kích thước; thông báo nơi lưu, không lộ credential. Backup phải nằm trên ổ host, không chỉ trong container. Tài liệu thêm lịch chạy Windows Task Scheduler và ví dụ sao chép backup qua NAS/ổ ngoài.

**P2.3. Restore drill**: tài liệu quy trình `pg_restore` vào **database test độc lập** để xác minh backup, không cung cấp lệnh có thể ghi đè database live mà không cảnh báo/confirm rõ ràng. Nếu triển khai script restore phải mặc định từ chối tên database live.

**P2.4. Bảo mật**: giữ cookies HttpOnly/SameSite và CSRF/authorization có sẵn; không thêm CORS `*`; không mở HTTP LAN tới Internet; nếu có chế độ truy cập public sau này, ghi checklist reverse proxy + TLS, `NODE_ENV=production`, `COOKIE_SECURE=true`, domain/DNS, giới hạn firewall, rate limit, backup, monitoring và kiểm thử bảo mật. Không triển khai public trong nhiệm vụ hiện tại.

## Files dự kiến sửa/thêm (xác minh trước khi làm)

- `compose.yaml`
- `scripts/local.mjs`
- `package.json` (script backup nếu có)
- `server.mjs`, `lib/auth.mjs`, `db/store.mjs` nếu cần cho role/concurrency
- `db/migrations/003_*.sql`, `004_*.sql` (nếu phát sinh thay đổi DB)
- `public/admin.js`, `public/admin.html`/`public/management.css` nếu cần
- `docs/LOCAL_WINDOWS.md`, **mới** `docs/LAN_DEPLOYMENT.md`, tài liệu role/backup
- `tests/` thêm test cho LAN config, RBAC, multiuser, conflict, backup

## Kiểm thử bắt buộc và tiêu chí nghiệm thu

1. `docker compose --env-file .env.local -f compose.yaml config` hợp lệ; không cấu hình `JIELIEN_BIND_IP` thì bind localhost; cấu hình `0.0.0.0` thì app publish port 3001 trên host, DB không publish 5432.
2. `npm run local:start` chạy app + DB không xóa volume; `npm run local:status` khỏe; health endpoint trả `ok` và `postgresql`. `localhost:3001` vẫn chạy.
3. Trên máy khác cùng LAN, mở `http://<IP_HOST>:3001`, đăng nhập; thao tác admin được lưu vào PostgreSQL chung; máy thứ hai refresh thấy dữ liệu mới. Nếu không có LAN trong môi trường Codex, kiểm thử phần config/HTTP có thể tự động và ghi rõ **LAN E2E thực tế cần IT xác nhận**.
4. `customer/viewer` không thể gọi API sửa dữ liệu (403); `sales`, `warehouse`, `content`, `boss` chỉ có quyền theo ma trận; không tự nâng quyền; role assignment có audit và CSRF; admin cuối cùng không thể bị tước quyền.
5. Hai admin cùng sửa một SKU từ phiên bản cũ: người lưu sau nhận `409` thay vì âm thầm ghi đè. Test API và UI.
6. Test nghiệp vụ cũ: đơn COD/VietQR, quản lý kho, lịch sử, đăng nhập, CSRF, migrations, import SQLite vẫn hoạt động. Không đưa dữ liệu thật vào fixtures hoặc logs.
7. Backup tạo file PostgreSQL custom format có thể kiểm tra và có quy trình restore vào DB test. Backup không bị commit.
8. Chạy tối thiểu `npm test`, `npm run test:local`; thử `npm run test:browser` và `npm run test:management` nếu có Chromium và test DB. Nếu test thất bại, sửa hoặc báo chính xác lỗi/giới hạn môi trường; không che lỗi.

## Cách thực hiện và bàn giao

1. Đọc code, lập checklist, nêu rủi ro ảnh hưởng dữ liệu, rồi sửa theo thứ tự **P0 → P1 → P2**. Nếu scope quá lớn, hoàn tất và commit riêng từng phase thay vì bỏ dở P0. Không yêu cầu tôi xác nhận các lựa chọn kỹ thuật nhỏ; hãy tự chọn phương án bảo thủ, an toàn và tương thích.
2. Tạo commit rõ ràng theo nhóm thay đổi, đừng commit `.env.local`, backup, node_modules hoặc dữ liệu live; chỉ push/create PR khi môi trường có quyền và theo workflow đang dùng.
3. Cuối cùng báo bằng tiếng Việt: danh sách files thay đổi, chức năng mới, migrations, lệnh chạy trên Windows, các test đã chạy/kết quả, hạn chế còn lại, bước thủ công IT phải làm (LAN firewall/IP và HTTPS nếu dùng dữ liệu thật), quy trình rollback code không xóa volume, và các việc chưa hoàn thành.
4. Đặc biệt: khi deploy bản mới trên máy đang có dữ liệu, **phải sao lưu trước**; lệnh triển khai không được dùng `down -v` hoặc tự xóa volume. Nêu rõ việc push GitHub **không tự cập nhật máy chạy localhost**; máy chủ phải pull/rebuild một cách có kiểm soát.

**Định nghĩa hoàn thành**: Jielien chạy từ một máy Windows, thiết bị trong mạng công ty truy cập cùng website qua IP LAN, người được phân quyền xem/sửa dữ liệu đúng phạm vi, toàn bộ dữ liệu được lưu PostgreSQL chung và không mất khi restart/rebuild; có backup kiểm chứng, tài liệu vận hành và bộ test tương ứng. Tên miền và public HTTPS để giai đoạn sau.
