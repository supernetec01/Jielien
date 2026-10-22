# Tiêu chí và bằng chứng nghiệm thu

Cập nhật ngày **22/10/2026** (Asia/Bangkok). Phạm vi: storefront Jielien mẹ và bé, lấy AVAKids làm website tham khảo. Cổng chạy: **3001**; không thay đổi dịch vụ người dùng trên cổng **3000**.

## Bổ sung tài khoản và chuyển khoản/VietQR

Mã triển khai hiện có migration 002: **35 bảng nghiệp vụ + schema_migrations (36 bảng)**. COD tiếp tục hoạt động; chuyển khoản chỉ bật khi đủ cấu hình ngân hàng phía server. QR NAPAS/EMVCo tạo cục bộ với số tiền/nội dung do server xác định, thông tin nhận tiền lưu snapshot theo từng payment.

Khách xem QR và làm mới trạng thái; chỉ nhân viên có `orders.manage` xác nhận đã nhận tiền sau đối soát ngân hàng. Không có webhook/sao kê hoặc xác minh tiền tự động. Không xuất giao chuyển khoản chưa paid; chuyển khoản đã paid phải đi qua quy trình hoàn tiền trong tương lai thay vì hủy thông thường.

Tài khoản bổ sung sửa họ tên/email, xác nhận mật khẩu khi đổi/xóa email, đổi mật khẩu thu hồi phiên, sửa/xóa địa chỉ theo chủ sở hữu. Hồ sơ/địa chỉ trong đơn cũ giữ snapshot riêng.

Kết quả sau khi tích hợp (22/10/2026):

| Lệnh | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm test` | **29/29 đạt** | API, migration, auth/RBAC, kho, tài khoản và chuyển khoản |
| `npm run test:browser` | **14/14 nhóm đạt** | Storefront và COD, phục hồi đơn khi mất phản hồi |
| `npm run test:management` | **9/9 nhóm đạt** | Địa chỉ, giỏ, đơn, quản trị SKU/kho và thu COD |
| `npm run test:account` | **9/9 nhóm đạt** | Sửa hồ sơ/email, địa chỉ, đổi mật khẩu/thu hồi nhiều phiên; GET cart503 vẫn giữ đăng nhập, CSRF và quyền sở hữu đơn |
| `npm run test:bank` | **7/7 nhóm đạt** | QR cục bộ, tổng tiền từ server, phân quyền, xác nhận một lần/audit, lịch sử, cấu hình thiếu, 503 cho đổi COD và mobile390px |

Đã sửa lỗi input ẩn `name=id` che thuộc tính `form.id` khiến form địa chỉ không gửi; kiểm thử địa chỉ đã chạy lại thành công. Các kiểm thử dùng dữ liệu giả, schema PostgreSQL tạm và cổng ngẫu nhiên; không chuyển tiền thật.

Sau sao lưu schema public bằng pg_dump, bản cổng3001 đã khởi động với migration002 và cấu hình ngân hàng do người dùng cung cấp trong `.env` đã ignore. Kiểm tra chỉ đọc: health200, danh sách phương thức có COD/chuyển khoản bật, `/tai-khoan` và `/quan-tri`200; cổng3000 vẫn lắng nghe. Mã BIN Techcombank970407 được đối chiếu từ danh mục công khai VietQR; không xác minh quyền sở hữu tài khoản hay giao dịch ngân hàng thật.

Các con số ở phần lịch sử dưới đây mô tả lần chạy trước phần bổ sung này.

## Kết quả thực thi trước khi bổ sung chuyển khoản

| Lệnh/kiểm tra          | Kết quả                              | Phạm vi bằng chứng                                                     |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `npm test`             | **10/10 test API đạt**               | `tests/api.test.mjs`, Node test runner                                 |
| `npm run test:browser` | **14/14 nhóm kiểm tra đạt**          | `tests/browser.test.mjs`, Chromium/Playwright, không phải 14 test Node |
| `ss -ltn`              | Cổng **3000 và 3001** cùng lắng nghe | Không dừng hoặc chiếm cổng 3000                                        |

API và browser test tạo app trên **cổng ngẫu nhiên** cùng thư mục SQLite tạm, rồi đóng app và xóa dữ liệu tạm. Chúng không dùng dữ liệu trình diễn hoặc bind cổng 3000/3001. Kết quả lịch sử trên không xác minh khả năng vận hành thương mại hoặc độ giống AVAKids.

Trong các bảng: **Đạt** có bằng chứng thực thi; **Đạt một phần** ghi chính xác phần đã kiểm tra; **Chưa chạy** không được coi là đạt. Ký hiệu **A1–A10** theo thứ tự test trong file API; **B1–B14** theo thứ tự thông báo `PASS` của file browser.

## Khảo sát website gốc

| Kiểm tra                               | Trạng thái         | Bằng chứng/giới hạn                                      |
| -------------------------------------- | ------------------ | -------------------------------------------------------- |
| Truy cập tên miền, lượt đầu            | Bị chặn            | Proxy trả `CONNECT 403`/`envoy`                          |
| HEAD sau cập nhật mạng                 | Đạt ở mức metadata | HTTP 200, headers ứng dụng và CDN; chưa có DOM           |
| GET nội dung HTML                      | Không đạt          | HTTP 200/curl18 body0, HTTP503 hoặc timeout tùy lượt thử |
| Tải bằng Chromium                      | Bị chặn bởi TLS    | `ERR_CERT_AUTHORITY_INVALID`; không bỏ qua xác minh      |
| So sánh ảnh desktop/mobile với AVAKids | Chưa chạy          | Chưa có ảnh gốc đáng tin cậy                             |
| Đối chiếu luồng mua hàng gốc           | Chưa chạy          | Chưa thao tác được trên website gốc                      |

Bản triển khai chưa được chứng nhận là bản sao chính xác AVAKids. Chính sách mạng đã thay đổi nhưng cần nhận được HTML/tài nguyên hợp lệ trước khi kết luận khảo sát giao diện thành công.

## Frontend và điều hướng

| Mã    | Kịch bản                               | Trạng thái và bằng chứng                                                                                                                          |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01 | Trang chủ, banner và menu              | **Đạt** — B1 thấy hero, đổi banner, mở menu và Escape đóng menu                                                                                   |
| UI-02 | Tìm kiếm tiếng Việt                    | **Đạt một phần** — B2 tìm `sua dinh duong` không dấu, gợi ý và kết quả khớp catalogue; chưa kiểm riêng chuỗi có dấu và kết quả rỗng               |
| UI-03 | Bộ lọc danh mục/thương hiệu/giá/tuổi   | **Đạt một phần** — B3 kết hợp danh mục + thương hiệu, giữ brand trên URL; khoảng giá được thử riêng; chưa thử tuổi hoặc cả bốn điều kiện cùng lúc |
| UI-04 | Sắp xếp giá                            | **Đạt một phần** — B3 xác minh tăng dần; chưa thử giảm dần                                                                                        |
| UI-05 | Chi tiết theo URL trực tiếp và tải lại | **Đạt** — B5 đúng tên sản phẩm, tab thông số và lưu ý có nội dung                                                                                 |
| UI-06 | SKU/URL không tồn tại                  | **Đạt một phần** — A5 từ chối SKU lạ; A10 route lạ trả 403/404; chưa thử UI slug sản phẩm không tồn tại                                           |
| UI-07 | Phân trang và trình duyệt Back         | **Đạt** — B4 trang 2 có đúng sản phẩm, mở chi tiết rồi Back về `page=2`; chưa kiểm riêng phục hồi mọi bộ lọc                                      |
| UI-08 | Thêm sản phẩm từ chi tiết              | **Đạt** — B5 thêm một đơn vị; số lượng trống bị chặn và không thay giỏ; chưa thử riêng nút thêm trên thẻ                                          |
| UI-09 | Tăng/giảm/xóa giỏ                      | **Đạt một phần** — B5 tăng 1 lên 2, tổng từ máy chủ khớp; chưa thử riêng giảm và xóa từng dòng                                                    |
| UI-10 | Khôi phục giỏ sau tải lại              | **Chưa chạy riêng** — B5 kiểm giỏ qua chuyển route; reload có giỏ khác rỗng chưa được assert trực tiếp                                            |
| UI-11 | Giỏ rỗng và chặn đặt đơn rỗng          | **Đạt một phần** — A5 từ chối items rỗng; B9 giỏ rỗng sau đặt thành công; chưa assert nút checkout của UI giỏ rỗng                                |
| UI-12 | Yêu thích                              | **Đạt** — B11 thêm, reload vẫn còn, bỏ yêu thích; B13 đủ 8 sản phẩm trên mobile/tablet                                                            |

## Ưu đãi và tổng tiền

| Mã       | Kịch bản                | Trạng thái và bằng chứng                                                        |
| -------- | ----------------------- | ------------------------------------------------------------------------------- |
| PRICE-01 | Quote giỏ hợp lệ        | **Đạt** — A1 và B5 xác minh giá sản phẩm, tổng và phí do server tính            |
| PRICE-02 | Client gửi giá/tổng giả | **Đạt** — A1 quote và A3 order bỏ qua giá/tổng/giảm giả, lưu tổng có thẩm quyền |
| PRICE-03 | `MEBE50` đủ 500.000đ    | **Đạt** — A2 giỏ 500.000đ giảm 50.000đ; B6 giỏ 850.000đ còn 800.000đ            |
| PRICE-04 | Mã chưa đủ điều kiện    | **Đạt** — A2 giỏ 99.000đ với `MEBE50`/`FREESHIP` trả 400                        |
| PRICE-05 | `FREESHIP` đủ điều kiện | **Đạt** — A2 giỏ 349.000đ có phí 0; chưa kiểm riêng ranh giới đúng 299.000đ     |
| PRICE-06 | Mã không tồn tại        | **Đạt** — A2 trả 400; B6 hiển thị lỗi và giữ tổng trước đó                      |
| PRICE-07 | Không mã, dưới 499.000đ | **Đạt** — A1 giỏ 250.000đ có phí 25.000đ; B5 cũng xác minh UI                   |
| PRICE-08 | Không mã, từ 499.000đ   | **Đạt** — B5 giỏ 850.000đ phí 0; chưa kiểm riêng ranh giới đúng 499.000đ        |

## Đơn hàng và API

| Mã     | Kịch bản                           | Trạng thái và bằng chứng                                                                                                      |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| API-01 | Xác thực thông tin người nhận      | **Đạt một phần** — A5 tên/địa chỉ rỗng và email sai trả 400; B7 điện thoại sai chặn form; chưa thử riêng thiếu tỉnh/quận      |
| API-02 | Điện thoại không hợp lệ            | **Đạt** — A5 backend từ chối; B7 native validity chặn UI và giữ giỏ                                                           |
| API-03 | SKU và số lượng không hợp lệ       | **Đạt một phần** — A5 thử SKU lạ, 0, lẻ, quá giới hạn, SKU trùng; A4 thử hết hàng; chưa gửi riêng số âm                       |
| API-04 | Tạo đơn COD hợp lệ                 | **Đạt** — A3 trả 201, token dài >30, trạng thái pending; B9 xác nhận mã đơn và xóa giỏ                                        |
| API-05 | Retry cùng khóa và nội dung        | **Đạt** — A3/A6 trả cùng đơn; B8 mất phản hồi sau commit rồi retry vẫn cùng mã, chỉ trừ tồn một lần                           |
| API-06 | Dùng khóa cũ với nội dung khác     | **Đạt** — A3 trả 409, tồn giữ nguyên                                                                                          |
| API-07 | Cạnh tranh tồn kho                 | **Đạt** — A4 hai request mua 2 khi còn 3: một 201, một 409, tồn cuối bằng 1; hàng hết không quote/order được                  |
| API-08 | Khởi động lại với cùng dataDir     | **Đạt** — A6 đơn và tồn vẫn còn; retry sau restart trả cùng đơn, không trừ thêm                                               |
| API-09 | Quyền đọc đơn                      | **Đạt** — A7 token thiếu/sai và danh sách đơn công khai trả 404; B9 reload xác nhận bằng token phiên thành công               |
| API-10 | Tra cứu mã đơn + điện thoại        | **Đạt** — A7 số đúng kể cả dạng +84 trả đơn không lộ token; B10 số sai không lộ đơn, số đúng hiển thị                         |
| API-11 | Giới hạn dò đơn                    | **Đạt** — A8 sau 10 tra cứu sai, request tiếp trả 429                                                                         |
| API-12 | Body quá lớn/JSON sai/content type | **Đạt** — A9 lần lượt 413/400/415; app tiếp tục xử lý các request kiểm tra                                                    |
| API-13 | Bảo vệ file riêng và traversal     | **Đạt** — A10 source, package, DB, Git và đường dẫn vượt public trả 403/404; route frontend hợp lệ trả HTML200                |
| API-14 | Gián đoạn trước khi tạo đơn        | **Đạt** — B7 giả lập API503: báo lỗi, giữ giỏ và dữ liệu form, có nút retry                                                   |
| API-15 | Mất phản hồi sau khi lưu đơn       | **Đạt** — B8 backend đã commit rồi abort response; retry dùng cùng nội dung/khóa, phục hồi đúng đơn và tồn                    |
| API-16 | Điều hướng trong lúc gửi đơn       | **Đạt** — B8 click logo khi request đang chờ không rời checkout; B7/B8 form và coupon bị khóa để giữ nội dung retry           |
| API-17 | Escape dữ liệu và lưu riêng tư     | **Đạt** — B9 payload HTML/script ở tên/ghi chú hiển thị như chữ, không chạy; localStorage không chứa điện thoại/email/địa chỉ |

## Responsive, bàn phím và trạng thái lỗi

| Mã      | Kịch bản                  | Trạng thái và bằng chứng                                                                                                                           |
| ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A11Y-01 | Viewport 390px            | **Đạt trong route đã thử** — B12: home, listing, detail, cart, lookup, chính sách không tràn ngang; chưa tự động kiểm độ dễ đọc/kích thước mọi nút |
| A11Y-02 | Viewport 768px            | **Đạt** — B12 cùng 6 route không tràn ngang; listing đủ 12 thẻ visible, B13 yêu thích đủ 8 thẻ                                                     |
| A11Y-03 | Desktop 1440px            | **Đạt cho luồng thao tác** — B1–B11 chạy ở 1440×1000; không thay thế việc so ảnh AVAKids                                                           |
| A11Y-04 | Điều khiển bàn phím/focus | **Đạt một phần** — B1 Escape đóng menu; chưa có audit focus-trap hoặc toàn bộ điều hướng bàn phím                                                  |
| A11Y-05 | Lỗi form                  | **Đạt một phần** — B5 quantity trống, B7 phone sai có native validity; chưa audit toàn bộ label/trình đọc màn hình                                 |
| A11Y-06 | API lỗi khi đặt hàng      | **Đạt** — B7/B8 phân biệt chưa xác nhận với thành công, giữ giỏ, retry an toàn                                                                     |
| A11Y-07 | Ảnh local/lỗi JavaScript  | **Đạt** — B14 không exception JS hoặc asset local HTTP4xx/5xx trong các route đã chạy; chưa giả lập font mạng lỗi                                  |

## Phần chưa xác minh và giới hạn vận hành

Các ô **Đạt một phần** giữ nguyên phần chưa chạy; không suy ra đã kiểm thử từ việc có mã triển khai. Kiểm tra không bao phủ toàn bộ tổ hợp đầu vào, mọi độ rộng màn hình, mọi trình duyệt hay audit WCAG hoàn chỉnh.

Trong bản storefront cũ ghi nhận ở phần lịch sử này, thanh toán trực tuyến, quản trị đơn có xác thực, gửi email/SMS, giao hàng, tích điểm và tồn kho chi nhánh ngoài phạm vi; phần PostgreSQL và bổ sung ở trên mô tả chức năng đã được phát triển tiếp. Tạo đơn COD cục bộ không chứng minh có bên bán nhận giao hàng. Dữ liệu, giá, thương hiệu và hình minh họa là mẫu; chưa có bằng chứng AVAKids dùng cùng API hoặc cùng quy tắc nghiệp vụ.

## Ảnh bản triển khai

Các ảnh sau được chụp từ **Jielien cổng 3001**, không phải AVAKids:

- [Trang chủ desktop](screenshots/home-desktop.png)
- [Danh sách sản phẩm](screenshots/catalog-desktop.png)
- [Chi tiết sản phẩm](screenshots/product-desktop.png)
- [Trang chủ điện thoại](screenshots/home-mobile.png)
- [Đặt hàng trên điện thoại](screenshots/checkout-mobile.png)

Không có đơn được gửi khi tạo các ảnh trên. Kiểm tra cuối: API cổng 3001 trả HTTP 200; dịch vụ cổng 3000 vẫn trả HTTP 200. Đã lưu `install_script`/`start_skill` cho lần khởi động sau; việc lưu cấu hình chưa tạo triển khai web công khai.

## Giai đoạn 1 — PostgreSQL, tài khoản và quản trị

Phần này thay thế mô tả SQLite ở kết quả cũ bên trên; các kết quả cũ được giữ làm lịch sử. Nguồn thiết kế là đề xuất người dùng đã dán vào chat, không phải schema nội bộ AVAKids.

- PostgreSQL 17.11 ở lần kiểm chứng migration 001: 34 bảng nghiệp vụ + schema_migrations; 41 FK, 53 CHECK, 19 UNIQUE trong migration đầu. Migration 002 bổ sung bảng chuyển khoản, nâng tổng hiện tại thành 35 bảng nghiệp vụ + schema_migrations.
- `npm test`: 19/19 test đạt, gồm 10 test API cũ đã chuyển PG, 3 migration và 6 nhóm auth/ownership/admin/kho/coupon/cart.
- `npm run test:browser`: 14/14 nhóm storefront đạt trên PostgreSQL.
- `npm run test:management`: 9/9 nhóm tài khoản/quản trị đạt: đăng ký HttpOnly; địa chỉ tiếng Việt; giỏ server/reload; checkout địa chỉ lưu; quyền sở hữu lịch sử; chặn customer vào quản trị; sửa giá nhưng giữ giá đơn cũ; chuỗi trạng thái/thu COD riêng; điều chỉnh kho/audit/logout/mobile.
- Test dùng schema ngẫu nhiên, PostgreSQL data tạm và port ngẫu nhiên; không ghi vào dữ liệu live. Mật khẩu/tài khoản test không được tạo trên DB vận hành.
- Import legacy test có đơn thật trong fixture: backup nhất quán, bảo toàn token/mã/fingerprint/giá/tồn khả dụng; chạy lại không nhân đôi; FK ngăn xóa SKU đã bán.
- Khách đăng ký không tự được nâng quyền; mutation thiếu CSRF trả403; session hết hạn/thu hồi không dùng lại được; địa chỉ/đơn không được lộ cho tài khoản khác.
- Coupon có usage_limit được thử bằng hai checkout đồng thời; đúng một đơn thành công và một redemption.

Chưa kiểm/triển khai: tải lớn/benchmark production, khôi phục PG qua sự cố máy thật, provider OTP/payment/shipping bên ngoài, full WCAG, quy trình hoàn trả và CRUD toàn bộ nội dung. Đây không phải chứng nhận production hay xác nhận giống giao diện AVAKids.

### Chuyển môi trường hiện tại sang PostgreSQL

Đã dừng đúng tiến trình Jielien cổng 3001 sau khi các bộ kiểm thử đạt; giữ nguyên tiến trình cổng 3000. Import live đã tạo backup SQLite và đối chiếu đủ 24 dòng tồn kho. Tồn khả dụng PostgreSQL khớp 24/24; SQLite cũ có 0 đơn và PostgreSQL sau nhập có 0 đơn. Kiểm chứng bảo toàn đơn có dữ liệu được thực hiện trong migration test riêng, không tự nhận đã chuyển đơn khách thực tế.

Sau khởi động mới, `/api/health` trả `{status:"ok",database:"postgresql"}`; `/tai-khoan` và `/quan-tri` trả HTTP200; dịch vụ cổng3000 vẫn HTTP200. Import chạy lại không reset kho. Chưa tạo admin trên database live (0 tài khoản admin); người vận hành tự khởi tạo bằng CLI, không có mật khẩu dùng chung.

Ảnh tài khoản/quản trị được chụp từ schema thử nghiệm riêng, không tạo tài khoản admin ở dữ liệu live: [tài khoản](screenshots/account-desktop.png), [quản trị](screenshots/admin-desktop.png), [SKU](screenshots/admin-products.png), [quản trị mobile](screenshots/admin-mobile.png). CLI tạo admin đã được chạy kiểm chứng bằng biến môi trường test trong schema tạm, sau đó schema được xóa.


## Chạy local Windows qua Docker Desktop

Đã thêm Dockerfile Node24.18.0, Compose PostgreSQL17 + app, helper `npm run local:*` và `docs/LOCAL_WINDOWS.md`. App chỉ publish loopback3001, database không mở cổng host. `.env.local` sinh mật khẩu ngẫu nhiên một lần, giữ nguyên `.env` native và dữ liệu.

- `npm run test:local`: **5/5 đạt** — mật khẩu khác nhau giữa lần cài mới, ổn định khi chạy lại, không ghi đè cấu hình/dữ liệu, chỉ sao chép thông tin nhận tiền hợp lệ, từ chối cấu hình database sai mà không thay file.
- `npm run test:local:stack`: **3/3 nhóm đạt** trên Docker Engine28.4.0/Compose2.40.3 Linux trong môi trường này — config DB nội bộ/cookieHTTP; đăng ký/CSRF checkout/VietQR; session/đơn/giá/giữ tồn vẫn đúng sau down/up toàn bộ stack với cùng volume. Dùng project riêng, cổng ngẫu nhiên, thông tin giả và volume tạm đã dọn; không chạm dịch vụ3000/3001.
- ProxyTLS của cloud cần CA bổ sung qua BuildKit secret chỉ trong kiểm thử. Không tắt xác minhTLS và không chép CA/cấu hình ngân hàng thật vào image. Docker Desktop thông thường không cần override CA này.

Chưa thực thi trên máy Windows của người dùng; kết quả DockerLinux không được coi là bằng chứng máy Windows đã cập nhật/khởi động.
