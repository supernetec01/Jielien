# 08 — Bảo mật, vận hành LAN, đưa lên public và kế hoạch phục hồi

## Hạ tầng hiện tại trong repo
- Node HTTP native `server.mjs` bind `0.0.0.0:3001` bên trong container; Docker Compose `127.0.0.1:${JIELIEN_PORT:-3001}:3001` ngoài host, vì vậy chỉ máy host truy cập.
- Docker Compose có service `db` PostgreSQL 17, app Node24, named volume `postgres_data`, bind `./data` vào `/app/data`, `.env.local` sinh password và URL. Các phần khác từ nguồn GitHub nhánh main.
- **Không cho DB port 5432 expose ra LAN/public.** `data` & DB volume không commit; `.env.local` secret.

## P0 LAN triển khai được nhưng có kiểm soát
1. Giữ port `3001`, không đụng `3000` app khác. Thêm `JIELIEN_BIND_IP` vào `compose.yaml` theo pattern `${JIELIEN_BIND_IP:-127.0.0.1}:${JIELIEN_PORT:-3001}:3001` để mặc định an toàn; LAN set IP cố định LAN host hoặc 0.0.0.0 trong `.env.local`.
2. Windows host tạo DHCP reservation IP (ví dụ tài liệu `192.168.1.100` không phải IP thật), vô hiệu sleep trên máy chạy server, Docker auto-start, restart policy `unless-stopped` tùy setup/boot.
3. Windows Firewall **Private** chỉ port3001 từ `LocalSubnet` hoặc subnet công ty cho phép; nếu có VLAN WiFi Guest/AP isolation thì cần policy kết nối cụ thể; không mở NAT/port forward router.
4. Máy nhân viên cùng subnet vào `http://<server-ip>:3001`; `/api/health` báo postgres OK, login role, cùng sửa giá sản phẩm thử nghiệm rồi đối chiếu máy khác; tuyệt đối không dùng HTTP LAN qua WiFi khách/công cộng để xử lý PII.
5. Để an toàn tốt hơn, triển khai HTTPS nội bộ (reverse proxy + CA tin cậy/mTLS/VPN tùy môi trường) trước khi cho đông nhân viên dùng dữ liệu thực; nếu chưa có HTTPS chỉ chạy thử nghiệm trên LAN tin cậy, hạn chế PII, mật khẩu test độc lập.
6. Pin `NODE_ENV=development`, `COOKIE_SECURE=false` cho thử nghiệm HTTP LAN *chỉ trong phạm vi test nội bộ*; khi có HTTPS production đặt `NODE_ENV=production`, `COOKIE_SECURE=true`, secure headers, domain cookies scoped. Không tự bật Secure trên HTTP rồi khiến login không hoạt động.
7. Bảo mật CSRF/Origin với reverse proxy: đảm bảo `Host`/`Origin` consistent; không tin `X-Forwarded-*` từ client tùy ý; cấu hình trusted proxy explicit, có tests.

## P1 sao lưu và khôi phục trước khi sửa DB
- Trước migration: `pg_dump -Fc` database PostgreSQL từ container `db` vào backup timestamp ngoài volume project, ghi checksum SHA256, encrypt, retention, ACL; không đưa PII/backup lên repo.
- Backup lịch: tối thiểu hằng ngày và trước mỗi deploy; retention tham khảo 7 daily + 4 weekly + 3 monthly tùy dữ liệu/quy định nội bộ; ghi rõ RPO/RTO đã thống nhất thay vì cam kết tùy tiện.
- Storage: backup DB và thư mục media assets durable **cùng snapshot mốc thời gian**; nếu media thiếu thì bài/sản phẩm mất hình. Media không chỉ ở container ephemeral.
- Test restore tối thiểu hàng tháng **vào DB/container test riêng**, `pg_restore` + validate counts/products/order numbers/roles/media; không restore đè live chỉ vì lỗi test. Không copy raw PG volume đang running làm backup logic.
- Migration additive 003+: backfill có thể re-run, CI kiểm checksum, không drop columns/constraint tàn phá. Backup trước, chạy staging restore rồi tests, deploy, rollback code khi cần; DB forward migration cần compatibility release, không tự down migration hủy dữ liệu.

## P1 môi trường tách biệt
| Env | URL | Database | Index? | Secrets |
|---|---|---|---|---|
| dev | localhost:3001 | dev/test riêng | no | .env local |
| LAN acceptance | LAN IP:3001 | acceptance riêng hoặc prod nội bộ có kiểm soát | no | secrets riêng |
| staging | private HTTPS subdomain (nếu có) | restored/sanitized staging | noindex + auth | secrets riêng |
| public production | HTTPS domain user cấu hình | PostgreSQL production | chỉ published public | secret manager/env restricted |

Không dùng live customer DB để chạy Playwright tests hoặc seed thử. Test schema/db sandbox, seed dữ liệu giả. Không bật public staging/preview.

## Public sau này (không tự mở ngay)
- Reverse proxy Caddy/Nginx + ACME TLS/HTTPS, redirect HTTP→HTTPS, HSTS sau xác minh, content security policy thử nghiệm rồi enforce, clickjacking/XSS/mime protections, gzip/brotli, asset caching.
- `PUBLIC_BASE_URL=https://<domain-own>`; sitemap, canonical, OG absolute domain thật. `SEO_INDEXING_ENABLED=true` chỉ sau domain ready, policy legal pages ready, payment/shipping real config, QA passed.
- Only app/proxy publicly reachable ports 80/443, PostgreSQL Docker internal only, admin endpoint protected by auth + optional IP/VPN. Firewall allow traffic as required.
- App replicas >1 require shared DB, centralized rate limiter/session store behavior, jobs lock and media shared storage; current in-memory rate limiter single process is inadequate at scale.

## Bảo mật ứng dụng
- OWASP-oriented threats: SQLi → parameterized PG; XSS → HTML blocks sanitize on server + output escaping + CSP; CSRF session/token/origin; IDOR → per record ownership; broken access → RBAC server; SSRF → image fetch/media url allowlist; upload malicious → MIME magic/dimensions/size/signature, storage outside executable path; open redirect → path-only allowlist; brute force → rate limits & alerts; supply chain → pin deps and run audit/review.
- PII minimization/masking: customer email/phone/address in admin list only when authorized, export permission separate. No secrets in logs/Git; request logs requestId sanitized; store sensitive data only as needed, define deletion/retention per Vietnamese applicable privacy requirements before public use.
- Financial: no bank login credentials in admin; browser never marks VietQR paid; server records verified admin action, audit payments; webhook future signature validate/idempotency.
- Customer product compliance: products with medical/nutritional claims require manual compliance review before public publication, legal labels/policies accurate.
- Maintenance: health/readiness, Docker restart, database disk capacity+WAL metrics, backup last success age, job failures, error rates. Alert on data disk low or failed backups; testing a restore more important than a green backup status.

## Deploy checklist
1. Freeze baseline commit + tag; check dirty changes.
2. Backup DB and media; verify restore test.
3. CI tests+schema migration dry run on staging; security/SEO/accessibility scans.
4. Deploy backwards-compatible code and new migrations; update `compose` using **same project name and volume**, no `docker compose down -v`.
5. Verify health, login, admin product edit/restore, orders, inventory, cms publish, sitemap config.
6. Monitor 15–30 minutes manually (duration guideline, not tool promise), ensure rollback docs.
7. After release, reconcile stats/order counts/stock count with predeploy snapshot; keep rollback build and backups.

## Phân biệt code vs data
- `git pull` cập nhật source **không** sao lưu/chuyển database.
- `public/catalog.json` là seed sample, không phải catalog active sau khi DB được dùng; không viết mã quản lý sản phẩm bằng sửa JSON trực tiếp trên Git.
- `.env.local` password hiện hữu phải giữ; đổi password file không đổi role password PG bên trong volume.
- Media upload storage path phải persistent; CDN chỉ sau khi xác định auth & quyền truy cập.

## Hoạt động theo role
- Boss: xem KPI/audit; Admin: bảo mật/phân quyền; Kho: phiếu kho; Sale: đơn; Content: bài & product content; SEO: publish & metadata; Finance: đối soát tiền. Mỗi nhân viên tài khoản riêng, không chia sẻ mật khẩu admin.
