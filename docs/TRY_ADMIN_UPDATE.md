# Chạy thử bản Admin mới trên máy của bạn

Bản này nằm trên nhánh **feat/admin-url-filters** của repo **supernetec01/Jielien**. Nhánh gồm toàn bộ thay đổi đã thực hiện trong chuỗi nhiệm vụ: Sentry/health, cấu hình tài khoản nhận tiền trong Admin, đối soát thủ công và hết hạn đơn, Sidebar đa cấp/URL, Topbar, Tổng quan và bộ lọc URL. Kế hoạch liên hệ khách/vận đơn chỉ có tài liệu, chưa có Bước 2; không có tích hợp SePay.

## 1. Kéo đúng nhánh và chạy lại

Mở Docker Desktop, đợi Docker Engine sẵn sàng. Mở PowerShell **ngay trong thư mục Jielien trên máy bạn**. Cần Git và Node.js 24.11 trở lên.

Trước hết:

```powershell
git status --short
```

Nếu có file đang chỉnh sửa, giữ nguyên và xử lý/lưu công việc đó trước khi đổi nhánh. Không dùng reset, không xóa dữ liệu để chuyển nhánh.

Nếu thư mục làm việc sạch, chạy từng dòng:

```powershell
git fetch origin
git switch feat/admin-url-filters
git pull --ff-only origin feat/admin-url-filters
npm run local:start
```

Lần đầu, Git thường tự tạo nhánh local theo nhánh origin cùng tên. Nếu Git báo không tạo được nhánh theo dõi và bạn chưa có nhánh local này, dùng `git switch --track origin/feat/admin-url-filters` thay cho dòng switch. Nếu đã có nhánh local, dùng dòng switch ban đầu. Không chạy `git pull origin main` để thử bản này: thay đổi đang ở nhánh riêng, chưa gộp vào main.

`local:start` build từ source vừa kéo và chạy app/database bằng Docker. Giữ `.env.local`, volume PostgreSQL và thư mục data đang có. Migration 020 của quy trình chuyển khoản là bổ sung và được hệ thống migration áp dụng khi khởi động; không seed/reset database để cập nhật.

Không cần cài dependency bằng npm ci trên Windows nếu chỉ chạy bằng Docker. Nếu muốn chạy bộ kiểm tra tự động bằng Node, cần môi trường PostgreSQL kiểm thử riêng theo tài liệu phát triển; các bước tự kiểm tra bên dưới không yêu cầu cài PostgreSQL trên Windows.

## 2. Kiểm tra ứng dụng đã chạy đúng

Sau khi lệnh thành công:

1. Mở http://localhost:3001/api/health — cần JSON có `status: "ok"`, `time`, `version`.
2. Mở http://localhost:3001/tai-khoan và đăng nhập bằng tài khoản quản trị đang có.
3. Mở http://localhost:3001/quan-tri; nhấn Ctrl+Shift+R nếu còn thấy giao diện cũ.
4. Kiểm tra Sidebar 6 nhóm đóng/mở, Topbar gọn, và Tổng quan không còn banner/Công việc thường ngày.

Nếu bạn đã đổi JIELIEN_PORT trong `.env.local`, thay 3001 bằng cổng đó. `localhost:3000` là ứng dụng khác, không phải bản vừa chạy. Nếu chưa từng tạo tài khoản quản trị, dùng `npm run local:admin` và tự nhập thông tin trong terminal; không gửi mật khẩu qua chat.

## 3. Thử bộ lọc vừa bổ sung

### Đơn chờ xác nhận

- Bấm thẻ **Đơn chờ xác nhận** trên Tổng quan.
- URL cần là `/quan-tri/don-hang?status=pending`; ô Trạng thái đơn chọn **Chờ xác nhận**.
- Danh sách chỉ chứa đơn còn pending. Nếu không có, hiển thị trạng thái rỗng, không tạo đơn giả.
- F5 hoặc Làm mới vẫn giữ bộ lọc. Đổi sang **Đã xác nhận** thì URL thành `?status=confirmed`.
- Thử Back/Forward để kiểm tra bộ lọc đi theo URL. Chọn **Tất cả trạng thái** để bỏ tham số status.
- Chọn thêm **Chờ đối soát** vẫn giữ được lọc trạng thái; URL có `reconciliation=pending`.
- Mở một đơn, tải lại, đóng chi tiết: trở về danh sách cùng bộ lọc.

### Tồn thấp

- Bấm thẻ **Cảnh báo tồn thấp** trên Tổng quan.
- URL cần là `/quan-tri/ton-kho?stock=alert`; ô Tình trạng tồn chọn **Cảnh báo tồn thấp**.
- Lọc này gồm cả **Hết hàng** và **Sắp hết**: số có thể bán <= ngưỡng của SKU; chỉ kho thường đang hoạt động. Không tính kho hư hỏng hoặc kho đã tắt.
- Số dòng cảnh báo khớp với cách tính KPI. Nếu có nhiều kho, KPI tính từng dòng SKU/kho, không phải số sản phẩm khác nhau. Dữ liệu có thể thay đổi khi nhân viên khác thao tác.
- F5 giữ bộ lọc. Thử **Sắp hết** (`stock=low`), **Hết hàng** (`stock=out`) và **Đủ hàng** (`stock=enough`); các lựa chọn cũ giữ ý nghĩa cũ.
- Chọn **Tất cả** để bỏ tham số stock. Tìm kiếm và chọn kho trên trang vẫn dùng được; nội dung ô tìm kiếm không được đưa vào URL.

Bạn cũng có thể dán trực tiếp hai đường dẫn đầy đủ:

- http://localhost:3001/quan-tri/don-hang?status=pending
- http://localhost:3001/quan-tri/ton-kho?stock=alert

Quyền truy cập giữ nguyên. URL không cấp thêm quyền cho tài khoản; đăng nhập xong sẽ trở về URL kèm bộ lọc.

## 4. Các cấu hình cần điền

**Bộ lọc URL không cần biến môi trường mới.** Bản tổng hợp vẫn giữ các tính năng ngoài ở trạng thái mặc định như các nhiệm vụ trước:

- Sentry: không có DSN thì tắt; điền riêng SENTRY_DSN_BACKEND/SENTRY_DSN_FRONTEND nếu muốn bật. Không cần điền để thử Admin.
- Tự hủy đơn chuyển khoản: ORDER_EXPIRY_ENABLED mặc định false, BANK_TRANSFER_TTL_HOURS mặc định 24.
- Telegram: STAFF_NOTIFY_ENABLED mặc định false. Chỉ bật khi đã cấu hình token/chat riêng.
- Tài khoản ngân hàng: chỉnh tại Admin → Cấu hình hệ thống → Tài khoản nhận tiền. Không có tài khoản nhận tiền thật nào được hardcode trong commit. Điền đủ thông tin hợp lệ rồi mới bật nhận chuyển khoản.

Giữ giá trị cấu hình đang dùng, không chép đè toàn bộ `.env.local` bằng `.env.example`. Không đưa `.env.local` lên Git hoặc gửi qua chat.

## 5. Khi không mở được và cách quay lại

Chạy:

```powershell
npm run local:status
```

Nếu dịch vụ chưa khỏe, xem `npm run local:logs` trên máy bạn để xác định lỗi; không đăng công khai log có thông tin nhạy cảm. Kiểm tra đã đúng thư mục, đúng nhánh, cổng và Docker Desktop đang chạy.

Để bỏ riêng bộ lọc, chọn **Tất cả** hoặc mở URL trang không có query. Không cần sửa code.

Nếu cần chạy lại source cũ: sau khi bảo đảm không có sửa đổi chưa lưu, chuyển sang nhánh/commit đã dùng trước đó rồi `npm run local:start` để rebuild. Không xóa volume hoặc data, không chạy down -v. Migration bổ sung không có bước hạ/xóa dữ liệu; nếu phục hồi phiên bản cũ của toàn bộ ứng dụng, cần kiểm tra tính tương thích schema trước. Để trở về main đang có trên GitHub, có thể dùng `git switch main`, `git pull --ff-only origin main`, rồi `npm run local:start`.

Đẩy source lên GitHub không tự cập nhật website trên máy bạn và không phải deploy production.
