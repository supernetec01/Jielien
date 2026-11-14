# Tối ưu bố cục Tổng quan Admin

> Cập nhật sau báo cáo này: bộ lọc trạng thái/tồn kho qua URL đã được triển khai. Xem [ADMIN_URL_FILTERS.md](ADMIN_URL_FILTERS.md) và [hướng dẫn chạy thử](../TRY_ADMIN_UPDATE.md).

## Phạm vi và Bước 0

Thư mục `/workspace/Jielien`, nhánh `style/admin-dashboard-layout`, commit nền `7aa3b1ed9bbb79ab903d2067ab336372ab332ac7`. Đã đọc AGENTS.md và kiểm tra Sidebar/Topbar đã hoàn tất trước khi sửa. Các thay đổi của nhiệm vụ trước được giữ nguyên.

Stack: JavaScript ES modules, template HTML/CSS, backend Node/PostgreSQL. Tổng quan nằm trong `dashboardMarkup()` và nhánh dashboard của `renderView()` trong `public/admin.js`; phần phân tích dùng `public/report-visuals.js`. Biểu đồ hiện hữu là SVG tự dựng, không có thư viện biểu đồ ngoài.

| Khối trước sửa | Nguồn và hành vi hiện hữu |
| --- | --- |
| Banner “Chăm chút từng đơn hàng…” | Markup tĩnh của dashboardMarkup(), không có dữ liệu/API riêng |
| Đơn chờ xác nhận | GET /api/admin/dashboard → stats.pendingOrders; store.dashboard(), db/store.mjs:1155, đếm orders.status='pending'. Dòng phụ stats.orders |
| Tiền đã thu | Cùng API → stats.revenue, tổng payments.amount có status='paid'; giữ hàm money() và định dạng đ |
| Sản phẩm | Cùng API → stats.products, số sản phẩm chưa xóa; dòng phụ stats.variants |
| Cảnh báo tồn thấp | Cùng API → stats.lowStock, số balance của kho thường đang hoạt động có on_hand-reserved <= ngưỡng của SKU |
| Công việc thường ngày | Bốn nút tắt sang view có sẵn; không có nguồn số liệu riêng |
| Giá trị đơn hàng theo ngày | GET /api/admin/reports/summary → report.series, report.gmv, report.previous; lib/operations.mjs:151,176. Kỳ mặc định 30 ngày, ngày nhóm theo Asia/Ho_Chi_Minh, GMV loại trừ đơn hủy; không phải tiền đã thu |
| Sản phẩm bán nhiều | Cùng API → report.topSkus; lib/operations.mjs:188. Top 5 SKU/snapshot, đơn chưa hủy, số lượng và giá trị dòng hàng |
| Trạng thái đơn hàng | Cùng API → report.byStatus và report.orders; lib/operations.mjs:194. Giữ cách tính tỷ lệ hủy |

Quyền dashboard.read/reports.read và xử lý lỗi tải báo cáo giữ nguyên. Renderer reportVisuals() còn dùng trên trang Báo cáo nên bố cục Tổng quan được tách bằng tùy chọn dashboard, không áp dụng toàn cục.

Trang Đơn hàng và Tồn kho có bộ lọc giao diện nhưng CHƯA đọc bộ lọc từ URL. Kiểm tra source filterOrders(), filterInventory() và URLSearchParams trong admin.js; chạy thử /quan-tri/don-hang?status=pending và /quan-tri/ton-kho?stock=low vẫn cho bộ lọc rỗng. Không thêm logic lọc trong nhiệm vụ này.

## Đã thay đổi

- Xóa banner và toàn bộ khối Công việc thường ngày; xóa map sectionIcons, handler nút tắt và các CSS chỉ dùng cho hai khối đó.
- Tiêu đề, mô tả và Làm mới cùng một hàng, kể cả 320/375px. Chỉ áp dụng spacing gọn cho Tổng quan, không sửa header của các màn hình khác. Giữ handler Làm mới.
- Đúng 4 KPI. Mỗi thẻ là một anchor bao toàn bộ, không lồng control khác. Lấy href từ adminNav; hỗ trợ click, mở tab mới và bàn phím theo liên kết thật. Icon SVG local có aria-hidden và nền pastel; thêm một SVG wallet vào thư viện hiện hữu.
- Lưới KPI 2 cột dưới 1280px, 4 cột từ 1280px. Thẻ desktop đo khoảng 122px; trên điện thoại cho chữ/số xuống dòng khi cần để không mất dữ liệu hoặc tràn ngang. Hover nhích lên/đổ bóng; focus-visible theo style Admin và reduced-motion hiện hữu.
- Thẻ chờ xác nhận chỉ nhấn nền olive khi pendingOrders > 0. Giữ đúng công thức/định dạng tiền và số trước đó.
- Từ 1280px: biểu đồ chiếm 2/3, bên phải Trạng thái đơn hàng rồi Sản phẩm bán nhiều, hai card flex-1. Card biểu đồ cao bằng toàn cột phải. SVG co giãn trong vùng plot, giữ viewBox, thanh, màu, title và bảng dữ liệu hiện hữu.
- Desktop giới hạn chiều cao danh sách bên phải theo viewport để biểu đồ nằm trong màn hình đầu. Không cắt mảng dữ liệu: danh sách cuộn được bằng chuột/bàn phím, có tabindex và aria-label. Dưới 1280px bỏ giới hạn này, xếp dọc biểu đồ → trạng thái → sản phẩm, giữ đầy đủ nội dung.
- Giữ nguyên trạng thái rỗng và thông báo lỗi/khôi phục bằng Làm mới. Trang Báo cáo tiếp tục dùng bố cục cũ.

### Đích của bốn thẻ

| Thẻ | URL từ adminNav | Bộ lọc URL |
| --- | --- | --- |
| Đơn chờ xác nhận | /quan-tri/don-hang | Không thêm, trang đích chưa hỗ trợ |
| Tiền đã thu | /quan-tri/bao-cao | Giữ kỳ mặc định của trang Báo cáo |
| Sản phẩm | /quan-tri/san-pham | Không thêm |
| Cảnh báo tồn thấp | /quan-tri/ton-kho | Không thêm, trang đích chưa hỗ trợ |

Quyền truy cập trang đích vẫn do hệ thống hiện hữu kiểm tra; không cấp thêm quyền qua liên kết KPI.

## File của nhiệm vụ này

Runtime chỉ có 4 file (đã đối chiếu SHA-256 trước/sau cho backend, cấu hình và các file public khác):

- `public/admin.js`: markup KPI/header, bỏ banner/nút tắt, chọn bố cục phân tích Tổng quan.
- `public/report-visuals.js`: tùy chọn bố cục dashboard, giữ markup mặc định của trang Báo cáo.
- `public/admin-workspace.css`: component Tổng quan và dọn CSS không còn dùng.
- `public/ui-icons.js`: SVG wallet local.

Kiểm thử và bằng chứng:

- `tests/dashboard-layout.browser.mjs` (mới): 6 nhóm kiểm tra, dữ liệu rỗng và 6 trạng thái/5 sản phẩm từ schema fixture.
- `tests/commerce.browser.mjs`: kiểm tra thẻ Sản phẩm thay cho nút tắt vừa được yêu cầu xóa; giữ kiểm tra mở đúng editor.
- `docs/screenshots/dashboard-layout/`: ảnh fixture ở 320/375/768/1366/1440/1920 và measurements.json.
- Báo cáo này.

Không thay backend, database, API, quyền, Sidebar, Topbar, adminNav hoặc nghiệp vụ lọc. Không có biến môi trường, dependency hoặc migration mới.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Trước sửa: test:browser / test:bank / test:account | 14/14, 26/26, 9/9 |
| Sau sửa: test:browser / test:bank / test:account | 14/14, 26/26, 9/9 |
| test:usability | 9/9 |
| test:commerce | 13/13 |
| test:management | 11/11 |
| test:admin-access | 6/6 |
| tests/admin-navigation.browser.mjs | 10/10 |
| tests/dashboard-layout.browser.mjs | 6/6 |
| node --check, git diff --check | Đạt |
| Docker build | Đạt: jielien-dashboard-layout:local |

Không có script npm run build trong repo; đã dùng Dockerfile hiện có. Môi trường proxy cần CA sẵn có, truyền qua --secret id=npm_ca,src=/usr/local/share/ca-certificates/environment-proxy-ca.crt; không tắt TLS hoặc sửa Dockerfile.

Đã mở Chromium thật với schema PostgreSQL dùng riêng, không dùng dữ liệu khách thật. Kiểm tra KPI khớp API, toàn bộ trạng thái/sản phẩm/bars/bảng dữ liệu khớp báo cáo, 4 link hoạt động, Tab/Enter/focus/hover, Làm mới, lỗi 503 và khôi phục. Không có request ghi dữ liệu do thao tác giao diện Tổng quan. Dữ liệu fixture được tạo qua API thật; không bịa giá trị trên UI.

Renderer mặc định của trang Báo cáo được so sánh với bản trước sửa: HTML giống nhau cho dữ liệu rỗng và có dữ liệu. Các kiểm tra báo cáo trong usability/commerce cũng đạt. Không chạy lại toàn bộ npm test vì không thay luồng dữ liệu hoặc validation.

Đã kiểm tra và chụp 1920×911, 1366×768, 1440×900, 768×1024, 375×812, 320×700; không tràn ngang. Đã xem ảnh desktop 1920, laptop 1366 và mobile 375. Đo bản cuối:

- 1920×911: 4 KPI kết thúc khoảng y=275; card biểu đồ kết thúc y=851; phần đầu cả ba khối phân tích hiện trong màn hình đầu.
- 1366×768: 4 KPI kết thúc khoảng y=275; toàn card biểu đồ kết thúc y=725.
- Tablet/mobile: KPI 2×2; sau đó biểu đồ, trạng thái, sản phẩm theo thứ tự. Nút Làm mới vẫn cùng hàng với phần tiêu đề/mô tả.

## Cách tự kiểm tra

1. Đăng nhập /quan-tri ở 1920×911 hoặc 1366×768. Không còn banner/Công việc thường ngày; thấy 4 KPI và biểu đồ trong màn hình đầu.
2. Bấm hoặc dùng Tab/Enter vào từng KPI; kiểm tra đúng các URL ở bảng trên. Đơn hàng/Tồn kho chưa được tự lọc.
3. Bấm Làm mới và đối chiếu KPI với số liệu thật đang có; nền thẻ chờ xác nhận trắng khi 0 và olive khi >0.
4. Trên desktop, cuộn danh sách trạng thái/sản phẩm để xem các mục còn lại; có thể Tab vào danh sách rồi dùng phím mũi tên/End. Mở Xem dữ liệu biểu đồ để đọc số chính xác.
5. Ở 768px và 375px, kiểm tra lưới KPI 2 cột và các khối phân tích xếp dọc; menu/topbar vẫn hoạt động.
6. Mở /quan-tri/bao-cao, kiểm tra bộ lọc và biểu đồ vẫn dùng bố cục trước đó.

## Hoàn tác và tồn đọng

Không có biến môi trường cần điền. Chưa deploy. Khi phát hành, cập nhật source rồi rebuild Docker theo quy trình hiện hữu.

Nếu cần hoàn tác, khôi phục riêng patch Tổng quan trong 4 file runtime, bài kiểm tra commerce và bài kiểm tra/bằng chứng mới; không reset toàn bộ working tree vì còn thay đổi của nhiệm vụ trước. Không có dữ liệu cần xóa hoặc hoàn tác.

Tồn đọng được giữ đúng phạm vi: bộ lọc đơn chờ xác nhận/tồn thấp qua URL chưa có; nếu cần phải làm nhiệm vụ riêng. Danh sách bên phải cuộn trong thẻ ở desktop khi nhiều dữ liệu. Chưa kiểm tra trên thiết bị Safari/iOS vật lý.
