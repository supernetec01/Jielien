# Nâng cấp giao diện danh mục, thuộc tính và SKU

Ngày kiểm tra: 2026-11-09. Dữ liệu trình duyệt là fixture trong schema PostgreSQL riêng, không sử dụng dữ liệu khách hàng.

## Thay đổi

- Danh mục / thương hiệu / thuộc tính: bổ sung tìm theo tên hoặc mã, trạng thái không có kết quả, tăng cỡ chữ của giá trị và vùng thao tác.
- Thêm giá trị thuộc tính bằng từng ô có nhãn; thêm hoặc bỏ dòng chưa lưu. Giá trị đã lưu hiển thị riêng và được giữ nguyên. Không còn nhập toàn bộ lựa chọn vào textarea nhỏ.
- Sản phẩm: chia thông tin, phân loại & giá, hình ảnh thành ba khu vực có liên kết điều hướng. Mỗi khu vực giữ nút lưu riêng để phản ánh API hiện có.
- SKU: tên, mã, giá, trạng thái và cảnh báo tồn luôn hiện; mã vạch, khối lượng, kích thước, thuộc tính nằm trong khu vực mở rộng. Chọn thuộc tính theo tên thay cho gõ ID.
- Bộ tạo tổ hợp có lựa chọn lớn, hỗ trợ bàn phím; giữ giới hạn 100 tổ hợp và chống thêm trùng. Cần bấm Lưu SKU để ghi các tổ hợp mới.
- Sidebar desktop cố định sát mép trái, từ đỉnh tới đáy viewport; header và nội dung nằm bên phải. Chỉ danh sách menu cuộn bên trong. Điện thoại giữ menu đóng/mở, bố cục một cột.
- Danh sách và biểu mẫu danh mục chia đều hai cột, cùng chiều cao trên desktop. Các cột bảng tự phân bổ, nút Sửa/Xóa có khoảng cách đồng nhất; trên điện thoại chuyển thành từng thẻ.
- Bổ sung xóa danh mục, thương hiệu và nhóm thuộc tính chưa sử dụng; có xác nhận trước khi xóa, thông báo lỗi ngay trên danh sách và ghi nhật ký. Danh mục có sản phẩm hoặc danh mục con, thương hiệu có sản phẩm, thuộc tính gắn với SKU đều được giữ lại và trả lỗi 409.

## Kiểm chứng

- `npm test`: 67/67, gồm kiểm tra xóa mục chưa sử dụng, chặn xóa mục đang dùng, CSRF, quyền truy cập, lỗi không tồn tại và nhật ký.
- `npm run test:commerce`: 13/13.
- `npm run test:usability`: 9/9.
- `npm run test:management`: 11/11.
- `npm run test:admin-access`: 6/6.
- `npm run test:admin-layout`: 5 kích thước màn hình, menu và hộp thoại đơn hàng.
- `npm run test:admin-catalog`: thêm/xóa danh mục chưa sử dụng, hủy xác nhận, báo lỗi khi mục đang dùng; hai khung bằng nhau và menu không đổi vị trí khi cuộn; thêm giá trị rồi tải lại, bảo toàn giá trị cũ, bỏ dòng chưa lưu, hủy sửa, tìm không có kết quả; lưu lựa chọn thuộc tính theo tên và tải lại; tạo tổ hợp không trùng; không tràn ngang tại 320/375/768/1440/1920px.
- Đã xem ảnh desktop/tablet/mobile trong `docs/screenshots/admin-catalog-layout/` và sửa các lỗi tab bị khuất, danh sách bị cắt trên điện thoại.
- Không thay migration. API mới: `DELETE /api/admin/catalog/{categories|brands|attributes}/:id`, yêu cầu quyền `catalog.edit` và CSRF. Kiểm tra liên kết, xóa và ghi audit trong cùng transaction; khóa dòng trước khi kiểm tra để bảo vệ liên kết khi có thao tác đồng thời.

## Giới hạn và công việc tiếp theo

- Chưa hỗ trợ đổi tên hoặc xóa riêng từng giá trị thuộc tính đã lưu. Có thể xóa toàn bộ nhóm thuộc tính nếu không có SKU sử dụng. Giao diện không cung cấp thao tác gây hiểu nhầm. Muốn bổ sung cần xử lý liên kết SKU và quy tắc khi giá trị đã được dùng; cửa hàng cần quyết định có cho ngừng dùng, đổi tên hay gộp lựa chọn không.
- Lưu một phần vẫn tải lại trình biên tập theo luồng hiện có. Hãy lưu phần đang sửa trước khi chuyển sang sửa phần khác. Cải tiến tiếp theo có thể thêm cảnh báo rời trang và lưu đồng thời có xử lý xung đột.
- Email báo đơn hàng nằm trong đề xuất `docs/proposals/ORDER_EMAIL_NOTIFICATION.md`, chưa triển khai trong lần chỉnh UI này. Cần email nhận thông báo, dịch vụ gửi thư/tài khoản SMTP, cấu hình tên miền gửi thư và thông tin xác thực được đặt riêng trong môi trường máy chủ.
- Đây là cập nhật source; chưa triển khai lên máy của cửa hàng. Kiểm thử qua không phải cam kết website không bao giờ phát sinh lỗi.

## Cập nhật máy đang chạy local

Trong thư mục Jielien, chạy `git pull --ff-only origin main`, sau đó `npm run local:start` để build lại Docker theo source mới. Mở lại `/quan-tri` và nhấn Ctrl+F5. Xem `docs/LOCAL_WINDOWS.md` nếu cần hướng dẫn Docker Desktop. Không xóa database hoặc volume.
