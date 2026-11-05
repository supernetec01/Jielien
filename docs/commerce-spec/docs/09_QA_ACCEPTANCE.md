# 09 — Quality Assurance, kiểm thử, nghiệm thu và Release checklist

## 1. Definition of Done (DoD)
Một feature chỉ hoàn thành khi đủ: **migration DB có kiểm thử / service business rule / endpoint auth-validation / UI desktop-mobile / audit nếu write / unit+integration+browser tests / docs / review security+accessibility / screenshot hoặc demo evidence**. Không coi mockup/hardcoded JSON là completed.

## 2. Test pyramid
- **Unit**: validation slug, SKU generator/matrix, price integer, media rules, markdown/content sanitizer, article workflow/state transitions, canonical path, permission check.
- **Integration PostgreSQL**: unique constraints, FK, migrations idempotent + checksum, transaction concurrency order/inventory/discounts, article publish jobs, RBAC, row version conflicts.
- **API**: GET list filtering, authorization, CSRF, 422/409/429 errors, pagination and correct response field types; no leak private fields.
- **Browser E2E**: user journey purchase, admin product editor, article editor, checkout, login, responsive; at least Chrome/Chromium desktop+mobile emulation.
- **SEO tests**: curl HTML source, robots/sitemap, canonical, JSON-LD, redirects/404, index restrictions.
- **Operations**: LAN access PC→PC, backup/restore, restart Docker, public staging TLS/cookie, media durable.

## 3. Functional cases — khách hàng
| Test ID | Preconditions/Action | Expected |
|---|---|---|
| T-SF-001 | Home desktop + mobile | Logo/color correct, categories/products/news rendered, no overflow |
| T-SF-002 | Search query có dấu/không dấu | Results relevant, accessible query and pagination |
| T-SF-003 | Filter by category+price+brand, refresh/back | Params persistent, filters still applied |
| T-SF-004 | SKU group (màu/size) selecting | Correct variant_id, gallery, price, stock, URL |
| T-SF-005 | Product out of stock | View info but add cart disabled, reason displayed |
| T-SF-006 | Add two variants same product | Two cart lines distinct |
| T-SF-007 | Quantity > available | Validation, no oversell |
| T-SF-008 | Product price changes while cart open | Quote new price from server, user sees change |
| T-SF-009 | Guest COD order valid | Exactly one order/stock reserved, status pending |
| T-SF-010 | Bank_transfer configured | VietQR pending, not paid until staff confirmation |
| T-SF-011 | Bank_transfer config incomplete | Payment option disabled, no transfer order |
| T-SF-012 | Checkout double click/retry with same key | One order/payment/reservation |
| T-SF-013 | Same key different payload | 409, no mutation |
| T-SF-014 | Account register/login/logout | CSRF/session protections, account correct |
| T-SF-015 | Address edit after old order | Old order snapshot unchanged |
| T-SF-016 | Order lookup correct phone vs incorrect phone | Authorized gets order, wrong gets generic deny |
| T-SF-017 | Cart after login | Merge rule correct; no duplicate quantities |
| T-SF-018 | Mobile cart/checkout 320px | Can complete all fields with keyboard |
| T-SF-019 | Expired session during checkout | Actionable login/retry, no lost/corrupt order |
| T-SF-020 | Invalid coupon code/expired | Clear error, no coupon redemption |

## 4. Catalog/media/admin
| Test ID | Input/Action | Expected |
|---|---|---|
| T-CA-001 | Create draft parent | New ID, draft, audit |
| T-CA-002 | SKU matrix Color x Size | Unique 4 combinations, correct labels |
| T-CA-003 | Duplicate SKU case variation | 409 duplicate_sku; DB unchanged |
| T-CA-004 | Duplicate barcode nonempty | 409; DB unchanged |
| T-CA-005 | Publish missing cover/active variant | Validation blocks publish |
| T-CA-006 | Publish valid product 1+ variants | Public GET and HTML show product |
| T-CA-007 | Edit price with version N | Successful update version N+1, audit |
| T-CA-008 | Two editors save version N concurrently | One commit, other 409, no lost update |
| T-CA-009 | Archive product in old order | Order history intact, public no new checkout |
| T-CA-010 | Upload .exe renamed .jpg | Reject by file signature and type |
| T-CA-011 | Upload oversized image | 413/422, no partial file leaked |
| T-CA-012 | Upload alt text and reorder gallery | Saved, public image alt/order correct |
| T-CA-013 | CDN/media volume restart | Assets persistent after container rebuild |
| T-CA-014 | CSV preview with invalid SKU/price | Line errors, no DB mutation |
| T-CA-015 | CSV commit twice with same job | No duplicate products/variants |
| T-CA-016 | Public product JSON | No cost price/internal note/private field |
| T-CA-017 | Read old variant URL | Still resolves or 301 canonical mapping |

## 5. Kho, đơn, thanh toán
| Test ID | Input/Action | Expected |
|---|---|---|
| T-IN-001 | Receive 10 SKU normal | on_hand +10; 1 receipt ledger line, audit |
| T-IN-002 | Post same document twice | No double stock addition |
| T-IN-003 | Transfer normal→damaged qty4 | Source -4, damaged +4, available sellable -4 |
| T-IN-004 | Transfer beyond `on_hand-reserved` | 409; both warehouses unchanged |
| T-IN-005 | Concurrent issue/order reserve | Available never negative, one action fails if insufficient |
| T-IN-006 | Count variance approval | Reason/actor/doc stored, correct ledger delta |
| T-IN-007 | Return sealed item | Normal warehouse restock only after inspection/post |
| T-IN-008 | Return opened item | Damaged warehouse only, not sellable |
| T-IN-009 | Cancel pending order | Reservations released once, ledger consistent |
| T-IN-010 | Try shipping unpaid VietQR | 409 payment_required |
| T-IN-011 | Confirm paid twice | Single event/no double booking |
| T-IN-012 | Mark delivered COD without pay | Payment remains pending unless separately confirmed |
| T-IN-013 | Refund > collected | Reject without mutation |
| T-IN-014 | Refund paid without actual confirmation | UI/state cannot falsely claim transferred |

## 6. News/CMS/technical SEO
| Test ID | Input/Action | Expected |
|---|---|---|
| T-SEO-001 | Writer creates article draft | Not on public list, no sitemap, admin can edit |
| T-SEO-002 | Writer tries publish without right | 403, remains draft |
| T-SEO-003 | Editor approves content | Stored approved revision, workflow event |
| T-SEO-004 | Schedule 09:00 VN | UTC due time correct, publish once |
| T-SEO-005 | Simulate job retries/2 workers | Single publication, no duplicate events |
| T-SEO-006 | Edit approved body before schedule | Re-review required or schedule points to approved version by explicit rule |
| T-SEO-007 | XSS `<script>` in rich content | Never executed/rendered as script |
| T-SEO-008 | View source article URL | Unique title/description/H1/body/Article JSON-LD present server-side |
| T-SEO-009 | View source PDP | Product/Offer price-stock reality, canonical |
| T-SEO-010 | sitemap.xml after publish | New article appears only if indexable/public |
| T-SEO-011 | Draft/admin/preview | Auth+noindex/404, not in sitemap |
| T-SEO-012 | Change published slug | Old URL 301→new, no chain/loop, canonical updated |
| T-SEO-013 | Category paginated page=2 | Crawlable link, canonical policy valid |
| T-SEO-014 | Product inactive, linked from old article | No broken CTA; controlled fallback |
| T-SEO-015 | Broken image or missing alt | Admin validation/warning, public fallback |
| T-SEO-016 | OGP social preview | Uses article title and cover asset correctly |
| T-SEO-017 | Sitemap while staging | Staging not indexable/does not publish production URLs incorrectly |

## 7. Security/RBAC and privacy tests
| Test ID | Action | Expected |
|---|---|---|
| T-SEC-001 | Guest POST admin product | 401 |
| T-SEC-002 | Customer POST admin product | 403 |
| T-SEC-003 | ContentWriter publish | 403 |
| T-SEC-004 | ContentWriter edit own draft | 200 when scoped, other draft 403 |
| T-SEC-005 | WarehouseStaff edit cost price | 403 |
| T-SEC-006 | BossViewer mutate order | 403 |
| T-SEC-007 | Staff role revoke | Current privileged sessions revoked/refreshed |
| T-SEC-008 | Remove last admin | Forbidden with descriptive error |
| T-SEC-009 | Cross-origin CSRF with session cookie | 403, no mutation |
| T-SEC-010 | SQL injection in filter/sort | Treated as data/rejected, no SQL execution |
| T-SEC-011 | Search/response/log order PII leakage | None for unauthorized users |
| T-SEC-012 | SVG/HTML upload disguised as image | Rejected |
| T-SEC-013 | CSV cells starting =,+,-,@ | Escaped on exports, no formula injection |
| T-SEC-014 | URL redirect to external malicious domain | Rejected; no open redirect |
| T-SEC-015 | Admin role self-escalation attempt | Forbidden + audit |

## 8. Migration/operational testing
- `T-DB-001` Legacy PG sample order, account, SKU, stock preserved after migrations: row counts and random spot checks equal before/after except intended additions.
- `T-DB-002` Re-running new migrations does not damage data; checksum mismatch for applied file still rejected.
- `T-DB-003` Existing `product_variants.id` and `orders.order_number` unchanged.
- `T-DB-004` Legacy SQLite import only once; never re-import into nonempty PG as reset.
- `T-OPS-001` Windows Docker local:start/status/stop works; `down -v` never used.
- `T-OPS-002` PC B on permitted LAN opens host IP:3001 and sees DB changes from PC A.
- `T-OPS-003` Laptop on wrong VLAN / WAN cannot access 3001 or PG 5432.
- `T-OPS-004` Backup pg_dump verified and restored to staging; media persists.
- `T-OPS-005` Docker image rebuild preserves PG/media.
- `T-OPS-006` Staging uses noindex, production HTTPS secure cookies and canonical base URL.
- `T-OPS-007` Existing tests from repo still pass; failures classified baseline/new.

## 9. UX & accessibility acceptance
| View | Desktop | Mobile | Key checks |
|---|---|---|---|
| Home | 1440px | 375px | Logo/nav/banner/cat/products/news/footer |
| Listing | 1440px | 320px | Filter drawer, sort, pagination, grid |
| PDP | 1440px | 375px | Gallery/variant/stock/CTA/spec |
| Cart/Checkout | 1440px | 375px | Price summary/coupon/form/payment states |
| Account | 1440px | 375px | Login/profile/addresses |
| News list/article | 1440px | 375px | Type hierarchy/TOC/share/related products |
| Admin dashboard | 1440px | 375px | Sidebar/drawer/cards/tables |
| Product editor | 1440px | 375px | Tabs/SKU matrix/media/SEO/publish |
| Article editor | 1440px | 375px | Rich blocks/review/schedule |
| Warehouse/order | 1440px | 375px | Status/forms/document lines |

- Keyboard-only flow can search, choose variant, add cart, checkout, login, open/close modal, submit editor.
- Focus visible, labels/landmarks correct, no click traps; screen reader labels on icon buttons.
- No excessive motion, CLS low, images sized; Lighthouse contrast/a11y checks + manual QA.

## 10. Evidence template cho mỗi PR
```
PR: #... phase ...
Base HEAD: ...
Feature IDs: ...
Files changed: ...
DB migration IDs & checksum: ...
Affected existing routes: ...
API tests: pass/fail/skipped (reason)
Browser tests: pass/fail/skipped (reason)
Accessibility/SEO checks: ...
Screenshots links: desktop/mobile ...
Backup created/test restore: yes/no (staging)
Known risks & migration steps: ...
Rollback approach: ...
Outstanding tasks: ...
```

## 11. Gate release
- **P0 gate:** backups tested, tests baseline, LAN optional without opening WAN.
- **P1 gate:** product CRUD + variants + media + brand UI + CMS news + HTML SEO + storefront purchase preserved; all acceptance T-SF/T-CA/T-SEO relevant pass.
- **P2 gate:** inventory docs/returns/coupons/staff/reporting complete; permission tests and 2-user concurrency pass.
- **P3 gate:** actual integrations have verified credentials/sandbox, webhooks, end-to-end evidence, HTTPS production safeguards.
