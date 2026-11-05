# Jielien: hướng dẫn sửa giao diện cho Codex

Ứng dụng dùng JavaScript ES modules, HTML render từ template string và CSS; backend Node/PostgreSQL. Không chỉ sửa file HTML: màn hình Admin được sinh trong `public/admin.js` và `public/commerce-admin.js`; storefront trong `public/app.js`; trang tin tức SSR trong `lib/seo.mjs`.

## Cách thực hiện thay đổi UI

- Đọc renderer và event handler của màn hình trước khi sửa. Giữ selector, kiểm tra quyền, CSRF, version và xử lý lỗi cần thiết cho nghiệp vụ.
- Với yêu cầu đổi bố cục, sửa cấu trúc markup và luồng tương tác. Chỉ đổi màu, bo góc hoặc thêm override CSS chưa đáp ứng yêu cầu thiết kế lại màn hình.
- Style Admin đặt trong `public/admin-workspace.css`, tải sau stylesheet cấu trúc `management.css`. Style mua sắm đặt trong `public/storefront.css`. Không thêm nhiều lớp override trùng selector; sửa component hiện có.
- Mỗi màn hình cần có tiêu đề, mô tả ngắn, thao tác chính, bộ lọc có nhãn, kết quả và trạng thái rỗng/lỗi rõ ràng. Dùng tiếng Việt; tránh ID nội bộ hoặc thuật ngữ database khi có thể chọn theo tên.
- Không dựng biểu đồ hoặc số liệu giả để lấp khoảng trống. Dùng API thật và trạng thái rỗng có hướng dẫn.
- Dùng SVG local thay icon phụ thuộc font. Giữ tương phản, focus bàn phím, nút tối thiểu 40px và chữ nhập liệu ít nhất 14px ở Admin. Màu chủ đạo navy `#0B1B34`, green `#86B529`.
- Form chỉnh sửa thay thế form cũ, không chèn thêm các form trùng. Không đặt `name="id"` trên form dựa vào thuộc tính `form.id`; dùng `getAttribute("id")` khi đọc ID form.

## Kiểm chứng trước bàn giao

- Chạy ứng dụng bằng test database/schema riêng và mở Chromium thật. Đi qua các thao tác bị tác động: tạo, sửa, lọc, hủy, lỗi và tải lại khi liên quan.
- Với thay đổi Admin, chạy `npm run test:usability`, `npm run test:commerce`, `npm run test:management`, `npm run test:admin-access`. Chạy `npm run test:browser` nếu sửa storefront và `npm test` nếu thay luồng dữ liệu hoặc validation.
- Chụp và **xem** các màn hình đã sửa ở desktop và điện thoại. Kiểm tra 320/375/768/1440/1920px, tràn ngang và menu cảm ứng. Ảnh nằm trong `docs/screenshots/`; ghi rõ dữ liệu fixture. Test pass không thay thế việc xem bố cục.
- Nêu chính xác file, thay đổi hành vi, kiểm thử và giới hạn; không nói đã triển khai lên máy công ty khi mới push GitHub. Hướng dẫn người dùng cập nhật source và rebuild Docker.

Không reset database hoặc thay mật khẩu để sửa UI. Không commit `.env*`, token, mật khẩu thật, backup hay dữ liệu khách hàng. Không xuất bản website ra Internet nếu chưa được yêu cầu.
