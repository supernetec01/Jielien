# Audit Account Center Jielien

## 1. Architecture Analysis

Node.js phục vụ `/tai-khoan` từ `public/account.html`. JavaScript ES modules tạo HTML từ template string; CSS dùng `brand.css`, `management.css`, `account-v3.css` và `language.css`. Không có framework, UI library, hooks hay store bên ngoài. State cục bộ giữ user, view, phiên bản render, địa chỉ và trạng thái form. API dùng Fetch cùng origin, CSRF cho thao tác ghi và JSON. Account đọc dữ liệu riêng qua API tài khoản, còn CMS không cung cấp dữ liệu hồ sơ. Script theo dõi lỗi dùng cấu hình công khai từ `/api/site`.

## 2. Audit Report

Điểm vào là `account.html` và `account.js`. Các phần chính gồm xác thực/khôi phục, shell, profile, đơn hàng và dialog, địa chỉ, đổi mật khẩu. `auth-session.js` dùng chung cho đăng xuất; `admin-access.js` và `admin-nav.js` quyết định liên kết quản trị và redirect hiện có. `language.js` giữ tùy chọn ngôn ngữ.

## 3. UX/UI Issues

Lời chào dùng “mẹ”, icon Unicode và chưa có avatar, email hoặc vai trò. Profile có trường chỉ đọc nhưng nhìn giống trường có thể sửa. Không có tổng quan đơn hàng. Điều hướng mobile phải cuộn ngang 275 px ở 320 px và 220 px ở 375 px. Với viewport cao 900 px, mép dưới CTA nằm ở 994 px và 959 px tương ứng. Axe xác định lỗi tương phản và liên kết trong đoạn văn.

## 4. SEO Issues

Một H1 sau khi giao diện render. Trang có title lặp thương hiệu và thiếu description, canonical, Open Graph và Twitter Card. HTTP đã có `X-Robots-Tag: noindex, nofollow` cho route riêng tư. Metadata mới phải là nội dung chung và giữ chính sách đó.

## 5. Performance Issues

Điều hướng cục bộ qua thao tác DOM, không có React hydration. Khi chuyển sang thông tin tài khoản hoặc bảo mật, renderer vẫn chèn khung loading dù dữ liệu đã có. Sau lưu hồ sơ, toàn bộ panel bị thay và phần nhận diện chưa cập nhật. Ảnh hàng trong lịch sử thiếu kích thước nội tại và lazy loading. Khi mở trang chỉ có hai request hiện có là kiểm tra phiên và cấu hình theo dõi lỗi.

## 6. Security Issues

Kiểm tra đọc cho thấy CSRF ở thao tác ghi, cookie HttpOnly, quyền quản trị qua helper hiện có, giới hạn tần suất phía server và kiểm tra chủ sở hữu tài nguyên. Mã khôi phục được xóa khỏi URL fragment và chỉ giữ tạm trong bộ nhớ. UI hiện có chèn số lượng và ID địa chỉ từ DTO trực tiếp vào markup trong khi các chuỗi hồ sơ đã escape. Refactor giữ logic quyền và escape mọi dữ liệu mới đưa vào template.

## 7. Existing APIs Used

| Nhóm | Endpoint và method |
| --- | --- |
| Phiên | GET `/api/auth/me`; POST `/api/auth/login`, `/api/auth/register`, `/api/auth/logout` |
| Khôi phục | POST `/api/auth/password/forgot`, `/api/auth/password/reset` |
| Hồ sơ và bảo mật | PATCH `/api/account/profile`; POST `/api/account/password` |
| Địa chỉ | GET/POST `/api/account/addresses`; DELETE `/api/account/addresses/:id` |
| Đơn hàng | GET `/api/account/orders`, `/api/orders/:id` |
| Theo dõi lỗi | GET `/api/site` từ module hiện có |

## 8. Business Rules

Số điện thoại đăng nhập chỉ đọc; thay hoặc xóa email cần mật khẩu hiện tại. Đổi mật khẩu thu hồi phiên và yêu cầu đăng nhập lại. Địa chỉ thuộc người dùng, có địa chỉ mặc định và quyền đi kèm. Đơn hàng hiển thị cho chủ sở hữu; lịch sử hiện tối đa 100 đơn. Đăng xuất, điều kiện chuyển hướng, quyền vào quản trị và kiểm tra VietQR tiếp tục theo luồng hiện có. Yêu thích dùng route cửa hàng đang có. Hệ thống thông báo phía server dành cho nhân viên; tài khoản khách chưa có nguồn thông báo.

## 9. Refactor Plan

Tách thẻ nhận diện và điều hướng; sidebar trên desktop và lưới tab trên mobile. Dùng dữ liệu trả về khi mở Đơn hàng để đếm bốn nhóm, tránh truy vấn lúc mở hồ sơ. Lưu hồ sơ cập nhật trực tiếp nhận diện và field. Chuẩn hóa tiếng Việt, SVG cục bộ, độ tương phản, trạng thái focus và nhãn. Bổ sung metadata chung, giữ noindex và toàn bộ luồng phiên hiện có.

## 10. Files To Modify

`public/account.html`, `public/account.js`, `public/account-v3.css`, `public/ui-icons.js` và từ điển `public/locale-zh.js` khi cần duy trì bản dịch. Audit và kiểm chứng lưu tại tài liệu này.

Baseline Lighthouse mobile với phiên fixture đã đăng nhập đạt 100 Performance, LCP khoảng 1,5 s và CLS 0,041.

## 11. Code Changes

Sidebar desktop và menu thu gọn dưới 801 px dùng chung các mục. Menu cập nhật tên mục hiện tại, đóng khi chọn, hỗ trợ Escape và chuyển focus đến tiêu đề nội dung. Thẻ nhận diện dùng avatar chữ cái, họ tên, email và nhãn vai trò được dịch từ phiên. Trường số điện thoại có nền riêng, biểu tượng khóa SVG và mô tả “Không thể thay đổi”. Lưu hồ sơ cập nhật nội dung trên chính form và thẻ nhận diện.

Tổng quan Đơn hàng dùng kết quả lịch sử hiện có. `pending` vào Chờ xác nhận, `confirmed` và `processing` vào Đang xử lý, `shipped` vào Đang giao và `delivered` vào Hoàn thành. Đơn hủy vẫn xuất hiện trong lịch sử. Các nhóm có giá trị 0 khi danh sách rỗng. Yêu thích dẫn sang route hiện có. Thông báo chuyển người dùng đến lịch sử đơn hàng khi cần kiểm tra trạng thái.

Trang sử dụng SVG cùng kho icon hiện có, metadata trung tính và `noindex`. Preload các module trực tiếp và dùng system font cho tiêu đề để hạn chế chờ tài nguyên. Không thêm endpoint, API call, dependency hay thay schema.

## 12. Validation Report

| Cỡ màn hình (px) | Tràn ngang (px) | Mép dưới nút lưu (px), màn hình cao 900 px |
| --- | --- | --- |
| 320 | 0 | 856 |
| 375 | 0 | 856 |
| 768 | 0 | 799 |
| 1024 | 0 | 760 |
| 1280 | 0 | 765 |
| 1440 | 0 | 765 |
| 1920 | 0 | 765 |

Axe không phát hiện vi phạm trong các kiểm tra WCAG A/AA ở Hồ sơ, Đơn hàng, Địa chỉ, Bảo mật, Thông báo, Đăng nhập, Đăng ký và Quên mật khẩu. Kiểm tra menu mở ở 320/375/768 px, thao tác bàn phím, bộ đếm rỗng và đơn đã tạo, metadata, HTTP noindex và hành vi xác thực. Không ghi nhận lỗi JavaScript trong các luồng kiểm tra.

Lighthouse 13.6 mobile với phiên đăng nhập fixture đạt Performance 100, Accessibility 100, Best Practices 100. LCP khoảng 1,53 s so với 1,52 s lúc audit, CLS 0 so với 0,041. SEO 61 so với 58 trên trang có chính sách noindex chủ động. Đây là số đo phòng lab, chưa đo Core Web Vitals thực tế.

Kiểm thử Chromium đã đạt account settings 10/10, management 11/11, customer flows 6/6, admin access 6/6, storefront 14/14 và frontend V3 12/12. Bộ `test:bank` hoàn tất và 16 kiểm thử Node về hồ sơ, khôi phục, đăng ký và giới hạn xác thực đều đạt.

## 13. Final Result

Bản UI đã được kiểm chứng trên cloud với dữ liệu fixture. Mục Thông báo có trạng thái giải thích và đường dẫn đến Đơn hàng. Hộp thư thông báo khách hàng cần nguồn dữ liệu được phê duyệt. Kết quả production vẫn cần xác nhận trên môi trường triển khai.

- [Hồ sơ desktop, fixture](screenshots/account-refactor/profile-desktop.png)
- [Hồ sơ mobile, fixture](screenshots/account-refactor/profile-mobile.png)
- [Đơn hàng mobile, fixture](screenshots/account-refactor/orders-mobile.png)
