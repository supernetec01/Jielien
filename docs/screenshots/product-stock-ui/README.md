Ảnh chụp từ schema test riêng (container postgres dùng một lần, không đụng dữ liệu thật).

Fixture: admin `product-stock-ui@example.test`; kho "Kho fixture nhập lúc tạo" và kho mặc định; sản phẩm "Dây ràng kiểm thử tồn" (SKU TON-UI-1, giá 120.000 ₫, tồn lúc tạo 15 → kiểm kê 20 → nhập thêm 2 = 22) và "Sản phẩm khác trong kho" (TON-UI-KHAC, tồn 7) để kiểm chứng bộ lọc theo sản phẩm.

Đã kiểm chứng trên UI thật: nhập tồn lúc tạo kèm chọn kho, nhật ký opening; sửa tồn nhanh từ dòng SKU (đặt số mới / nhập thêm, lý do bắt buộc ≥3 ký tự) không mất thay đổi chưa lưu của form; bảng tồn theo từng kho; lọc theo sản phẩm và trạng thái rỗng ở màn Kho; không tràn ngang và không lỗi runtime tại 320/375/768/1440/1920px.

- editor-after-create-1440.png: trang sửa sản phẩm sau khi tạo kèm tồn 15.
- quick-stock-dialog-1440.png / quick-stock-dialog-375.png: dialog sửa tồn nhanh.
- warehouse-filter-1440.png: màn Kho & tồn hàng với bộ lọc theo sản phẩm.
- editor-stock-<width>.png: trang sửa sản phẩm và mục Tồn kho ở từng khổ màn hình.