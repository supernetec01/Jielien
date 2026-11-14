# Đối soát chuyển khoản thủ công và hết hạn đơn

Nhánh: `feat/manual-bank-reconciliation-expiry`. Source ban đầu chưa có cơ chế hết hạn đơn chuyển khoản; các phần hết hạn trước đó chỉ áp dụng coupon, session và khôi phục mật khẩu. Không tích hợp SePay, cổng thanh toán hay API ngân hàng. Telegram chỉ dùng cho thông báo nhân viên và mặc định tắt.

## Hành vi

- Giữ endpoint xác nhận thủ công `POST /api/admin/orders/:id/bank-transfer` và quyền `payments.reconcile`/CSRF. Form mới yêu cầu `receivedAmount`, nhận `bankTransactionRef` tùy chọn. Khi số tiền khác số phải thu, phải gửi `mismatchConfirmed: true`; giao diện hiển thị cảnh báo và checkbox. Xác nhận lặp không tạo thêm receipt/audit.
- `orders.grand_total` và snapshot `bank_transfer_details.amount` giữ số phải thu ban đầu. `payments.amount` lưu số thực nhận sau khi nhân viên xác nhận để báo cáo tiền đã thu phản ánh thực nhận. Event/audit lưu số phải thu, thực nhận, mã giao dịch và việc chấp nhận chênh lệch. Chênh lệch được nhân viên xử lý riêng; không tự hoàn tiền.
- Đơn đã hủy hoặc quá hạn không thể xác nhận chuyển khoản. Màn hình hướng dẫn xử lý hoàn tiền hoặc tạo lại đơn; đơn đã paid giữ tính lặp an toàn, kể cả sau hạn.
- Bộ lọc **Chờ đối soát** chỉ lấy đơn chuyển khoản chưa hủy, payment pending, cũ nhất trước (tối đa 200 đơn mỗi lượt, như giới hạn danh sách hiện có). Hiển thị tiền cần thu, nội dung, thời gian chờ và dấu hiệu khách đã báo chuyển. Có nút sao chép số tiền/nội dung trong danh sách và chi tiết.
- Khách có nút sao chép, hướng dẫn ghi ĐÚNG nội dung, hạn và thời gian còn lại khi bật hết hạn. Nút **Tôi đã chuyển khoản** ghi nhận thông báo, không đổi payment; giới hạn 5 phút/đơn bằng khóa và timestamp trong database. Truy cập phải có session của chủ đơn, token đơn hoặc số điện thoại đúng như luồng tra cứu. Bộ đếm dừng khi rời trang; quá hạn ẩn QR và chặn thao tác chuyển tiếp.

## Hết hạn và dữ liệu cũ

`ORDER_EXPIRY_ENABLED=false` mặc định; `BANK_TRANSFER_TTL_HOURS=24`. Khi bật, server chạy mỗi 10 phút. Mỗi lần dùng advisory lock theo schema, mỗi đơn dùng một transaction riêng trên kết nối giữ khóa. Lỗi một đơn được rollback và không ngăn đơn tiếp theo.

Chỉ hủy đơn chuyển khoản ở trạng thái chờ/xác nhận/chuẩn bị, payment còn pending, không có payment paid và đã tới hạn. Dùng lại `updateOrderStatus(..., 'cancelled', ..., 'Hết hạn thanh toán')` để nhả tồn/reservation, cập nhật shipment/payment/history và audit. Không hủy COD, paid, đã giao hoặc đã hủy.

Migration `020_manual_bank_workflow.sql` chỉ thêm hai cột nullable và bảng hàng đợi thông báo/index, không cập nhật dữ liệu cũ. Đơn mới khi bật tự hủy lưu hạn riêng. Đơn cũ chưa có hạn được xét bằng ngày tạo + TTL đang cấu hình; vì vậy **chạy dry-run và xem danh sách trước khi bật trên dữ liệu thật**. Đổi TTL không sửa hạn đã lưu của đơn mới trước đó. Tắt công tắc dừng tự hủy; không khôi phục đơn đã hủy.

```sh
npm run orders:expire -- --dry-run
```

Lệnh trên chỉ liệt kê mã đơn, tiền và hạn; không chạy migration, không hủy hay ghi dữ liệu. Database cần đã được nâng cấp qua quy trình migration/startup hiện có. Chạy không có `--dry-run` chỉ hủy khi công tắc bật. Lỗi từng đơn có trong `failed`; CLI trả exit code khác 0 khi có lỗi.

## Telegram

| Biến | Giá trị/cách dùng |
|---|---|
| `STAFF_NOTIFY_ENABLED` | Mặc định `false`; `true` để bật |
| `TELEGRAM_BOT_TOKEN` | Điền riêng trong môi trường, không đưa vào source/test/log |
| `TELEGRAM_CHAT_ID` | Chat nhận thông báo, điền riêng trong môi trường |
| `PUBLIC_BASE_URL` | URL gốc HTTPS của website để tạo link `/quan-tri?order=...` |

Không lưu token vào Admin. Hàng đợi chỉ lưu loại thông báo, mã đơn nội bộ và số tiền; tin nhắn chỉ có nhãn sự kiện, mã đơn, số tiền và link Admin, không có tên, điện thoại, địa chỉ hoặc token đơn. Link mở đúng chi tiết sau đăng nhập và kiểm quyền.

Thông báo đơn mới được xếp hàng cùng transaction tạo đơn, duy nhất theo đơn. Thông báo khách báo chuyển được ghi theo lần báo hợp lệ. Gửi mạng chạy sau phản hồi; worker kiểm tra hàng đợi mỗi 30 giây, timeout 3 giây/lần gửi, xử lý tối đa 10 tin/lượt. Gửi lỗi thử lại sau 5 phút, tối đa 5 lần rồi đánh dấu failed; không làm hỏng đặt hàng. Không ghi lỗi mạng/URL/token/body Telegram vào log. Có thể có tin lặp nếu Telegram đã nhận nhưng phản hồi bị mất; không liên quan tới trạng thái thanh toán.

Khi Telegram tắt, nút của khách vẫn ghi nhận trong Admin, không gửi mạng. Các thông báo khi công tắc tắt không được xếp hàng để gửi bù khi bật lại. Các bản ghi hàng đợi đã pending từ lúc bật được tiếp tục khi bật lại. Chưa có giao diện gửi lại tin failed.

## Chủ dự án tự kiểm tra

1. Cập nhật source, rebuild stack Docker hiện có; giữ nguyên volume và thông tin database. Chưa có triển khai tự động trong nhiệm vụ này.
2. Để cả hai công tắc tắt. Tạo đơn chuyển khoản thử, kiểm tra sao chép; bấm **Tôi đã chuyển khoản**, tải lại: payment vẫn chờ, nút chờ 5 phút và Admin hiện khách đã báo.
3. Admin → Đơn hàng → **Chờ đối soát**. Kiểm tra cũ nhất trước. Mở đơn, nhập số tiền thực nhận và mã giao dịch giả. Thử nhập lệch: chưa tick thì chưa ghi nhận; tick chỉ sau khi hiểu rằng đơn sẽ được đánh dấu paid và phần chênh lệch phải xử lý riêng.
4. Chạy `npm run orders:expire -- --dry-run` trước khi bật hết hạn. Trên môi trường thử, chọn TTL ngắn phù hợp, bật `ORDER_EXPIRY_ENABLED=true`, khởi động lại. Xem hạn trên đơn, chạy script hoặc đợi job; đơn quá hạn bị hủy, tồn được nhả. Không dùng dữ liệu thật để giả lập quá hạn.
5. Kiểm tra COD và đơn paid không bị hủy. Mở đơn đã hủy: không có nút xác nhận, có hướng dẫn hoàn tiền/tạo lại đơn.
6. Muốn thử Telegram, điền biến môi trường và URL HTTPS riêng rồi bật `STAFF_NOTIFY_ENABLED=true`, khởi động lại. Chỉ dùng dữ liệu thử. Kiểm tra tin mới và tin khách báo chuyển không chứa thông tin cá nhân. Tắt công tắc khi chưa dùng.

## Tắt/hoàn tác và giới hạn

Đặt `ORDER_EXPIRY_ENABLED=false` và/hoặc `STAFF_NOTIFY_ENABLED=false`, khởi động lại/recreate app theo cách chạy hiện có. Luồng xác nhận thủ công vẫn dùng được. Không rollback migration bằng cách xóa cột/bảng: giữ dữ liệu, dùng quy trình Git/rebuild hiện có với phiên bản hiểu migration 020. Không tự mở lại đơn đã hủy; nếu đã nhận tiền thì nhân viên xử lý hoàn tiền hoặc tạo lại đơn.

Chưa deploy/build Docker, chưa điền token hay gửi Telegram thật. Kiểm thử Telegram dùng transport giả lập; không gọi ngân hàng bên ngoài. Các ảnh là dữ liệu fixture, không phải đơn khách thật.

## File trong nhiệm vụ này

- `db/migrations/020_manual_bank_workflow.sql`, `db/store.mjs`, `db/schema-contract.md`.
- `lib/bank-transfer-policy.mjs`, `lib/order-expiry.mjs`, `lib/staff-notifications.mjs`, `scripts/expire-orders.mjs`, `server.mjs`.
- `public/app.js`, `public/transfer-timing.js`, `public/admin.js`, `public/admin-workspace.css`, `public/sentry-privacy.js`.
- `tests/manual-bank-workflow.test.mjs`, `tests/manual-bank-workflow.browser.mjs`, `tests/support/bank-settings.mjs`, `tests/bank-checkout.browser.mjs`, `tests/commerce-upgrade.test.mjs`.
- `package.json`, `.env.example`, `compose.yaml`, `compose.production.yaml`, `README.md`, báo cáo này.

Các thay đổi Sentry và cấu hình ngân hàng từ nhiệm vụ trước được giữ nguyên.

## Kết quả kiểm chứng

| Kiểm tra | Trước sửa | Sau sửa |
|---|---|---|
| `test:browser` | 14/14 | 14/14 |
| `test:bank` | 16 kiểm tra, tất cả pass | 26 kiểm tra, tất cả pass: 7 VietQR cũ + 3 API cấu hình + 6 UI cấu hình + 6 nghiệp vụ mới + 4 UI mới |
| `test:account` | 9/9 | 9/9 |
| `npm test` | — | 98/98 |
| `test:usability` | — | 9/9 |
| `test:commerce` | — | 13/13 |
| `test:management` | — | 11/11 |
| `test:admin-access` | — | 6/6 |
| `test:frontend-v3` | — | 12/12 |

Đã chạy bằng schema/database fixture riêng, Chromium thật ở chế độ headless và transport Telegram giả lập. Đã kiểm tra quá hạn/chưa quá hạn/paid/COD, hai lần chạy job, advisory lock, rollback lỗi một đơn rồi xử lý đơn khác, đơn đã hủy/hết hạn không thể paid, nhập lệch và chấp nhận chênh lệch, quyền/CSRF, thông báo khách giới hạn 5 phút, gửi Telegram lỗi không làm hỏng checkout, nội dung thông báo không chứa dữ liệu cá nhân. CLI `--dry-run` cũng đã được chạy trên schema thử và xác nhận chỉ liệt kê, không hủy đơn.

Kiểm thử nâng cấp database so sánh nguyên vẹn mọi trường cũ và xác nhận hai cột mới NULL trên đơn cũ; chạy migration lại không có migration mới cần áp dụng. Màn hình danh sách đối soát, form nhận tiền và trang chuyển khoản đã kiểm tra 320/375/768/1440/1920px. Đã xem ảnh desktop/điện thoại và sửa phần nút/nội dung đối soát bị chật trên mobile; kiểm tra vị trí nút không bị cắt được thêm vào browser test. Các ảnh fixture của bộ mới nằm trong `docs/screenshots/manual-bank/`; bộ quản trị cũ được chạy từ thư mục tạm để không ghi đè ảnh source có sẵn.
