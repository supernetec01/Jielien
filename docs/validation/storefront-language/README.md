# Menu ngành hàng và giao diện Việt–Trung

Ngày kiểm tra: 2026-11-09. Ảnh sử dụng catalog fixture trong schema riêng.

## Đã thực hiện

- Menu Khám phá danh mục mở khi rê chuột trên máy tính; có khoảng chờ ngắn khi di chuyển từ nút tới danh sách để tránh đóng nhầm. Bấm nút, chạm trên điện thoại, ArrowDown, Tab, Escape và bấm nền ngoài vẫn hoạt động. Trang mua sắm và trang tin tức SSR dùng cùng controller.
- Ngành hàng trên thanh điều hướng, menu xổ xuống và thẻ danh mục sáng nền xanh khi hover/focus. Hiệu ứng tôn trọng reduced motion.
- Bộ chọn Tiếng Việt / 简体中文 ở đầu trang mua sắm, tin tức và tài khoản, hiện cả trên điện thoại. Ghi nhớ lựa chọn trên cùng trình duyệt, đồng bộ tab qua storage event, cập nhật thuộc tính HTML lang. Không đổi đường dẫn, mã SKU, giá tiền, thông tin nhập trong form hoặc tên người dùng đã đăng nhập.
- Từ điển giao diện cục bộ trong `public/locale-zh.js`: nhãn điều hướng, danh mục phổ biến, tìm kiếm, nút mua hàng, giỏ hàng, nhãn giao nhận/thanh toán, tài khoản và một số trạng thái. Nội dung render động được cập nhật khi đổi trang; chuyển lại tiếng Việt khôi phục văn bản nguồn.
- Không gọi dịch vụ dịch bên ngoài, không cần API key cho bản dịch giao diện này. Thêm từ mới bằng cách bổ sung cặp Việt–Trung vào từ điển.

## Phần cần hoàn thiện nếu muốn toàn bộ nội dung song ngữ

Đây là bản dịch **giao diện**, chưa phải hệ thống CMS song ngữ đầy đủ. Văn bản chưa có trong từ điển giữ nguyên bản gốc. Tên/mô tả sản phẩm, ngành hàng mới do cửa hàng đặt, bài viết, nội dung banner và chính sách tùy chỉnh chưa được tự dịch; chữ nằm trong ảnh cũng chưa được dịch. Chưa cung cấp URL/SEO/metadata riêng cho từng ngôn ngữ; SSR và JavaScript tắt vẫn hiển thị tiếng Việt.

Để hoàn thiện cần:

1. Cửa hàng đã xác nhận dùng Giản thể (简体中文); cần cung cấp/duyệt bản dịch tên hàng, thông số, chính sách và nội dung quảng cáo; không tự suy diễn nội dung pháp lý hay công dụng sản phẩm.
2. Phát triển trường bản dịch theo ngôn ngữ trong Admin và API/SSR, quy tắc fallback, URL/canonical/hreflang theo ngôn ngữ.
3. Nếu muốn hỗ trợ dịch tự động: chọn dịch vụ, cung cấp khóa qua môi trường máy chủ và thống nhất bước nhân viên duyệt trước khi xuất bản. Khóa không đưa vào frontend hoặc Git.

## Kiểm thử

- `npm run test:storefront-language`: hover, nhấp/chạm, highlight, ArrowDown/Escape, chuyển Việt–Trung hai chiều, nhớ sau reload, qua trang SPA và SSR, giữ nguyên dữ liệu form, không tràn ngang tại 320/375/768/1440/1920px. Đã xem ảnh ở cả năm kích thước.
- `npm run test:browser`: 14 kiểm tra, gồm giỏ hàng, đặt đơn COD và tra cứu đơn.
- `npm run test:frontend-v3`: 12 kiểm tra, gồm responsive, WCAG và danh mục lấy từ database.
- `npm run test:commerce`: 13 kiểm tra.
- Không thay migration hoặc quy tắc đặt hàng, tồn kho hay thanh toán.

## Cập nhật local

`git pull --ff-only origin main`, rồi `npm run local:start` để rebuild. Mở lại trang, Ctrl+F5. Thay đổi mới chỉ push source, không tự triển khai máy chủ cửa hàng.
