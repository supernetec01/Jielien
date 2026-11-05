# Giao diện dễ sử dụng — bản sửa theo ảnh phản hồi

Ảnh phản hồi cho thấy giao diện cũ đã đổi màu nhưng báo cáo, trạng thái vận hành, danh mục và CMS vẫn là các đoạn văn/form chưa có bố cục rõ ràng. Bản sửa này thay renderer và tương tác của các màn hình đó, đồng thời tách style Admin khỏi các trang tài khoản/mua sắm.

## Thay đổi thực tế

- Menu chia nhóm theo nghiệp vụ; tìm chức năng không cần gõ dấu; icon SVG local, trạng thái đang chọn, menu đóng/mở trên điện thoại. Quyền quyết định các mục được thấy như trước.
- Báo cáo có thẻ số đơn/giá trị đơn/tiền thực thu từ API, bộ lọc ngày giữ lại giá trị, chọn nhanh 7/30/90 ngày, CSV và báo lỗi khoảng ngày sai mà không mất dữ liệu nhập. Không dựng biểu đồ hoặc doanh số giả.
- Vận hành có thẻ trạng thái cơ sở dữ liệu, bản sao lưu, lịch xuất bản; diễn giải tiếng Việt, nút làm mới và trạng thái rỗng. Thông tin backup chỉ là bản ghi, không chứng minh đã restore thử.
- Danh mục/thương hiệu/thuộc tính dùng ba tab, bảng và một vùng sửa riêng. Chọn danh mục cha bằng tên, loại bỏ lựa chọn chính nó. Sửa mục thay form hiện tại thay vì chèn thêm form trùng. Nút thêm mới đưa focus vào form. Ở điện thoại, dòng dữ liệu xếp lại để nút sửa không bị khuất ngoài màn hình.
- CMS có bộ lọc, trạng thái tiếng Việt, danh sách/empty state và hai nhóm tạo chuyên mục/thẻ; giữ các chức năng duyệt/xuất bản thực tế.
- Cỡ chữ, nhãn, khoảng cách, nút và focus bàn phím thống nhất trên Admin. Trang mua sắm tăng độ rõ của giá, tên, bộ lọc và nút thêm giỏ; thay nút nền hồng cũ bằng xanh lá theo thương hiệu.
- Thêm `AGENTS.md` để các lần làm việc sau của Codex đọc đúng renderer, sửa markup/interaction và xem ảnh trình duyệt thay vì chỉ chồng CSS.

## File chính

- Renderer: `public/admin.js`, `public/commerce-admin.js`, `public/admin.html`.
- Thành phần/style: `public/admin-workspace.css`, `public/storefront.css`, `public/ui-icons.js`; xóa block override Admin cũ khỏi `management.css`.
- Nạp style cửa hàng: `public/index.html`, `lib/seo.mjs`.
- Kiểm chứng: `tests/usability.browser.mjs`, script `test:usability`, GitHub Actions và `docs/screenshots/usability/`.

## Kiểm thử và ảnh chụp

`npm test`: 51 test. Các suite browser có sẵn: storefront 14, management 11, commerce 13, account 9, bank 7 và role access 6 kiểm tra.

`npm run test:usability`: 9 nhóm kiểm tra mới:

1. Menu tìm kiếm không dấu, kết quả rỗng, nhóm menu chỉ chứa chức năng được cấp quyền.
2. Tạo/sửa danh mục qua UI, dữ liệu lưu trong PostgreSQL test; chỉ một form, không chọn cha là chính nó.
3. Tab chỉ hiển thị nhóm dữ liệu đang làm việc.
4. Báo cáo 7 ngày có đơn fixture thật, metric đối chiếu API và tải CSV.
5. Ngày sai có thông báo, giữ giá trị nhập.
6. CMS lọc rỗng có hướng dẫn và giữ từ khóa.
7. Bốn màn hình phản hồi ở 320/375/768/1440/1920px; menu điện thoại mở và tự đóng khi chọn. Nút sửa danh mục phải nằm trong viewport.
8. Catalog cỡ chữ phù hợp, không tràn ngang ở mobile/desktop.
9. Không có lỗi JavaScript.

Ảnh được chụp từ ứng dụng/API/PostgreSQL đang chạy; số liệu trong ảnh thuộc schema kiểm thử, không phải dữ liệu công ty. Test chạy với schema tạm, không reset database ứng dụng. Bản nâng cấp không có migration.

Cloud kiểm thử Chromium/Linux; chưa kiểm thử trực tiếp thiết bị Windows/LAN của công ty. Không tuyên bố đã thay đổi bản Docker đang chạy trên máy người dùng.

## Cập nhật bản chạy

Sau khi thay đổi được gộp vào `main`, trên Windows mở Docker Desktop và chạy trong đúng thư mục dự án:

```powershell
git status --short
git fetch origin --prune
git switch main
git pull --ff-only origin main
npm run local:start
npm run local:status
```

Giữ thay đổi local bằng commit/stash nếu có trước khi switch/pull. Không thay `.env.local` hoặc xóa volume để cập nhật UI. Mở `/quan-tri` và nhấn Ctrl+F5 sau rebuild. Xem `DEMO_QUICKSTART.md` về đăng nhập và LAN.
