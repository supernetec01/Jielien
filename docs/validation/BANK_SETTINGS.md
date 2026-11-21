# Cấu hình tài khoản nhận tiền trong Admin

Nhánh: `feat/admin-bank-settings`. Phạm vi: màn hình cấu hình ngân hàng và việc dùng cấu hình đó cho đơn mới. Các thay đổi Sentry từ nhiệm vụ trước được giữ lại. Không triển khai webhook SePay; vẫn cần tài liệu `docs/sepay-webhook.md`. Không deploy, không sửa schema/migration hay thông tin ngân hàng của đơn cũ.

## Đã thay đổi

- Thêm mục **Quản lý hệ thống → Tài khoản nhận tiền** với bốn ô: ngân hàng, mã VietQR, số tài khoản và chủ tài khoản.
- Cho lưu nháp khi thiếu thông tin. Bật chuyển khoản yêu cầu đủ bốn thông tin hợp lệ; không thay mã ngân hàng còn thiếu bằng mã giả.
- Dùng bảng `site_settings` hiện có, khóa riêng không nằm trong cấu hình công khai. Khi đã lưu, cấu hình Admin được ưu tiên hơn biến môi trường; hiệu lực cho đơn mới ngay.
- Giữ nguyên thông tin ngân hàng/QR và kết quả gửi lại của đơn cũ. Có quyền xem/sửa riêng, CSRF, kiểm tra phiên bản và nhật ký không chứa chi tiết tài khoản.
- Demo với thông tin chủ dự án cung cấp chỉ chạy trong schema thử riêng; không đưa dữ liệu đó vào source, test fixture hay cấu hình website đang bán hàng. Ảnh desktop/điện thoại đã được xem.

## Danh sách file của phần ngân hàng

- `lib/bank-settings.mjs`: đọc/lưu cấu hình, kiểm tra dữ liệu, phiên bản và audit.
- `db/store.mjs`: lấy cấu hình hiện hành khi liệt kê phương thức và tạo đơn.
- `server.mjs`: nối service cấu hình và chờ kết quả danh sách phương thức.
- `lib/commerce-routes.mjs`: GET/PATCH `/api/admin/settings/bank-transfer` với kiểm tra quyền.
- `public/bank-settings-admin.js`: renderer và handler màn hình ngân hàng.
- `public/commerce-admin.js`: nối màn hình mới vào bộ biên tập.
- `public/admin.js`: menu tài khoản nhận tiền.
- `public/admin-workspace.css`: bố cục checkbox và thông tin tài khoản trên màn hình nhỏ.
- `public/sentry-privacy.js`: cho phép tên hai file source mới trong stack trace đã lọc.
- `tests/support/bank-settings.mjs`: fixture riêng, mật khẩu/token sinh ngẫu nhiên.
- `tests/bank-settings.test.mjs`: quyền/CSRF, nháp, kiểm tra dữ liệu, cạnh tranh ghi, snapshot và tắt chuyển khoản.
- `tests/bank-settings.browser.mjs`: lưu/hủy/lỗi, bật/tắt, quyền chỉ xem và 5 kích thước màn hình.
- `tests/bank-payments.test.mjs`: chờ phương thức đọc cấu hình bất đồng bộ, giữ nguyên nội dung kiểm tra cũ.
- `package.json`: thêm kiểm thử cấu hình vào `npm test` và `npm run test:bank`.
- `.env.example`: hướng dẫn ưu tiên cấu hình trong Admin; không thêm giá trị ngân hàng thật.
- `README.md`: cách dùng, kiểm tra và tắt.
- `docs/validation/BANK_SETTINGS.md`: báo cáo này.
- `docs/screenshots/bank-settings/bank-settings-{320,375,768,1440,1920}.png`: ảnh kiểm thử giao diện bằng dữ liệu giả.

## Kiểm thử

| Bộ kiểm tra | Trước sửa | Sau sửa |
|---|---|---|
| `test:browser` | 14/14 | 14/14 |
| `test:bank` | 7/7 | 7 kiểm tra cũ + 3 API mới + 6 giao diện mới, tất cả pass |
| `test:account` | 9/9 | 9/9 |
| `npm test` | Không chạy toàn bộ trước sửa | 92/92 |
| `test:usability` | — | 9/9 |
| `test:commerce` | — | 13/13 |
| `test:management` | — | 11/11 |
| `test:admin-access` | — | 6/6 |

Các bộ quản trị cũ tạo ảnh được chạy từ thư mục tạm để không ghi đè ảnh có sẵn trong source. Bộ ngân hàng mới ghi ảnh dữ liệu giả vào `docs/screenshots/bank-settings/`. Màn hình ngân hàng đã kiểm tra 320/375/768/1440/1920px, không tràn ngang. Ảnh demo riêng dùng thông tin được chủ dự án cung cấp và nằm ngoài source; các kiểm tra bật QR chỉ dùng tài khoản giả. Đã kiểm tra cấu hình nháp còn sau khi tải lại; khởi tạo lại service vẫn ưu tiên cấu hình đã lưu; đổi tài khoản không đổi snapshot/QR của đơn cũ.

## Chủ dự án tự kiểm tra

1. Cập nhật source và rebuild stack Docker hiện có. Đăng nhập Admin có quyền sửa cấu hình.
2. Mở **Quản lý hệ thống → Tài khoản nhận tiền**. Nhập ngân hàng, tài khoản và chủ tài khoản. Nếu chưa có mã VietQR, để trống mã và không bật checkbox.
3. Lưu, tải lại trang, mở lại mục này: thông tin vẫn còn. Sửa thử rồi chọn **Hủy chỉnh sửa**: trở về dữ liệu đã lưu.
4. Chỉ khi đã xác minh mã ngân hàng và tài khoản: điền đủ, bật checkbox, lưu. Trên môi trường thử, tạo một đơn chuyển khoản, kiểm tra thông tin nhận tiền/QR.
5. Đổi thông tin nhận tiền; mở lại đơn cũ để xác nhận không thay đổi. Tắt checkbox rồi lưu; đơn mới không thể chọn chuyển khoản, COD vẫn hoạt động.

## Biến môi trường, tắt và phần còn lại

Không có biến môi trường mới cần điền. Bốn biến `BANK_*` cũ chỉ là cấu hình ban đầu khi chưa lưu trong Admin. Không cần điền token SePay ở màn hình này.

Để tắt, bỏ chọn **Bật thanh toán chuyển khoản cho đơn mới** rồi lưu. Hoàn tác phần source bằng quy trình Git/rebuild hiện có, không xóa dữ liệu. Nếu quay về phiên bản cũ chỉ đọc biến môi trường, kiểm tra lại bốn biến `BANK_*` vì phiên bản cũ không đọc cấu hình Admin.

Chưa build Docker hay deploy; chưa xác minh mã VietQR/tài khoản với ngân hàng; chưa thử chuyển tiền thật. SePay A/B vẫn chưa làm, chờ tài liệu và phê duyệt theo yêu cầu trước đó.
