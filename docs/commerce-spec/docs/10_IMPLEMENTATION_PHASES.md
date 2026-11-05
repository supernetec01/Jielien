# 10 — Kế hoạch triển khai incrementally theo Codex / Spec Kit

## Chiến lược
Đề nghị 7 phase/PR tách biệt, mỗi phase có migration (nếu cần), API, UI, tests, docs, release notes. Không làm lại từ đầu hệ thống Node/Postgres đang dùng. Giữ source tests and database dữ liệu cũ. P0 chuẩn bị baseline/backup; P1 UI; P2 Catalog; P3 Warehouse; P4 CMS SEO; P5 Admin/marketing; P6 production hardening. Để đáp ứng mục tiêu SEO, P4 bắt buộc trước khi gọi hoàn thành public website.

## P0 — Baseline, kiểm thử, bảo toàn dữ liệu, LAN
**Task IDs T000-T019.** Clone/open đúng repo; record HEAD; run baseline automated tests; viết report pass/fail; snapshot schema and safe backup; freeze API contracts existing; configure env binding IP host and firewall instructions with secure defaults; boot smoke LAN on second machine (nếu có hardware), DB not publicly exposed; backup/restore runbook; add migration staging harness. **Exit:** data retained, no regressions, health ok, LAN documented, baseline committed.

## P1 — Design system & storefront Jielien identity
**T020-T049.** Logo source in `assets/` as supplied; derive production safe logo assets without redrawing; tokens colors `#86B529` green, `#0B1B34` navy, `#F2F7E6` soft green, `#FFFFFF`; remove old pink variables in `style.css`, `management.css`, inline/JS; create shared brand/theme tokens and reusable components, home/catalog/PDP/cart/checkout/account/admin shell responsive, SEO-ready page layouts. **Exit:** reviewed screenshot mobile + desktop each view, no broken checkout & a11y baseline.

## P2 — Full Catalog CRUD and SKU/Media
**T050-T099.** Add product extended fields/migrations, category/brand/attributes, variants combinations and unique SKU/barcode, product/variant media and durable upload, edit/publish/unpublish/archive, CSV preview/import/export with stable field mappings, audit/version conflict. Public listing/detail use DB, not fake catalog. **Exit:** a new company product with 3 variants + images + description, published and purchasable from second LAN computer; old product URLs preserved.

## P3 — Inventory docs, returns, staff RBAC
**T100-T149.** Add roles/permissions and role assignment, staff admin UI and 401/403 tests. Warehouse receipt/issue/transfer/stocktake and damaged returns, concurrent locks, movements, reversal and audit, returns/RMA preliminary; optional refunds separate and manual approval. Orders update UI, history; no double stock. **Exit:** stock receipt and normal→damaged transfer posted once, only permitted staff can operate, backup restored validates counts.

## P4 — CMS news, article workflow, technical SEO (must-have)
**T150-T199.** Add article/category/tag/revision/publish jobs/relations/redirect tables; admin rich editor server sanitation and preview, publish schedule by Job, article pages, listing, internal product links, sitemap.xml/robots, SSR or pre-render dynamic HTML, canonical/meta/schema, status/redirect, noindex staging. **Exit:** article created/approved/published; Google-style HTML inspection via curl, JSON-LD validated, changed slug 301, draft private; SEO index disabled on LAN.

## P5 — Full Admin operations, promotions, settings and analytics
**T200-T249.** Complete Admin dashboard, filter/search/export orders/products/inventory, coupon CRUD and fair usage caps, banner/collection management, site settings logo/nav/footer/SEO, reports and audit/reconciliation UI, business metrics definitions. **Exit:** boss can view reports only, content can manage news but not finance, promo changes work in checkout correctly, no fabricated stats.

## P6 — Hardening, UAT, release public-readiness
**T250-T299.** QA end-to-end, responsive/accessibility/security, load/perf, backup/restore drill, input/permissions audit, real domain HTTPS prep, production env template with secrets ignored, analytics with consent where applicable, docs & maintenance. Public launch is **separate explicit decision**; do not open user data on Internet automatically. **Exit:** phase scorecard all P1 mandatory done; no outstanding critical bugs, restore evidence, documentation, PR reviewed.

## Thứ tự phụ thuộc
`P0 -> P1 -> P2 -> P3`, `P2 -> P4`, `P3 + P4 -> P5 -> P6`. P4 may develop in parallel with P3 if distinct migration/API naming avoids conflict and tests isolated. SEO routes depend on stable product/article data. Staff rights depend on P3 but early P2 can use existing admin role with tests.

## Implementation discipline
- Tạo branch `feature/jielien-ecommerce-v2` hoặc PR per phase, không force-push main.
- Mỗi task ghi: `Objective`, `Files expected`, `DB migration`, `API contract`, `Test coverage`, `Acceptance criteria`, `Risks/rollback`. Codex tự audit file mappings trước touch; docs không phải blanket permission sửa dữ liệu.
- Không đổi `db/migrations/001_core.sql` và `002_bank_transfers.sql`; mọi thay đổi schema bằng file `003_*` trở đi, checksummed.
- Nếu phát hiện database migration conflicts hoặc source khác baseline, update gap report và điều chỉnh kế hoạch trước code; không reset.
- Không tự thay payment provider / shipping carrier live. Integration không có API credentials phải là interface adapter + disabled UI, không giả successful payment.
- Các chức năng P3 optional không block core release nếu đã đánh dấu out of scope, nhưng **catalog CRUD, image, CMS, SEO, admin and LAN** là mục tiêu bắt buộc của yêu cầu này.

## Đầu ra Codex mỗi phase
1. `PR` link và commits, `CHANGELOG.md`/release notes.
2. Bảng file thay đổi: purpose + database migration.
3. `npm test` / browser results, test environment & limitations.
4. Screenshot UI trước/sau; đường dẫn test fixtures.
5. Hướng dẫn deploy Docker Win, rollback code, backup/restore.
6. Danh sách chức năng DONE / PARTIAL / DEFERRED, lỗi còn tồn.
