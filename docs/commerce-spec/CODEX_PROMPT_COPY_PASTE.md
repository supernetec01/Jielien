# PROMPT — sao chép nguyên phần dưới vào Codex

Bạn là senior full-stack engineer + product architect cho dự án website thương mại điện tử **JIELIEN INTERNATIONAL**.

**Repo thực thi:** `https://github.com/supernetec01/Jielien.git` (nhánh `main`, HEAD cần đọc lại trước khi sửa).

Tôi đính kèm `JIELIEN_FULL_ECOM_SPEC_KIT.zip`. Hãy đọc và coi bộ tài liệu trong ZIP là hợp đồng triển khai, đặc biệt:
- `.specify/memory/constitution.md`
- `specs/001-jielien-commerce/{spec,plan,tasks}.md`
- `docs/01_REPO_BASELINE_AND_GAP.md`
- `docs/02_PRODUCT_REQUIREMENTS.md`
- `docs/03_UX_UI_DESIGN_SYSTEM.md`
- `docs/04_DATA_MODEL.md`
- `docs/05_USE_CASES_WORKFLOWS.md`
- `docs/06_API_RBAC.md`
- `docs/07_CMS_NEWS_SEO.md`
- `docs/08_SECURITY_DEPLOYMENT_OPERATIONS.md`
- `docs/09_QA_ACCEPTANCE.md`
- `contracts/*`, `diagrams/*`, `templates/*` và ảnh logo gốc trong `assets/`.

## Mục tiêu cuối cùng
Hoàn thiện website Jielien thành trang bán các sản phẩm của công ty, có **sản phẩm cha / phân loại SKU / giá và số lượng theo kho / barcode / nhiều ảnh và ảnh mô tả / nội dung SEO**, trang khách hàng mua hàng (giỏ, checkout, tài khoản, đơn), trang **Admin** đầy đủ (catalog, media, kho, đơn hàng, tin tức CMS, SEO, khách hàng, nhân viên RBAC, báo cáo, cấu hình), dùng chung PostgreSQL. Áp dụng **toàn bộ** nhận diện Jielien navy/green/white theo logo được đính kèm. Chạy được nội bộ LAN trước, chuẩn bị khả năng public HTTPS về sau. **Không chỉ tạo mockup hoặc ghi kế hoạch — cần sửa code thật qua các PR.**

## Quy trình Spec Kit ưu tiên
1. Đọc constitution rồi khảo sát code thật & chạy test baseline; lập GAP theo trạng thái REAL/INCOMPLETE/NOT IMPLEMENTED, không tin tài liệu cũ nếu source mới khác.
2. Cập nhật feature spec, quyết định công nghệ, kế hoạch, chia task có dependencies theo tài liệu. Nếu Spec Kit CLI đã cài, dùng các command phù hợp (`constitution`, `specify`, `plan`, `tasks`, `analyze`, `implement`) thay vì đoán tên script; nếu chưa cài, dùng tài liệu tương đương và không block tiến độ.
3. Thực hiện tuần tự P0→P6 hoặc tách PR. Mỗi phần phải có migration/API/business logic/UI/security/tests/docs, không chỉ CSS và HTML.
4. Thực hiện screenshot + API/db/e2e tests; lỗi phải được xử lý. Báo cáo từng phase DONE/PARTIAL/DEFERRED với evidence.

## Không được vi phạm
- Không xóa/tạo lại DB, không `docker compose down -v`, không sửa migration 001/002 đã chạy, không sửa tên/ID SKU legacy, không thay order history/snapshot, không reset PostgreSQL volume. Backup + kiểm tra restore trước khi schema change.
- Không hardcode sản phẩm/giá/tồn cho các chức năng mới; mỗi SKU thật có ID/giá/tồn riêng, server recompute checkout; dùng transaction/row lock/idempotency.
- Không trả private data trong API public; không cấp quyền admin cho tài khoản đăng ký; RBAC server enforced; CSRF, XSS, upload security.
- Không để bài draft, preview URL, admin, checkout vào sitemap; không xuất bản SEO hoàn toàn dựa vào JS client-render shell. Cần HTML indexable server-side/pre-render cho product/category/article với canonical/JSON-LD và status thật.
- Không làm giả thanh toán tự động, carrier integration, đánh giá khách hàng, số liệu báo cáo hoặc Google ranking.
- Không tự public site hiện chỉ dùng HTTP nội bộ; public đòi HTTPS/domain/config và quyết định người dùng.
- Không commit `.env*`, mật khẩu, tokens, dump DB hay PII. Không thay đổi giao diện logo thành logo tự thiết kế khác; bản gốc nằm trong `assets/`.

## Khi bắt đầu task
- Kiểm tra `git status`, commit SHA, dependencies, DB state và backup.
- Vui lòng triển khai **P0 & P1** trước, sau đó tiến đến P2...; nếu giới hạn thời gian thực thi, hoàn thành tối đa các task an toàn, không báo là toàn bộ dự án đã xong nếu chưa qua test.
- Tạo branch/PR và commits theo từng bước (không merge main khi chưa duyệt).
- Kết thúc với bảng: `Feature | Status | Code/Migration files | Test evidence | Remaining risks`, kèm lệnh triển khai Windows Docker Desktop và cách rollback.

**Trả lời báo cáo bằng tiếng Việt.**
