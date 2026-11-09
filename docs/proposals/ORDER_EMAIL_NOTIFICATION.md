# Đề xuất: email báo đơn mới cho cửa hàng

Trạng thái: **đề xuất, chưa triển khai/chưa gửi email**. Lượt sửa hiện tại chỉ đổi giao diện Admin và chi tiết đơn. Không tạo form đặt đơn hộ trong Admin.

## Mục tiêu

Khi khách đặt đơn thành công, cửa hàng nhận email để nhân viên kiểm tra và xử lý. Không yêu cầu khách đăng ký và không làm checkout chậm hoặc thất bại khi SMTP lỗi. Email này gửi cho nhân viên cửa hàng, chưa mở rộng sang email xác nhận cho khách.

## Luồng kỹ thuật khuyến nghị

1. Trong đúng transaction tạo đơn lần đầu, ghi một bản ghi `email_outbox` loại `shop.order_created`. UNIQUE theo `(event_type, order_id)` để retry checkout cùng idempotency key không sinh thêm thông báo.
2. Chỉ sau COMMIT, worker lấy bản ghi bằng cơ chế claim/lease (FOR UPDATE SKIP LOCKED), gửi SMTP rồi cập nhật trạng thái. Transaction rollback không có email; lỗi SMTP không rollback đơn đã tạo.
3. Worker chạy nền, có timeout SMTP, retry tăng dần và giới hạn số lần. Mục tiêu lần gửi đầu trong vài giây khi dịch vụ hoạt động; thời điểm thư đến phụ thuộc nhà cung cấp, không đảm bảo tức thì.
4. Quá số lần thử → trạng thái thất bại, Admin hiện lỗi đã làm sạch và nút gửi lại cho người có quyền, audit thao tác. Không ghi credential hoặc toàn bộ nội dung khách vào log.
5. Khi app khởi động lại, worker tiếp tục bản ghi chưa xử lý; dùng lease hết hạn để phục hồi công việc. SMTP có thể nhận thư rồi mất response trước khi app ghi sent, vì vậy không cam kết exactly-once delivery. Dùng Message-ID ổn định theo event và chỉ retry theo chính sách rõ ràng; chống trùng sự kiện trong database.
6. Chưa cấu hình SMTP/người nhận → không giả báo đã gửi. Admin hiển thị “Chưa cấu hình email báo đơn”; checkout và danh sách đơn vẫn hoạt động.

## Nội dung email

- Tiêu đề: `Jielien · Đơn mới {mã đơn}`.
- Mã đơn, thời gian đặt theo giờ Việt Nam, số lượng sản phẩm, tổng tiền, COD/chuyển khoản và trạng thái thanh toán hiện tại.
- Tên người nhận có thể hiển thị nếu cửa hàng cần; mặc định không đưa địa chỉ/điện thoại đầy đủ vào email để hạn chế phát tán dữ liệu cá nhân.
- Nút “Mở trang quản trị” trỏ về PUBLIC_BASE_URL/quan-tri; phải đăng nhập bằng tài khoản nhân viên. Không gửi cookie, access token tra cứu đơn hoặc link bỏ qua đăng nhập.
- Có bản HTML và text, escape toàn bộ dữ liệu động. Đơn chuyển khoản chưa đối soát phải ghi đúng “Chờ xác nhận thanh toán”, không ghi “Đã trả tiền”.

## Cấu hình cần từ chủ cửa hàng

| Thông tin | Mục đích |
|---|---|
| Email nhận thông báo của cửa hàng | Một email hoặc nhóm nhân viên; có thể hỗ trợ nhiều người nhận với giới hạn rõ ràng |
| Email gửi và nhà cung cấp | Nên dùng dịch vụ email giao dịch/SMTP được phép gửi từ tên miền cửa hàng |
| SMTP host/port và phương thức xác thực | Theo nhà cung cấp; dùng TLS, không tắt kiểm tra chứng chỉ |
| Credential SMTP | Nhập qua môi trường bảo mật, không gửi chat, không lưu vào API settings công khai hoặc Git |
| Tên miền và người có quyền DNS | Thiết lập SPF/DKIM/DMARC theo hướng dẫn nhà cung cấp; thử vào Inbox/Spam |
| Người phụ trách kiểm tra lỗi gửi | Quy trình xử lý khi email tạm lỗi; danh sách đơn trong Admin vẫn là nguồn chính |

Tên cấu hình đề xuất: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `ORDER_NOTIFICATION_TO`. Không dùng email hỗ trợ public để tự suy ra người nhận nội bộ. Không đưa SMTP password vào form công ty đang public qua `/api/site`.

## Hạng mục phát triển và nghiệm thu

- Migration mới (không sửa 001–014): outbox, unique event/order, trạng thái/số lần thử/next_attempt_at/lease/sent_at; có chính sách lưu và dọn nội dung.
- Module gửi SMTP bằng thư viện phù hợp, worker và cấu hình bật/tắt; không gửi ra ngoài trong test.
- Màn Admin xem trạng thái email theo đơn và retry theo quyền/audit.
- Kiểm thử SMTP cục bộ: tạo đơn thành công chỉ có một sự kiện; rollback không gửi; retry checkout không tạo thêm sự kiện; SMTP timeout không làm mất đơn; restart tiếp tục gửi; worker cạnh tranh không cùng claim; hết lượt retry có lỗi rõ ràng; mẫu HTML không thực thi nội dung nhập.
- Thử đầu cuối với mailbox của cửa hàng trước khi bật gửi thật; kiểm tra DNS, thư rác và độ trễ thực tế.

## Nếu cần nhân viên tạo đơn hộ khách

Đây là tính năng riêng, chưa có trong lượt sửa giao diện. Đề xuất màn “Tạo đơn” có khách hàng/người nhận lớn, tìm SKU, số lượng, báo giá server, phí ship, phương thức và xác nhận. Phải dùng cùng transaction/idempotency/giữ tồn như checkout, có quyền `orders.create` và audit nhân viên tạo; không cho client tự ghi giá/tổng hoặc ghi đã nhận tiền. Đơn nhân viên tạo thành công có thể dùng chung sự kiện email ở trên.
