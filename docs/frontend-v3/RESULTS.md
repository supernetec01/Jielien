# F8 — kết quả kiểm chứng

Bản source ở `feat/frontend-v3`, base `2b4e299`. Kết quả dưới đây là cloud Linux/Chromium/PostgreSQL 17 và Docker Linux containers, không phải phép đo trên máy công ty hay kết quả thực địa.

| Lệnh | Kết quả |
|---|---|
| `npm test` | 59 test đạt: 51 regression + 8 integration V3 |
| `npm run test:local` | 6 test cấu hình/init đạt |
| `npm run test:browser` | 14 kiểm tra storefront/search/filter/page/giỏ/COD/idempotency/tra cứu/yêu thích/responsive đạt |
| `npm run test:management` | 11 kiểm tra account/đơn/kho/giá xung đột/quyền đạt |
| `npm run test:account` | 9 kiểm tra tài khoản/địa chỉ/password/session và giỏ lỗi tạm đạt |
| `npm run test:bank` | 7 kiểm tra VietQR local, snapshot, phân quyền, đối soát idempotent và fallback COD đạt |
| `npm run test:commerce` | 13 kiểm tra catalog/SKU/media/staff/CMS/banner/company settings đạt |
| `npm run test:admin-access` | 6 trường hợp guest/customer/staff không quyền/viewer/admin/logout đạt |
| `npm run test:usability` | 9 nhóm thao tác Admin/responsive đạt |
| `npm run test:frontend-v3` | 11 nhóm V3 đạt; tổng các suite browser là 80 nhóm kiểm tra |
| `npm run test:local:stack` | 5 nhóm Docker/PG17: cấu hình, checkout/VietQR, media, giữ dữ liệu sau recreate, backup/restore drill đạt |
| `npm run test:load` | 120 requests, concurrency 8, không lỗi; p95 97ms trong lab này |
| `git diff --check` | Không lỗi whitespace |

## Integration và bảo mật V3

1. Deployment trống không tự seed demo/campaign, dữ liệu `catalog.json` cũ không được phục vụ từ public.
2. SQL search/category/brand/age/price/sort/page; alias API cũ; default/cap 48 SKU. Fixture bulk 96 SKU không tạo phản hồi không giới hạn. Tải SKU mục tiêu và biến thể sản phẩm không phụ thuộc trang đầu.
3. Banner slot/lịch/thứ tự, link nội bộ, focal bounds, version conflict, whitelist settings. Thử 200 banner một slot không làm các slot khác biến mất; public cap 10 entry/slot.
4. Mobile media chỉ public khi banner còn hiệu lực; SVG upload bị chặn; ảnh không gắn nội dung public bị 404.
5. Guest/customer/CSRF sai bị 401/403; nhân viên chỉ có quyền banner sửa được banner và không đọc được tài khoản khác. `/quan-tri`/`admin.html` trả 401/403 theo phiên.
6. Product/Article JSON-LD, canonical, Breadcrumb, HTML nội dung, sitemap, URL 301/404 thật, không hash routing, không lối Admin trong public shell kể cả khi đăng nhập staff.
7. Migration 013 giữ ID, asset, title, status, version và lịch của banner cũ; migration/upgrade suite giữ snapshot account/order/stock cũ.

## Browser V3

- Home/hero/poster đúng slot; responsive picture chọn ảnh mobile thật. API catalog bounded, tab ngành hàng và URL category dựa DB.
- Chọn SKU/giá/ảnh, giỏ reload có SKU ngoài trang đầu, quote server; hết hàng vô hiệu hóa mua.
- Slow/error catalog: SSR vẫn đọc được nội dung, nút giao dịch chờ hydrate, có retry; lỗi nội dung tùy chọn không hiện quảng cáo giả hoặc lối Admin.
- Banner Studio sửa slot/ảnh mobile/thứ tự, preview thiết bị, lưu và thấy đúng poster trên storefront; fallback mobile → desktop.
- 108 danh mục vẫn không làm tràn màn hình 320px; có kiểm tra menu bằng touch context Chromium. Không có lỗi JavaScript trong các luồng.

## Ảnh và đánh giá trực quan

`screenshots/home-*` và `catalog-*`: 320, 375, 390, 430, 768, 1024, 1366, 1440, 1920px. Detail/cart/account/journal/article: 320/375/768/1440. Studio: 375/1440. `reference-desktop.png`, `reference-mobile.png` là ảnh **prototype gốc** để đối chiếu; `baseline/` là UI trước sửa. Dữ liệu ảnh app là fixture, không phải nội dung công ty.

Đã xem ảnh desktop/mobile của ứng dụng thực tế, chỉnh badge/heart để neo trong card, tránh ảnh danh mục chèn tên, đồng nhất độ tương phản và khối hero/poster. Nội dung/campaign/photo cụ thể phải do công ty cấu hình; hình minh họa trong prototype không được nhập vào DB.

## Khả năng truy cập và hiệu năng

- `accessibility.json`: axe-core 4.11, WCAG 2 A/AA và 2.1 A/AA trên home đã hydrate, **0 violations**. Không phải chứng nhận WCAG cho toàn bộ ứng dụng; các trang khác có kiểm tra keyboard/focus/label và responsive trong regression.
- `performance.json`: đo CLS/LCP/navigation của fixture local bằng PerformanceObserver. CLS xấp xỉ 0.0023 ở lượt ghi nhận. Không phải Lighthouse, số đo người dùng thật hoặc cam kết CWV p75. Các ảnh campaign có kích thước cố định, ảnh hero eager/high priority, ảnh dưới fold lazy, WebP pipeline hiện có; chưa sinh đa kích thước/AVIF tự động.
- `load.json`: benchmark môi trường phát triển. Không suy ra năng lực production, tốc độ Windows/LAN hoặc mạng di động.

## Giới hạn bàn giao

- Chưa chạy UAT trên Windows vật lý, Chrome/Edge của nhân viên, iOS/Safari hoặc hai PC LAN công ty. Hướng dẫn staging nằm trong README/MIGRATION của thư mục này.
- Chưa có newsletter consent backend: form được ẩn. Không tự đưa thông tin pháp lý hoặc cam kết thương mại giả vào website.
- API banner cập nhật khi tải trang; không có push realtime đến tab mở lâu. Library Admin hiện giới hạn 180 entry; public giới hạn độc lập 10/slot. Cấu hình nhiều hơn cần mở rộng phân trang Admin ở tác vụ riêng.
- Giữ logo gốc; không có biến thể transparent đã được công ty xác nhận. Nội dung/quy định pháp lý cuối cùng cần công ty cung cấp trong settings/CMS.
- Không merge main, triển khai Internet hoặc thao tác database công ty trong tác vụ này. Trạng thái CI GitHub xem tại pull request.
