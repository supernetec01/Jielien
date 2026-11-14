# Kiểm tra giao diện điều hướng Admin

Nhánh: `style/admin-navigation`. Thư mục: `/workspace/Jielien`.

## Phạm vi thực hiện

Chỉ sửa giao diện trong `public/admin.js` và `public/admin-workspace.css`; thêm bài kiểm tra `tests/admin-navigation.browser.mjs` và báo cáo này. Các thay đổi từ nhiệm vụ trước được giữ nguyên. Đối chiếu mã băm trước/sau xác nhận các file backend, cơ sở dữ liệu, cấu hình và frontend khác không thay đổi trong nhiệm vụ này. Danh sách section, hàm API, kiểm tra quyền và hàm mutation giữ nguyên.

Menu được chia thành 7 nhóm, gồm 22 màn hình nội bộ đang có tại `/quan-tri`:

| Nhóm | Màn hình có sẵn |
| --- | --- |
| Tổng quan | Tổng quan, Báo cáo |
| Đơn hàng | Đơn hàng, Đổi trả hàng |
| Sản phẩm | Sản phẩm cha & SKU, Danh mục & Thuộc tính, Giá mặc định & trạng thái SKU, CSV sản phẩm |
| Kho hàng | Kho & tồn hàng, Quản lý nhiều kho, Phiếu kho |
| Nội dung & Website | Tin tức & SEO, Thư viện ảnh, Banner, Chuyển hướng SEO |
| Ưu đãi | Mã giảm giá |
| Quản lý hệ thống | Nhân viên, Cấu hình website, Tài khoản nhận chuyển khoản, Vận hành, Tra cứu nhật ký, Nhật ký |

Đây là các view nội bộ có renderer/handler và nguồn dữ liệu hiện hữu, không phải 22 URL mới. Các nhóm cha là tiêu đề, không giả làm liên kết. Không thêm route hoặc trang mới; không bỏ màn hình đang hoạt động. Không hiển thị mục chưa có triển khai: nhật ký liên hệ, tạo vận đơn thủ công và giao dịch SePay chưa khớp. Bước 2 của `docs/order-flow-plan.md` vẫn chờ duyệt.

Mỗi nhóm cha dùng một icon SVG khác nhau từ thư viện sẵn có `public/ui-icons.js`. Mục con không có icon. Menu vẫn lọc theo quyền hiện hữu. KPI giữ nguồn `/api/admin/dashboard`; không thêm số liệu hoặc badge giả.

Sidebar dùng navy và token xanh lá thương hiệu có sẵn (`--brand-green`), với viền/hover pha trắng tương đối. Mục active dùng nền tối và chữ xanh lá; tỷ lệ tương phản đo trong trình duyệt là 5,71:1. Không dùng nền xanh lá đặc với chữ trắng.

## Kết quả kiểm tra

- Trước sửa: browser 14/14, bank 26/26, account 9/9.
- Sau sửa: browser 14/14, bank 26/26, account 9/9.
- Admin usability 9/9; commerce 13/13; management 11/11; admin-access 6/6.
- Bài kiểm tra mới: 6/6, gồm 7 icon cha riêng biệt, không icon con, KPI khớp API, mở đủ 22 view, tìm kiếm không dấu, tương phản, menu điện thoại, quyền viewer và khách chưa đăng nhập. Không phát sinh request ghi dữ liệu khi chuyển menu.
- Đã chạy Chromium với cơ sở dữ liệu fixture riêng, kiểm tra kích thước 320/375/768/1440/1920; không tràn ngang. Đã xem ảnh desktop 1440 và menu điện thoại 375.
- `git diff --check` đạt. Không deploy; không gọi ngân hàng hoặc Telegram thật.

Lệnh kiểm tra mới: `node tests/admin-navigation.browser.mjs`. Ảnh kiểm tra nằm ngoài source tại `/tmp/docs/screenshots/admin-navigation/`.

## Tự kiểm tra

1. Đăng nhập `/quan-tri`, xem 7 nhóm menu; chỉ những mục được cấp quyền mới xuất hiện.
2. Chọn từng mục; tên nhóm và màn hình đang chọn được cập nhật, đường dẫn vẫn `/quan-tri`.
3. Tìm bằng từ không dấu; xóa nội dung tìm để xem lại menu.
4. Trên điện thoại, mở Mục quản trị, cuộn menu và chọn mục; menu đóng sau khi chọn.
5. Đối chiếu số liệu với dữ liệu thật của cửa hàng; thử tài khoản ít quyền và đăng xuất để kiểm tra màn hình đăng nhập.

Không có biến môi trường, thư viện hoặc migration mới trong nhiệm vụ này. Nếu cần hoàn tác, khôi phục riêng phần giao diện của hai file Admin từ phiên bản được duyệt; giữ các thay đổi nghiệp vụ của nhiệm vụ trước. Cần kiểm tra lại với dữ liệu và tài khoản thực tế trước khi triển khai. Không thực hiện bước xử lý đơn mới đang chờ duyệt.
