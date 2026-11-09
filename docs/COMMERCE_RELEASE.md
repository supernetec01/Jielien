# Jielien International — bản demo commerce/CMS

Danh sách công việc còn thiếu và thông tin cần từ chủ cửa hàng hiện được quản lý tại [CHUC_NANG_CHUA_TRIEN_KHAI.md](CHUC_NANG_CHUA_TRIEN_KHAI.md). Các bằng chứng/mốc kiểm thử của tài liệu này thuộc các đợt bàn giao trước; chức năng tài khoản hiện tại xem REGISTRATION.md.

Các nhánh LAN, commerce/CMS và phân quyền Admin đã được hợp nhất vào `main` theo yêu cầu chủ dự án. Bản nâng cấp giao diện tiếp nối được ghi tại [INTERFACE_REFRESH.md](INTERFACE_REFRESH.md); chạy từ `main` theo [DEMO_QUICKSTART.md](DEMO_QUICKSTART.md). Không tự xuất bản website công khai hoặc thay database máy công ty. Bộ đặc tả gốc giữ nguyên tại `docs/commerce-spec`; task theo dõi tại `specs/001-jielien-commerce/tasks.md`. Spec Kit chính thức đã cài; xem `SPEC_KIT_SETUP.md`.

## Chức năng có thể dùng

| Feature | Status | Code / migration | Evidence / giới hạn |
|---|---|---|---|
| P0: LAN opt-in, DB nội bộ, giữ dữ liệu | DONE trong cloud; UAT LAN pending | compose.yaml, scripts/local.mjs, tests/commerce-upgrade.test.mjs | 001–004 bất biến; upgrade trên schema có dữ liệu giữ ID/SKU/giá/order snapshot/user/stock; restore Docker riêng |
| P1: nhận diện Jielien, storefront/account/admin | DONE phần nhận diện và luồng chính | public/brand.css, style.css, management.css, *.html, assets/jielien-logo.jpg | Logo JPEG gốc, không vẽ lại; có favicon/alt/tỷ lệ. Chưa có logo SVG/transparent chuẩn từ công ty |
| P2: product cha, SKU, tổ hợp thuộc tính, SEO, archive | DONE phần lõi | lib/catalog.mjs, public/commerce-admin.js; 005/011 | Tên/SKU/barcode/combination unique; giá VND riêng, weight/dimensions/threshold; version conflict; preview có auth; active cần ảnh/category/SKU; không hard-delete |
| P2: media/gallery | DONE phần lõi | lib/media.mjs; 005 | JPEG/PNG/WebP tối đa 5 MiB, magic bytes + decode + pixel cap, chuyển WebP tối đa 1800px, loại bỏ metadata; ảnh random immutable trong data/media; gallery thứ tự/ảnh SKU/alt và giữ legacy. Chưa có video/crop/đa cỡ thumbnail |
| P2: CSV | DONE trong giới hạn đã ghi | lib/catalog-import.mjs, lib/csv.mjs; 009 | Preview không ghi, lỗi từng dòng, create/update, token version, commit transaction/idempotent; tối đa 200 dòng và envelope JSON 32 KiB; chỉ draft, không ghi tồn. Export là báo cáo SKU, chưa là round-trip template đầy đủ |
| P3: admin và nhân viên | DONE | lib/auth.mjs, scripts/create-admin.mjs, public/admin.js; 006/012 | Admin bootstrap username mặc định được gợi ý `admin`, mật khẩu do người vận hành đặt; admin tạo username/password/role nhân viên; không tạo customer/admin qua form nhân viên; khách tự đăng ký chỉ customer; khóa thu hồi session, bảo vệ admin cuối |
| P3: phiếu kho và hoàn hàng | DONE luồng cơ bản; PARTIAL mở rộng | lib/inventory-documents.mjs, lib/returns.mjs; 006/010 | Receipt/issue/transfer/stocktake → submit/approve/post; row locks, không dùng tồn reserved, post retry không cộng hai lần. Hoàn đơn delivered có giới hạn, nhận/kiểm/duyệt; sealed vào normal, opened/damaged vào damaged; không tự hoàn tiền |
| P4: CMS workflow/revisions | DONE luồng chính | lib/cms.mjs, commerce-routes.mjs, public/commerce-admin.js; 007 | Nháp → duyệt → approved → published/scheduled; trả lại nháp qua API; lưu trữ; tự lưu nháp đã tạo mỗi 15s; revision append-only/restore thành nháp; public giữ published revision trong khi sửa; writer chỉ sửa bài mình |
| P4: SEO | DONE phần nền tảng; PARTIAL biên tập nâng cao | lib/seo.mjs, lib/cms.mjs | HTML ban đầu cho home/product/category/news; 404/301 thật, canonical/OG/JSON-LD/Breadcrumb khi cấu hình HTTPS, sitemap published-only, mặc định LAN noindex. Chuyên mục/tag và related product qua dữ liệu DB; không bịa review/rating |
| P5: vận hành | DONE phần cơ bản; PARTIAL analytics/merchandising | lib/operations.mjs; 008 | Banner ảnh/lịch, settings công ty không secret, coupon create/update với quote thật, GMV/collected/date-filter/CSV, audit filter/CSV chống formula, widget database/job/backup. Chưa có collection CMS/chart drill-down/campaign nâng cao |
| P6: test/backup/release | DONE kiểm tra cloud; UAT pending | tests/*, scripts/backup.mjs, COMMERCE_WINDOWS.md | Test API/browser/upgrade/load/Docker và checksum/restore; chưa nghiệm thu Windows thật, LAN PC→PC, HTTPS production hay CWV người dùng thật |

**Không phải tuyên bố hoàn thành toàn bộ backlog P0–P6.** Đây là bản tích hợp phần lõi hoạt động thực tế để review/UAT. Các task không đủ tiêu chí vẫn để `[ ]`, không đánh dấu x chỉ vì đã có API hoặc giao diện.

## Phân quyền thực tế

- `admin`: mọi quyền; quản lý tài khoản/settings/audit, duyệt kho và xuất bản.
- `boss`: read dashboard/catalog/orders/inventory/audit/reports/content/settings; không mutation.
- `sales`: catalog/orders/dashboard read, xử lý trạng thái đơn, tạo yêu cầu hoàn; **không đối soát thanh toán**.
- `warehouse`: inventory read/manage/post, orders read như bản LAN cũ, tạo/kiểm định hoàn. Không approve kho, không xác nhận tiền.
- `content` legacy: catalog read/manage + create/edit/publish/archive/media và content read/write own; giữ tương thích quyền sửa catalog cũ.
- `catalog_manager`: catalog read/manage/create/edit/publish/archive, media, inventory read.
- `writer`: content read/write own, catalog read, media; không approve/publish.
- `seo`: content read/write/manage/approve/publish, seo.manage, catalog read, media.
- `finance`: orders read, payments.reconcile, reports.read; permission refunds.approve dự phòng, chưa có workflow hoàn tiền.
- `viewer`: catalog read. `customer`: chỉ tài khoản/đơn/giỏ của mình.

Role cộng dồn. Permission kiểm ở server. GET CMS nháp giới hạn owner hoặc người có quyền review/manage/audit. Gán/thu hồi role có hiệu lực request kế tiếp; disable thu hồi phiên. Khách không được tự đặt username hoặc role qua public register. Đăng nhập nhân viên bằng username, điện thoại hoặc email; không có mật khẩu mặc định.

## Migration mới và bảo toàn

001–004 giữ nguyên checksum. Các migration mới đều forward-only:

- 005: metadata/version/content product, media_assets, combination SKU, redirects, catalog/media permissions.
- 006: username, phiếu kho/items, vai trò writer/seo/finance/catalog_manager và permissions.
- 007: article taxonomy, articles/revisions/published revision, liên kết, workflow và publish jobs.
- 008: whitelisted site settings và banner.
- 009: idempotent catalog import jobs.
- 010: return requests/items, permissions.
- 011: khối lượng/kích thước và ngưỡng cảnh báo SKU.
- 012: quyền đọc catalog cho editorial roles; content legacy write draft.

Không đổi ID variant/order_number, không tính lại order_items, không đổi mật khẩu PG, không xóa volume. Seed cũ không ghi đè giá/tồn. Source không chứa tài khoản/mật khẩu vận hành, dump hay PII. Database công ty không được dùng trong test. Media chưa có API xóa vật lý; snapshot sao lưu được file immutable đã tham chiếu và cả orphan để tránh mất hình.

## Các phần còn lại của đặc tả

1. Kho: đảo phiếu/reversal ledger, luồng phê duyệt nhiều cấp, hoàn tiền thủ công với chứng từ, giao hàng/tracking nâng cao. Hiện điều chỉnh bù phải có lý do và được người có quyền phê duyệt ngoài hệ thống; không sửa ledger cũ hoặc giả đã hoàn tiền.
2. Catalog: taxonomy edit có khóa/cycle guard; chưa có UI xóa/archive từng attribute value, advanced facets/bulk publish, editor tabs/diff so sánh đầy đủ. Category slug rename chưa tự tạo redirect; dùng SEO redirect sau khi kiểm tra URL đích. Không hard-delete entity đã có tham chiếu.
3. CMS: editor hỗ trợ paragraph, H2/H3, quote, list, image; chưa có table/video/FAQ/product block phong phú hoặc diff revision trực quan. Preview yêu cầu session mọi request, không phát bearer URL cho người khác. Related products dùng product parent IDs; taxonomy/SEO editor nâng cao còn cần cải thiện UX.
4. Merchandising/analytics: chưa có collection CMS, chart/top SKU/channel, cost/profit/refund report, social analytics/Search Console. Chỉ công bố số liệu từ DB đang có; không suy diễn GMV thành tiền đã thu.
5. QA bên ngoài: Windows PowerShell 5.1/Docker Desktop thực, firewall/Private profile/VLAN và PC→PC LAN; chuyên môn nội dung sản phẩm/chính sách, manual accessibility và load/capacity production. Lab không chứng minh Core Web Vitals p75 hoặc thứ hạng Google.
6. Provider-dependent/out of scope: tự động nhận thanh toán/hoàn tiền, carrier API, sàn/TikTok/Shopee, public TLS/domain. Email password reset đã có code qua Resend, còn cần cấu hình và thử gửi thật; OTP đăng ký đã được chủ cửa hàng bỏ. Email báo đơn là chức năng riêng chưa triển khai. Không dựng mock success hoặc mở Internet.

Các mục này được nêu công khai để review phần còn lại, không bị ẩn bằng nút trống hoặc thông báo thành công giả.

## Kiểm chứng

Kết quả chính xác và hạn chế nằm tại `docs/validation/RESULTS.md`. Screenshot chứa dữ liệu test giả trong `docs/screenshots/commerce/`. Load lab có cấu hình/mẫu đo ở `docs/validation/load.json`; không phải cam kết tải production. Hướng dẫn triển khai/cutover/backup/rollback ở `COMMERCE_WINDOWS.md`.

## UX upgrade tiếp nối

| Phần | Trạng thái | Bằng chứng |
|---|---|---|
| Mua hàng/mobile | Đã triển khai phần UI: chọn quy cách tại chỗ, mini-cart, thanh mua/checkout, bộ lọc dialog | tests/ui-upgrade.browser.mjs; docs/screenshots/upgrade |
| Cài đặt liên hệ/chính sách | Đã triển khai form Admin, validation và version từng trường; không seed thông tin giả vận hành | tests/ui-upgrade.test.mjs; test:upgrade |
| Báo cáo | Thêm series ngày/so sánh/top SKU/trạng thái từ SQL thật; còn thiếu các phần B1/B4 trong spec | lib/operations.mjs; public/report-visuals.js |
| Toàn bộ đặc tả 3 giai đoạn | CHƯA hoàn thành | Xem bảng đầy đủ tại UPGRADE_DELIVERY.md, không đánh đồng bản UI với các tích hợp vận hành |

Không thay migration cũ hoặc xuất bản môi trường công khai. Font WOFF2 phục vụ cục bộ, giấy phép OFL. Kết quả tại validation/UX_UPGRADE_RESULTS.md.

## Sửa khung Admin và chi tiết đơn

Sidebar giữ đầy đủ phần tài khoản trong viewport; chi tiết đơn rộng, thông tin người nhận/đơn/thanh toán lớn hơn và chia nhóm. Xem [ADMIN_ORDER_LAYOUT.md](ADMIN_ORDER_LAYOUT.md). Chỉ thay giao diện, không có migration hoặc thay đổi xử lý tiền/tồn. Email báo đơn và tạo đơn hộ nhân viên mới ở mức [đề xuất](proposals/ORDER_EMAIL_NOTIFICATION.md), chưa gửi email.
