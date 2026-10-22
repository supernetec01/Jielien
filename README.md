# Jielien — thế giới mẹ và bé

Website thương mại điện tử tiếng Việt, tham khảo mô hình cửa hàng mẹ và bé theo yêu cầu AVAKids. Frontend HTML/CSS/JavaScript, backend Node.js và SQLite. Giao diện độc lập, không liên kết với AVAKids; 24 sản phẩm, thương hiệu, giá và hình SVG là dữ liệu minh họa.

Khảo sát trang gốc mới nhận được HTTP headers; tải nội dung còn lỗi/rỗng. Chưa có cơ sở khẳng định đây là bản sao giao diện chính xác. Chi tiết bằng chứng và phạm vi ở [phân tích tham khảo](docs/REFERENCE_ANALYSIS.md).

## Chạy trên cổng 3001

Cần **Node.js >=24.11.0** để dùng `node:sqlite`.

```sh
npm ci
npm run dev
```

Mặc định máy chủ nghe `0.0.0.0:3001`. Địa chỉ khi chạy trên máy của bạn: `http://localhost:3001`. Không chiếm hoặc dừng cổng 3000. Có thể đặt `PORT` để đổi cổng.

Không có bước build hoặc phụ thuộc runtime bên ngoài. `playwright-core` chỉ dùng cho kiểm thử trình duyệt. Không yêu cầu tài khoản, API key hay dịch vụ cloud để chạy luồng COD cục bộ. Không thể chạy toàn bộ backend bằng GitHub Pages; cần hosting hỗ trợ Node.js và ổ đĩa bền vững.

## Chức năng đã triển khai

- Trang chủ có danh mục, banner chuyển được, ưu đãi và gợi ý sản phẩm.
- Tìm kiếm tiếng Việt có/không dấu, gợi ý tìm kiếm.
- Danh mục, thương hiệu, độ tuổi, khoảng giá; sắp xếp và phân trang theo URL.
- Chi tiết từng sản phẩm, quy cách liên quan, tab mô tả/thông số/lưu ý, số lượng và sản phẩm gợi ý.
- Yêu thích và giỏ hàng lưu localStorage; không lưu thông tin người nhận trong localStorage.
- Giỏ hàng thêm/xóa/chỉnh số lượng, mã giảm giá, phí vận chuyển và tổng do server xác thực.
- Checkout COD kiểm tra thông tin, lưu đơn và trừ tồn bằng transaction SQLite.
- Khóa idempotency và retry cùng payload để tránh tạo đơn trùng khi mất phản hồi sau khi máy chủ lưu đơn.
- Trang xác nhận, tải lại với token của phiên; tra cứu bằng mã đơn và số điện thoại.
- Bài viết, trang chính sách, trạng thái rỗng/lỗi; giao diện desktop, tablet và điện thoại.

Chính sách mẫu: phí giao hàng 25.000đ, miễn phí từ tổng sản phẩm 499.000đ trước giảm giá. `MEBE50` giảm 50.000đ từ 500.000đ. `FREESHIP` miễn phí vận chuyển từ 299.000đ. Mỗi đơn một mã.

## Dữ liệu

- `public/catalog.json`: dữ liệu sản phẩm và số tồn ban đầu.
- `public/assets/`: ảnh SVG tự tạo, không phụ thuộc CDN bên ngoài.
- `data/store.sqlite`: đơn và tồn kho sau khi chạy; `data/` đã được Git bỏ qua.
- Khi khởi động lại, đơn và tồn được giữ nguyên. Thay stock trong catalog không ghi đè tồn đã khởi tạo trong SQLite. Sao lưu dữ liệu trước khi can thiệp; không xóa database có đơn cần giữ.
- Backend phục vụ nội dung trong `public/`, không công khai database hoặc mã server.

Thông tin người nhận nằm trong database máy chủ. Chỉ dùng dữ liệu giả khi kiểm thử. Luồng hiện tại lưu đơn thử nghiệm; **chưa kết nối giao hàng, thanh toán online, email/SMS, tài khoản thành viên hoặc quản trị đơn có xác thực**. Không có đơn vị bán hàng tự động xử lý các đơn này. Cần bổ sung dữ liệu thật, hạ tầng HTTPS, quản trị, sao lưu và quy trình vận hành trước khi mở bán.

## Kiểm thử

```sh
npm test
```

10 kiểm thử API: giá do server tính, điều kiện mã, input, tồn kho/transaction, idempotency, persistence sau restart, quyền xem đơn, rate limit và giới hạn đường dẫn/body.

Kiểm thử giao diện cần Chromium đã cài trên máy:

```sh
# Linux có /usr/bin/chromium
npm run test:browser
# Đường dẫn khác
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

14 nhóm kiểm tra trình duyệt: tìm/lọc, URL, chi tiết, giỏ, checkout, mất response sau COMMIT, XSS, tra cứu, yêu thích, mobile/tablet và lỗi tài nguyên. Kiểm thử tự tạo cổng ngẫu nhiên và SQLite tạm, không ghi đơn vào website cổng 3001, không tác động cổng 3000. [Kết quả nghiệm thu](docs/ACCEPTANCE.md).

## Cấu trúc

```text
public/
  index.html       khung trang và điều hướng
  style.css        bố cục, responsive, trạng thái tương tác
  app.js           router, tìm/lọc, giỏ, checkout, gọi API
  catalog.json     24 sản phẩm mẫu
  assets/          hình sản phẩm và banner SVG
server.mjs         HTTP API, SQLite, validation, phục vụ frontend
/tests             kiểm thử API và trình duyệt
/docs              phân tích và nghiệm thu
```

API: `GET /api/products`, `POST /api/quote`, `POST /api/orders`, `GET /api/orders/:id?token=...`, `POST /api/orders/lookup`. Server tính giá từ catalog, không nhận tổng/giá do client chỉ định. Không có endpoint công khai liệt kê mọi đơn.

Ảnh giao diện bản hiện tại: [desktop](docs/screenshots/home-desktop.png), [điện thoại](docs/screenshots/home-mobile.png), [chi tiết sản phẩm](docs/screenshots/product-desktop.png).
