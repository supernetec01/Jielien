# Cài và nâng cấp trên Windows Docker Desktop

Mã nguồn đã được hợp nhất vào `main` theo yêu cầu chủ dự án. Push/merge GitHub không tự cập nhật máy công ty hoặc xuất bản website lên Internet. Hướng dẫn chạy demo ngắn gọn: [DEMO_QUICKSTART.md](DEMO_QUICKSTART.md).

## 1. Giữ dữ liệu và lấy source

Cần Git, Node.js >=24.11 và Docker Desktop Linux containers. Dùng **đúng thư mục cũ** và project `jielien-local`; không clone sang thư mục khác rồi tưởng là đã chuyển database. Giữ `.env.local`, volume `postgres_data`, thư mục `data` và SQLite legacy nếu còn. Không thay `POSTGRES_PASSWORD` hoặc `LOCAL_DATABASE_URL`.

```powershell
cd D:\SuperNet\Jielien
git status --short
# Chỉ tiếp tục khi sạch. Không reset/hủy thay đổi đang có.
git fetch origin
git switch main
git pull --ff-only origin main
```

Nếu Git báo dubious ownership và đây đúng là thư mục bạn tin cậy, chỉ thêm ngoại lệ cho thư mục đó:

```powershell
git config --global --add safe.directory D:/SuperNet/Jielien
```

Không dùng safe.directory `*`. Nếu Git báo xung đột, giữ file và xử lý trước.

## 2. Backup TRƯỚC rebuild/migration

Giữ app/database cũ đang chạy. Helper mới chỉ đọc qua container cũ, không chạy migration. Hạn chế thao tác ghi trong thời gian cutover theo kế hoạch IT.

```powershell
npm run db:backup
```

Helper gọi pg_dump -Fc, đọc media qua container app để không phải chmod dữ liệu, ghi binary an toàn trên host vào `data\backups\postgresql\jielien-....backup\` gồm:

- `database.dump` — PostgreSQL custom archive.
- `media\` — file WebP immutable.
- `manifest.json` — SHA-256/kích thước từng file.

Chỉ rename `.partial` thành `.backup` khi cả database/media thành công. Backup thất bại thì chưa rebuild; xử lý Docker/app/db, dung lượng, quyền thư mục hoặc media bị thiếu. Không đưa backup lên Git; sao chép bundle và `.env.local` riêng sang NAS/ổ ngoài có ACL/mã hóa phù hợp. Bản `.dump` từ helper cũ vẫn giữ nguyên, không bị tự xóa.

Ví dụ kiểm checksum PowerShell 5.1:

```powershell
$backup = 'D:\SuperNet\Jielien\data\backups\postgresql\TEN_BUNDLE.backup'
$manifest = Get-Content -Raw (Join-Path $backup 'manifest.json') | ConvertFrom-Json
if ((Get-FileHash (Join-Path $backup 'database.dump') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.database.sha256) { throw 'Sai checksum database' }
foreach ($item in $manifest.media) {
  if ((Get-FileHash (Join-Path (Join-Path $backup 'media') $item.key) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { throw 'Sai checksum media' }
}
```

Restore drill vào DB riêng, **không dùng tên database live `jielien`**:

```powershell
$dbContainer = docker compose --env-file .env.local -f compose.yaml ps -q db
$drillDb = 'jielien_drill_20261105'
if ($drillDb -notmatch '^jielien_drill_[0-9]+$') { throw 'Ten database drill khong hop le' }
docker cp (Join-Path $backup 'database.dump') "${dbContainer}:/tmp/jielien-drill.dump"
if ($LASTEXITCODE -ne 0) { throw 'Copy that bai' }
docker compose --env-file .env.local -f compose.yaml exec -T db pg_restore --list /tmp/jielien-drill.dump
if ($LASTEXITCODE -ne 0) { throw 'Archive khong doc duoc' }
docker compose --env-file .env.local -f compose.yaml exec -T db createdb -U jielien $drillDb
if ($LASTEXITCODE -ne 0) { throw 'Dung lai; chon database drill moi, khong ghi de database da co' }
docker compose --env-file .env.local -f compose.yaml exec -T db pg_restore --exit-on-error --no-owner -U jielien -d $drillDb /tmp/jielien-drill.dump
if ($LASTEXITCODE -ne 0) { throw 'Restore that bai' }
docker compose --env-file .env.local -f compose.yaml exec -T db psql -U jielien -d $drillDb -c 'SELECT count(*) FROM orders; SELECT count(*) FROM users; SELECT count(*) FROM product_variants; SELECT count(*) FROM schema_migrations;'
```

Đối chiếu count và mẫu order_number/SKU trong môi trường được phép, không in PII/token ra log. Nếu backup thuộc schema mới, kiểm thêm count media_assets/articles. Test media bằng checksum và bản sao staging có mount riêng; không chép đè `data\media` live để thử. Chỉ restore live sau phê duyệt downtime/cutover riêng. Không có restore tự động vào live.

## 3. Chạy phiên bản mới

Sau backup/restore drill được IT xác nhận:

```powershell
npm run local:start
npm run local:status
Invoke-RestMethod http://localhost:3001/api/health
```

Build dùng lockfile, PostgreSQL dùng lại volume cũ, app áp dụng migration additive 005–012. Health phải trả `ok`/`postgresql`. Không cần npm ci trên host để chạy Docker. `npm ci` chỉ cần nếu phát triển/test native.

Mở `http://localhost:3001`. Với LAN, chỉ thêm/sửa trong `.env.local` (không trùng dòng):

```dotenv
JIELIEN_BIND_IP=0.0.0.0
JIELIEN_PORT=3001
```

Chạy lại local:start; local:status phải thấy `0.0.0.0:3001->3001/tcp`. DB không publish 5432. IT lấy IPv4 bằng ipconfig, DHCP reservation và rule Private/LocalSubnet theo `LAN_DEPLOYMENT.md`. Máy đồng nghiệp chỉ mở `http://<IPv4>:3001`, không chạy stack riêng. Máy chủ luôn bật/Docker chạy, không sleep. Không port-forward router/tunnel/public.

## 4. Admin chính và nhân viên

Giữ tài khoản admin cũ. Nếu chưa có admin:

```powershell
npm run local:admin
```

Lệnh hỏi username (Enter gợi ý `admin`), email, điện thoại Việt Nam và mật khẩu riêng >=10 ký tự; không có mật khẩu mặc định. Nếu helper không hiện prompt, gọi tương tác trực tiếp:

```powershell
docker compose --env-file .env.local -f compose.yaml exec app node scripts/create-admin.mjs
```

Nếu dùng email admin cũ và nhập đúng mật khẩu hiện tại, có thể đặt thêm username mà không đổi password. Email khách đã có không được tự nâng thành admin; mật khẩu cũ sai sẽ bị từ chối, không reset tự động.

Vào `/quan-tri` → **Tài khoản & Phân quyền** → **Tạo nhân viên**. Nhập họ tên, username duy nhất, số điện thoại, email tùy chọn, mật khẩu riêng và role. Form không tạo khách hàng hoặc admin mới. Mỗi nhân viên đăng nhập bằng username/điện thoại/email; không chia sẻ tài khoản admin. Khách đăng ký qua storefront vẫn chỉ customer.

Admin cấp/thu hồi role, disable nếu nghỉ việc; backend áp dụng quyền request kế tiếp và thu hồi session khi khóa. Admin cuối cùng không thể bị tước quyền/khóa.

## 5. Nhập hàng, sản phẩm và bài viết

1. Tạo category/brand/attributes, upload ảnh JPEG/PNG/WebP có alt.
2. Sản phẩm cha & SKU → tạo draft → nhập SKU riêng (hoặc sinh tổ hợp), giá/barcode/quy cách/weight → lưu. Không nhập tồn vào form catalog.
3. Gallery chọn ảnh, sắp thứ tự, gán theo SKU nếu cần. Nhập mô tả block/SEO, preview có auth, đổi active khi đủ checklist.
4. Phiếu kho: receipt chọn **chỉ kho đích**; issue/stocktake chọn **chỉ kho nguồn**; transfer chọn hai kho khác nhau. Nháp → gửi → admin duyệt → người có quyền ghi sổ. Stocktake là tổng tồn thực đếm, không phải delta. Không sửa ledger đã post.
5. Tin tức & SEO: chuyên mục/tag → bài nháp → nội dung/ảnh/SEO → gửi duyệt → SEO/admin approve → publish hoặc đặt lịch theo giờ trên máy. PostgreSQL lưu UTC; bài public hiển thị giờ Việt Nam. Tự lưu chỉ chạy sau lần tạo đầu, ở draft; lỗi 409 dừng autosave và giữ form để xử lý.
6. Chỉnh bài published tạo draft riêng; bản public không đổi cho tới lượt publish mới. Revision restore chỉ tạo draft, không hoàn tác bài public trực tiếp.
7. CSV dùng template kit, preview và sửa hết lỗi trước commit; tên brand/category/attribute values phải có sẵn, cover_asset_key là key đã upload. Không dùng dữ liệu mẫu trong kit làm dữ liệu vận hành. Import lưu draft; export SKU hiện chưa round-trip đủ tất cả cột template.
8. Hoàn hàng: chỉ đơn delivered, kiểm số lượng còn được hoàn, ghi tình trạng thực tế trước approve/complete. Không coi hoàn hàng là đã hoàn tiền.

## 6. Sao lưu lịch và public sau này

Task Scheduler: Program đường dẫn Node, Arguments `scripts/backup.mjs`, Start in thư mục repo; tài khoản có quyền Docker/host backup, Docker Desktop/app/db phải chạy. Theo dõi exit code, copy bundle hoàn tất sang nơi khác và drill hàng tháng; tự đặt retention/RPO/RTO với công ty. Helper không tự xóa backup cũ. Widget chỉ ghi nhận thời điểm snapshot, không chứng minh restore đã được kiểm tra.

LAN mặc định `noindex`, sitemap rỗng. **Không bật indexing/public trong lần triển khai này.** Khi có phê duyệt HTTPS riêng mới chuẩn bị reverse proxy/TLS, trusted network, legal policies, backup, rate limiting/monitoring, cấu hình `PUBLIC_BASE_URL=https://<domain-thật>`, `SEO_INDEXING_ENABLED=true`, `NODE_ENV=production`, `COOKIE_SECURE=true`. Không bật Secure trên HTTP LAN vì sẽ làm mất đăng nhập; không dùng thông tin thật trên Wi-Fi khách/công cộng.

## 7. Rollback và kiểm tra sau deploy

Đối soát count/user/order_number/SKU/stock, health, login/admin, COD/VietQR, nhân viên, ảnh, CMS và hai máy LAN sau rollout. Nếu lỗi, dừng đúng app và dùng forward fix hoặc build rollback **còn giữ đủ migration files đã áp dụng**. Runner chủ động từ chối bản code thiếu migration/checksum thay đổi; checkout main cũ rồi xóa DB để chạy lại không phải rollback an toàn.

Không xóa volume, không reset database, không dùng `docker compose down -v`, không thay mật khẩu PG. Chỉ restore backup vào live khi có phê duyệt riêng, downtime và kế hoạch đồng bộ DB/media. `npm run local:stop` giữ volume/data nhưng app ngừng phục vụ; không chạy trên máy chưa xác định đúng project.

Ví dụ override chỉ để IT chuẩn bị HTTPS **sau khi có phê duyệt riêng**, không phải lệnh đã thực thi:

```yaml
services:
  app:
    environment:
      NODE_ENV: production
      COOKIE_SECURE: "true"
      PUBLIC_BASE_URL: https://your-owned-domain.example
      SEO_INDEXING_ENABLED: "true"
```

Reverse proxy phải terminate TLS, giữ Host/Origin nhất quán, chỉ proxy tới app; không expose PostgreSQL. Thay domain placeholder bằng domain được sở hữu và kiểm tra chứng chỉ/DNS trước, không copy override production vào LAN HTTP hiện tại. Cấu hình này không tự tạo domain/TLS hoặc bảo đảm public readiness.
