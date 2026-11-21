# Bộ lọc Admin qua URL và bản tổng hợp GitHub

Nhánh: `feat/admin-url-filters`. Đã đọc AGENTS.md, tạo nhánh riêng và chạy kiểm tra trước khi sửa. Nền checkout: `7aa3b1ed9bbb79ab903d2067ab336372ab332ac7`.

## Đã thực hiện

- KPI Đơn chờ xác nhận → `/quan-tri/don-hang?status=pending`.
- KPI Cảnh báo tồn thấp → `/quan-tri/ton-kho?stock=alert`.
- Dùng hai trang đã có, không tạo trang trống hoặc thay nghiệp vụ xử lý đơn/kho.
- Đọc các giá trị hợp lệ từ URL khi vào trang, F5, Làm mới, Back/Forward. Đổi dropdown cập nhật URL, chọn Tất cả bỏ tham số.
- Giữ bộ lọc khi mở/tải lại/đóng chi tiết đơn và qua đăng nhập. Breadcrumb vẫn lấy nhãn từ adminNav.
- Lọc trạng thái đơn trong SQL trước LIMIT, tham số hóa giá trị; không chỉ lọc một danh sách đơn mới nhất trên trình duyệt. API giữ giới hạn hiện có tối đa 200 kết quả, không thêm phân trang trong nhiệm vụ này. Có thể phối hợp `status` và `reconciliation=pending`.
- Thêm lựa chọn “Cảnh báo tồn thấp”: kho normal, đang active, available <= low_stock_threshold. Bao gồm tồn bằng 0, đúng cùng cách tính KPI. API inventory thêm thuộc tính warehouseStatus từ phép JOIN hiện có, không thêm bảng/migration.
- Giữ nghĩa lựa chọn cũ: `stock=low` là Sắp hết (còn dương), `out` là Hết hàng, `enough` là Đủ hàng.
- URL nhận giá trị enum hữu hạn. Giá trị không hợp lệ ở frontend được bỏ qua; API status không hợp lệ trả 400. Không đưa tên/SĐT/nội dung ô tìm kiếm lên URL. Quyền và CSRF giữ nguyên.

## File thuộc phần bộ lọc

- `public/admin-filters.js`: đọc/ghi enum URL và điều kiện cảnh báo tồn thấp dùng để đối chiếu KPI.
- `public/admin.js`: URL KPI, áp dụng/sync bộ lọc, điều hướng query và giữ query của danh sách khi xem chi tiết.
- `public/account.js`: chấp nhận redirect tới URL admin hợp lệ có query.
- `db/store.mjs`: WHERE status trước LIMIT; thêm warehouseStatus trong dữ liệu tồn kho.
- `server.mjs`: chuyển status của API Admin tới store, giữ kiểm tra quyền trước truy vấn.
- `package.json`: đưa test mới vào npm test, thêm test:admin-filters.
- `tests/admin-filters.test.mjs`, `tests/admin-filters.browser.mjs`, `tests/support/admin-filter-fixture.mjs`: unit/API/browser, dữ liệu fixture riêng.
- `tests/dashboard-layout.browser.mjs`: đổi kỳ vọng thẻ KPI và kiểm tra filter URL đã triển khai.
- `docs/TRY_ADMIN_UPDATE.md`: hướng dẫn chạy nhánh bằng Docker Desktop.
- README thêm link hướng dẫn; LOCAL_WINDOWS sửa mô tả JSON health về đúng status/time/version; các báo cáo Sidebar/Topbar/Tổng quan cũ có ghi chú dẫn tới cập nhật này.
- `docs/screenshots/admin-url-filters/`: ảnh 320/375/768/1440/1920 với dữ liệu fixture, không phải khách hàng thật.

## Kiểm thử

| Bộ kiểm tra | Kết quả |
| --- | --- |
| Trước sửa: test:browser / test:bank / test:account | 14/14, 26/26, 9/9 |
| Sau sửa: test:browser / test:bank / test:account | 14/14, 26/26, 9/9 |
| npm test | 100/100 |
| test:admin-filters | 2/2 unit/API + 5/5 browser |
| test:usability / test:commerce | 9/9, 13/13 |
| test:management / test:admin-access | 11/11, 6/6 |
| Sidebar/Topbar browser | 10/10 |
| Tổng quan browser | 6/6 |
| node --check, git diff --check | Đạt |
| Docker build | Đạt: jielien-admin-update:local |

Chromium thật với schema PostgreSQL dùng riêng. Đã kiểm tra pending/confirmed/tất cả, phối hợp chờ đối soát, F5/Làm mới/Back/Forward, URL chi tiết, đăng nhập trở về URL có query, cảnh báo gồm hết hàng và bằng ngưỡng, loại trừ kho hư hỏng/kho inactive, các bộ lọc cũ, giá trị URL sai, quyền 401/403 và không ghi dữ liệu khi điều hướng. Đã chụp năm kích thước và xem ảnh desktop tồn kho 1440 và đơn hàng mobile 375; không tràn ngang. Test API có trường hợp limit=1 để chứng minh WHERE trạng thái được áp dụng trước LIMIT.

Dự án không có script npm run build; dùng Dockerfile hiện có, với CA môi trường qua build secret. Không sửa Dockerfile cho bộ lọc, không tắt TLS.

## Bản tổng hợp được yêu cầu commit

Theo yêu cầu người dùng, commit còn gồm toàn bộ thay đổi chưa commit đã làm trước đó trong chuỗi nhiệm vụ: Sentry/health, cấu hình tài khoản nhận tiền trong Admin, quy trình đối soát chuyển khoản thủ công/hết hạn đơn/thông báo nhân viên, Sidebar/Topbar/URL/Tổng quan, tài liệu kế hoạch xử lý đơn và các kiểm thử/bằng chứng liên quan. Không triển khai SePay hoặc Bước 2 liên hệ khách/vận đơn chưa được duyệt.

Đã rà các file mới/thay đổi, quét mẫu private key/token dịch vụ và tên file nhạy cảm; không thấy ứng viên credential theo các mẫu quét. `.env`/`.env.local`/dữ liệu/backup không được đưa vào commit; `.env.example` chỉ chứa tên biến và mẫu không có bí mật. Ảnh là dữ liệu kiểm thử. Đây không phải cam kết quét bí mật tuyệt đối; không in giá trị credential vào log. Không tự bật Sentry/Telegram/tự hủy, không deploy.

## Chạy thử, tắt và hoàn tác

Xem [hướng dẫn từng bước](../TRY_ADMIN_UPDATE.md). Bộ lọc không có biến môi trường/migration mới; các biến tùy chọn của phần tổng hợp vẫn theo .env.example. Chọn Tất cả để bỏ bộ lọc. Hoàn tác source bằng nhánh/commit đã duyệt rồi rebuild, giữ dữ liệu và cấu hình local; không reset database hoặc xóa volume.

Giới hạn: API danh sách đơn vẫn tối đa 200 kết quả theo thiết kế cũ; bộ lọc không thêm phân trang. Các ô tìm kiếm/kho/sắp xếp khác vẫn là bộ lọc tại trang, không được serialize vào URL. Chưa thử trên Safari/iPhone vật lý hoặc deploy vào máy người dùng.
