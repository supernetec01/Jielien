# Kiểm chứng UX upgrade

> Hồ sơ của lượt UX ban đầu. Trạng thái sau tích hợp V3/LAN và production mới xem [RELEASE_READINESS.md](../RELEASE_READINESS.md). Các dòng về nhánh chưa push và migration trong hồ sơ này là lịch sử, không phải trạng thái bản tích hợp.

Môi trường cloud: Node 24.22.1, PostgreSQL 17.11, Chromium thật qua playwright-core. Test schema tạm, cổng HTTP ngẫu nhiên; không dùng database công ty hoặc sửa dịch vụ 3000/3001. Dữ liệu trong ảnh là fixture; không có tài khoản/mật khẩu vận hành.

| Lệnh | Kết quả |
|---|---|
| `npm test` | 52 pass, 0 fail/skip, bao gồm test mới cho contact validation/version, quote policy và report nhiều dòng hàng |
| `npm run test:browser` | 14 nhóm kiểm tra pass |
| `npm run test:management` | 11 nhóm pass |
| `npm run test:usability` | 9 nhóm pass |
| `npm run test:commerce` | 13 nhóm pass |
| `npm run test:admin-access` | 6 nhóm pass |
| `npm run test:account` | 9 nhóm pass |
| `npm run test:bank` | 7 nhóm pass |
| `npm run test:upgrade` | 10 nhóm pass: quy cách/URL/giỏ, drawer quantity/Esc, filter apply, lỗi checkout, 5 độ rộng storefront/Admin, báo cáo đối chiếu fixture, liên hệ/chính sách, coupon editor, category XSS, không có lỗi JS |
| `npm run test:contrast` | 8 cặp màu chính đều >=4,5:1 |
| `git diff --check` | Không có lỗi khoảng trắng |

Log chọn lọc của lần chạy trong [ux-upgrade](ux-upgrade/). Test cũ đã cập nhật có chủ đích: mở khối email/ghi chú checkout trước khi nhập; form thông tin công ty chuyển từ key/value sang các trường có nhãn. Không tắt assertion và không thay lỗi bằng trạng thái thành công giả.

## Tương phản

| Cặp màu | Tỷ lệ |
|---|---|
| Navy / xanh lá CTA | 7,09:1 |
| Nội dung / trắng | 17,20:1 |
| Chữ phụ / trắng | 6,15:1 |
| Chữ phụ / nền trang | 5,78:1 |
| Link xanh đậm / trắng | 5,50:1 |
| Lỗi / trắng | 6,47:1 |
| Thành công / trắng | 7,13:1 |
| Cảnh báo / trắng | 7,09:1 |

Đây là kiểm tra cặp token chính, không phải chứng nhận toàn bộ website đạt WCAG AA.

## Ảnh và xem trực tiếp

`docs/screenshots/upgrade/` có 62 PNG: 6 màn storefront và 6 màn Admin × 5 độ rộng 320/375/768/1440/1920, cộng mini-cart và thanh mua khi cuộn ở 375px. Đã mở xem ảnh trang chủ, sản phẩm, checkout, dashboard, cấu hình công ty, đơn, kho, mã giảm giá và mini-cart; phát hiện bảng mobile giấu thao tác nên đã chuyển đơn/kho sang thẻ có nhãn, chụp lại/kiểm tra lại. Không tràn ngang toàn trang trong ma trận được assert.

Giới hạn: không phải mọi dialog/tab/editor đều được chụp ở 5 kích thước. Chưa đo Lighthouse/LCP/CLS/INP hoặc CWV p75; chưa test iOS vật lý, screen reader thực tế, Windows/Docker Desktop hoặc tải production. Không công bố số đo hiệu năng hay tỷ lệ tăng chuyển đổi chưa đo.

## Bảo toàn

Không có migration mới; migration 001–012 nguyên trạng. Không sửa công thức tính tiền, trạng thái đơn, quyền hạn hoặc quy trình xác nhận thanh toán. Thay đổi backend gồm public metadata phí ship, settings whitelist/validation và report SQL chỉ đọc; cảnh báo tồn dashboard dùng threshold từng SKU. Kiểm thử nâng cấp, cạnh tranh tồn, retry/idempotency và phân quyền trong `npm test` vẫn pass.

## Phạm vi còn lại

Xem [UPGRADE_DELIVERY.md](../UPGRADE_DELIVERY.md) để đối chiếu từng S/B/C/D, phân biệt code chưa triển khai với dữ liệu/nhà cung cấp cần chủ shop cung cấp. Bản này chưa được push/merge, chưa triển khai công khai hoặc trên máy công ty.
