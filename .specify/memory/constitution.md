# Jielien Commerce Constitution (v1.0)

## I. Bảo toàn dữ liệu là ràng buộc cao nhất
- PostgreSQL live là nguồn chân lý; `public/catalog.json` chỉ là seed mẫu, không ghi đè product/price/inventory live.
- Không dùng `DROP SCHEMA`, `TRUNCATE`, `DELETE FROM` hàng loạt, `docker compose down -v`, `git reset --hard`, `prisma db push` hoặc `db sync` không kiểm soát lên môi trường live.
- Không sửa checksum migration đã áp dụng (`db/migrations/001_core.sql`, `002_bank_transfers.sql`); thêm migration mới có thứ tự và backfill idempotent.
- Không thay đổi external order_number; không thay `product_variants.id` hiện là ID SKU phục vụ link cũ. Giữ foreign keys, order snapshot, voucher redemptions, user sessions.
- Trước migration: backup có đối soát số bản ghi; chạy thử với copy DB; chứng minh có thể restore. Chỉ thao tác live sau khi phê duyệt phương án cutover.

## II. Một nguồn sự thật cho nghiệp vụ
- Server quyết định giá, khuyến mãi, tồn, phí ship, quyền truy cập, trạng thái đơn và thanh toán. Client chỉ gợi ý UX.
- Tất cả ghi thay đổi kho/giữ tồn/đơn/thanh toán trong transaction với khóa hàng hoặc cơ chế đồng bộ phù hợp.
- Idempotency cho tạo đơn, xác nhận thanh toán, webhook và thao tác có thể retry.
- Lưu audit log cho thao tác quan trọng, không ghi mật khẩu/token/đầy đủ PII.

## III. Bảo mật và nguyên tắc ít quyền nhất
- RBAC kiểm ở API, không chỉ ẩn nút UI. Admin có phân quyền riêng; khách hàng không thể tự nâng quyền.
- Password hash, CSRF, SameSite/HttpOnly/Secure cookie theo môi trường, chống XSS, SQL injection, SSRF và abuse upload.
- Không đưa .env, khóa API, dump DB, dữ liệu khách hàng lên GitHub/log. Kiểm soát scope mạng LAN; public phải HTTPS.
- Media được xác minh MIME thực, dung lượng, định dạng; tên file random; không nhận SVG scriptable/executable vào upload công khai.

## IV. SEO là tính năng kỹ thuật cốt lõi
- Trang sản phẩm/danh mục/bài viết đã xuất bản phải có HTML nội dung và metadata hữu ích trong response ban đầu hoặc SSR tương đương, không dựa hoàn toàn vào JS client.
- Chỉ published/active public được index/sitemap; preview/admin/draft không index. Canonical self hoặc canonical group theo chiến lược variant, 301 khi đổi slug, sitemap cập nhật.
- JSON-LD đúng dữ liệu thật: Product/Offer, BreadcrumbList, BlogPosting/Article và Organization; không tự bịa reviews, stock, rating hoặc offer.
- SEO content phải do biên tập viên duyệt, không xuất bản tự động bài tạo bởi AI không kiểm định.

## V. UI/UX, khả năng sử dụng và nhận diện
- Logo Jielien nguyên bản làm chuẩn: green `#86B529`, navy `#0B1B34`, white `#FFFFFF`; xây dựng design tokens dùng chung.
- Giữ công năng checkout, account, admin; keyboard, focus, tương phản WCAG 2.2 AA mục tiêu, mobile 320px+, touch targets dễ thao tác.
- Không lạm dụng màu xanh để thể hiện thành công/vấn đề khi ý nghĩa trạng thái cần màu riêng; nội dung và trạng thái phải có nhãn chữ.
- Không chỉ thay CSS hex: thiết kế lại hệ thống component, responsive, empty/loading/error states.

## VI. Kỹ thuật có thể bảo trì
- Giữ Node.js/PostgreSQL/Docker từ repo; không chuyển framework lớn nếu chưa có ADR nêu chi phí, lợi ích, rủi ro migration.
- Mỗi feature có hợp đồng API, migration, validation, UI, test và docs; ưu tiên mô-đun hóa backend đang tập trung ở `server.mjs`, `db/store.mjs`.
- Test tự động chạy với DB/schema test tách biệt; không đánh vào dữ liệu live; kiểm cả concurrent writes.
- Không nhận tuyên bố hoàn thành nếu chưa chạy tests và có bằng chứng; nếu không chạy được phải ghi rõ tại sao.

## VII. Vận hành & release
- Tách dev/staging/prod; biến môi trường riêng, không hard-code secrets.
- Backup định kỳ + test restore, monitoring/healthcheck, retention log và rollback code tương thích schema.
- Triển khai LAN trước theo firewall/IP chính xác; public sau với TLS, headers, reverse proxy và rà soát tuân thủ.
- Mỗi phase giao PR độc lập, release note, checklist nghiệm thu và hướng dẫn cho đội ngũ non-tech.
