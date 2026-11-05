# 06 — Hợp đồng API, validation, RBAC và response semantics

## Nguyên tắc
- **Giữ nguyên** các endpoint đã có `/api/...` từ `server.mjs` và định dạng response client đang dùng; mở rộng theo feature hoặc version có backward compatibility. Không đổi tất cả thành framework khác chỉ để thêm CMS.
- Mọi API admin yêu cầu session HttpOnly cookie + CSRF trên mutation (theo pattern hiện tại). CORS không mở `*` cùng credentials. Permission enforce bên server, không chỉ JS.
- DTO chỉ trả field hợp lệ: không lộ `cost_price`, `password_hash`, bank config secrets, sessions, raw tokens, notes nội bộ, địa chỉ/phone khách trong public responses.
- Pagination mặc định `limit=20`, max=100; sorting whitelist; filter sanitized; tránh `SELECT *` returning secrets; 400/401/403/404/409/413/422/429/500 có format lỗi thống nhất. API response chứa `requestId` nếu tiện để tra log.
- Mutation có optimistic concurrency: client gửi `version`/`If-Match`; server kiểm trong transaction, update `version=version+1`, trả `409 version_conflict` nếu khác.
- Monetary giá VND: integer (không float); parse safe integer; price/cart/discount/stock luôn tính lại server; body size có giới hạn, upload stream riêng.

## API đang có cần bảo toàn
`GET /api/health`, `/api/products`, `/api/categories`, `/api/brands`, `/api/payment-methods`, `/api/auth/me`, `POST /api/auth/register|login|logout`, `PATCH /api/account/profile`, `POST /api/account/password`, CRUD addresses, `/api/cart`, `POST /api/quote`, `POST /api/orders`, `POST /api/orders/lookup`, GET order authorized, `GET /api/admin/dashboard|products|orders|inventory|audit`, `PATCH /api/admin/variants/:id`, `/api/admin/orders/:code/status`, `POST /api/admin/orders/:code/payment|bank-transfer`, `POST /api/admin/inventory/adjust`. Đối chiếu code HEAD trước sửa.

## API mới theo domain — contract tối thiểu
| Method | Path đề xuất | Permission | Body chính / semantics |
|---|---|---|---|
| GET | `/api/catalog/search` | public | q, category, filters, sort, page; trả paged products |
| GET | `/api/catalog/products/:slug` | public | product + actual variants, image gallery, media + pricing/availability |
| GET | `/api/catalog/categories/:slug` | public | category tree + SEO settings, active only |
| GET | `/api/news` | public | published only + page, category/tag, search |
| GET | `/api/news/:slug` | public | published article rendered public-safe, no drafts |
| GET | `/api/admin/catalog/products` | catalog.read | filtered list, offset/cursor |
| POST | `/api/admin/catalog/products` | catalog.create | create draft parent; 201 location, id, version |
| GET/PATCH | `/api/admin/catalog/products/:id` | catalog.read/edit | payload + version, 409 conflicts |
| POST | `/api/admin/catalog/products/:id/publish` | catalog.publish | prerequisite validation, return public URL |
| POST | `/api/admin/catalog/products/:id/archive` | catalog.archive | soft archive + audit |
| POST | `/api/admin/catalog/products/:id/variants` | catalog.edit | create SKUs incl attribute map; duplicate validation |
| PATCH | `/api/admin/catalog/variants/:id` | catalog.edit | variant fields + version; preserve old PATCH compat |
| CRUD | `/api/admin/catalog/categories` | catalog.manage | category tree, slug uniqueness and parent cycle prevention |
| CRUD | `/api/admin/catalog/brands` | catalog.manage | brand logos/SEO/status |
| CRUD | `/api/admin/catalog/attributes` | catalog.manage | type, values, sort |
| POST | `/api/admin/media/uploads` | media.upload | multipart upload, AV/size/type checks; 201 asset metadata |
| GET | `/api/admin/media` | media.read | list/search/pagination |
| POST | `/api/admin/inventory/documents` | inventory.manage | receipt/issue/transfer/stocktake draft |
| POST | `/api/admin/inventory/documents/:id/submit` | inventory.manage | draft→submitted |
| POST | `/api/admin/inventory/documents/:id/approve` | inventory.approve | approver, reason and audit |
| POST | `/api/admin/inventory/documents/:id/post` | inventory.post | atomic ledger and balance writes |
| POST | `/api/admin/returns` | returns.manage | RMA initial, bounded by delivered qty |
| PATCH | `/api/admin/returns/:id` | returns.manage | inspection/damaged classification |
| POST | `/api/admin/refunds/:id/approve` | refunds.approve | dual control, don't auto mark paid |
| GET | `/api/admin/cms/articles` | content.read | filter by status, author and category |
| POST | `/api/admin/cms/articles` | content.write | draft with version |
| GET/PATCH | `/api/admin/cms/articles/:id` | content.read/write | content blocks, SEO, version |
| POST | `/api/admin/cms/articles/:id/submit` | content.write | submit review, revision snapshot |
| POST | `/api/admin/cms/articles/:id/approve` | content.approve | approve reviewed revision |
| POST | `/api/admin/cms/articles/:id/publish` | content.publish | publish now/schedule, server validates |
| POST | `/api/admin/cms/articles/:id/preview` | content.read | return expiring authenticated preview URL; noindex |
| GET | `/api/admin/cms/articles/:id/revisions` | content.read | immutable version history |
| CRUD | `/api/admin/cms/categories` | content.manage | article taxonomy |
| CRUD | `/api/admin/cms/tags` | content.manage | tag management |
| CRUD | `/api/admin/seo/redirects` | seo.manage | strict 301 paths, detect loops/chains |
| GET/PATCH | `/api/admin/settings/site` | settings.read/write | brand/nav/footer/public data only |
| GET | `/api/admin/users` | users.read | masked PII, paging |
| POST/PATCH | `/api/admin/users/:id/roles` | users.manage | assign allowed roles + audit |
| POST | `/api/admin/users/:id/revoke-sessions` | users.manage | invalidate sessions |
| GET | `/api/admin/reports/summary` | reports.read | metric definitions, date filters |
| GET | `/sitemap.xml`, `/robots.txt` | public | dynamic valid XML/plain text per environment |

## Đề xuất REST payloads (ví dụ, không phải code đã có)
**POST `/api/admin/catalog/products`**
```json
{"name":"Bình sữa 240ml","brandId":7,"primaryCategoryId":12,"categoryIds":[12],"shortDescription":"Bình sữa sử dụng hằng ngày","descriptionBlocks":[{"type":"paragraph","text":"Mô tả đã kiểm chứng"}],"status":"draft"}
```
→ `201 {"product":{"id":101,"status":"draft","version":1}}`. SKU cần tạo qua API variants; không dùng `stock` tự do trong product DTO.

**POST `/api/admin/catalog/products/101/variants`**
```json
{"variants":[{"sku":"JL-BINH-240-XANH","name":"Xanh / 240ml","attributeValueIds":[5,8],"price":179000,"originalPrice":199000,"status":"active"},{"sku":"JL-BINH-240-HONG","name":"Hồng / 240ml","attributeValueIds":[6,8],"price":179000,"status":"active"}],"version":1}
```
→ `201` variants + new product version. SKU/barcode unique; combination unique per product; rollback toàn bộ batch nếu invalid.

**PATCH `/api/admin/cms/articles/71`**
```json
{"version":4,"title":"Chọn bình sữa theo độ tuổi","slug":"chon-binh-sua-theo-do-tuoi","excerpt":"Hướng dẫn lựa chọn","categoryId":3,"tagIds":[1,5],"contentBlocks":[{"type":"heading","level":2,"text":"Tiêu chí"},{"type":"paragraph","text":"Nội dung biên tập"}],"seo":{"title":"Cách chọn bình sữa theo độ tuổi | Jielien","description":"Hướng dẫn lựa chọn phù hợp."}}
```
→ `200 {"article":{"id":71,"version":5,"status":"draft"}}` hoặc `409 {"error":"version_conflict","currentVersion":5}`; không làm mất draft người khác.

**Common error**
```json
{"error":"validation_error","message":"Dữ liệu chưa hợp lệ","details":[{"field":"variants[1].sku","code":"duplicate","message":"SKU đã tồn tại"}],"requestId":"req-opaque"}
```

## Quyền theo actor (tóm tắt; xem CSV)
- Admin: users/role/settings/audit và mọi action quản trị được cấu hình; không hardcode user id.
- Boss: `reports.read`, `audit.read`, `catalog.read`, `orders.read`, `inventory.read` theo nhu cầu; **read-only mặc định**.
- CatalogManager: catalog.create/edit/publish, media; không duyệt hoàn tiền, không sửa quyền.
- WarehouseStaff: inventory.read/receipt/transfer/stocktake; quyền approve/post tách biệt nếu kiểm soát 2 người.
- Sales: orders.read/manage, returns.request, customer-contact masked; không xem giá vốn.
- Writer: content.write own/draft, preview; không publish.
- SEOEditor: content.review/publish, seo.manage, cms taxonomy; không thao tác bank/payment.
- Finance: payments.reconcile, refunds.approve, finance.read_cost, reports.read.
- Customer: chỉ dữ liệu own; public endpoints là quyền read không có PII.

**Nguyên tắc:** permission mới được seed qua **migration additive**; gán role mới explicit; legacy admin tự nhận permission quản trị mới theo policy có audit/migration, không nâng quyền legacy customer. Loại trừ privilege escalation từ invite/public register. Không dựa vào user-supplied `role` trong API public.

## Authentication và browser
- Cookie session `HttpOnly`, `SameSite=Lax`, `Secure` khi HTTPS production; CSRF token theo phiên và origin; login throttling per-IP + per-account với proxy trust config chính xác.
- Log auth failures without credentials; revoke all sessions on password change/lock staff; add sensitive action re-auth/2FA when feasible.
- CORS same-origin unless explicit allowlist HTTPS; không chấp nhận origin tùy ý của client.
- Upload static assets không cho executable/HTML/SVG scripts; preview content sanitized server side.

## Contract/API test bắt buộc
- Guest `GET public` ok; guest POST admin 401; customer POST admin 403; role cụ thể 200/201; disallowed 403.
- Existing API and browser tests pass unchanged unless justified migration contract change + explicit compatibility tests.
- Concurrent SKU update 1 success/1 version conflict; concurrent checkout 1 stock available 1 order success, next 409; same idempotencyKey retry same result.
- Draft article accessible only authorized preview, not via `/api/news`, sitemap, client HTML or cache.
