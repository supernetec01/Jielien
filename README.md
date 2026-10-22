# Jielien — cửa hàng mẹ và bé

Bản mẫu website thương mại điện tử tiếng Việt, lấy cảm hứng từ lĩnh vực bán lẻ mẹ và bé. Giao diện riêng, hình SVG và sản phẩm minh họa; không liên kết với AVAKids. Website tham khảo không truy cập được từ môi trường khi triển khai, nên đây không phải bản sao chính xác.

## Chạy

Node.js >=22, không cần cài phụ thuộc:

```sh
npm run dev
```

Mặc định cổng 3000; đặt biến `PORT` để thay đổi. Frontend gồm HTML, CSS và JavaScript thuần trong `public/`. Máy chủ tĩnh: `server.mjs`.

Có tìm kiếm, lọc danh mục, mở rộng danh sách, giỏ hàng lưu localStorage, chỉnh số lượng, bài viết mẫu và giao diện responsive. Dữ liệu sản phẩm/giá/đánh giá/số tư vấn đều là minh họa. Chưa có backend, đăng ký email, thanh toán hoặc xử lý đơn hàng. Font Google là tùy chọn, có font dự phòng khi offline.

Trước khi kinh doanh cần thay thông tin thật, ảnh được cấp phép, chính sách, tồn kho và kết nối hệ thống đơn hàng/thanh toán.
