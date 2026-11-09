# Nâng cấp giao diện demo Jielien

Bộ `JIELIEN_CLEAN_PUBLIC_AND_ADMIN_ACCESS.zip` là thiết kế tĩnh tham khảo. Bản nâng cấp áp dụng bố cục vào ứng dụng đang chạy API/PostgreSQL, không phục vụ các file HTML preview độc lập.

## Đã cập nhật

- Trang chủ: banner nền navy, hai thẻ giới thiệu, thông tin mua sắm, danh mục, thẻ sản phẩm, tin tức CMS; giữ tìm kiếm, giỏ, yêu thích, checkout và tra cứu đơn.
- Header sáng, màu xanh lá/logo Jielien; footer navy; responsive 320/375/768/1440 px. Bỏ liên kết tin tức trùng lặp, sidebar danh mục cũ trên hero, dải banner nhỏ cũ và mục lợi ích lặp ở chân trang.
- Admin: sidebar navy, tổng quan đặt đầu, thẻ thống kê API thật, lối tắt chỉ hiện theo quyền, bảng/form thống nhất. Mục sửa giá SKU vẫn được giữ vì có luồng chỉnh sửa và kiểm tra xung đột riêng.
- Banner: preview tiêu đề/ảnh ngay khi nhập; tạo, xuất bản, sửa và lưu trữ banner hiện có qua API versioned. Lịch hiển thị và quyền kiểm tra tại server. Khi chỉnh sửa gặp conflict, dữ liệu nhập được giữ và thông báo lỗi hiện trong form.
- Quy tắc liên kết Admin áp dụng cả trang tài khoản/footer và truy cập trực tiếp. Không có thanh chuyển Website/Admin dành cho khách.
- Dọn CSS riêng cho bố cục đã bỏ và thay các override giao diện cũ. Các tài liệu đặc tả, lịch sử migration và chức năng đang dùng vẫn được giữ.

## File chính

`public/index.html`, `public/app.js`, `public/style.css`, `public/admin.js`, `public/management.css`, `public/commerce-admin.js`; test tại `tests/commerce.browser.mjs`, `tests/browser.test.mjs`. Hướng dẫn `README.md`, `docs/COMMERCE_WINDOWS.md`, `docs/DEMO_QUICKSTART.md`. Ảnh chụp mới thay ảnh cũ tại `docs/screenshots/commerce/`; dữ liệu và ảnh xanh trong ảnh chụp là fixture kiểm thử.

## Kiểm chứng

- `npm test`: 51 test backend/unit/migration/backup.
- `npm run test:local`: 6 test cấu hình Docker/local.
- Browser: storefront 14, management 11, account 9, bank 7, admin-access 6 và commerce 13 kiểm tra.
- Commerce bổ sung chứng minh shortcut mở editor thật; banner preview → lưu publish → sửa → hiển thị trên storefront; banner editor không tràn ngang ở 375px.
- Home/catalog/news/article ở 320/375/768/1440px; editor sản phẩm/CMS và Admin có ảnh chụp. Không có lỗi JavaScript trong các luồng kiểm thử.
- GitHub Actions chạy các suite trên PostgreSQL 17 và Chrome. Kiểm thử Windows Docker Desktop và LAN tại máy công ty cần người dùng thực hiện theo quickstart; cloud không truy cập máy đó.

Lần nâng cấp UI không thêm migration, không reset database hoặc mật khẩu. Các migration 005–012 của nhánh commerce được giữ nguyên khi hợp nhất main. Không triển khai website công khai trong tác vụ này. Các giới hạn nghiệp vụ nâng cao còn lại vẫn theo `COMMERCE_RELEASE.md`; đây không phải tuyên bố hoàn tất mọi task P0–P6.
