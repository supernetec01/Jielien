# Tasks — implementation-ready backlog (Spec Kit-compatible)

**Marker:** `[ ]` chưa triển khai, `[x]` chỉ khi Codex có code+tests evidence. `[P]` parallel khi không xung đột schema. ID là mục tiêu triển khai, không phải mã commit. Mọi task có Definition of Done theo `docs/09_QA_ACCEPTANCE.md`. Codex cập nhật statuses sau từng PR.

## Phase P0: prerequisite và dữ liệu
- [ ] T001 Scan HEAD, branch, `git status`, dependency, tests; ghi file-mapping baseline + GAP, phát hiện source diverge.
- [ ] T002 Validate test env isolated PostgreSQL, run all existing tests, report failures and reasons.
- [ ] T003 Snapshot schema & row counts; backup DB/media + restore rehearsal; document checksum and recovery.
- [ ] T004 [P] Add config `JIELIEN_BIND_IP` safely; keep localhost default; LAN opt-in Windows Docker.
- [ ] T005 [P] Update local docs to check Windows Private firewall/subnet/DHCP reservation; no public db exposed.
- [ ] T006 Build migration CI guard: immutable checksums 001/002, validate forward-only 003+, test populate DB upgrade.

## Phase P1: UI/UX Jielien
- [ ] T020 Preserve original logo; create appropriately optimized transparent assets without altering identity; add favicon, alt, aspect ratio.
- [ ] T021 Build `brand.css` tokens, replace old pink theme across both CSS and inline styles.
- [ ] T022 [P] Rework header/footer/nav/search/hero banners for responsive Jielien storefront.
- [ ] T023 [P] Rework cards, category listing, filters, PDP gallery/selector, breadcrumbs.
- [ ] T024 [P] Rework cart/checkout/confirmation/order lookup, maintain functionality.
- [ ] T025 [P] Rework account login/register/profile/orders, preserve auth.
- [ ] T026 [P] Rework admin shell/dashboard/table/form/dialog/list/mobile UI.
- [ ] T027 Add shared a11y states (error/loading/empty/focus/dark-on-navy); screenshot 320/375/768/1440 and functional regression.

## Phase P2: Catalog + SKU + media
- [ ] T050 Design migrations for extended products/variants/categories/brands media and SEO metadata, keep legacy columns.
- [ ] T051 Build service for product CRUD with soft archive and `version` conflict; validate names/slugs/categories/status.
- [ ] T052 Build SKU matrix/variant option groups, unique SKU/barcode/combination and per-variant price/media/weight.
- [ ] T053 Build authenticated media upload, MIME/limits/sanitize/thumb/alt and persistent storage + backup.
- [ ] T054 Create admin product list advanced filters/search/pagination + product editor tabs (info, SKU, media, SEO, publish).
- [ ] T055 Create admin category tree/brand/attributes CRUD; validate category cycle and usage restrictions.
- [ ] T056 Create product publish checklist, preview, 301 slug redirect, public API & category/product render DB.
- [ ] T057 Implement CSV import/export with dry-run per row validation, mode create/update and audit, prevent stock direct writes.
- [ ] T058 Verify legacy catalog URL/variant id/order snapshots and two-staff edit 409 tests.

## Phase P3: Inventory/Staff/Returns
- [ ] T100 Add RBAC permissions/roles via migration (not public self-service), mapping and staff session-revoke.
- [ ] T101 Build admin staff list/invite/role/suspend + audit, block last admin disable.
- [ ] T102 Add inventory_documents/items migration for receipt/issue/transfer/stocktake.
- [ ] T103 Implement draft/submit/approve/post with transaction locks, idempotency and immutable movement ledger.
- [ ] T104 Implement UI for movement documents, warehouse SKU balances, alerts and audit.
- [ ] T105 Add return_requests/items and damage disposition normal/damaged, order quantity bounds.
- [ ] T106 Add manual refund approvals and payment evidence status (if P2 approved); don't fake bank transfer completion.
- [ ] T107 Add order management UX filters/timeline/tracking manual; preserve existing statuses.
- [ ] T108 Concurrency suite: 2 checkout last item, double-post transfer, role bypass, payment manual idempotency.

## Phase P4: CMS/news/SEO mandatory
- [ ] T150 Add article_category/tag/article/revision/publish job/workflow tables, related product links and seo_redirects.
- [ ] T151 Build Article CRUD/validations with rich blocks sanitation, draft autosave and version conflicts.
- [ ] T152 Build review/approve/reject/preview/schedule/publish/archive services with permissions & audit.
- [ ] T153 Build scheduler idempotent locking due jobs and retry; respect Asia/Ho_Chi_Minh display, UTC DB.
- [ ] T154 Build CMS admin list/filter/editor/SEO sidebar/preview/revisions and mobile responsive states.
- [ ] T155 Build `/tin-tuc`, category/tag, article detail with real DB, related product embeddings.
- [ ] T156 Build server-rendered/prerendered HTML SEO for product/category/article, real 301/404 statuses.
- [ ] T157 Build canonical/meta/OG/JSON-LD Product+Offer/Article/Breadcrumb, sitemap, robots, staging noindex.
- [ ] T158 Integrate SEO quality validators, HTML curl tests, product stock markup consistency, slug redirect tests.

## Phase P5: content merchandising, finance reporting, settings
- [ ] T200 Build hero banners/collections management with schedule and media, linked storefront rendering.
- [ ] T201 Build coupon/promotion CRUD and validation with existing order/coupon transaction logic; preserve old promo codes.
- [ ] T202 Build admin site settings (company logo, nav, footer, contact, public base URL) with whitelisted nonsecret fields.
- [ ] T203 Build reports dashboard with explicit GMV vs collected vs refunds definitions, filters and CSV permission.
- [ ] T204 Build audit filters and permission-aligned export, safe CSV escaping.
- [ ] T205 Add operational status widget (health/backup/job status) without exposing env/database secrets.

## Phase P6: hardening/release
- [ ] T250 Run full migration populated-copy tests and `npm test`, all browser and UAT; fix regressions.
- [ ] T251 Run security checks: RBAC IDOR, CSRF, XSS, open redirects, upload, SSRF, rate limiting.
- [ ] T252 Run accessibility contrast/keyboard/mobile tests, screenshot comparisons per critical page.
- [ ] T253 Run SEO validation of initial HTML, schema, robots/sitemap/canonical, 404 and 301.
- [ ] T254 Run load/Lighthouse lab against controlled environment; store baseline & results.
- [ ] T255 Finalize restore/rollback runbook, production HTTPS example, no open public until owner approves.
- [ ] T256 Produce user-facing Vietnamese release notes: DONE/PARTIAL/DEFERRED + commands + PR links + limitations.

## Dependencies
P0 before destructive-risk work. P1 and P2 client work may parallel `[P]`; P2 DB model before P4 product SEO; RBAC before distributed editing rollout; P4 before public SEO-ready label. Distinct branches/PRs for potentially conflicting task families.

## Completion evidence per task
Link to exact git files or diff, migration number, tests name/result, screenshot path, API example, rollback; task only `[x]` after documented evidence and acceptance reviewer. If no environment tools, mark blocked and explain, do not fake.
