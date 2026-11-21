# Dữ liệu demo Tin tức Jielien

## Phạm vi M1

Jielien dùng Node.js ES modules, PostgreSQL 17 với truy vấn `pg`, HTML dựng phía máy chủ, JavaScript/CSS thuần ở Admin, Sharp cho ảnh và Playwright cho kiểm thử trình duyệt. Seed dùng các service hiện có của danh mục, CMS và Banner Studio. Migration 021 chỉ mở rộng ràng buộc vị trí banner. Số 020 dành cho migration chuyển khoản của nhánh `feat/admin-url-filters`.

Nguồn dữ liệu là [seed-demo.json](../db/fixtures/seed-demo.json). Có 5 chuyên mục, 9 thẻ, 3 tác giả mẫu, 8 sản phẩm, 6 bài viết, 7 vị trí quảng cáo và 6 chiến dịch. Nhật ký mẫu gồm 42 dòng, tương ứng 7 ngày cho mỗi chiến dịch. Mọi giá, tồn kho, khách hàng quảng cáo và thống kê đều là giả lập. Ba tác giả dùng email mẫu, ở trạng thái vô hiệu hóa đăng nhập. Ảnh WebP được tạo tại chỗ từ đồ họa đơn giản. Tệp JSON giữ tên ảnh gốc theo đặc tả, còn dữ liệu ứng dụng dùng URL `/media/` của thư viện hiện có.

- Sản phẩm SafeStraps và Youlisn lấy mẫu sản phẩm từ Shopee. Với bình silicone Baby Tattoo, dùng video của thương hiệu để nhận diện mẫu và lưu link gian hàng Shopee. Các liên kết tham khảo nằm trong JSON. Giá, tồn kho và nội dung niêm yết trên sàn không được nhập.
- Trạng thái `pending` trong fixture được lưu thành `in_review`. Bốn bài đã xuất bản có thể đọc công khai và hai bài còn lại trả 404. Nội dung ngắn để thấy tình trạng cần cải thiện SEO.
- Seed giữ cả hai redirect trong fixture. Redirect tới bài đang chờ duyệt được giữ ngoài bảng chuyển hướng công khai đến khi có đích công khai. Redirect tới bài nón bảo hiểm trả 301.
- Quảng cáo dùng đường dẫn nội bộ khi hiển thị. URL ngoài, phạm vi, trọng số, dữ liệu hợp đồng và banner dự phòng được giữ trong fixture. Chiến dịch tạm dừng vào trạng thái nháp trong Studio. Chiến dịch hết hạn hoặc sắp chạy dùng ngày lịch theo fixture. Thống kê mẫu nằm ở `demo_ad_stats_daily` trong schema demo. Các tính năng chọn quảng cáo theo phạm vi/trọng số, đặt banner dự phòng, đo lượt xem/click và giao diện báo cáo thuộc milestone sau. Giao diện hiện tại đọc banner ở hai bên bài và banner được chèn vào nội dung. Bốn vị trí còn lại có thể lưu trong Studio.

## Cách chạy

Seed mặc định tạo schema `jielien_journal_demo` trên kết nối `DATABASE_URL`. Mọi lần chạy sau trên cùng schema nhận diện bộ dữ liệu đã nạp và giữ các thay đổi thực hiện trong demo. Muốn nhập một bộ mẫu mới song song, dùng hậu tố riêng qua `JIELIEN_JOURNAL_DEMO_SCHEMA`. Dữ liệu ảnh nằm tại `data/journal-demo/<schema>/media`.

Với PostgreSQL có thể kết nối từ máy đang chạy Node:

```sh
npm ci
npm run demo:journal
npm run demo:journal -- --serve
```

Mở [Tin tức demo](http://localhost:3011/tin-tuc) hoặc [bài mẫu Youlisn](http://localhost:3011/tin-tuc/cach-chon-loa-bluetooth). Nhấn Ctrl+C để dừng demo. Cổng mặc định là 3011.

Với Docker Desktop trên Windows, clone nhánh demo vào thư mục riêng, mở Docker Desktop ở chế độ Linux containers và chạy PowerShell. Cần Git, Node.js 24.11 trở lên và Docker Desktop.

```powershell
git clone --branch demo/journal-seed --single-branch https://github.com/supernetec01/Jielien.git Jielien-Journal-Demo
cd Jielien-Journal-Demo
npm run local:init
docker compose -p jielien-journal-demo --env-file .env.local up -d --wait db
docker compose -p jielien-journal-demo --env-file .env.local build app
docker compose -p jielien-journal-demo --env-file .env.local run --rm --no-deps -e JIELIEN_JOURNAL_DEMO_BIND=0.0.0.0 -e JIELIEN_JOURNAL_DEMO_PORT=3001 -p 127.0.0.1:3011:3001 app npm run demo:journal -- --serve
```

Giữ cửa sổ PowerShell mở khi xem demo trên cổng 3011. PostgreSQL và cấu hình nằm trong dự án Docker riêng `jielien-journal-demo`. Nhấn Ctrl+C để dừng ứng dụng demo. Có thể dừng thêm PostgreSQL demo bằng `docker compose -p jielien-journal-demo --env-file .env.local stop db`. Dùng `npm run test:journal-demo` với PostgreSQL kiểm thử để xác nhận nạp hai lần, số bản ghi và trạng thái bài giữ nguyên.
