# JIELIEN INTERNATIONAL — Bộ bàn giao thiết kế & triển khai E-commerce + CMS SEO

**Phiên bản:** 1.0 • **Ngày lập:** 2026-11-05 • **Ngôn ngữ:** Tiếng Việt • **Repo đích:** `https://github.com/supernetec01/Jielien.git` • **Nhánh cơ sở đã đối chiếu:** `main` / Git tree `c1e7b3bb0be2f421b2b82d780786e324020c069c`.

> **Mục đích:** giao cho Codex một đặc tả đủ rõ để nghiên cứu, lập kế hoạch, lập trình, kiểm thử và bàn giao website thương mại điện tử Jielien hoàn chỉnh. Đây là tài liệu thiết kế/chỉ dẫn; **không phải source code đã sửa**, không phải kết quả kiểm thử trên máy thực tế. Codex phải đọc và đối chiếu với commit mới nhất trước khi chỉnh sửa.

## Ưu tiên sử dụng tài liệu
1. `.specify/memory/constitution.md` — luật dự án, đặc biệt không phá dữ liệu và bảo mật.
2. `specs/001-jielien-commerce/spec.md` — yêu cầu nghiệp vụ và tiêu chí nghiệm thu.
3. `docs/01_REPO_BASELINE_AND_GAP.md` — chức năng đã có, còn thiếu, file code cần động vào.
4. `docs/02_PRODUCT_REQUIREMENTS.md` — yêu cầu UX/website/admin chi tiết, phân kỳ.
5. `docs/03_UX_UI_DESIGN_SYSTEM.md` — giao diện Jielien theo logo đính kèm.
6. `docs/04_DATA_MODEL.md` + `contracts/ENTITY_DICTIONARY.csv` — dữ liệu, quan hệ và migration.
7. `docs/05_USE_CASES_WORKFLOWS.md` — luồng người dùng, nhân viên, hệ thống.
8. `docs/06_API_RBAC.md` + `contracts/API_CONTRACT.yaml` + `contracts/RBAC_MATRIX.csv` — hợp đồng API và quyền.
9. `docs/07_CMS_NEWS_SEO.md` — bài viết, biên tập, xuất bản, technical SEO.
10. `docs/08_SECURITY_DEPLOYMENT_OPERATIONS.md` — LAN, public, bảo mật, backup, vận hành.
11. `docs/09_QA_ACCEPTANCE.md` — kiểm thử và điều kiện đạt.
12. `specs/001-jielien-commerce/plan.md` và `tasks.md` — kế hoạch và task có thứ tự.
13. `CODEX_PROMPT_COPY_PASTE.md` — prompt giao việc nhanh.

## Tệp tham chiếu
- `assets/jielien-logo-original.jpg` là **ảnh logo gốc user cung cấp**, không phải bản vector. Không thiết kế lại biểu tượng; ưu tiên xin source logo chuẩn, có thể cắt khoảng trắng và xuất PNG transparent ở phiên bản sử dụng web, bảo toàn hình và tỷ lệ.
- `reference/PREVIOUS_UI_REDESIGN_SPEC.md` và `reference/PREVIOUS_LAN_IMPLEMENTATION_SPEC.md` được đính kèm để bảo toàn yêu cầu trước. **Khi mâu thuẫn**: constitution > spec hiện tại > tài liệu chuyên môn mới > tham chiếu cũ; thông báo rõ xung đột.
- `diagrams/*.mmd` để Codex tạo ERD, sơ đồ UI và luồng.
- `templates/PRODUCT_IMPORT_TEMPLATE.csv`, `templates/ARTICLE_EDITOR_TEMPLATE.md` cho nhập liệu và bài SEO.

## Đích bàn giao thực tế
- Trang khách truy cập `/', /san-pham, /san-pham/:slug, /tin-tuc, /tin-tuc/:slug, /gio-hang, /thanh-toan, /tai-khoan, /tra-cuu-don-hang`.
- Admin `/quan-tri` có dashboard, sản phẩm cha/SKU, thuộc tính, hình/video, tồn kho, đơn, nội dung, SEO, mã giảm giá, phân quyền, nhật ký và cài đặt.
- Một DB PostgreSQL chung; màn hình khách và admin đọc/ghi cùng nguồn dữ liệu; bảo vệ giao dịch song song; không có logic giá/tồn nhạy cảm ở client.
- LAN trước, public sau qua HTTPS; có phương án nâng cấp có thể rollback, không mất dữ liệu.

## Các quyết định mặc định để Codex không phải hỏi lại
- Việt Nam là thị trường bán hàng đầu tiên, **VND nguyên** trong cơ sở dữ liệu; giao diện tiếng Việt trước. Cấu trúc cho đa ngôn ngữ tương lai, không dịch tự động nội dung SEO khi chưa được duyệt.
- Catalog có **Product (sản phẩm cha) → Variant/SKU (phiên bản bán)**. SKU duy nhất, giá/tồn tính ở variant. Có thể có một SKU mặc định.
- Có ít nhất **2 loại kho**: kho chính đủ điều kiện bán; kho hàng hư hỏng không bán. Không hạch toán hai lần khi chuyển kho/hoàn trả.
- Nội dung tin tức có workflow `draft → in_review → approved → scheduled/published → archived`, kèm revision và audit.
- Thời điểm publish theo `Asia/Ho_Chi_Minh`, lưu UTC trong PostgreSQL.
- Không thêm cổng thanh toán tự động, vận chuyển tự động hoặc đồng bộ sàn nếu thiếu nhà cung cấp/credentials; thực hiện giao diện + hợp đồng tích hợp rõ ràng, gắn cờ future.
- Không mặc định mở public website đang chạy HTTP LAN; public phải có HTTPS, domain, reverse proxy và cấu hình production.
- Trước mọi migration phải dump PostgreSQL và kiểm tra restore; không sửa migration 001/002 đã áp dụng, chỉ bổ sung migration mới (từ 003 trở lên tùy repo mới nhất).

## Cách triển khai đề xuất
1. Codex kiểm tra repo head, test hiện tại, lập bảng GAP trước/sau.
2. Tạo nhánh `feature/jielien-commerce-cms` (hoặc các nhánh PR theo phase), không chỉnh thẳng main.
3. Triển khai các phase P0→P6 trong `tasks.md`, mỗi phase chạy tests + screenshots + nghiệm thu.
4. Tạo migration **additive**, backfill với cơ chế có thể chạy lại an toàn; không reset database hoặc xóa thông tin khách.
5. Viết release notes, bản backup/restore runbook, không commit .env, thông tin thanh toán hoặc bản dump chứa PII.
6. Đưa PR để người dùng review, không tự merge nếu chưa được phê duyệt.

## Tuyên bố phạm vi
Tài liệu mô tả **mục tiêu cuối cùng** và danh mục tính năng có thể mở rộng. Không có nghĩa mọi chức năng đã tồn tại. Những mục `P2/P3` là đề xuất cho giai đoạn sau; Codex chỉ coi là hoàn thành khi code + migration + giao diện + test + tài liệu đều hiện hữu.

## Nguồn thực hành SEO đối chiếu
- Google Search Central — SEO cho thương mại điện tử: https://developers.google.com/search/docs/specialty/ecommerce
- Google — cấu trúc URL e-commerce/canonical: https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites
- Google — Merchant listing markup: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Google — Article markup: https://developers.google.com/search/docs/appearance/structured-data/article

