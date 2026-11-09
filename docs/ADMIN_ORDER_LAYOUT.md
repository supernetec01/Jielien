# Sửa khung Admin và chi tiết đơn hàng

Khắc phục phản hồi ảnh chụp: sidebar desktop trước đây cao `100dvh - 40px` trong khi bắt đầu dưới header + lề trên, dẫn đến phần tài khoản cuối sidebar ngoài viewport. Nay trừ vùng header/lề, giữ brand/tìm kiếm/tài khoản không co; chỉ danh sách chức năng cuộn.

Chi tiết đơn trước đây giới hạn 700px, thông tin khách/đơn 12px. Nay dùng workspace rộng tối đa 1280px, hai thẻ khách hàng/đơn phía trên; sản phẩm và thanh toán/xử lý bên dưới, cột xếp lại ở màn nhỏ. Tên khách 22–24px, điện thoại 20–21px có link gọi, địa chỉ 18px, nội dung đơn 16px, tổng tiền 28–30px. Header/đóng luôn thấy; chỉ nội dung dialog cuộn, nền trang khóa cuộn khi dialog mở.

Giữ nguyên API, quyền, CSRF, version, form trạng thái/đối soát/thu COD và lý do điều chỉnh. Chưa có form tạo đơn hộ hoặc gửi email mới. Đề xuất chức năng tại [ORDER_EMAIL_NOTIFICATION.md](proposals/ORDER_EMAIL_NOTIFICATION.md).

Kiểm tra: `npm run test:admin-layout` dùng đơn/khách fixture, assert menu/tài khoản trong viewport desktop, dialog rộng, cỡ chữ, không tràn ngang, nội dung cuộn không làm header biến mất, Esc đóng. Ảnh 320/375/768/1440/1920 tại `docs/screenshots/admin-order-layout/`; không chứa dữ liệu khách thật. Chạy thêm management/usability/commerce/admin-access theo AGENTS.md.

Sau khi cập nhật Git: `git pull --ff-only origin main`, `npm run local:start`, Ctrl+F5. Không cần migration, reset volume hoặc tạo lại tài khoản.

Kết quả lượt sửa: management 11, usability 9, commerce 13, admin-access 6 nhóm pass; test layout đạt cả 5 viewport, kiểm cả mở lại đơn bắt đầu từ đầu. Không chạy lại toàn bộ API vì không thay luồng dữ liệu/validation. Đã mở xem ảnh desktop/mobile và sửa vị trí cuộn, cỡ chữ số lượng/đơn giá.

Cập nhật theo phản hồi mép trái: desktop dùng toàn bộ chiều ngang viewport, menu x=0 sát mép trái, bắt đầu ngay dưới header (76px nội dung + 1px viền) và kéo đến đáy màn hình; bỏ khung bo góc/lề ngoài của sidebar. Nội dung vẫn có padding bên trong để dễ đọc. Mobile giữ menu thu gọn. Regression test kiểm x=0 và không có khoảng hở giữa header/sidebar.
