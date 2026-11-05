# 02 — PRD chức năng đầy đủ: Website bán hàng + Admin

## 0. Mục tiêu, phạm vi và định nghĩa
**North star:** người dùng tìm đúng SKU, hiểu sản phẩm, đặt đơn nhanh; nhân viên quản lý hàng hóa–nội dung–đơn–kho trên **một dữ liệu**; website có khả năng thu hút organic traffic nhờ bài tin tức và product/category SEO.

**Actor:** `Guest`, `Customer`, `Admin`, `Boss`, `CatalogManager`, `WarehouseStaff`, `Sales/CS`, `ContentWriter`, `SEOEditor`, `Finance`, `SystemJob`, `ExternalPayment/Carrier` (optional).

**P0** nền tảng dữ liệu/an toàn; **P1** website/catalog/CMS/brand/SEO bắt buộc để ra mắt; **P2** quản trị nghiệp vụ mở rộng; **P3** tích hợp và tiện ích sau ra mắt. Các mục `P3` là backlog, không được ghi “đã xong” nếu chỉ là giao diện giả.

## A. Website khách hàng — toàn bộ chức năng

### A1. Trang chủ (FR-SF-001..015; P1)
| ID | Tính năng | Quy tắc / kết quả |
|---|---|---|
| SF-001 | Header Jielien và logo | Logo link `/`, menu danh mục, tìm kiếm, tài khoản, tra cứu, giỏ hàng; sticky tiết chế |
| SF-002 | Mega-menu danh mục | Tối đa 3 cấp, hiển thị category active, sắp theo admin sort order |
| SF-003 | Banner/hero | Banner responsive desktop/mobile, alt text, link nội bộ, lịch bật/tắt; tránh CLS |
| SF-004 | USP/tin cậy | 3–4 lợi ích thực tế do admin quản lý; không tuyên bố sai |
| SF-005 | Sản phẩm nổi bật | Featured/new/best seller do hệ thống hoặc admin lựa chọn; server trả thực |
| SF-006 | Bộ sưu tập | Landing theo danh mục/chiến dịch, thời gian hiển thị |
| SF-007 | Khuyến mãi | Hiển thị ưu đãi hợp lệ; không ghi giảm giá nếu giá cũ không có thật |
| SF-008 | Tin tức mới | 3–6 bài đã published + link chuyên mục |
| SF-009 | Thương hiệu | Logo thương hiệu/hãng (nếu có quyền sử dụng) |
| SF-010 | Footer | Công ty, liên hệ, chính sách, mạng xã hội, điều hướng, bản quyền |
| SF-011 | Chính sách | Giao hàng, đổi trả, bảo mật, điều khoản, thanh toán; bản được duyệt |
| SF-012 | Breadcrumb | Các trang cấp dưới, liên kết thật |
| SF-013 | Search bar | Gợi ý có debounce, keyboard, no-results state |
| SF-014 | Responsive | 320/375/768/1024/1440 desktop/tablet/mobile, không scroll ngang |
| SF-015 | Loading/error | Skeleton, empty, retry; no flash layout |

### A2. Danh mục, tìm kiếm và bộ lọc (FR-SF-020..035; P1)
- `/san-pham`: grid sản phẩm, sort `relevance/newest/price_asc/price_desc/bestselling` (chỉ khi có dữ liệu thật), filter category, brand, giá min/max, trạng thái tồn, thuộc tính (size/màu/quy cách/độ tuổi), cursor/page pagination ổn định.
- `/danh-muc/:slug` hoặc đường dẫn danh mục có canonical chính thức và breadcrumb theo cây; một parent product không nhân đôi quá mức khi có nhiều SKU.
- Search tiếng Việt có dấu/không dấu, match name/SKU/brand/category/keywords; gợi ý; rate limit; chống query quá dài và injection. Hỗ trợ search khi không có kết quả và viết rõ bộ lọc đang chọn.
- Query string là nguồn sự thật cho filter/page/sort; Back/Forward hoạt động; các URL lọc động không tự động vào sitemap; canonical theo chiến lược tránh duplicate.
- Thẻ sản phẩm hiển thị ảnh, tên, giá từ variant chọn/default, giá gạch thực nếu hợp lệ, badge hết hàng/mới/ưu đãi, CTA thêm giỏ/chọn biến thể; ảnh lazy ngoài viewport; skeleton layout.
- Stock hiển thị `còn hàng / sắp hết / hết hàng` từ available sellable kho, không tiết lộ chính xác số tồn nếu không cần.

### A3. Chi tiết sản phẩm và SKU (FR-SF-040..065; P1)
- Tên product cha, thương hiệu, danh mục, breadcrumb, short description, full HTML/blocks description, thông số, FAQ, tài liệu/hướng dẫn, nội dung chăm sóc, SKU cụ thể.
- Gallery: 1 ảnh cover bắt buộc lúc publish, nhiều ảnh phụ, ảnh theo variant, ảnh mô tả trong nội dung, video (optional), zoom, thumbnails, alt text theo ảnh, responsive srcset.
- Biến thể phân loại: nhóm thuộc tính (màu/số lượng/quy cách/kích thước/vị/phiên bản); combinations được liệt kê thành từng SKU duy nhất, không tạo duplicate tổ hợp; chọn variant cập nhật URL/ảnh/giá/khối lượng/tồn/barcode/có thể mua.
- Giá bán: integer VND, compare-at optional; admin có thể cấu hình giá từng SKU. Backend tính lại tại checkout, không tin số tiền browser.
- Chính sách/ước tính phí vận chuyển chỉ hiển thị nếu có nguồn tính hợp lệ, không tự bịa ETA.
- Quantity min=1 max=available và giới hạn nghiệp vụ, disable add-to-cart nếu out-of-stock/inactive; nếu tồn thay đổi sau vào giỏ, server báo và yêu cầu khách xác nhận trước thanh toán.
- Bài viết liên quan & sản phẩm liên quan, internal links trỏ URL có thể crawl; wishlist P2; reviews verified P3 (không fake rating).
- SKU có slug SEO ổn định; lưu mapping redirect 301 khi đổi slug; giữ legacy `/san-pham/:skuSlug` hoạt động.
- Có quy định riêng cho hàng có hạn dùng, yêu cầu an toàn, sản phẩm thuộc diện kiểm soát (P3/conditional, không bật khi chưa có dữ liệu/chứng từ).

### A4. Giỏ hàng, checkout, thanh toán (FR-SF-070..095; P1)
- Giỏ khách vãng lai/local session và tài khoản; không mất giỏ khi refresh, merge có quy tắc lúc login; chỉnh quantity/xóa/hết hàng/tính lại tiền server.
- Cart line theo **variant_id**: product + SKU + ảnh snapshot hiển thị + unit price hiện hành; không cộng nhầm SKUs cùng product; price change alert.
- Coupon 1 mã/order ở phiên bản đầu; kiểm điều kiện server (thời gian, usage, min spend, SKU/category eligibility) trong transaction.
- Checkout 1 trang dễ thao tác: nhận hàng (tên/phone/tỉnh/quận-phường/địa chỉ), phương thức, ghi chú, summary phí/giảm/tổng; validate và hiển thị trường sai.
- Guest checkout không bắt buộc đăng ký; khách đăng nhập chọn địa chỉ cũ; không lộ thông tin khách khác.
- Payment COD hoặc VietQR manual như code hiện tại; chỉ nhân viên có quyền xác nhận nhận tiền; không cho khách tự đánh dấu paid.
- Khi đặt thành công tạo `order_number`, đóng snapshot item/discount/tax/shipping/payment/address, reserve tồn, trả confirmation + cách tra cứu.
- Mỗi lần nhấn xác nhận checkout tạo/giữ idempotencyKey; retry timeout không nhân đôi đơn; double-click không trừ kho hai lần.
- Không có kết nối bank thực: UI ghi “Chờ đối soát”; không hiển thị “Đã thanh toán” ngay sau quét QR.
- Trạng thái đơn hiển thị chính xác; có trang `/tra-cuu-don-hang`; bảo vệ bằng owner session hoặc mã đơn + điện thoại, rate limit; không lộ token trong referral/log.

### A5. Tài khoản khách hàng (FR-SF-100..112; P1)
- Đăng ký với validation; login/logout; đổi mật khẩu + revoke session; tên/email; địa chỉ nhiều địa chỉ, một default; wishlist P2.
- Danh sách đơn của chính user, timeline trạng thái và thanh toán, liên hệ hỗ trợ.
- Có luồng reset password qua email/OTP khi có provider hợp lệ (P2); **không hardcode mật khẩu mặc định hoặc gửi plain text password**.
- Privacy: chỉ hiển thị PII cho owner và staff có quyền; chính sách xóa dữ liệu theo chính sách công ty và nghĩa vụ pháp lý, không xóa order history tuỳ tiện.

### A6. Tin tức/SEO (FR-SF-120..142; P1)
- `/tin-tuc`: list, category, tag, search, pagination; `/tin-tuc/:slug`: hero image, title, summary, author, published/updated dates, reading content, toc/heading, related posts/products, share links.
- SEO title/meta description/canonical/OG/Twitter meta/image; H1 duy nhất, alt ảnh, H2/H3 hợp lý, indexable HTML.
- Breadcrumb, RSS optional, XML sitemap, robots.txt, redirects 301, noindex draft and search/filter as appropriate, JSON-LD Article/Breadcrumb.
- Chức năng liên kết bài với product/category, khuyến nghị sản phẩm không làm mất mục tiêu chia sẻ thông tin.

### A7. Các trang phụ và trải nghiệm (FR-SF-150..160; P1/P2)
- Giới thiệu công ty, liên hệ, FAQ, chính sách, 404 thực, 500 và bảo trì; form liên hệ chống spam (P2).
- Floating contact/Zalo/điện thoại (P2; chỉ hiển thị thông tin đúng), sitemap nội bộ, legal footer.
- PWA/push, membership, review/loyalty, autocomplete nâng cao, compare (P3).

## B. Admin — yêu cầu chức năng chi tiết

### B1. Dashboard và điều hướng (FR-AD-001..014; P1/P2)
- Sidebar có menu theo permission, header với thông báo, avatar/role, chuyển sang trang storefront; breadcrumb, bộ lọc thời gian, card KPI.
- KPI: đơn đặt, đơn chờ, tổng thu đã xác nhận, GMV theo định nghĩa, doanh thu ròng (khi có refund), AOV, số SKU đang bán, SKU sắp hết, bài viết scheduled.
- Biểu đồ theo ngày/tuần/tháng, top sản phẩm/SKU/danh mục, tình trạng đơn, tồn kho; định nghĩa metric rõ: `GMV = sum(grand_total của orders theo điều kiện)`, `collected = sum(payments paid)` tránh gọi chung doanh thu.
- Dashboard `Boss` read-only theo mặc định; quyền chi tiết cho report/export.

### B2. Quản lý Product (FR-AD-020..060; P1 bắt buộc)
**Danh sách:** tìm theo name/SKU/barcode/ID, filter category/brand/status/published date/in-stock, sort, pagination server, bulk publish/unpublish, CSV export/import preview; không hard delete sản phẩm đã có order.

**Form tạo/sửa Product parent:**
1. Thông tin: tên, slug (unique), brand, danh mục đa chọn có primary, short summary, full description rich blocks, feature list, specifications, chính sách/hướng dẫn, tags, related products.
2. Media: cover, gallery, video link/video upload (optional), ảnh trong mô tả, alt text, crop/ratio, sort, mobile banner optional, asset library.
3. Phân loại: thuộc tính và giá trị (màu/quy cách/size...), ma trận combinations; SKU auto-generate có xem trước và cho phép sửa; barcode optional; trọng lượng/kích thước đóng gói optional; tất cả SKU được preview trước lưu.
4. Từng SKU: name, code, barcode, status, price, compare-at price, stock threshold, media riêng, weight, optional sale price window, SEO variant configuration.
5. SEO: SEO title/meta description, OG image, canonical setting, slug/redirect mapping, preview Google (chỉ mô phỏng snippet), schema validation.
6. Publish: draft, in_review (nếu yêu cầu), published, archived; không xuất bản nếu thiếu tên, category hợp lệ, 1 ảnh cover, 1 SKU active có price>0, các trường nội dung quan trọng; cho phép SKU out-of-stock vẫn hiện với nhãn hết hàng.
7. Audit và version: ai sửa, trước/sau các trường quan trọng, `row_version`/updated_at chống lost update; soft archive.

**Thao tác hàng loạt:** import CSV theo template, validate toàn bộ trước commit, dry-run preview theo SKU unique, chế độ create/update rõ, export lỗi từng dòng, commit batch transactional hợp lý; không tự sửa tồn qua import danh mục nếu không có chứng từ kho.

### B3. Category, Brand, Attributes (FR-AD-065..081; P1)
- Category tree parent/child, slug, heading/description SEO, thumbnail, image banner, sort order, visibility, primary parent, redirect history.
- Brand CRUD logo/name/slug/description, status, SEO. Chặn xóa nếu đang được product dùng (archive/unlink có xác nhận).
- Attributes CRUD code/label/display type (buttons/swatches/dropdown), values, sort, validation; SKU combination unique per product, tránh duplicate thuộc tính.

### B4. Quản lý Media (FR-AD-085..096; P1)
- Upload drag/drop, multiple files, alt caption, gallery re-order, library filter by owner/date/type, attach/detach with refcount, crop focal point optional.
- Chấp nhận JPEG/PNG/WebP, video chỉ khi có cấu hình storage/giới hạn; không chấp nhận executable/SVG có script từ upload; verify magic bytes, max size, dimensions, filename random/hash, thumbnail WebP, metadata.
- Tách web assets trong public khỏi media user tải lên bằng storage durable được backup; server không cho traversal; ràng buộc quyền upload/delete.

### B5. Kho/Inventory (FR-AD-100..131; P2)
- Xem tồn theo SKU/kho: on_hand, reserved, available, damaged, low-stock threshold, history movement.
- Phiếu `receipt` nhập từ nhà cung cấp; `issue` xuất ngoài bán; `transfer` kho A→B; `stocktake` kiểm kê + sai lệch; `return` nhận hàng hoàn theo điều kiện A chưa mở → kho thường, B mở/hư → kho damaged. Tất cả có reason/ref, actor, timestamp, status, approval nếu cần.
- Phiếu từ `draft → submitted → approved → posted → reversed` (có quy tắc), không mutate phiếu posted; đảo bằng reversal có ledger tương ứng.
- Tồn khả dụng để bán = `sum(on_hand - reserved)` ở kho normal active; hàng damaged không được bán. Không âm, không thấp hơn reserved, khóa balance khi cập nhật đồng thời.
- Cảnh báo gần hết/hết theo variant, export CSV, tìm kiếm barcode, SKU; optional serial/lot/expiry P3.

### B6. Đơn hàng/fulfillment (FR-AD-140..171; P1 hiện có, P2 mở rộng)
- Danh sách order lọc ngày/trạng thái/payment/channel/phone/order code, phân trang server; detail có customer masked, snapshot items, event history, notes.
- Workflow: `pending→confirmed→processing→shipped→delivered`, cancel hợp lệ; ghi trạng thái với người sửa/thời gian/lý do, tránh nhảy bước.
- Xác nhận COD nhận tiền sau giao, VietQR xác nhận sau đối soát; idempotent, không cho ship chuyển khoản chưa paid.
- Manual carrier/tracking number, in packing slip, handoff audit, partial shipment P3.
- Returns/RMA P2: yêu cầu → duyệt → nhận hàng → kiểm tra A/B → xử lý kho → refund/replace theo quyền; tách trạng thái trả hàng khỏi trạng thái order để tránh làm sai ledger.
- Refund P2: phiếu có lý do, số tiền không vượt đã thu, dual-control ngưỡng cao, không “đã hoàn tiền” cho đến khi xác nhận thực tế; payment event/reconciliation.

### B7. CMS, tin tức, landing page và SEO (FR-AD-180..215; P1)
- Danh sách post filter category/tag/status/author/date/search, bulk schedule/archive (permission checked).
- Trình soạn thảo rich text/block: headings, paragraphs, list, image+alt, quote, table, links, CTA product embed, TOC; tự làm sạch HTML và render an toàn; auto-save draft + conflict notice.
- Post metadata: title, unique slug, excerpt, cover image, author, category, tags, publish_at, edited_at, reading time, SEO title/meta/canonical, OG.
- Quy trình editor: writer draft → submit review → SEOEditor approve → schedule/publish; revision history, preview có quyền + noindex, reject với reason.
- Related articles/products theo topic; internal link manager, broken-link checker (P2), redirect manager; XML sitemap, robots; setting brand/org SEO sitewide.
- Quản lý homepage banner, collection, trang giới thiệu/chính sách với publish version và SEO metadata (P1/P2).

### B8. Promotion, marketing, CRM (FR-AD-220..245; P2/P3)
- Coupon: code unique, type fixed/%/ship, min spend, starts/ends, max usage, per customer, SKU/category scope, stackability policy, status. Prevent concurrent over-redemption.
- Campaign banner, hero, product collection sort, schedule; marketing link tracking UTM (không để UTM làm URL canonical).
- Contact forms, opt-in newsletter theo consent và unsubscribe (P2/P3 khi có email provider); abandoned cart reminders P3.

### B9. Người dùng, nhân viên, phân quyền (FR-AD-250..277; P1/P2)
- Customer list (PII masked) với search/filter, status, own data access per role; không hiển thị password/session tokens.
- Admin mời/tạo staff (không tạo password plaintext tự động), gán role/scope, khóa/mở khóa, thu hồi session, reset via controlled process, audit.
- Roles: SuperAdmin/Admin, BossViewer, CatalogManager, WarehouseStaff, Sales/CS, ContentWriter, SEOEditor, Finance, Auditor; ma trận `contracts/RBAC_MATRIX.csv` là cơ sở.
- Permission kiểm **mỗi endpoint và mỗi operation**, không chỉ menu. Nguyên tắc least privilege; deny by default; cấm gỡ admin cuối cùng hoặc tự cấp cao hơn quyền của mình.

### B10. Thiết lập & hệ thống (FR-AD-280..300; P1/P2)
- Company legal/public contact, logo/favicons, social, navigation, footer policy, sitemap base URL/domain; setting có version/audit.
- Payment configuration: provider env/secrets nằm server (không show full secret); quản trị chỉ thấy masked values; không đưa bank login vào DB.
- Shipping config manual rates, thresholds, support zones (P2), status system/health read-only, background jobs page.
- Backup schedule/status/restore drill logs (không cho download full PII dump vô điều kiện), audit filtering, security access log summary.
- Import/export CSV tôn trọng quyền, tránh CSV formula injection, encoding UTF-8 BOM nếu cần mở Excel VN.

## C. Quy tắc bắt buộc xuyên suốt
- Mọi thay đổi trạng thái phải có actor và timestamp, chuyển trạng thái theo state machine.
- Dùng transaction cho kho/giỏ đặt hàng/khuyến mãi/thanh toán; kiểm concurrency, idempotency.
- Dữ liệu order giữ snapshot giá, tên, SKU, ảnh, địa chỉ, phí ship, discount tại thời điểm mua. Sửa product sau đó không thay order cũ.
- Ẩn sản phẩm/danh mục không cho mua mới nhưng lịch sử đơn và ledger phải tồn tại.
- Các trạng thái rỗng/loading/error phải có UI; lưu dữ liệu khi submit thất bại chỉ khi an toàn; chống double-submit.
- Page SEO chỉ hiển thị `published`, ẩn draft/unlisted theo policy; không đưa preview token vào sitemap.
- Hình, nội dung quảng cáo và SEO không được chứa thông tin sản phẩm y tế/hiệu quả không có chứng cứ/phê duyệt.

## D. Định nghĩa hoàn thành mức feature
`DONE = database/migration + service validation + API + permission + UI desktop/mobile + audit nếu mutation + automated tests + docs + demo evidence`. Nếu thiếu bất kỳ lớp nào, trạng thái = partial. Không coi mock screen hoặc hardcoded JSON là hoàn thành.
