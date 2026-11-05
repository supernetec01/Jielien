# 03 — Bộ thiết kế UX/UI JIELIEN INTERNATIONAL

## 1. Brand brief và nguyên tắc
**Mục tiêu hình ảnh:** Jielien = chuyên nghiệp, tin cậy, gọn gàng, hiện đại, vẫn thân thiện với khách mẹ & bé. Không dùng toàn bộ nền hồng của demo trước. Giữ **logo người dùng gửi** ở `assets/jielien-logo-original.jpg` làm nguồn nhận diện; không vẽ lại hình JL tùy tiện.

**Từ khóa:** Fresh & Trust · Premium Clean Commerce · Content-first SEO · Operational Clarity.

### Tokens bắt buộc
| Token | Hex / giá trị | Dùng ở đâu |
|---|---|---|
| `--brand-green` | `#86B529` | CTA accent, viền active, nhấn giá/khuyến mãi có tiết chế |
| `--brand-green-hover` | `#739C20` | Hover button |
| `--brand-navy` | `#0B1B34` | Header/footer, tiêu đề, sidebar |
| `--brand-navy-2` | `#142943` | Header hover/sidebar hover |
| `--green-subtle` | `#F2F7E6` | Category strip, tag nền, banner |
| `--surface` | `#FFFFFF` | Card, modal, input |
| `--canvas` | `#F7F9FC` | Nền khu vực nội dung, admin |
| `--text-main` | `#0B1B34` | Nội dung trên nền sáng |
| `--text-muted` | `#64748B` | Nhãn phụ, timestamp |
| `--border` | `#E3E9EE` | Divider/outline |
| `--success` | `#16784A` | Trạng thái xác nhận, không dùng để nhầm với brand CTA |
| `--warning` | `#9A6000` | Chờ xử lý/hàng sắp hết |
| `--danger` | `#C53030` | Thất bại, hết hạn, hủy |
| `--focus` | `#4A77B8` | Focus-visible dễ phân biệt |

**Typography:** ưu tiên system stack hỗ trợ tiếng Việt (`Inter`, `Arial`, `system-ui`, sans-serif); không bắt buộc tải font ngoài; body 16px web, admin 14–16px, line-height 1.5–1.7, H1 ~32–42 desktop / 26–30 mobile. Không phát tán tệp font. **Spacing:** 4/8/12/16/24/32/48/64. **Radius:** 8px controls, 12px cards, 16–20px large cards. **Shadow:** nhẹ, không nhiều glow. **Grid:** content max-width 1280px (hoặc 1220px để tận dụng code), 12 columns desktop, 4 mobile.

**Bảo đảm tương phản:** text navy trên `#86B529` cho CTA; không dùng chữ trắng nếu tương phản không đủ. `#64748B` trên trắng cần đo kiểm WCAG thực tế. Trạng thái phải có chữ và icon, không phụ thuộc duy nhất màu.

### Cấu trúc file CSS đề xuất
- `public/brand.css`: token base/themes/shared resets; cần load trước `style.css`/`management.css`.
- `public/style.css`: storefront component/page layouts; thay `--pink`, `--pink-dark`, `--pink-light` bằng semantic tokens; xóa fallback pink còn tồn.
- `public/management.css`: account/admin shell, tables/form/state.
- JS chỉ thêm class semantic, **không inject màu hardcoded inline** trừ style động có kiểm soát (ví dụ progress width).
- Nếu muốn CSS modules/utility thì cần ADR + regression tests; không mặc định rewrite SPA sang framework.

### Logo xử lý
1. Có file JPEG gốc có nền trắng và vùng trống: copy giữ nguyên trong assets/source; tạo bản logo ngang dùng header, bản compact mobile, favicon 32/48/180 cho web theo tài nguyên cho phép.
2. Prefer SVG do công ty cung cấp. Nếu chỉ có JPEG, có thể xử lý khoảng trống/raster resize, không thay hình dáng JL hoặc khoảng cách chữ; tránh auto-trace chưa được duyệt làm méo thương hiệu.
3. Logo ở header phải link `/`, có `alt="Jielien International"`, bản icon trên mobile/manifest. Không thay văn bản HTML thành hai màu JIE/LIEN rời rạc nếu đã có logo.

## 2. Information architecture — khách hàng
```
Header: [JL Logo] [Danh mục ▼] [Tìm kiếm________________] [Tài khoản] [Đơn hàng] [Giỏ hàng]
Nav: Trang chủ | Danh mục | Thương hiệu | Ưu đãi | Tin tức | Giới thiệu | Liên hệ
Home
 ├ Banner / CTA → danh mục/collection
 ├ Danh mục nổi bật → Listing
 ├ Sản phẩm nổi bật → Product detail
 ├ Khuyến mãi → Listing
 ├ Bài viết mới → Article
 └ Chính sách / Footer
Listing → Filter/Sort → Product Detail → Variant → Add Cart → Cart → Checkout → Success/Tracking
News index → Category/Tag → Article → Related products → Detail
Account → Profile / Addresses / Orders / Security
```

**Route goals:** canonical main `/`, `/san-pham`, `/san-pham/:slug`, `/danh-muc/:slug`, `/thuong-hieu/:slug`, `/gio-hang`, `/thanh-toan`, `/tai-khoan`, `/tra-cuu-don-hang`, `/tin-tuc`, `/tin-tuc/:slug`, `/tin-tuc/chuyen-muc/:slug`, `/gioi-thieu`, `/lien-he`, `/chinh-sach/:slug`, `/quan-tri`. Giữ routing legacy hoạt động hoặc 301 với mapping.

## 3. UX chi tiết theo trang
### 3.1 Home
- Utility bar mỏng, thông tin thực tế về giao hàng/chăm sóc; header navy (logo thật), search nổi, icon có label, dropdown accessible.
- Hero split: 60% text/CTA, 40% ảnh (desktop), stacked mobile; headline max 2 dòng; không dùng ảnh quá nặng làm LCP; banner có publish schedule và vị trí riêng desktop/mobile.
- Category grid 4–6 column desktop, 2 mobile; hình vuông nền dịu, title rõ.
- Product groups: carousel horizontal nhưng có nút/keyboard và fallback grid; không trượt ngoài viewport.
- Organic content area: 3 article cards + link `/tin-tuc` rõ.
- Footer navy: công ty/địa chỉ/liên hệ/chính sách/social, không placeholder chưa xác nhận.

### 3.2 Listing/search
- Desktop 1 sidebar filter (260px) + grid 4 cột; tablet 2–3; mobile 2 cột, filter dạng bottom sheet/modal; clear filters và chips.
- Sorting tại top right; count `N sản phẩm`; skeleton khi fetch; facet values có số lượng nếu API cấp.
- Product card: ảnh tỷ lệ 1:1, badges góc trái, tên 2 dòng, price lớn, original + % giảm khi hợp lệ, CTA nút xanh, trạng thái hết hàng.
- Pagination URL tường minh để search crawler truy cập; không chỉ infinite scrolling không có link.

### 3.3 Product details
```
[Breadcrumb]
[Thumbnail] [ẢNH LỚN/GALLERY]  |  [Brand] [H1 Name]
                                |  [rating thật (nếu có)]
                                |  [GIÁ theo SKU]
                                |  [Thuộc tính: màu/quy cách]
                                |  [Tình trạng tồn]
                                |  [- qty +]  [Thêm vào giỏ] [Mua ngay]
                                |  [Giao hàng / Chính sách]
------------------------------------------------------------
[Thông tin] [Mô tả chi tiết] [Thông số] [Hướng dẫn] [FAQ]
[Ảnh mô tả trong nội dung / Video]
[Sản phẩm liên quan] [Bài viết liên quan]
```
- Variant selector dạng radio tiles/combobox có label; disabled out-of-stock nhưng vẫn show; đổi variant cập nhật UI đúng, URL shareable; focus quản lý sau AJAX.
- Giá/tồn hiển thị trên data từ server; ảnh có zoom chạm, mobile sticky cart CTA nhưng không che nội dung.
- Rich description dùng headings/table images tối ưu, có alt và lazy loading, sanitize HTML.

### 3.4 Cart/checkout
- Desktop two-column items + sticky order summary; mobile one-column summary collapse, CTA sticky hợp lý.
- Checkout: `Liên hệ → Giao hàng → Thanh toán → Kiểm tra đơn`; hiển thị rõ lỗi form, validate cả client và server, progress hoặc section headings.
- Hiển thị line item theo variant, stock alert, coupon apply/revoke, ước phí ship minh bạch, price updates. Submit disable khi pending, sau timeout dùng cùng idempotency key để retry.
- Success: order number, payment status thực, hướng dẫn VietQR nếu đang pending, tracking link; không khẳng định nhận tiền khi chưa đối soát.

### 3.5 News/article SEO
- Listing có tab/category cards, heading giới thiệu, featured, search và page links; thumbnail 16:9, author/date, reading time.
- Article: H1, featured image, thông tin tác giả, mục lục từ H2/H3, internal anchors, content max 760px, full-width images vừa phải, quote, comparison table, CTA liên quan, related articles.
- Head content server generated: title/meta/canonical/OG/JSON-LD; HTML có body article ngay cả khi không chạy JS.

### 3.6 Account
- Login/register sidebar hero nhẹ, form rõ, password reveal toggle, keyboard accessible, account dashboard, edit addresses, order cards, session errors.

## 4. UX Admin
### 4.1 Layout
- Desktop fixed sidebar 248px navy + header compact trên nền sáng; sidebar có icon nhỏ, nhãn luôn hiện, active green-subtle hoặc green accent; không dùng text green quá sáng trên nền trắng.
- Top bar: breadcrumb, search scoped, quick add product/article, notifications, profile.
- Tablet sidebar collapsible; mobile bottom nav hoặc drawer, tables scroll ngang có cột ID sticky (không che thao tác).
- Bảng: sorting, selection, filters, `Edit/View/Archive`, pagination, export; sticky header, skeleton, no-results.
- Form dài chia tabs: `Thông tin | Phân loại SKU | Media | Kho | SEO | Xuất bản`; sticky action footer `Lưu nháp`, `Xem trước`, `Xuất bản`.

### 4.2 Product editor — luồng dùng được ngay
1. `Thêm sản phẩm` → nhập tên/brand/category và mô tả → `Lưu nháp` sinh `product_id`.
2. Tạo attribute groups + values; click `Sinh các SKU` → preview matrix; tự đề xuất unique code, user được chỉnh.
3. Bảng SKU editable: ảnh/variant values/SKU/barcode/giá so sánh/giá bán/trạng thái/ngưỡng cảnh báo; validation inline theo cột; nếu hủy matrix cần xác nhận và không xoá SKU đã tham chiếu order.
4. Upload ảnh cover/gallery, alt, sort, mô tả media trong block editor. Media variant chọn từ library.
5. Nhập HTML/block mô tả/FAQ/spec, preview desktop/mobile.
6. SEO tab: slug, title, meta, OG, canonical readonly mặc định, warning độ dài là hướng dẫn chứ không tự block nếu hợp lệ.
7. `Publish` chạy checklist; nếu thiếu yêu cầu, show lỗi cụ thể; nếu pass, ghi audit và hiển thị link.
8. Khi hai người sửa cùng sản phẩm, người lưu sau nhận `409 version_conflict`, UI hiện so sánh/refresh, không ghi đè im lặng.

### 4.3 CMS editor
- Two-column article body/editor + SEO/publish sidebar desktop, mobile tabs; draft autosave có chỉ báo `Đã lưu lúc...`.
- Tác giả/SEO Editor có quyền khác nhau; nút Send for Review, Approve, Schedule/Publish theo permission, không chỉ UI gating.
- Preview URL tạm có auth + noindex; revision diff (text trước/sau), schedule queue status.
- Product embed chọn từ catalog có thật; nếu sản phẩm archived thì hide/recommend fallback không link 404.

### 4.4 Inventory, order, reports
- Warehouse: dashboard stock KPIs + per SKU detail; các phiếu nhập/transfer/stocktake; màu trạng thái và action confirm.
- Orders: list filter; detail timeline + customer summary + items snapshot + payment status + fulfillment actions; hành động nguy hiểm đòi reason/confirm.
- Reports: filters, metric definitions visible, date range, CSV export, timezone rõ.

## 5. Thành phần dùng chung — contract tối thiểu
`AppShell`, `PublicHeader`, `Footer`, `MegaMenu`, `SearchInput`, `Breadcrumb`, `ProductCard`, `Price`, `VariantSelector`, `MediaGallery`, `QuantityStepper`, `CartSummary`, `CouponBox`, `OrderStatusBadge`, `NewsCard`, `ArticleBody`, `AdminSidebar`, `KpiCard`, `DataTable`, `ToolbarFilters`, `Pagination`, `FormField`, `RichTextEditor`, `MediaPicker`, `ConfirmDialog`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton`, `PermissionGate`, `SEOFieldsPanel`, `PublishPanel`.

Mỗi component có: variants, disabled, loading, error, keyboard/focus states, responsive and a11y; không hardcode dữ liệu demo ở component.

## 6. Accessibility/Responsive/Performance
| Tiêu chí | Điều kiện nghiệm thu |
|---|---|
| Breakpoints | 320, 375, 768, 1024, 1440px; không x-overflow vô lý |
| Mobile touch | Các vùng chạm chính ~44px trở lên; form không quá nhỏ |
| Keyboard | Tab order logic; Enter/Space làm việc; Escape đóng dialog/drawer |
| Focus | `:focus-visible` rõ trên nền navy và trắng; sau modal focus trở về trigger |
| Form | `<label>` liên kết input; `aria-invalid`, error text được công bố; errors không chỉ đổi màu |
| Images | Dimension/aspect-ratio đặt trước, lazy ngoài fold, cover ưu tiên tải |
| Motion | Tôn trọng `prefers-reduced-motion`; tránh carousel tự chạy quá nhanh |
| Contrast | WCAG 2.2 AA mục tiêu, kiểm automated + manual |
| Performance | p75 mục tiêu LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 trên public HTTPS có traffic thực; local lab kiểm Lighthouse và ảnh nặng |

## 7. Visual acceptance
- Trang khách và admin không còn pink theme, trừ khi hình ảnh sản phẩm có màu pink tự nhiên.
- Logo giống nguồn công ty, không bị méo/mất chữ/đính nền trắng thô trên navy.
- Ảnh minh họa phải thay từ dữ liệu/asset hợp pháp; không làm mất alt và fallback.
- Chụp ảnh 8 view chính ở mobile 375px và desktop 1440px: home, listing, detail, cart, checkout, news listing, article, admin dashboard, product editor, CMS editor (cộng thêm nếu cần).
- Không chấp nhận "chỉ thay `#ed1164` bằng `#86B529`" mà không thay hệ component, bố cục và states.

## 8. Điểm liên hệ với tài liệu thiết kế trước
Đọc thêm `reference/PREVIOUS_UI_REDESIGN_SPEC.md`; nếu có khác biệt, **tài liệu này ưu tiên**. Tông Jielien là navy + green + white, không thiết kế web baby toàn pastel hoặc copy UI thương hiệu khác.
