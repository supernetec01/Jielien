# Kiểm chứng nâng cấp LAN

Ngày 2026-11-03, Linux cloud, Node 24.22.1 / PostgreSQL 17.11 / Chromium:

- npm test: 31 pass (API cũ, migrations, import SQLite, RBAC, CSRF, khóa tài khoản, admin cuối, phiên bản SKU, backup binary).
- npm run test:local: 6 pass; giữ file/password cũ, cấu hình LAN/IP/port.
- npm run test:browser: 14 kiểm tra pass.
- npm run test:management: 11 kiểm tra pass, gồm UI cấp role và conflict SKU.
- npm run test:account: 9 kiểm tra pass.
- npm run test:bank: 7 kiểm tra pass.
- npm run test:local:stack: pass trên Docker Engine 29.9.2; Compose localhost/LAN hợp lệ, DB không publish port, health, đăng ký/CSRF/VietQR; tạo lại container giữ session/đơn/giá/tồn; pg_dump custom binary và pg_restore vào database drill độc lập giữ đơn hàng.
- git diff --check và kiểm tra cú pháp thành công.

Các test chạy schema tạm hoặc project Docker riêng, không dùng database công ty. Volume test Docker được giữ lại có chủ đích; không chạy lệnh xóa volume.
Chưa xác minh thực tế trên Windows Docker Desktop, Windows Task Scheduler, firewall công ty hoặc hai máy LAN. IT cần làm checklist LAN_DEPLOYMENT.md; kết quả Docker Linux không thay thế LAN E2E công ty.

Migration 003 chỉ thêm role/permission; 004 thêm row_version mặc định 1 cho SKU. Không sửa migration 001/002, không reset/đổi mật khẩu PostgreSQL. Backup trước triển khai; giữ .env.local và volume. Khôi phục/rollback phải có kế hoạch tương thích schema, không checkout bản thiếu migration đã áp dụng rồi xóa database để khắc phục.
