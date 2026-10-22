# Phân tích đề xuất và lộ trình phát triển

Đầu vào là bản thiết kế e-commerce do người dùng gửi trong chat. Đây là thiết kế đề xuất, không phải dữ liệu nội bộ AVAKids. Chọn PostgreSQL 17, triển khai giai đoạn 1 theo ba trục Product–Variant–Inventory, Order–Item–Payment–Shipment, Role–Permission–Audit.

## Giai đoạn 1 — đang hoàn tất và kiểm chứng

- Chuẩn hóa 34 bảng nghiệp vụ, FK/CHECK/UNIQUE/index thật, migration có phiên bản và checksum.
- Giữ ID SKU và URL cũ; giá, danh mục, thông số và tồn đọc PostgreSQL.
- Đăng ký/đăng nhập, phiên có hash, CSRF, địa chỉ, giỏ tài khoản và lịch sử đơn của từng người.
- Khách vẫn mua COD không cần tài khoản; đơn đăng nhập gắn với user_id.
- Đơn/chi tiết tách bảng với snapshot; reservation và transaction ngăn vượt tồn; chống gửi lặp.
- Mã giảm giá/điều kiện/thời hạn/lượt dùng lưu DB; một mã trên một đơn.
- Màn hình quản trị: tổng quan, giá/trạng thái SKU, xử lý đơn, điều chỉnh tồn có lý do, thu COD thủ công và nhật ký.
- Kho normal/damaged riêng; không bán từ kho hư hỏng. Chuyển kho hai vế và chứng từ nhập/xuất đầy đủ chưa nằm trong UI hiện tại.
- Sao lưu/nhập SQLite giữ tồn khả dụng và đơn cũ, không reset dữ liệu.

Tài khoản admin không tạo mặc định. Người vận hành chạy `npm run admin:create` để nhập thông tin và mật khẩu riêng. Kiểm thử tạo tài khoản thử trong schema tạm, không tạo admin dùng chung trên database vận hành.

## Giai đoạn 2 — mở rộng sau lõi bán hàng

- CRUD đầy đủ sản phẩm cha, danh mục, hình, thuộc tính, xuất/nhập CSV.
- Tạo/sửa chiến dịch và mã khuyến mãi trong quản trị; ưu tiên/cộng dồn giảm giá được quy định rõ.
- Đổi trả/hoàn tiền, chuyển kho có chứng từ, sổ nhập xuất, báo cáo.
- CMS bài viết/banner, đánh giá có kiểm duyệt, flash-sale quota và combo ghép hàng lẻ.
- Bổ sung quy trình bảo vệ dữ liệu, sao lưu/khôi phục định kỳ và giám sát vận hành.

## Giai đoạn 3 — tích hợp và nhiều kênh

- Cổng thanh toán có webhook/signature/idempotency; OTP và email/SMS qua nhà cung cấp.
- Đơn vị vận chuyển, tracking thực, nhiều điểm bán, phân bổ kho, lô/hạn sử dụng.
- Tích điểm qua sổ giao dịch, hỗ trợ khách hàng và thông báo nhiều kênh.
- Livestream/video, đồng bộ Shopee/TikTok Shop và dịch thuật có cache.

Các giai đoạn sau chưa được coi là triển khai bằng việc chỉ có tên trong đề xuất. Chưa yêu cầu credentials hoặc giả lập tích hợp ngoài thành dịch vụ thật.

## Khác biệt có chủ đích so với SQL mẫu

- BIGINT VND thay DECIMAL(15,2) vì hiện chỉ dùng đồng Việt Nam; mọi phép tính là số nguyên có kiểm tra giới hạn.
- Có thêm slug/name ở SKU để giữ liên kết cũ và tên từng quy cách.
- Đơn có id nội bộ số và order_number JL bên ngoài; không đổi mã khách đã nhận.
- Giữ access_token của đơn cũ để tương thích; token đăng nhập mới dùng token_hash, không dùng chung hai loại.
- Không tạo đồng loạt 70+ bảng; chỉ thêm bảng khi có dữ liệu/luồng nghiệp vụ và kiểm chứng tương ứng.
