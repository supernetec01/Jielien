# Frontend V3 — bản triển khai để review

Base `main`: `2b4e299`. Nhánh `feat/frontend-v3`. Tác vụ này không merge hoặc triển khai production. Hai tệp người dùng gửi được lưu nguyên bản trong [reference](reference/); HTML là chuẩn hình khối/màu/bố cục, không phải ứng dụng được copy vào public.

## F1–F8 và bằng chứng

| Giai đoạn | Đã thực hiện | Nguồn/bằng chứng |
|---|---|---|
| F1 | Baseline, ảnh cũ, bản gốc/checksum, backup cloud ngoài Git | [F1_BASELINE.md](F1_BASELINE.md), `baseline/` |
| F2 | Header/nav/footer V3, token navy/green, SVG local, layout 1360px, menu responsive; không có Admin trong chrome công khai | `public/index.html`, `storefront.css`, `ui-icons.js`, `shell-v3.js` |
| F3 | Hero 65% + poster stack, trust từ settings đã cấu hình, danh mục DB, banner ngang; slot trống được ẩn, hero có lời chào thương hiệu khi chưa cấu hình | `v3-storefront.js`, `operations.mjs`, migration 013 |
| F4 | SQL search/filter/sort/page, danh mục slug/ID/tên và cây con; gallery/SKU/stock; ảnh thiếu có fallback | `public-catalog.mjs`, renderer dùng chung; `frontend-v3.test.mjs` |
| F5 | Trang tin tức/bài viết SSR dùng cùng chrome V3, published revision, metadata/Article/Breadcrumb/canonical/sitemap/301 và URL thật | `lib/seo.mjs`, `shell-v3.js`; không hash routing |
| F6 | Giỏ/account/checkout theo theme V3; cache chỉ SKU cần thiết, giữ giỏ sau reload/merge tài khoản; COD/VietQR/quote/CSRF/idempotency giữ nguyên | `app.js`, `account-v3.css`; các suite browser cũ và V3 |
| F7 | Banner Studio chọn slot, desktop/mobile, alt, subtitle/CTA/link, lịch, thứ tự, lấy nét và preview thiết bị; sửa có version conflict | `commerce-admin.js`, `admin-workspace.css`, `operations.mjs` |
| F8 | API/security/upgrade/browser, ảnh nhiều viewport, axe, chỉ số lab/load, Docker backup/restore và hướng dẫn Windows | [RESULTS.md](RESULTS.md), `screenshots/`, [MIGRATION.md](MIGRATION.md) |

Chức năng Admin khác và backend Node.js/PostgreSQL được kế thừa. Không đưa dữ liệu/vector/giá/SKU của prototype vào database. Các ảnh và dữ liệu trong screenshot mới là **fixture của schema thử nghiệm**, được tạo qua API, không phải nội dung triển khai công ty.

## File chính và API

- `public/v3-storefront.js`: renderer thuần dùng chung server/client cho home, catalog và detail; tránh mất SEO hoặc đổi khối bố cục khi hydrate.
- `public/app.js`: tương tác thật, lịch sử URL, giỏ/checkout, cache các SKU đã thấy và tải riêng SKU trong giỏ/yêu thích. Nút giao dịch trên HTML SSR chờ hydrate để tránh mất thao tác lúc session/catalog còn đang tải.
- `public/style.css`: giữ cấu trúc giao dịch, gallery, đơn hàng; dọn các component header/hero/product cũ đã thay. `storefront.css` là thiết kế V3 và adapter; tăng tương phản chữ nhỏ so với mẫu để đạt kiểm tra axe trên home.
- `GET /api/categories`: active taxonomy từ DB; có `id,slug,name,parent_id,sort_order,image_url` và alias camelCase cũ. Không trả version/user/editor metadata.
- `GET /api/products?limit=12&page=1&q=...&category=...&brand=...&age=...&min=...&max=...&sort=...`: `items`, alias `products`, `page,limit,total,pages,facets`; tối đa 48 SKU/request, mặc định 48 khi caller cũ không truyền limit. Sort: `price-asc`, `price-desc`, `discount`, `name` (alias underscore cũ vẫn hỗ trợ). Không còn tải toàn catalog trong browser. Caller cũ dùng trên 48 SKU phải đọc các trang, không giả định mảng không giới hạn.
- `GET /api/catalog/search`: alias tương thích, mặc định 20; `GET /api/catalog/products/:slug`: SKU và tối đa 100 biến thể cùng sản phẩm; `GET /api/catalog/skus?ids=...`: tối đa 200 SKU phục vụ giỏ/yêu thích, không lấy sản phẩm inactive.
- `GET /api/site`: settings qua whitelist công khai, banner published/còn lịch theo slot/thứ tự, coupon thật. Banner public không trả actor/version.
- Banner Admin giữ `/api/admin/banners` POST và `/api/admin/banners/:id` PATCH. Body cũ `assetId` vẫn là ảnh desktop; body mới thêm `slot,assetMobileId,alt,subtitle,ctaLabel,sortOrder,focalX,focalY,version,startsAt,endsAt`. Có alias `assetDesktopId`. Lịch nhập giờ máy người dùng, gửi ISO UTC. Ảnh qua pipeline kiểm MIME/magic/decode và WebP immutable hiện có. Không nhận SVG/HTML upload.
- Danh mục Admin thêm `imageAssetId,sortOrder`; dropdown cha chọn theo tên. Thư viện ảnh phải có trước khi gắn vào danh mục/banner.
- `/quan-tri` và `/admin.html`: HTTP 401 khi chưa đăng nhập, 403 khi không có quyền màn hình; API mutation tiếp tục kiểm RBAC/CSRF. Chỉ trang tài khoản có lối vào Admin cho người đủ quyền.

## Những gì không tự bật

Newsletter ẩn vì chưa có dịch vụ lưu consent. Không thêm số điện thoại, cam kết vận chuyển hoặc thông tin pháp lý giả. Trust strip chỉ xuất hiện khi đã cấu hình `trust1`–`trust4`; footer hỗ trợ `companyName,contactPhone,contactEmail,address,footerText,tagline,legalName,registrationNumber`. Cấu hình tại Admin → Cấu hình công ty.

Startup **không tự seed demo**, kể cả khi database trống. Bộ catalog cũ đã chuyển khỏi public vào `db/fixtures/catalog.json`; `/catalog.json` không còn phục vụ dữ liệu mẫu. Chỉ các test wrapper/isolated stack opt-in fixture. Không bật `JIELIEN_DEMO_DATA=true` trên máy công ty. Dữ liệu cũ đã có không bị tự xóa hoặc đổi tên: nếu DB còn danh mục mẹ & bé, giao diện sẽ hiển thị các bản ghi đó cho tới khi công ty biên tập taxonomy thật trong Admin.

## Xem và chạy bản PR trên Windows Docker Desktop

Chưa cần merge main để thử. Dùng staging/thư mục được chọn có database riêng nếu đang review; khi cập nhật bản đang dùng, giữ nguyên `.env.local`, volume và đúng project. Không clone chỗ mới rồi mặc nhiên coi là dùng database cũ.

1. Mở Docker Desktop (Linux containers), Git và Node >=24.11.
2. Trong PowerShell:

```powershell
cd D:\SuperNet\Jielien
git status --short
# Lưu công việc local bằng commit/stash nếu có trước khi switch.
git fetch origin
git switch feat/frontend-v3
git pull --ff-only origin feat/frontend-v3
# Với stack cũ đang chạy, sao lưu trước khi migration:
npm run db:backup
npm run local:start
npm run local:status
```

Máy mới chưa có stack thì chạy `local:start`, không gọi backup trước lần khởi tạo. App áp dụng migration 013 trên schema cũ. Mở `http://localhost:3001`, dùng Ctrl+F5 sau build. Giữ mật khẩu PostgreSQL và volume. Khi Git báo dubious ownership chỉ thêm safe.directory cho thư mục tin cậy, theo `COMMERCE_WINDOWS.md`.

```powershell
npm run local:admin
```

Giữ Admin cũ; chỉ chạy lệnh trên nếu chưa có. Nhập username/email/điện thoại/mật khẩu theo từng câu hỏi. Đăng nhập `/tai-khoan` → vào Admin bằng lối dành cho tài khoản được cấp quyền. Không có tài khoản/mật khẩu mặc định trong source.

3. Admin → Danh mục & Thuộc tính: biên tập ngành hàng, ảnh và thứ tự. Admin → Thư viện ảnh: upload ảnh thật. Sản phẩm/SKU cần ảnh, danh mục, giá, trạng thái xuất bản và nhập kho đúng nghiệp vụ.
4. Admin → Banner & Poster Studio: chọn vị trí, ảnh desktop/mobile, CTA/link/lịch/thứ tự, xem preview rồi lưu nháp hoặc xuất bản. Link chỉ cho phép URL nội bộ của sản phẩm/danh mục/tin tức; không cho link Admin hoặc domain ngoài.
5. Kiểm tra home, catalog, detail, giỏ, COD/VietQR, tin tức, tài khoản và hai máy LAN. LAN vẫn dùng `.env.local` với `JIELIEN_BIND_IP=0.0.0.0`, cổng 3001 và firewall Private/LocalSubnet theo [DEMO_QUICKSTART.md](../DEMO_QUICKSTART.md). Không mở cổng PostgreSQL.

Ảnh/logo trong suốt phải là tài sản thương hiệu được công ty xác nhận; bản này giữ logo gốc, không tự vẽ hoặc xóa nền để tạo biến thể chưa duyệt. Danh sách banner được làm mới khi tải trang; thay đổi lịch/trạng thái không đẩy realtime đến các tab đã mở.
