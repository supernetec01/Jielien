# 01 — Kiểm kê mã nguồn hiện tại và phân tích chênh lệch

**Cơ sở:** GitHub repository `supernetec01/Jielien` nhánh `main` tại tree `c1e7b3bb0be2f421b2b82d780786e324020c069c` (đọc 2026-11-05). Nếu repo đã có commit mới, Codex phải đối chiếu lại.

## Công nghệ thực tế
| Lớp | Đang có | Ghi chú |
|---|---|---|
| Frontend | HTML/CSS/JS thuần: `public/index.html`, `style.css`, `app.js` | Các trang catalog và nội dung hiện render client-side |
| Tài khoản | `public/account.html`, `account.js`, `management.css` | Login/profile/address/order history |
| Admin | `public/admin.html`, `admin.js`, `management.css` | Dashboard, SKU price/status, order/payment, inventory adjustment, audit |
| API | Node.js native HTTP `server.mjs` | Routing/validation hiện tập trung ở một file |
| Database | PostgreSQL 17, `pg`, migrations 001/002 | 35 bảng nghiệp vụ + migration table |
| Logic nghiệp vụ | `db/store.mjs`, `lib/auth.mjs`, `lib/cart.mjs`, `lib/vietqr.mjs` | Đã có transaction và inventory reservation |
| Docker | `Dockerfile`, `compose.yaml`, `scripts/local.mjs` | `127.0.0.1:3001` mặc định của compose, PG volume riêng |
| Test | tests API/auth/checkout/inventory/browser | Giữ và mở rộng thay vì bỏ |

## Đã có, phải tận dụng
1. Product parent, variant/SKU, category/brand, image refs, attributes, specs ở schema.
2. Đăng ký/đăng nhập, cookie session, CSRF, RBAC backend; mặc định customer/admin.
3. Giỏ hàng tài khoản, đặt hàng, giá/discount do server tính; COD/VietQR chuyển khoản đối soát thủ công.
4. Order lifecycle, order history, payment events, audit; reserve/release/sale stock transactional.
5. Kho normal/damaged, inventory balance/movement, import legacy SQLite an toàn.
6. Bảo vệ slug cũ của SKU, mã đơn JL cũ, order snapshots, test harness.

## Còn thiếu hoặc cần mở rộng — không nhầm với đã triển khai
| Nhóm | Khoảng trống | Mức |
|---|---|---|
| Catalog CMS | CRUD product parent, variant matrix, category tree, brand, attributes, gallery, editorial description, bulk import | P1 |
| Media | Upload file thật, phân loại image/video, validation/resize/storage/dedup/accessibility | P1 |
| Inventory | Phiếu nhập/xuất/chuyển kho, lý do, đối soát, return condition, optional bin/lot | P2 |
| Orders | Lọc nhiều tiêu chí, xem lịch sử, giao đơn thủ công, đổi/trả/hoàn tiền có workflow | P2 |
| Staff IAM | Role Boss/Sales/Kho/Content/SEO/CS; assign/revoke UI, role permissions API | P1/P2 |
| Promotions | Full CRUD campaign/coupon, schedule, eligibility, budget and usage report | P2 |
| CMS SEO | Database article/category/tag, revision/approval, editor, scheduled publish, sitemap, Open Graph | P1 |
| Technical SEO | SSR/pre-render meaningful HTML product/category/blog; canonical/redirect, schema, robots | P1 |
| Analytics | Report endpoints filter time/channel/product/SKU; export CSV; definition metric | P2 |
| UX/UI | Hiện dùng pink `#ed1164`; cần Jielien brand system + mobile/accessibility | P1 |
| DevOps | LAN binding/firewall/docs, production TLS, backup automation, retention, restore drill | P0/P3 |
| Integrations | Shipping webhooks, payment gateway, TikTok/Shopee, email, newsletter, review | P3 |

## Mã nguồn cần khảo sát/sửa theo module
| File có sẵn | Việc cần làm |
|---|---|
| `public/style.css` | Thay màu hồng, tạo component tokens, responsive storefront |
| `public/management.css` | Phối giao diện admin/account, states, form/tables |
| `public/index.html` / `public/admin.html` / `public/account.html` | Logo, metadata, nav, cấu trúc accessible |
| `public/app.js` | Tách component page, dùng API catalog/news, không hardcode blog nội dung |
| `public/admin.js` | CRUD admin mới, role-gated views và form validation |
| `server.mjs` | Tách route nhóm module, public SEO HTML handling và API versioning hữu ích; giữ compatibility |
| `db/store.mjs` | Catalog/CMS/orders/stock services, transaction, locking |
| `lib/auth.mjs` | User admin role management, permission methods, revoke sessions |
| `db/migrations/*.sql` | Tạo migration mới, không sửa lịch sử đã áp dụng |
| `compose.yaml` | LAN bind tùy chọn, backups, restart/volume theo điều kiện |
| `tests/` | API + browser regression + concurrency + crawlable SEO |

## Cảnh báo triển khai
- `public/app.js` đang có nội dung `articles`/`policies` dạng tĩnh: chuyển dần sang CMS nhưng giữ route legacy `/bai-viet/:slug`, nên trả 301 vào `/tin-tuc/:slug` nếu nội dung tương ứng tồn tại.
- `server.mjs` đang phục vụ nhiều route bằng `index.html` SPA: với SEO cần trả metadata/HTML theo entity, tránh trùng title/description hàng loạt.
- `public/catalog.json` là dữ liệu mẫu, không đưa vào tác vụ đồng bộ hai chiều sau khi admin CRUD hoạt động.
- `db/migrations/001_core.sql` chỉ có `admin/customer`, dù có bảng roles và permissions. Cần thêm role bằng migration/seed an toàn + admin UI không nâng quyền cho customer tự đăng ký.
- `compose.yaml` hiện bind `127.0.0.1`, không truy cập từ LAN; đổi qua biến cấu hình tùy chọn, kèm firewall giới hạn.
- Trạng thái ngân hàng VietQR *không tự chứng minh nhận tiền*. Chỉ thu tiền khi nhân viên đã đối soát hoặc có tích hợp verified sau này.

## Yêu cầu báo cáo GAP cho Codex trước code
- Liệt kê commit HEAD thực tế, thư mục repo, các test đã chạy và lỗi baseline.
- So sánh từng yêu cầu ở đặc tả với code mới nhất, đánh dấu `done/partial/missing/deferred`.
- Quyết định tái sử dụng logic cũ và rủi ro migration/compatibility, viết ADR nếu thay đổi lớn.
- Không tự coi UI hoặc API có sẵn là đã đạt nếu chưa kiểm chứng frontend/backend/DB end-to-end.
