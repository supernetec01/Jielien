# Phân tích website tham khảo và thiết kế triển khai

Website được yêu cầu: https://www.avakids.com/.
Mục tiêu: phát triển Jielien thành một cửa hàng mẹ và bé có thể duyệt hàng, xem chi tiết, tạo và tra cứu đơn COD trong môi trường phát triển.

## Bằng chứng và giới hạn khảo sát

Khảo sát đã được thử lại sau khi danh sách mạng cho phép được cập nhật. Kết quả mới không còn chỉ là chặn tên miền; tuy nhiên chưa nhận được nội dung trang hợp lệ.

| Nguồn kiểm tra                                | Kết quả quan sát được                                                                   | Kết luận được phép rút ra                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| HTTPS `www.avakids.com`, lượt đầu             | Proxy trả `CONNECT 403`, máy chủ `envoy`                                                | Tại thời điểm đó môi trường chưa được phép truy cập                    |
| HEAD `www.avakids.com`, sau cập nhật mạng     | HTTP 200; `text/html`, `viewport: DESKTOP`; headers Next.js/RSC và preload tài nguyên   | Kết nối và metadata trang hoạt động; chưa chứng minh lấy được nội dung |
| GET trang chủ, HTTP/1.1 và browser headers    | Có lượt HTTP 200 nhưng curl mã thoát 18, không nhận body; các lượt khác trả 503/timeout | Chưa có HTML đủ để phân tích DOM                                       |
| GET `/sua-cho-be`, `/bim-ta`                  | 503 hoặc timeout                                                                        | Đây chỉ là đường dẫn được thử, chưa xác minh là URL danh mục hợp lệ    |
| GET `robots.txt`, `sitemap.xml`, tên miền gốc | Timeout hoặc 503 trong các lượt thử                                                     | Chưa có sơ đồ URL công khai được xác minh                              |
| Chromium với kiểm tra TLS mặc định            | `ERR_CERT_AUTHORITY_INVALID`                                                            | Chưa chụp được giao diện; không bỏ qua kiểm tra TLS để ép tải          |
| CDN ảnh được khai báo trong HEAD              | GET vẫn bị lỗi proxy ở các lượt thử                                                     | Biết tên tài nguyên, chưa xem được hình ảnh                            |
| Mã Jielien ban đầu                            | Trang chủ mẫu, 10 sản phẩm, giỏ hàng localStorage, checkout chỉ hiện thông báo          | Có nền giao diện nhưng chưa có luồng bán hàng đầy đủ                   |

Metadata công khai đã xác minh: website trả headers ứng dụng Next.js/RSC, phân loại viewport desktop, preload ảnh banner; các host tài nguyên được khai báo gồm `cdnv2-tmdt.tgdd.vn`, `img.tgdd.vn`, `cdnv2.tgdd.vn` và `api.avakids.com`. Những thông tin này không đủ suy ra bảng màu, bố cục hay API nghiệp vụ.

Chưa thu được DOM, ảnh chụp màn hình hay kết quả thao tác trực tiếp trên AVAKids. Không có cơ sở khẳng định chính xác màu, kích thước, menu, giá, ưu đãi hoặc luồng nghiệp vụ hiện tại của trang gốc. HTTP 200 từ HEAD và HTTP 200 không có body không được coi là khảo sát giao diện thành công. Các lỗi này cũng không chứng minh AVAKids đang ngừng hoạt động với khách truy cập khác.

Các mục bên dưới là **thiết kế đề xuất cho bản triển khai**, không phải các quan sát đã xác minh về AVAKids. Sau khi truy cập được nội dung website gốc, cần đối chiếu desktop/mobile và cập nhật phần chênh lệch trước khi gọi đây là bản sao tương đương.

## Hệ thống giao diện đề xuất

### Khung trang và điều hướng

- Header nổi bật thương hiệu, tìm kiếm ở vị trí dễ thấy và giỏ hàng có số lượng.
- Thanh danh mục để đi từ nhu cầu rộng đến nhóm hàng: sữa, bỉm tã, ăn dặm, chăm sóc và đồ dùng cho bé.
- Trên điện thoại, tìm kiếm vẫn dễ truy cập; danh mục có thể cuộn hoặc mở menu.
- Breadcrumb và URL riêng cho danh mục, chi tiết, giỏ hàng và đặt hàng để tải lại hoặc chia sẻ trang.

### Trang chủ

Banner khuyến mại dẫn tới danh mục liên quan; các nhóm hàng có hình nhận diện; sản phẩm hiển thị ảnh, tên, giá và hành động mua. Ưu tiên mật độ nội dung vừa đủ để người mua so sánh, giữ khoảng trắng và sự phân cấp rõ giữa chương trình ưu đãi với thông tin sản phẩm.

Tông hồng phù hợp định hướng cửa hàng mẹ và bé, nhưng chưa được coi là bản tái tạo chính xác bảng màu AVAKids. Hình SVG và thương hiệu mẫu thuộc bản triển khai; không dùng logo AVAKids hoặc tạo cảm giác cửa hàng chính thức.

### Danh mục và kết quả tìm kiếm

- Tìm theo tên và thương hiệu, chuẩn hóa tiếng Việt để tìm không dấu.
- Lọc thương hiệu, khoảng giá và độ tuổi; các điều kiện kết hợp với nhau.
- Sắp xếp giá tăng/giảm và lựa chọn mặc định; có trạng thái không tìm thấy.
- Giữ bộ lọc trong URL khi triển khai để quay lại từ trang chi tiết không mất ngữ cảnh.
- Giá và kết quả tìm kiếm cùng sử dụng một nguồn catalogue, tránh mâu thuẫn dữ liệu giữa các trang.

### Trang chi tiết sản phẩm

Khu mua hàng đặt ảnh, tên, thương hiệu, giá, tình trạng hàng và bộ chọn số lượng gần nhau. Nội dung bổ sung gồm mô tả, thông số/độ tuổi/khối lượng, đặc điểm và sản phẩm liên quan. Nếu có nhiều quy cách, cần thể hiện chúng bằng SKU riêng hoặc biến thể có tồn kho rõ ràng; không hiển thị tùy chọn không làm thay đổi sản phẩm thật.

Hành động thêm giỏ cần phản hồi kết quả, giới hạn theo tồn kho và giữ người dùng ở ngữ cảnh mua sắm. Không dùng đánh giá giả như thể đó là phản hồi của khách hàng thật.

### Giỏ hàng và thanh toán

Giỏ hàng cho phép tăng/giảm/xóa sản phẩm, nhập mã ưu đãi và xem tổng hàng, giảm giá, phí giao hàng, tổng thanh toán. Trình duyệt gửi mã sản phẩm và số lượng; máy chủ tính lại giá, kiểm tra tồn kho và áp dụng điều kiện ưu đãi.

Checkout thu họ tên, điện thoại, địa chỉ và đơn vị hành chính dưới dạng trường nhập rõ ràng. Luồng COD tạo mã đơn và xác nhận lưu thành công ở máy chủ. Không đánh dấu đã thanh toán vì người dùng mới gửi yêu cầu đặt hàng.

Tra cứu đơn cần mã đơn cùng thông tin xác minh; không có danh sách công khai chứa dữ liệu cá nhân. Trang xác nhận chỉ được hiển thị đơn khi có quyền truy cập tương ứng.

## Phạm vi và mức độ tương đương

| Nhóm                           | Mức ưu tiên    | Phạm vi triển khai                            | Đối chiếu AVAKids     |
| ------------------------------ | -------------- | --------------------------------------------- | --------------------- |
| Trang chủ và danh mục          | P0             | Banner, tìm kiếm, nhóm hàng, thẻ sản phẩm     | Chưa xác minh bản gốc |
| Lọc và sắp xếp                 | P0             | Thương hiệu, giá, độ tuổi, kết quả rỗng       | Chưa xác minh bản gốc |
| Chi tiết sản phẩm              | P0             | Ảnh, thông tin, số lượng, sản phẩm liên quan  | Chưa xác minh bản gốc |
| Giỏ và ưu đãi                  | P0             | Chỉnh giỏ, mã ưu đãi, phí và tổng từ máy chủ  | Chưa xác minh bản gốc |
| Tạo/tra cứu đơn COD            | P0             | Lưu đơn bền vững, kiểm tra đầu vào và tồn kho | Chưa xác minh bản gốc |
| Đăng nhập và tài khoản         | Mở rộng        | Chưa nằm trong luồng mua không cần tài khoản  | Chưa xác minh bản gốc |
| Thành viên/tích điểm           | Mở rộng        | Chưa triển khai                               | Chưa xác minh bản gốc |
| Thanh toán trực tuyến          | Tích hợp ngoài | Cần nhà cung cấp và thông tin vận hành        | Chưa xác minh bản gốc |
| Tìm cửa hàng/tồn kho chi nhánh | Tích hợp ngoài | Cần dữ liệu cửa hàng thật                     | Chưa xác minh bản gốc |

P0 ở đây là phạm vi cần phát triển và kiểm thử, không phải chứng nhận tất cả đã vượt qua kiểm tra. Kết quả thực thi ghi trong `ACCEPTANCE.md`.

## Kiến trúc và dữ liệu

Frontend sử dụng HTML/CSS/JavaScript, API Node.js phục vụ catalogue và nhận đơn. SQLite lưu đơn và số lượng tồn trên máy chủ. Giá, mô tả và ảnh trong catalogue là dữ liệu mẫu, không phải dữ liệu AVAKids được đồng bộ.

localStorage chỉ giữ giỏ hàng để người mua tiếp tục phiên duyệt; đó không phải bằng chứng đơn hàng đã được tạo. Dữ liệu đơn và tổng thanh toán có thẩm quyền nằm ở SQLite. Tránh lưu thông tin người nhận trong localStorage.

Chống gửi đơn lặp bằng khóa idempotency. Việc lưu đơn và trừ tồn cần cùng giao dịch để không tạo đơn vượt số lượng. Sau khi máy chủ khởi động lại, đơn đã lưu vẫn phải tra cứu được với cùng cơ chế xác minh.

## Responsive và khả năng tiếp cận

- Desktop dùng vùng nội dung rộng có lề; mobile thu gọn thành một hoặc hai cột theo nội dung.
- Không ẩn tùy tiện sản phẩm bằng vị trí `nth-child`; số kết quả phải phản ánh đúng danh sách.
- Label rõ cho input, lỗi cạnh trường sai và thông báo kết quả cho trình đọc màn hình.
- Điều hướng và giỏ hàng sử dụng được bằng bàn phím; dialog có quản lý focus và đóng bằng Escape.
- Không tràn ngang ở màn hình nhỏ; nút điều khiển đủ lớn và có trạng thái focus.

## Chạy và giới hạn vận hành

Cổng mặc định và cổng xác minh là **3001**. Không dừng, khởi động lại hoặc chiếm cổng **3000**, vì người dùng đang dùng cổng đó cho việc khác.

Bản phát triển chưa có quản trị đơn hàng có xác thực, gửi hàng, tích hợp thanh toán hoặc quy trình xử lý dữ liệu cá nhân cho kinh doanh thật. Tạo đơn COD cục bộ chứng minh luồng phần mềm hoạt động, chưa đồng nghĩa có bên bán tiếp nhận và giao hàng. Trước khi kinh doanh cần thay catalogue, thông tin liên hệ, chính sách và kết nối vận hành thực tế.
