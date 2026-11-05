# PR #2 — Điều hướng Admin theo quyền

Nhánh `fix/role-gated-admin-navigation`, base `feature/jielien-commerce-cms`. Bản sửa gốc bd81c4b được kế thừa, không thay bằng preview tĩnh. Không merge/deploy tự động.

## Quy tắc đã kiểm chứng

| Phiên người dùng | Footer | Trang tài khoản | Mở trực tiếp /quan-tri | API quản trị |
|---|---|---|---|---|
| Guest | Ẩn | Không có link | Hiện yêu cầu đăng nhập | 401 |
| Customer | Ẩn | Không có link | Hiện không đủ quyền | 403 |
| Staff không có workspace permission | Ẩn | Không có link | Hiện không đủ quyền | 403 |
| Viewer có catalog.read | Hiện | Có link | Vào phần catalog được phép | Catalog GET 200; users GET và mutation 403 |
| Admin | Hiện | Có link | Vào workspace | API được phép trả 200 |

Footer ẩn ngay HTML ban đầu bằng hidden + display:none để tránh CSS display của footer làm lộ link trước khi xác thực. Sau `/api/auth/me`, chỉ role không phải customer kèm quyền màn hình thực mới hiện link. Không đọc quyền từ localStorage hay từ checkbox trên UI. Payload roles/permissions thiếu hoặc sai kiểu không mở link.

`public/admin-access.js` dùng chung cho storefront, account và admin shell. Khi thêm màn hình Admin, cập nhật danh sách workspace permissions tương ứng; các endpoint tiếp tục tự kiểm permission ở server. Ẩn UI không phải rào cản bảo mật: HTML /quan-tri có thể trả shell đăng nhập, nhưng không chứa dữ liệu nghiệp vụ; dữ liệu/action từ `/api/admin/*` vẫn cần session và permission, mutation cần CSRF.

## Kiểm thử 2026-11-05

- `npm test`: 51 pass, 0 fail/skipped/cancelled (bao gồm regression toàn dự án và 5 test điều kiện hiển thị).
- `npm run test:admin-access`: 6 kiểm tra E2E đạt; session thật trong Chromium, PostgreSQL schema tạm: 5 nhóm tài khoản trên footer/account/direct URL/API, và logout.
- Test ghi trực tiếp bằng guest/customer/no-access/viewer bị từ chối, không đổi SKU.
- `git diff --check` đạt; các test được đăng ký trong GitHub Actions. Kết quả CI trên commit cuối cần xem tại PR #2, không suy ra từ CI của commit cũ.
- Không có migration, không sửa dữ liệu hoặc mật khẩu PostgreSQL, không triển khai lên máy chủ công ty.

## ZIP đính kèm

`JIELIEN_STORE_PUBLIC_PREVIEW.html` đã kiểm bằng HTML parser: không có phần tử prototype-tabs, liên kết Admin hoặc panel Admin. CSS còn tên selector không tạo ra màn hình Admin. Hai preview Admin còn lại chỉ dành cho review nội bộ; không chép chúng vào public hoặc dùng thay ứng dụng có đăng nhập/DB thật. ZIP được giải nén ngoài checkout, không được đưa vào static routes.
