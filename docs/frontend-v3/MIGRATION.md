# Migration 013 và kế hoạch chuyển phiên bản

`013_frontend_v3.sql` chỉ ADD COLUMN/INDEX. Không sửa các migration 001–012, không drop/reset bảng, đổi mật khẩu, thay ID hoặc snapshot đơn hàng.

## Thay đổi

`page_banners`: thêm `slot`, `asset_mobile_id`, `alt`, `subtitle`, `cta_label`, `sort_order`, `focal_x`, `focal_y`, `created_by`, `updated_by`, `updated_at`. `asset_id` hiện tại tiếp tục là desktop asset; API Admin trả thêm alias `asset_desktop_id`. Không tạo bản sao ảnh. Giữ `starts_at/ends_at` và version cũ. Banner cũ mặc định `home_hero`, thứ tự 0, lấy nét 50/50, không có mobile nên dùng desktop. Alt rỗng của dữ liệu cũ fallback alt từ media.

Slot có CHECK giới hạn sáu vị trí; mobile asset có FK; focal 0–100. Chỉnh sửa giữ row lock/version, trả 409 khi dùng phiên bản cũ. Actor chỉ trả ở API Admin. Có index banner published và giá SKU active.

`categories`: thêm `image_asset_id` FK đến media. Sort_order/parent_id/slug có sẵn được kế thừa. Không tự thêm hoặc đổi ngành hàng. URL ảnh public chỉ được phục vụ khi gắn với category active, banner còn lịch hoặc nội dung public hợp lệ.

## Trước cập nhật

- Backup database và media bằng `npm run db:backup` trong stack cũ đang chạy. Copy bundle ra nơi khác theo quy trình công ty; xem `COMMERCE_WINDOWS.md` để kiểm checksum/restore vào database drill riêng.
- Giữ `.env.local`, mật khẩu PG, thư mục `data`, volume và đúng project. Không dùng `down -v`.
- Review các ảnh cũ: banner cũ có thể không đúng crop V3; upload/gắn ảnh desktop/mobile thật qua Studio sau cập nhật, không dùng dữ liệu HTML mẫu.
- Giữ database riêng cho staging; các test tự tạo schema riêng và chỉ xóa schema test của chúng.

## Áp dụng và đối soát

App startup chạy runner checksum/transaction hiện có. Cần quyền DDL như các migration cũ. Thử vào thời điểm ít thao tác để tránh chờ khóa; migration lỗi thì transaction rollback, không reset để thử lại.

Đối soát số tài khoản/đơn/SKU/tồn và lịch/banner trước/sau; thử đăng nhập, quote/COD/VietQR và ảnh. Test tự động đã kiểm banner cũ giữ toàn bộ cột cũ, ID/version/lịch; test upgrade của repo vẫn kiểm các snapshot người dùng/giá/đơn/tồn.

## Rollback/fallback

- API lỗi nội dung tùy chọn: catalog/giỏ vẫn dùng được; poster/campaign/trust có thể ẩn, hero dùng lời chào thương hiệu. Không giả thành công hoặc dùng giá/stock tĩnh.
- Slot không có mobile dùng ảnh desktop và lấy nét; thiếu ảnh sản phẩm dùng placeholder có nhãn. Banner draft, tương lai, hết hạn không được API public trả về.
- Không checkout bản code thiếu migration 013 rồi chạy runner: runner sẽ từ chối downgrade không đủ migration. Ưu tiên forward fix hoặc build rollback có giữ migration 013 và adapter catalog phân trang.
- Không tự DROP COLUMN, khôi phục database live hoặc ghi đè media để rollback UI. Restore live cần kế hoạch downtime/quyền phê duyệt riêng. Chỉ thử restore vào database độc lập trong quy trình kiểm chứng này.

Không thực thi migration trên máy công ty hoặc triển khai production trong tác vụ cloud; các migration chạy trong test schema/isolated Docker stack. Bản PostgreSQL cloud trước tác vụ được sao lưu ngoài Git, không thay thế backup tại công ty.
