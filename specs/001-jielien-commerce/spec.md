# Feature Spec: Jielien company e-commerce + admin + news SEO

**Input**: yêu cầu chủ website phát triển hệ thống bán hàng công ty hoàn chỉnh, SKU/tồn/ảnh, trang tin tức SEO, admin và rebrand theo logo Jielien. **Baseline** `supernetec01/Jielien` Git tree `c1e7b3bb0be2f421b2b82d780786e324020c069c` được xem ngày 2026-11-05; Codex phải đọc HEAD mới nhất.

## User stories (priority, acceptance)

### US-01 Storefront Jielien [P1]
Là khách hàng, tôi muốn xem trang chủ có nhận diện Jielien, tìm danh mục/sản phẩm, xem SKU và giá/tồn chính xác để mua. **Acceptance:** logo & design tokens theo `docs/03`; desktop/mobile; published products only; listing pagination/filter/sort; PDP SKU variant selects and updates data; no fake data; a11y.

### US-02 Catalog quản trị [P1]
Là người quản lý hàng hóa, tôi muốn CRUD product cha, nhiều SKU, ảnh/video, thông số, nội dung mô tả, SEO và publish. **Acceptance:** test 3 SKU variation across 2 attributes, price per variant, gallery per product/variant, uniqueness, conflict, draft/published, no deletion if referenced order.

### US-03 Checkout/order shared DB [P1]
Là khách, tôi muốn giỏ và checkout thông suốt; là nhân viên, tôi muốn xử lý đơn. **Acceptance:** quote from server; reserve stock once; idempotent order; snapshot immutable; existing COD/VietQR remains functional; order statuses valid.

### US-04 Inventory docs & return classification [P2]
Là nhân viên kho, tôi muốn nhập/chuyển/kiểm/nhận hoàn, phân loại kho thường/hư và có ledger. **Acceptance:** create→approve→post, no double post, no negative or reserved overspend, transfer atomic, return A normal/B damaged, event logs.

### US-05 CMS News/SEO [P1]
Là Content/SEO, tôi muốn tạo bài viết, ảnh, chuyên mục, lịch duyệt/xuất bản và nội dung SEO có thể tìm kiếm. **Acceptance:** article draft/review/publish/schedule; HTML main content on first response, meta/canonical, sitemap, JSON-LD, redirect, old slugs; private drafts excluded.

### US-06 Admin/RBAC [P1]
Là Admin, tôi muốn giao quyền cho nhân viên; là Boss, tôi chỉ muốn xem báo cáo; là nhân viên, tôi được phép thao tác đúng nhiệm vụ. **Acceptance:** server-side RBAC on every endpoint, staff manage UI, no public admin grants, revoke session, audit.

### US-07 LAN then public readiness [P0/P3]
Là IT, tôi muốn website chạy trên IP LAN với shared PostgreSQL; sau này có thể đưa lên domain HTTPS mà không mất dữ liệu. **Acceptance:** compose bind controlled, no db exposed, health & second machine test, backup restore tested, production config documented.

## Cross-cutting requirements
- Security and privacy: least privilege, session CSRF, database parameterization, upload validation, XSS sanitizer, audit, backup restore.
- UX: user errors/retry, editable forms, mobile responsive, keyboard accessible, consistent green/navy/white.
- SEO: crawlable server HTML; published only; canonicals/sitemaps/robots and valid Product/Article schema.
- Data integrity: existing IDs, tables and old orders preserved; additive migrations; transactions for inventory/checkout.
- Nonfunctional: configurable hosts and URLs, diagnostics, CWV targets, isolated e2e test DB.

## In/out of scope
**In mandatory:** P0–P1 features, catalog/admin/media/CMS/SEO, preserve checkout, LAN. **In expanded:** P2 stock documents/RMA, promo/settings/report/role workflows. **Out until approved/provider available:** automatic payment gateway reconciliation, automatic shipping label/carrier API, TikTok/Shopee sync, CRM marketing automation, multilingual machine-translated SEO live, actual public launch, product claims outside compliance.

## Decisions to preserve
35 existing domain tables + schema_migrations, `product_variants.id` is existing SKU identifier, `orders.order_number` is external ID, VND integer, DB main PostgreSQL17, backend Node24, browser client vanilla JS, canonical URL `PUBLIC_BASE_URL` future.

## Use cases, data and acceptance links
See `docs/02_PRODUCT_REQUIREMENTS.md`, `docs/04_DATA_MODEL.md`, `docs/05_USE_CASES_WORKFLOWS.md`, `docs/06_API_RBAC.md`, `docs/07_CMS_NEWS_SEO.md`, `docs/09_QA_ACCEPTANCE.md`.
