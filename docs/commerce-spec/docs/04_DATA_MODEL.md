# 04 — Thiết kế cơ sở dữ liệu PostgreSQL, quan hệ, ràng buộc, migration

## 1. Bối cảnh và quy ước
Schema **đang có 35 bảng domain** (migration `001_core.sql`, `002_bank_transfers.sql`) phải **giữ nguyên**, chưa có các bảng CMS SEO. Danh mục bên dưới phân loại `EXISTING / ALTER / NEW`. Đây là **data model triển khai mục tiêu**, không phải bằng chứng code đã tồn tại.

**Dữ liệu:** id `BIGINT IDENTITY`; tiền `BIGINT` nguyên VND; timestamps `TIMESTAMPTZ` UTC; hiển thị Asia/Ho_Chi_Minh; thêm `version INTEGER DEFAULT 1` cho optimistic concurrency; status enum `TEXT CHECK`, không sửa/đổi enum không có migration. Unique index có thể phân biệt chữ hoa/thường dựa vào chuẩn hóa đầu vào và expression index; `deleted_at` chỉ dùng khi soft delete có đánh giá FK. Không dùng float VND.

**Bất biến:**
1. Product parent ≠ Variant: `product_variants.id` hiện là SKU/id được dùng làm catalog/cart route; không di chuyển/đổi định nghĩa.
2. `SKU` unique toàn hệ thống (normalize upper-case trim); một product có 1–N variants, mỗi combination thuộc tính duy nhất theo product.
3. `barcode` non-empty unique toàn hệ thống (existing partial unique).
4. Available sellable = sum(`on_hand - reserved`) qua active normal warehouses; damaged excluded.
5. Không update/tính lại dữ liệu snapshot `order_items`, `orders` sau mua từ product live.
6. Media không phụ thuộc đường dẫn source code container; lưu durable volume/object storage, backup.
7. Mỗi bản sửa product/article/catalog có actor+audit; published article có revision bất biến của nội dung hiển thị.
8. Slug thay đổi phải có redirect mapping tránh mất SEO; canonical target hợp lệ và không loop.
9. Ràng buộc `CHECK`, FK, UNIQUE và transaction cùng kiểm tra nghiệp vụ ở service (không chỉ UI).

## 2. Bảng EXISTING — tái sử dụng (35 bảng)
- IAM: `users`, `user_addresses`, `user_sessions`, `roles`, `permissions`, `user_roles`, `role_permissions`.
- Catalog: `brands`, `categories`, `products`, `product_categories`, `product_variants`, `product_media`, `attributes`, `attribute_values`, `variant_attribute_values`, `product_specs`.
- Commerce: `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `payments`, `payment_events`, `bank_transfer_details`.
- Inventory: `warehouses`, `inventory_balances`, `inventory_movements`, `inventory_reservations`, `shipments`.
- Marketing/audit/legacy: `promotions`, `coupons`, `coupon_redemptions`, `audit_logs`, `legacy_imports`.
- Schema control: `schema_migrations` (không tính vào 35 domain).

### 2.1 ALTER existing catalog fields (migration mới, additive)
| Bảng | Cột mới đề xuất | Type / ràng buộc | Mục đích |
|---|---|---|---|
| `products` | `short_description` | TEXT NOT NULL DEFAULT '' | Summary ở PDP/listing |
| `products` | `content_json` | JSONB NOT NULL DEFAULT '{}'::jsonb | Rich content block dạng schema/version, sanitize |
| `products` | `primary_category_id` | BIGINT NULL REFERENCES categories | Breadcrumb primary |
| `products` | `published_at` | TIMESTAMPTZ NULL | thời điểm public |
| `products` | `seo_title`, `seo_description`, `og_image_url` | TEXT nullable | metadata public |
| `products` | `version` | INT NOT NULL DEFAULT 1 CHECK >0 | conflict edit |
| `products` | `archived_at` | TIMESTAMPTZ NULL | soft archive |
| `product_variants` | `cost_price` | BIGINT NULL CHECK >=0; **admin finance only** | giá vốn cho report P2 |
| `product_variants` | `weight_grams`, `length_mm`, `width_mm`, `height_mm` | INT nullable CHECK>=0 | cân nặng/đóng gói |
| `product_variants` | `low_stock_threshold` | INT NOT NULL DEFAULT 5 CHECK>=0 | cảnh báo tồn |
| `product_variants` | `version` | INT NOT NULL DEFAULT 1 | CAS edit |
| `product_variants` | `seo_title`, `seo_description` | TEXT NULL | optional variant page SEO |
| `product_media` | `asset_id` | BIGINT NULL REFERENCES media_assets | media pipeline |
| `product_media` | `alt_text`, `caption`, `is_cover` | TEXT, TEXT, BOOL | a11y/cover |
| `categories` | `description`, `seo_title`, `seo_description`, `image_asset_id` | TEXT + FK | landing SEO |
| `categories` | `version`, `published_at` | INT, TIMESTAMPTZ | governance |
| `brands` | `slug`, `status`, `seo_title`, `seo_description`, `logo_asset_id` | TEXT UNIQUE nullable initially; TEXT CHECK; FK | brand listing |
| `warehouses` | `code`, `sort_order` | TEXT UNIQUE nullable initially, INT | định danh kho |
| `users` | `last_login_at` | TIMESTAMPTZ NULL | staff admin |
| `orders` | `channel`, `internal_note` | TEXT DEFAULT 'website' / nullable, **admin only** | tracking & CS |

**Thực thi safely:** thêm nullable/default an toàn, backfill tại service/batch rồi đặt NOT NULL/UNIQUE ở migration sau nếu có dữ liệu sạch. Nếu `brands.slug` có dữ liệu xung đột, resolve deterministic và report. Không update hàng loạt vô điều kiện trong traffic cao. Không lưu thông tin nhạy cảm trong SEO metadata.

### 2.2 Model Product/SKU (ví dụ chính xác)
- Product P-100: `Bình sữa BabyCare 240ml`, category `Bình sữa`, brand `BabyCare`, description: lợi ích/sử dụng/bảo quản; gallery 5 ảnh.
- Variants: `BC-240-BLUE` màu Xanh / bình 240ml / giá 179000 VND / kho thường on_hand=20 reserved=2 → available=18; `BC-240-PINK` màu Hồng / 240ml / giá 179000 / on_hand=0 → hết hàng.
- Thuộc tính: `color` values `blue,pink`, `capacity` value `240ml`; mapping bằng `variant_attribute_values` đang có; thêm `variant_signature` computed/unique tại service + bảng nếu cần.
- SKU item chọn tại checkout là variant_id, không phải product_id. Xóa variant đang tham gia đơn thì archive, không hard delete.

## 3. Các bảng NEW cần lập trình

### 3.1 Catalog/media/SEO (P1)
**`media_assets`**: `id PK`, `storage_key TEXT UNIQUE NOT NULL`, `original_name`, `mime_type`, `size_bytes BIGINT`, `width INT`, `height INT`, `sha256`, `alt_text`, `caption`, `created_by FK users`, `created_at`, `deleted_at NULL`. Validate MIME/size/dimension, unique storage_key; optional dedup sha256 không xóa bản có references.

**`product_attribute_groups`** (optional nếu tái dùng attributes toàn hệ): `id`, `product_id FK`, `attribute_id FK`, `sort_order`, UNIQUE(product_id, attribute_id).

**`product_related`**: `product_id`, `related_product_id`, `sort_order`, composite PK, CHECK(product_id <> related_product_id), FKs RESTRICT. Hỗ trợ related product explicit.

**`seo_redirects`**: `id`, `old_path TEXT UNIQUE`, `new_path TEXT`, `http_status SMALLINT DEFAULT 301 CHECK IN (301,308)`, `entity_type`, `entity_id`, `created_by FK`, `created_at`. Reject external URLs/javascript, redirect loops, chains; no wildcard open redirect.

**`site_settings`**: `key TEXT PRIMARY KEY`, `value_json JSONB NOT NULL`, `version INT`, `updated_by FK`, `updated_at`; chỉ whitelisted settings theo schema, secrets không lưu hoặc đọc qua API public.

**`page_banners`**: `id`, `slot`, `title`, `caption`, `asset_id FK`, `mobile_asset_id FK`, `target_path`, `starts_at`, `ends_at`, `status draft/published/archived`, `sort_order`, `version`, `created_by`, timestamps. `starts_at < ends_at` nếu có.

**`content_pages`** (P2 cho about/policies nếu dynamic): `id`, `page_type`, `slug UNIQUE`, `title`, `content_json`, `status`, `seo_title`, `seo_description`, `published_at`, `version`, timestamps.

### 3.2 CMS Tin tức (P1)
**`article_categories`**: `id PK`, `parent_id nullable FK self`, `name`, `slug UNIQUE`, `description`, `seo_title`, `seo_description`, `cover_asset_id`, `status`, `sort_order`, timestamps. No cycles trong cây.

**`article_tags`**: `id PK`, `name`, `slug UNIQUE`, `status`, timestamps.

**`articles`**: `id PK`, `title TEXT NOT NULL`, `slug TEXT UNIQUE NOT NULL`, `excerpt TEXT`, `cover_asset_id FK`, `category_id FK`, `author_id FK users`, `editor_id nullable FK`, `status CHECK` (`draft`,`in_review`,`approved`,`scheduled`,`published`,`archived`), `current_revision_id nullable FK article_revisions (add FK after table)`, `seo_title`, `seo_description`, `canonical_path nullable`, `og_asset_id FK`, `published_at`, `scheduled_at`, `last_reviewed_at`, `version INT`, `created_at`, `updated_at`. Published pages only if valid SEO/cover/body and `published_at <= now`.

**`article_revisions`**: `id PK`, `article_id FK`, `revision_no INT`, `title_snapshot`, `excerpt_snapshot`, `body_json JSONB`, `body_html_sanitized TEXT`, `seo_snapshot JSONB`, `updated_by FK users`, `change_summary`, `created_at`, UNIQUE(article_id,revision_no). Revision rows append-only; content HTML produced from allowlist.

**`article_tag_links`**: `article_id FK`, `tag_id FK`, composite PK.

**`article_product_links`**: `article_id FK`, `product_id FK`, `sort_order`, composite PK. Display only active/public products.

**`article_workflow_events`**: `id PK`, `article_id FK`, `from_status`, `to_status`, `actor_id FK users`, `reason TEXT`, `created_at`; audit state changes.

**`article_publish_jobs`**: `id PK`, `article_id FK`, `due_at TIMESTAMPTZ`, `state pending/running/done/failed/cancelled`, `attempts`, `last_error_code`, `leased_until`, `created_at`, `updated_at`; UNIQUE partial active schedule per article, idempotent worker with DB lock and transaction.

**`article_internal_links`** (P2): `id`, `from_article_id FK`, `to_path`, `anchor_text`, `link_type manual/recommendation`, `created_at`; kiểm broken links.

**`article_views_daily`** (P3): aggregated, consent/cookie policy; không lưu raw IP quá mức; không là analytics bắt buộc nếu không có nhu cầu.

### 3.3 Warehouse documents (P2)
**`inventory_documents`**: `id PK`, `document_number UNIQUE`, `type receipt/issue/transfer/stocktake/return`, `status draft/submitted/approved/posted/reversed`, `source_warehouse_id nullable FK`, `target_warehouse_id nullable FK`, `reason`, `reference_type`, `reference_id`, `created_by FK`, `approved_by FK null`, `posted_by FK null`, `submitted_at`, `approved_at`, `posted_at`, `created_at`, `updated_at`, `version`. For transfer, source != target; audit each transition.

**`inventory_document_items`**: `id PK`, `document_id FK`, `variant_id FK`, `quantity INT CHECK>0`, `condition normal/damaged`, `expected_quantity nullable`, `actual_quantity nullable`, `unit_cost_vnd nullable`, `note`, UNIQUE(document_id,variant_id,condition) per design. `qty` never negative.

**`stocktakes`** (P2 optional separate from inventory_documents if need audit rounds): `id`, `warehouse_id FK`, `cycle_name`, `status`, `created_by`, `finished_at`; existing inventory_documents may already cover count. Không tạo trùng hai nguồn truth nếu unnecessary.

### 3.4 Returns & refunds (P2)
**`return_requests`**: `id`, `return_number UNIQUE`, `order_id FK`, `requested_by_user_id nullable`, `reason_code`, `description`, `status requested/authorized/received/inspected/approved/rejected/completed`, `approved_by`, `created_at`, `updated_at`, `version`.

**`return_items`**: `id`, `return_id FK`, `order_item_id FK`, `quantity INT CHECK>0`, `condition sealed/opened/damaged`, `disposition restock/damaged/dispose`, `received_quantity`, `note`, CHECK against order quantity in transaction (cross-row bound).

**`refunds`**: `id`, `return_id nullable FK`, `order_id FK`, `payment_id nullable FK`, `amount BIGINT CHECK >=0`, `status requested/approved/processing/paid/failed/cancelled`, `method`, `reference`, `initiated_by`, `approved_by`, `confirmed_at`, timestamps, `idempotency_key UNIQUE`. Sum(paid refunds) <= collected paid for order; no successful refund without proof.

### 3.5 Promotion and staff (P2)
**`promotion_targets`**: `id`, `promotion_id FK`, `target_type product/category/variant/brand`, `target_id BIGINT`, `include BOOL`, composite unique; validate target existence in service because polymorphic FK.

**`coupon_usage_by_customer`** optional: `coupon_id`, `user_id`, `redemption_count`, composite PK; consistency ensured inside coupon reservation/redemption transaction.

**`staff_invites`**: `id`, `email`, `role_id FK`, `token_hash UNIQUE`, `expires_at`, `accepted_at`, `revoked_at`, `invited_by`, created_at; no raw invite token in DB.

**`activity_notifications`** (P2): `id`, `user_id FK`, `type`, `payload_json` limited/sanitized, `read_at`, `created_at`; không chứa PII ngoài nhu cầu.

### 3.6 Sales reporting (P2)
Prefer materialized queries/views thay vì duplicate tables. `report_daily_sales` materialized view hoặc job aggregate **chỉ khi có scale**; có definition date basis/timezone, gross/collected/refund, channels.

## 4. Quan hệ dữ liệu trọng tâm
```
brands ─┐
        ├── products ──── product_variants ─── variant_attribute_values ── attribute_values ── attributes
categories ── product_categories ┘           │
       │              │                        ├── inventory_balances ── warehouses
       │              ├── product_media ── media_assets
       │              └── product_related
       └── category SEO
users ── carts ── cart_items ── variants
users ── orders ── order_items ── variants
orders ── payments ── bank_transfer_details/payment_events
orders ── inventory_reservations ── warehouse/variant
inventory_documents ── inventory_document_items ── variant
users ── articles ── article_revisions
article_categories ── articles ── article_tag_links ── article_tags
articles ── article_product_links ── products
articles ── article_publish_jobs/article_workflow_events
```
See `diagrams/ERD_JIELIEN.mmd`.

## 5. Migration + backfill plan
1. Verify schema drift, HEAD, migration checksums, row counts; dump & test restore.
2. `003_brand_and_catalog_extension.sql`: thêm nullable/new columns, unique indexes sau backfill, media_assets, product_related, redirect; seed null values safe.
3. `004_cms_news.sql`: article categories/tags/articles/revisions/link tables/jobs, audit indexes.
4. `005_staff_permissions.sql`: role codes, permission codes, role mapping. Seed `INSERT ... ON CONFLICT DO NOTHING`; **không cấp admin cho customer tự đăng ký**.
5. `006_inventory_docs.sql`: inventory_documents/items, return/refund nếu P2; apply only after service ready; no stock rebuild from random snapshot.
6. Backfill existing media URL→asset metadata optionally only if internal file exists; images không tìm thấy phải flag action, không delete.
7. Backfill category primary/slug only when deterministic; invalid/duplicate rows logged for manual review. Preserve legacy `orders.order_number`, user ID, SKU ID.
8. Add foreign keys/NOT NULL/indexes separately after cleanup if table large and lock time matters; prefer concurrent indexes outside transaction only if migration runner supports (current runner uses single transaction, so ADR needed).
9. Verify `SELECT count(*)` and sample order snapshots before/after; tests concurrent order & migration repeated apply.
10. **Rollback:** ưu tiên code-level feature flag/forward-compatible schema, không `DROP` data; restore tested snapshot only after explicit approval and downtime.

## 6. Indexes/checks quan trọng
| Table | Index/Constraint |
|---|---|
| `products`, `categories`, `articles` | unique slug (case policy), `status,published_at` index |
| `product_variants` | UNIQUE normalized SKU; existing unique barcode; product,status,price index |
| `media_assets` | UNIQUE storage_key, sha256 non-unique if dedup optional |
| `article_revisions` | UNIQUE(article_id, revision_no), FK article |
| `article_publish_jobs` | index(state,due_at); partial UNIQUE article active scheduled |
| `article_tag_links` | composite PK; reverse tag_id index |
| `inventory_documents` | UNIQUE number; status,posted_at,warehouse indexes |
| `inventory_document_items` | qty>0, composite unique, line status consistency |
| `return_items` | qty <= ordered - previously accepted returns (transaction check) |
| `refunds` | idempotency key unique, amount nonnegative, aggregate cap via tx lock |
| `seo_redirects` | UNIQUE old_path, path whitelist, no chains/cycles |
| `audit_logs` | actor/time & entity indexes exist; add action,time for staff audit |

## 7. Data governance
- PII: phone, address, email trong users/orders — mask trong admin list khi không cần, encrypt backups at rest, restrict export.
- Pricing: giá vốn (`cost_price`) không trả public API; permission `finance.read_cost`.
- SEO: draft/preview private, avoid exposing unpublished snippets in client JSON/public search index.
- Revision/snapshots: append-only for article revisions/order items/inventory movements; sửa dữ liệu bằng event mới, không xóa lịch sử.
- Time: all SQL timestamps UTC; cron publish as UTC, admin input chuyển Asia/Ho_Chi_Minh; test DST không áp dụng Vietnam nhưng lưu timezone robust.
- Restore: backup PostgreSQL thông qua `pg_dump`, không lấy bản sao hot physical folder/volume như bản backup logic; ưu tiên PITR sau khi traffic tăng.

## 8. Ví dụ SQL migration **THAM KHẢO — KHÔNG CHẠY TỰ ĐỘNG**
```sql
-- Execute only as part of reviewed, checksummed NEW migration.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS short_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT;

CREATE TABLE IF NOT EXISTS article_categories (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
*Chú ý:* `IF NOT EXISTS` không thay thế checksum quản lý migration hiện có; chỉ tham khảo cấu trúc.
