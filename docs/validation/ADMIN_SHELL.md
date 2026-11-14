# Sidebar đa cấp, URL admin và Topbar

> Cập nhật sau báo cáo này: bộ lọc trạng thái/tồn kho qua URL đã được triển khai. Xem [ADMIN_URL_FILTERS.md](ADMIN_URL_FILTERS.md) và [hướng dẫn chạy thử](../TRY_ADMIN_UPDATE.md).

## Phạm vi và hiện trạng trước sửa

Thư mục: /workspace/Jielien. Nhánh: feat/admin-routes-sidebar-topbar. Commit nền: 7aa3b1ed9bbb79ab903d2067ab336372ab332ac7. Các thay đổi chưa commit từ nhiệm vụ trước được giữ nguyên; báo cáo này chỉ mô tả phần điều hướng/layout được làm sau khi người dùng cho phép bổ sung URL.

Đã đọc AGENTS.md. Stack: ES modules, template HTML/CSS, Node/PostgreSQL; không dùng React, không có hydration. Icon là SVG local. Trước sửa, cả 22 mục sidebar là button gọi renderView(id), KHÔNG có href riêng; URL giữ /quan-tri. Topbar nằm trong public/admin.html, còn breadcrumb/thông báo phiên và danh tính cuối sidebar nằm trong shell() của public/admin.js. Hai link Tài khoản trỏ /tai-khoan; Xem website trỏ /. Mobile ≤900px dùng menu mở trong luồng trang, không phải drawer phủ màn hình. Nút menu trước đây ở hàng breadcrumb vùng nội dung.

Đăng xuất trước đây chỉ có ở public/account.js: POST /api/auth/logout bằng api() có CSRF, xóa jielien-cart-v2 và jielien-cart-owner, xóa user/csrf rồi hiện đăng nhập. Đã tách đúng luồng này sang auth-session.js để dùng chung; backend đăng xuất không thay đổi. Tài khoản giữ nguyên đích /tai-khoan. Đăng nhập nay chấp nhận thêm các URL admin hợp lệ để trở về đúng trang sau đăng nhập.

## Nguồn cấu hình và URL

public/admin-nav.js là nguồn duy nhất cho id, nhãn, href, nhóm và quyền của 22 mục. Nhóm cha có icon riêng, mục con không có icon. Sidebar, tìm kiếm, breadcrumb và cổng route phía server dùng chung config. Đổi group: null trên một dòng cấu hình sẽ đưa mục đó ra cấp 1. Không thêm trang nghiệp vụ mới hoặc route menu rỗng.

| Nhóm | Nhãn cũ → nhãn hiện tại | URL thật mới |
| --- | --- | --- |
| Tổng quan & Báo cáo | Tổng quan → Tổng quan | `/quan-tri` |
| Tổng quan & Báo cáo | Báo cáo → Báo cáo phân tích | `/quan-tri/bao-cao` |
| Đơn hàng & Vận chuyển | Đơn hàng → Danh sách đơn hàng | `/quan-tri/don-hang` |
| Đơn hàng & Vận chuyển | Đổi trả hàng → Xử lý đổi trả hàng | `/quan-tri/doi-tra` |
| Sản phẩm & Danh mục | Sản phẩm cha & SKU → Sản phẩm cha & SKU | `/quan-tri/san-pham` |
| Sản phẩm & Danh mục | Danh mục & Thuộc tính → Danh mục & Thuộc tính | `/quan-tri/danh-muc` |
| Sản phẩm & Danh mục | Giá mặc định & trạng thái SKU → Giá mặc định & trạng thái | `/quan-tri/gia-sku` |
| Sản phẩm & Danh mục | CSV sản phẩm → Nhập / xuất CSV | `/quan-tri/csv-san-pham` |
| Quản lý kho hàng | Kho & tồn hàng → Tồn kho hiện tại | `/quan-tri/ton-kho` |
| Quản lý kho hàng | Phiếu kho → Phiếu nhập / xuất kho | `/quan-tri/phieu-kho` |
| Quản lý kho hàng | Quản lý nhiều kho → Thiết lập nhiều kho | `/quan-tri/kho-hang` |
| Tiếp thị & Nội dung web | Mã giảm giá → Mã giảm giá | `/quan-tri/ma-giam-gia` |
| Tiếp thị & Nội dung web | Banner & Poster Studio → Banner & Poster Studio | `/quan-tri/banner` |
| Tiếp thị & Nội dung web | Tin tức & SEO → Tin tức & bài viết SEO | `/quan-tri/bai-viet` |
| Tiếp thị & Nội dung web | Thư viện ảnh → Thư viện media | `/quan-tri/media` |
| Tiếp thị & Nội dung web | Chuyển hướng SEO → Chuyển hướng SEO | `/quan-tri/chuyen-huong` |
| Cấu hình hệ thống | Cấu hình công ty → Thông tin công ty | `/quan-tri/cong-ty` |
| Cấu hình hệ thống | Tài khoản & Phân quyền → Tài khoản & phân quyền | `/quan-tri/tai-khoan` |
| Cấu hình hệ thống | Nhật ký thao tác → Nhật ký thao tác | `/quan-tri/nhat-ky` |
| Cấu hình hệ thống | Lọc & xuất nhật ký → Lọc & xuất nhật ký | `/quan-tri/tra-cuu-nhat-ky` |
| Cấu hình hệ thống | Tài khoản nhận tiền → Tài khoản nhận tiền | `/quan-tri/tai-khoan-ngan-hang` |
| Cấu hình hệ thống | Trạng thái vận hành → Trạng thái vận hành | `/quan-tri/van-hanh` |

Giữ đủ 22 chức năng hiện hữu, gồm Tài khoản nhận tiền và Lọc & xuất nhật ký trong nhóm hệ thống. Không đưa Nhật ký liên hệ, Tạo vận đơn thủ công hoặc Giao dịch SePay chưa khớp vào menu: chưa có triển khai tương ứng. Bước 2 của docs/order-flow-plan.md vẫn chờ duyệt.

Chi tiết đơn hàng: /quan-tri/don-hang/{mã đơn}, dùng chính API/khung xử lý đơn đang có. Hỗ trợ tải lại và lịch sử Back/Forward; đóng khung trả về URL danh sách. Link cũ /quan-tri?order=... được chuyển sang URL chi tiết. /admin.html vẫn được hỗ trợ, chuyển URL về view hợp lệ. Đường dẫn không có màn hình thật trả 404. Trang admin mới giữ cổng đăng nhập/quyền quản trị phía server, no-store và noindex. Không tạo các route chi tiết giả cho màn hình khác.

## Hành vi sau sửa

- 6 nhóm accordion: mặc định chỉ nhóm đang active mở, cho phép nhiều nhóm mở. Đổi trang mở nhóm mới mà giữ các nhóm đã mở; không lưu storage.
- Một SVG ChevronDown xoay 0/-90 độ trong 200ms; grid rows 0fr/1fr; tôn trọng reduced-motion. Vùng đóng dùng inert, không nhận Tab.
- Mục con thụt lề với đường kẻ trắng tương đối, một dòng có ellipsis/title. Trạng thái active dùng chữ xanh lá thương hiệu trên nền tối và vạch bên trái, kể cả lúc hover. Nhóm chứa mục active vẫn nổi bật khi đóng.
- Khớp prefix dài nhất, riêng /quan-tri chỉ khớp chính xác. Các route có thể truy cập được kiểm tra riêng để không phục vụ URL chưa triển khai.
- Nguồn số đơn chờ xác nhận: GET /api/admin/dashboard → stats.pendingOrders → store.dashboard() đếm orders.status='pending'. Badge dùng cùng nguồn này, cập nhật lúc tải Tổng quan/danh sách đơn hoặc khi mở admin từ view khác. Không polling mới. Ẩn khi 0/không lấy được/thiếu quyền dashboard.read hoặc orders.read; >99 hiện 99+. Nhóm đóng có số nhỏ. Không lấy số theo độ dài danh sách đơn phân trang.
- Tìm kiếm bỏ dấu NFD và đ/Đ, không phân biệt hoa/thường; Ctrl/Meta+K focus, Escape xóa/blur, Enter đi tới kết quả đầu. Tìm kiếm tạm mở nhóm khớp; xóa chữ khôi phục trạng thái nhóm. Kbd mặc định Ctrl K, đổi sang ⌘K sau khi đọc nền tảng trong trình duyệt; ẩn khi có chữ.
- Logo sidebar 40px là link /quan-tri. Sidebar cuộn riêng. Giữ navy/xanh lá và viền/hover pha màu tương đối.
- Topbar 56px: breadcrumb từ config, chấm phiên bảo vệ, link storefront tab mới và một dropdown Admin. Logo topbar chỉ giữ dưới 1024px. Ẩn chữ phiên dưới 1280px, giữ chấm/title. Di chuyển nút mobile menu lên Topbar, giữ hành vi mở trong luồng trang.
- Breadcrumb dùng nav/ol, link các cấp trước và aria-current ở cấp cuối. Chi tiết đơn hiện Quản trị / Danh sách đơn hàng / Chi tiết. Không còn hàng breadcrumb cũ hoặc danh tính ở đáy sidebar. Nút Làm mới giữ cạnh tiêu đề trang.
- Dropdown có aria/menu roles, phím mũi tên/Home/End, Escape, click ngoài và trả focus. API, quyền, CSRF, xử lý đơn/kho/thanh toán không đổi.

## File của nhiệm vụ này

Runtime:
- public/admin-nav.js (mới): config và bộ khớp URL/tìm kiếm/badge.
- public/auth-session.js (mới): luồng đăng xuất dùng chung.
- public/admin.js: sidebar, sự kiện, URL, breadcrumb, dropdown và badge.
- public/admin.html: khung Topbar.
- public/admin-workspace.css: layout/sidebar/Topbar và responsive.
- public/management.css: bỏ CSS admin-user đã không còn sử dụng; giữ header-caption cho trang tài khoản.
- public/ui-icons.js: thêm SVG chevronDown và megaphone.
- public/account.js: dùng chung logout và chấp nhận redirect tới URL admin hợp lệ.
- server.mjs: phục vụ các URL admin có trong config qua cổng xác thực hiện có.

Kiểm thử:
- tests/admin-navigation.browser.mjs: 10 nhóm kiểm tra cho URL, accordion, badge, tìm kiếm, breadcrumb, mobile, quyền và đăng xuất.
- tests/support/admin-navigation.mjs (mới): mở nhóm trước khi chọn link, dùng điều khiển thật.
- Cập nhật thao tác chọn menu trong tests/admin-catalog-layout.browser.mjs, admin-order-layout.browser.mjs, bank-checkout.browser.mjs, bank-settings.browser.mjs, commerce.browser.mjs, customer-account.browser.mjs, frontend-v3.browser.mjs, management.browser.mjs, ui-upgrade.browser.mjs, usability.browser.mjs và warehouse-catalog.browser.mjs. Giữ các kiểm tra nghiệp vụ; không bỏ assertion để vượt test.
- Báo cáo này và docs/screenshots/admin-shell/*.png: ảnh dữ liệu fixture, không phải đơn khách thật.

Không thêm dependency, migration, biến môi trường hoặc chỉnh cấu hình ngân hàng/dịch vụ ngoài.

## Kiểm chứng

| Lệnh/bộ kiểm tra | Kết quả |
| --- | --- |
| Trước sửa: test:browser / test:bank / test:account | 14/14, 26/26, 9/9 |
| Sau sửa: test:browser / test:bank / test:account | 14/14, 26/26, 9/9 |
| npm test | 98/98 |
| test:usability | 9/9 |
| test:commerce | 13/13 |
| test:management | 11/11 |
| test:admin-access | 6/6 |
| node tests/admin-navigation.browser.mjs | 10/10 |
| node --check + git diff --check | Đạt |
| Docker build local | Đạt, image jielien-admin-shell:local |

Dự án không có npm run build; đã build Dockerfile hiện có. Lần build đầu gặp SELF_SIGNED_CERT_IN_CHAIN của proxy môi trường; build lại thành công với --secret id=npm_ca,src=/usr/local/share/ca-certificates/environment-proxy-ca.crt (CA có sẵn, không tắt TLS và không chép CA vào source/image). Không deploy.

Đã chạy Chromium thật với schema PostgreSQL dùng riêng cho fixture. Bài kiểm tra mở đủ 22 href, reload, Back/Forward, URL chi tiết và link cũ; kiểm tra header no-store/noindex, HEAD, khách chưa đăng nhập 401, tài khoản khách 403, URL lạ 404; logout trả 204 và session bị thu hồi. Kiểm tra bố cục 320/375/768/1440/1920px không tràn ngang. Đã xem ảnh desktop 1440 và menu mobile 375; ảnh trong docs/screenshots/admin-shell/. Kiểm tra reduced-motion, keyboard và active hover trong trình duyệt. Nội dung fixture hiển thị số thật từ database kiểm thử, không hardcode trên UI.

## Cách tự kiểm tra

1. Đăng nhập /quan-tri. Chỉ nhóm Tổng quan & Báo cáo mở. Mở/đóng thêm nhóm bằng click, Tab/Enter/Space.
2. Chọn Danh sách đơn hàng. URL đổi /quan-tri/don-hang; nhấn tải lại, Back và Forward. Tổng quan không sáng trên trang đơn hàng.
3. Mở một đơn thật đang có quyền xem. URL có mã đơn; tải lại vẫn mở đúng đơn. Breadcrumb có Chi tiết; đóng khung về danh sách.
4. Ctrl/⌘+K, gõ don hang, Enter; thử chuỗi không có kết quả; Escape xóa và bỏ focus. Kiểm tra trạng thái mở nhóm được khôi phục sau khi xóa chữ.
5. Đối chiếu badge với thẻ Đơn chờ xác nhận trên Tổng quan. Tài khoản thiếu quyền không thấy mục/badge bị hạn chế.
6. Mở dropdown Admin, thử Escape/click ngoài, Tài khoản đúng /tai-khoan. Xem website mở / trong tab mới. Đăng xuất rồi thử tải lại trang admin.
7. Trên điện thoại 375px, mở menu ở Topbar, cuộn nhóm và chọn mục; menu đóng, không tràn ngang. Từ desktop 1024px không có logo lặp.

## Hoàn tác và việc còn lại

Không có biến môi trường cần điền. Chưa cập nhật máy chủ hoặc dữ liệu thật. Khi phát hành, cập nhật source và rebuild/restart backend Docker để URL mới được phục vụ; chỉ thay file JS/CSS trên server cũ là chưa đủ.

Nếu cần hoàn tác, khôi phục riêng patch điều hướng/Topbar này cùng các file test tương ứng từ phiên bản đã duyệt, rồi rebuild; không hoàn tác toàn bộ working tree vì còn thay đổi của nhiệm vụ trước. Không có dữ liệu mới cần xóa. Các bookmark URL mới cần quay lại /quan-tri nếu dùng phiên bản cũ.

Giới hạn: chỉ đơn hàng có URL chi tiết vì có API/khung chi tiết thật. Không thêm quy trình liên hệ/vận đơn hoặc SePay. Chưa kiểm tra trên thiết bị Safari/iOS vật lý; kiểm chứng thực tế trong Chromium. Badge cập nhật theo lúc tải màn hình, không nhận thông báo realtime.
