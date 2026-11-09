# Bàn giao nâng cấp giao diện Jielien

> Hồ sơ của lượt UX ban đầu. Trạng thái hiện tại và thông tin chủ cửa hàng cần cung cấp được quản lý tập trung ở [CHUC_NANG_CHUA_TRIEN_KHAI.md](CHUC_NANG_CHUA_TRIEN_KHAI.md). Các dòng về nhánh chưa push, chưa có reset email, giới hạn đăng nhập và số migration địa chỉ bên dưới là lịch sử; không dùng chúng để triển khai lại phần đã có hoặc sửa migration cũ.

Đối chiếu `docs/UPGRADE_SPEC.md` và audit UI/UX. Nhánh: `feature/ux-upgrade-phase1`.

Đây là bản nâng cấp giao diện và một phần báo cáo, **không phải tuyên bố hoàn thành toàn bộ 3 giai đoạn** trong đặc tả. Không triển khai lên máy công ty, không mở website công khai. Không thay migration 001–012, không reset database hoặc thay mật khẩu. Mọi kiểm thử dùng schema riêng.

## Đã triển khai và cách sử dụng

### Website

- Font tiêu đề Be Vietnam Pro (Latin/Vietnamese, 600/700), file WOFF2 lưu cục bộ kèm OFL; không gọi CDN. Artifact Fontsource 5.3.0 được kiểm SHA-512 trước khi giải nén. Không thêm dependency chạy ứng dụng.
- Bộ biến màu/chữ/khoảng cách/chuyển động chung trong `public/brand.css`; xanh lá đi với chữ navy, màu chữ phụ rõ hơn.
- SVG thống nhất ở header, navigation mobile, thẻ sản phẩm, vùng mua, dashboard và các mục Admin chính. Sprite HTML dùng cùng bộ paths.
- Danh mục menu/trang chủ/bộ lọc lấy `/api/categories`, giữ fallback khi lỗi; thương hiệu lấy `/api/brands`.
- Trang sản phẩm: giá và chọn quy cách trước mô tả dài; chọn quy cách bằng nút radio với bàn phím, URL cập nhật bằng replaceState, mở lại URL đúng quy cách. Hết hàng vẫn chọn xem được. Không lộ số tồn lớn; vùng chạm số lượng 44px.
- Thanh mua mobile chỉ hiện khi khối mua gốc ngoài viewport, có giá/quy cách và mua/thêm giỏ; bố trí trên navigation dưới, chừa khoảng trống cuối trang.
- Mini-cart dùng native dialog (focus modal, Esc, trả focus), đổi số lượng/xóa, debounce 250ms và version để bỏ response cũ; giá và tổng lấy `/api/quote`. Mua ngay đi thẳng checkout. Header desktop mở lại mini-cart.
- Phí mặc định và ngưỡng miễn ship gom trong `lib/shipping-policy.mjs`, trả qua `/api/site` và `/api/quote`; giữ 25.000/499.000 và quy tắc tính trước giảm giá như cũ. Có thanh tiến độ, gợi ý mã từ server thay cho mã ghi cứng.
- Checkout: input mobile 16px; email/ghi chú thu gọn; lỗi có aria-invalid và mô tả; giữ bản nháp khi lỗi; nút đặt hàng/tổng tiền cố định mobile thay navigation dưới. Giữ checkbox điều khoản bắt buộc và cơ chế chống gửi lặp/phục hồi đơn.
- Banner dùng tất cả banner server trả về, có nút chọn/trước/sau/tạm dừng; tự chuyển 6 giây, dừng khi hover/focus/reduced-motion. Không có banner dùng bộ fallback cũ.
- Bộ lọc mobile dạng dialog trượt dưới, chọn xong bấm Áp dụng; Xóa lọc chỉ xóa lựa chọn trong dialog cho đến khi xác nhận. Desktop giữ lọc trực tiếp.
- Thẻ sản phẩm: giá nổi bật, giảm giá đỏ, tên 2 dòng, nút yêu thích 44px, ảnh có kích thước/tỷ lệ, trạng thái tồn đặc biệt. Hiệu ứng ảnh hover, thêm giỏ/nhảy badge, drawer, toast, section reveal; tôn trọng reduced-motion.
- Tin tức/bài viết SSR tái sử dụng header/footer của index, giữ HTML nội dung, metadata/canonical/JSON-LD; script nhẹ chỉ hỗ trợ menu và badge giỏ, không ghi đè nội dung.
- Nhãn demo ở footer tắt mặc định; `DEMO_MODE=true` bật nhãn/một số ghi chú mẫu. **Tắt nhãn không biến catalog mẫu thành hàng thật.** Không thay nội dung/ảnh catalog do người vận hành nhập.

### Admin

- Sidebar dễ đọc, icon theo chức năng; giữ phân quyền từng mục. Dashboard có đơn chờ xác nhận, tiền đã thu và ngưỡng cảnh báo tồn theo SKU, kho normal đang hoạt động.
- Dashboard ưu tiên lối tắt đơn/kho/sản phẩm/báo cáo; bỏ khối hướng dẫn dài. Báo cáo và dashboard có SVG từ database thật, top 5 SKU, trạng thái đơn, tỷ lệ hủy, so sánh giá trị đơn với kỳ trước. Chuỗi ngày bao gồm ngày không có đơn, theo giờ Việt Nam. Tiền đã thu không gộp với giá trị đơn; doanh thu dòng SKU ghi rõ trước ưu đãi cấp đơn/chưa gồm ship.
- Biểu đồ có mô tả, tooltip SVG qua title và bảng dữ liệu đọc bằng bàn phím; không có đơn hiển thị trạng thái rỗng.
- Bảng có header cố định trong vùng cuộn, chữ/nút lớn hơn, nhãn lọc nhìn thấy; kho có lọc Hết/Sắp hết/Đủ và sắp xếp tồn bán tăng dần, cảnh báo có chữ.
- Vai trò nhân viên hiển thị tiếng Việt; không thay các permission hoặc mã role thực tế.
- Mã giảm giá: bảng có nút Sửa, tự điền biểu mẫu, ID ẩn, nhãn tiếng Việt và nút tạo mới/hủy chỉnh sửa; dùng đúng adapter API/CSRF cũ.
- **Thông tin cửa hàng:** vào mục Cấu hình công ty/Thông tin cửa hàng để nhập tên, hotline, link Zalo/Messenger, email, địa chỉ, giờ làm việc, giới thiệu ngắn và bốn nội dung chính sách. Không phải sửa source để đổi các nội dung này.
- Placeholder hướng dẫn có sẵn; **không đưa số điện thoại/link giả vào database vận hành**. Số 0900000000 trong ảnh chỉ thuộc schema test và được dọn sau test.
- Khi lưu, chỉ gửi trường thay đổi với version đã tải, cập nhật version từng trường sau thành công; lỗi giữa chừng không giả toàn bộ đã lưu. API settings là từng trường, không phải giao dịch nguyên form: phần đã lưu trước lỗi được giữ, có thể sửa và bấm lưu lại.
- Liên hệ đã lưu xuất hiện trong footer/nút tư vấn. Hotline, email và host Zalo/Messenger có validation. Trường rỗng không tạo kênh liên hệ. Chính sách là văn bản thuần đã escape, không cho chèn HTML/script. Mặc định không tự bịa số ngày đổi trả hoặc nội dung pháp lý.

## Các phần CHƯA hoàn thành — lý do và hỗ trợ cần thiết

Các mục dưới không bị đánh dấu hoàn thành chỉ vì đã có phần nền. “Cần phát triển tiếp” là phần code chưa làm, không phải lỗi môi trường hoặc yêu cầu người dùng cấp quyền lại.

| Hạng mục | Trạng thái / phần còn thiếu | Lý do và bước tiếp theo | Bạn cần hỗ trợ gì |
|---|---|---|---|
| S1 | Chưa đạt toàn bộ tiêu chí gỡ mọi dấu vết mẫu; catalog/ảnh/mô tả seed vẫn là mẫu | Không tự đổi hàng hóa và văn bản mẫu thành tuyên bố sản phẩm thật | Nhập ảnh, giá, thương hiệu, mô tả thật trong Admin; duyệt bốn chính sách |
| S2 | Các bề mặt chính đã dùng SVG; một số ký tự mũi tên/phụ trợ trong editor cũ còn lại | Chưa hoàn thành kiểm kê/thay toàn bộ ký tự của mọi editor | Không cần thông tin; cần lượt rà soát code tiếp |
| S3 | Còn phân cấp danh mục con thụt lề, slug→ảnh chuẩn; chính sách vẫn qua SPA | Cần hoàn thiện cây danh mục và render chính sách SSR, hiện tin tức/bài viết đã dùng shell chung | Xác nhận cây danh mục mong muốn nếu cần sắp xếp kinh doanh |
| S4 | Đã có form lưu, footer, contact menu; chưa có hotline riêng trong header/dòng tư vấn dưới nút mua | Điểm liên hệ chính đã dùng được; các vị trí bổ sung chưa triển khai | Điền thông tin thật vào Admin; không gửi secret trong chat |
| S5 | Chưa hiện giá riêng trên từng nút quy cách; thay quy cách render lại phần trang trong SPA | Không tải lại document, giữ đúng SKU/URL; tối ưu cập nhật từng vùng là phần tiếp | Không cần thông tin |
| S6 | Chưa cho chỉnh phí ship trong Admin; hiện chỉ có một nguồn hằng server | Thay sang cấu hình vận hành cần validation, quyền và kiểm tra thay đổi phí qua API | Cung cấp mức phí/ngưỡng chính thức nếu muốn đổi; số mặc định được giữ nguyên |
| S7 | **Chưa có danh sách tỉnh/phường-xã chuẩn; chưa có ward/migration 013**. Chưa có tóm tắt thu gọn đầu checkout hoặc lỗi blur đầy đủ | Không dùng danh sách địa giới từ trí nhớ. Cần chốt bộ dữ liệu có nguồn/ngày/giấy phép rồi triển khai ward xuyên suốt API, địa chỉ đã lưu, fingerprint và snapshot đơn cũ/mới | Có thể gửi nguồn dữ liệu hành chính chính thức/đã duyệt. Giữ địa chỉ text tương thích hiện tại đến khi chuyển đổi có kiểm thử |
| S8 | Chưa có vuốt banner; logo thương hiệu vẫn chữ nếu thiếu ảnh; chưa đổi hoàn toàn thứ tự section mobile | Điều khiển nút, autoplay/pause đã có; gesture và ảnh thương hiệu chưa triển khai/thiếu tài sản | Cung cấp logo SVG/PNG nền trong suốt, logo thương hiệu và banner thật |
| S9 | Chưa có skeleton đúng riêng từng route hoặc đo CLS/Lighthouse; search chưa có ARIA combobox đầy đủ | Đã có ảnh giữ tỷ lệ, drawer filter, gợi ý có ảnh/giá và phím; còn yêu cầu truy cập/hiệu năng cần kiểm tra riêng | Không cần thông tin để code; số đo người dùng thật cần dữ liệu sau triển khai |
| B1 | Chưa có bảng 8 đơn cần xử lý/8 SKU, KPI chuyển khoản chờ, series endpoint 7/30 riêng hoặc count-up | Bản này dùng báo cáo summary có quyền reports.read; chưa hoàn thành toàn bộ dashboard nghiệp vụ trong spec | Không cần secret; cần phát triển/test thêm, không phải tính năng đã bật |
| B2 | Chưa có lọc/phân trang server, bulk status, in phiếu A5/100×150, export theo bộ lọc | Đây là tập thay đổi API/luồng vận hành riêng, không thể coi cải thiện bảng UI là đã xong. Cần test từng đơn hợp lệ/lỗi, phân quyền và số COD trước khi dùng | Chọn khổ giấy/máy in mong muốn; không cần cấp credential cho phần code |
| B3 | Chưa có export tồn, lịch sử SKU trong dialog, nút nhập kho điền sẵn | Lọc/trạng thái và form điều chỉnh có lý do giữ nguyên đã được cải thiện; các adapter phiếu/sổ kho còn cần nối tiếp | Không cần thông tin trừ mẫu CSV mong muốn |
| B4 | Chưa vẽ series tiền đã thu, phân tích hoàn trả/phương thức ở UI; chưa báo cáo lợi nhuận | Backend có byPayment/collectedSeries nhưng UI chưa dùng; lợi nhuận không thể suy ra từ giá bán | Chỉ khi muốn lợi nhuận: chốt cách nhập giá vốn và cung cấp giá vốn SKU |
| B5 | Chưa có nhớ thu gọn nhóm menu, card mobile cho mọi bảng, confirm/toast thống nhất toàn bộ | Các mục này vẫn ở backlog. Server đã có rate limit đăng nhập theo IP; chưa bổ sung giới hạn theo tài khoản | Danh sách vai trò thực tế chỉ cần khi cấu hình nhân viên, không cần để xem UI |
| C1 | Chưa triển khai outbox SMTP/quên mật khẩu | Cần code token một lần/hash/expiry/rate limit, queue và test SMTP cục bộ; thiếu SMTP chỉ chặn gửi thật, không phải lý do nói code đã xong | Chọn dịch vụ email, cấu hình host/user/password/from qua môi trường bảo mật |
| C2 | Chưa triển khai đánh giá đã mua có kiểm duyệt | Cần schema/quyền/API/ảnh/SEO và kiểm thử ownership; không tạo đánh giá giả | Chốt người kiểm duyệt/quy trình nếu khác spec; không cần credential để code |
| C3a | Chưa có biểu phí theo vùng/cân nặng | Phải chốt biểu phí rồi mở rộng quote/server; giữ phí đơn cũ đã snapshot | Cung cấp bảng phí, ngưỡng và quy tắc cân nặng |
| C3b | Chưa tích hợp nhà vận chuyển | Spec yêu cầu chọn provider/credential trước, chưa có hợp đồng API để đối chiếu webhook | Chọn GHN/GHTK/Viettel Post; cấp sandbox/API key trong môi trường bảo mật |
| C4 | Chưa tích hợp báo có/webhook/cổng thanh toán | Chưa chọn provider, chưa có tài liệu/chữ ký/sandbox. Đối soát thủ công hiện có giữ nguyên | Chọn dịch vụ/cổng, cấp sandbox và secret an toàn |
| C5 | Chưa có GA4/Meta/consent banner | Không nạp tracker khi chưa có cấu hình và nội dung bảo mật đã duyệt | Measurement ID/Pixel ID và chính sách cookie/consent đã duyệt |
| C6 | Chưa có gần đây/mua kèm nâng cao/báo tồn/FAQ/timeline mới | Các tính năng này chưa triển khai; báo tồn phụ thuộc C1, tracking phụ thuộc C3b | Nội dung FAQ thật; SMTP/carrier cho tính năng phụ thuộc |
| D1 | Chưa code lô/hạn dùng/FEFO | Spec yêu cầu thiết kế riêng và chủ shop duyệt vì thay đổi giữ/xuất tồn, không ghép vào bản giao diện | Duyệt thiết kế, quy trình kiểm kê và chuyển tồn cũ thành lô |
| D2 | Chưa có tích điểm/combo/sàn/2FA/đa ngôn ngữ mới | Spec yêu cầu đặc tả riêng | Chọn mục tiêu và nghiệp vụ tương ứng |

Không cần bạn cung cấp password/token trực tiếp trong chat. Tính năng bên ngoài chưa có cấu hình không hiện như đã hoạt động. Trước khi nhận đơn thật vẫn cần nội dung thật, HTTPS, nghiệm thu vận hành/backup và chính sách được duyệt.

## Kiểm chứng

Lệnh và kết quả trong `docs/validation/UX_UPGRADE_RESULTS.md`. Ảnh ở `docs/screenshots/upgrade/`, có dữ liệu fixture và 5 kích thước 320/375/768/1440/1920. Đã mở xem ảnh và sửa lỗi bố cục; không chỉ dựa vào test pass. Các test hồi quy cũ vẫn chạy trên schema tạm, cổng ngẫu nhiên. Chưa có Lighthouse mobile, thiết bị iOS vật lý, load production, UAT Windows/LAN; không tuyên bố CWV người dùng thật hoặc tăng chuyển đổi bằng phần trăm.

## Cập nhật máy của bạn

Bản sửa đang ở nhánh Git trong cloud, chưa push/merge hoặc tự cập nhật máy công ty. Khi đã đưa commit lên remote theo quy trình của bạn: backup database/media và thử restore theo `docs/COMMERCE_WINDOWS.md`, giữ `.env.local`, mật khẩu, volume; cập nhật đúng nhánh rồi chạy `npm run local:start` để rebuild. Không reset volume và không dừng dịch vụ 3000. Sau cập nhật kiểm tra trang chủ, một đơn COD fixture, Admin và thông tin liên hệ. Thực hiện trên bản sao/UAT trước khi thay phiên bản vận hành.
