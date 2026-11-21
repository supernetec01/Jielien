# Jielien International — Commerce & CMS PostgreSQL

Bản thử Admin tổng hợp và bộ lọc URL: xem [hướng dẫn kéo nhánh feat/admin-url-filters và chạy bằng Docker](docs/TRY_ADMIN_UPDATE.md).

Bản demo hợp nhất trên nhánh `main`, với giao diện cửa hàng và Admin theo bộ thiết kế Jielien. Chưa triển khai công khai. Có catalog cha/SKU/media, tài khoản nhân viên do admin tạo, CMS duyệt/xuất bản và SEO HTML, CSV, phiếu kho/đổi trả, backup database + media.

- **[File theo dõi tập trung: chức năng chưa triển khai, còn thiếu gì và bạn cần cung cấp thông tin nào](docs/CHUC_NANG_CHUA_TRIEN_KHAI.md)** — cập nhật theo bản `main` hợp nhất ngày 09/11/2026; ưu tiên đọc trước các backlog/QA cũ.
- [Frontend V3: phạm vi F1–F8, API, migration và chạy bản PR](docs/frontend-v3/README.md)
- [Giao diện Admin và cải tiến sử dụng theo phản hồi](docs/ADMIN_USABILITY.md)
- [Chạy nhanh bản demo mới trên Windows](docs/DEMO_QUICKSTART.md)
- [Chạy/nâng cấp Windows Docker Desktop, backup và rollback](docs/COMMERCE_WINDOWS.md)
- [Chức năng thực tế, migration, phân quyền và phần còn lại](docs/COMMERCE_RELEASE.md)
- [Bằng chứng kiểm thử và giới hạn](docs/validation/RESULTS.md)

**Giữ nguyên `.env.local`, mật khẩu PostgreSQL và volume hiện có; backup/restore drill trước khi rebuild bản mới.** Không dùng dữ liệu thật để chạy test.

Giai đoạn 1 theo thiết kế e-commerce người dùng cung cấp: **35 bảng nghiệp vụ + 1 bảng migration**, sản phẩm cha/SKU, kho/giữ tồn, đơn/chi tiết/thanh toán/giao hàng, tài khoản/phân quyền/nhật ký. Website độc lập, không liên kết với AVAKids; hàng hóa, thương hiệu và hình SVG vẫn là dữ liệu minh họa.

- [Thiết kế database: cột, PK, FK và ERD](docs/DATABASE.md)
- [Phân tích và lộ trình](docs/ROADMAP.md)
- [Kết quả kiểm chứng](docs/ACCEPTANCE.md)
- [Giới hạn khảo sát website gốc](docs/REFERENCE_ANALYSIS.md)
- [Cập nhật và chạy trên Windows/Docker Desktop](docs/LOCAL_WINDOWS.md)

## Chạy trên máy cá nhân bằng Docker Desktop

Máy cá nhân và môi trường đám mây là hai bản chạy riêng. Push mã lên GitHub không cập nhật tiến trình `localhost` trên máy bạn. Bản mới dùng **cổng 3001**; giữ nguyên dịch vụ ở cổng **3000**.

Cần Git, Node.js **24.11 trở lên** để chạy lệnh hỗ trợ, và Docker Desktop đang mở ở chế độ **Linux containers**. Node.js 24 và PostgreSQL 17 của ứng dụng chạy bên trong Docker; không cần cài PostgreSQL hoặc `npm ci` trên máy để dùng cách này.

Mở PowerShell trong đúng thư mục repo đã clone, kiểm tra các thay đổi đang có rồi cập nhật:

```powershell
git status --short
git pull --ff-only origin main
npm run local:start
```

Nếu Git báo thay đổi xung đột hoặc không thể fast-forward, giữ nguyên công việc hiện có và xử lý thông báo trước khi tiếp tục; không reset/xóa dữ liệu để cập nhật. Lần đầu Docker cần tải image và build app. Lệnh `local:start` tạo `.env.local` nếu chưa có, dùng mật khẩu database ngẫu nhiên, rồi đợi app/database sẵn sàng. Mở **http://localhost:3001**, tài khoản ở **http://localhost:3001/tai-khoan**. Nếu cổng 3001 đã được dùng, xác định tiến trình đó trước; không dừng dịch vụ chưa rõ nguồn gốc.

```powershell
npm run local:status
npm run local:logs
npm run local:admin
npm run local:stop
```

`local:admin` hỏi thông tin quản trị riêng; không có mật khẩu mặc định. `local:stop` giữ PostgreSQL volume, `.env.local` và thư mục `data`. Giữ ổn định mật khẩu database đã tạo và không xóa volume. `.env` native được giữ nguyên; Docker dùng URL database nội bộ của `.env.local`, không dùng đường dẫn socket cloud.

VietQR local cần đủ bốn biến `BANK_*` trong `.env.local`. Lần khởi tạo đầu chỉ sao chép thông tin nhận tiền hợp lệ, đầy đủ từ biến môi trường hoặc `.env`; nếu thiếu sẽ để trống và chỉ bật COD. Điền đủ rồi chạy lại `npm run local:start`; không đưa file cấu hình lên Git. Xem [hướng dẫn Windows](docs/LOCAL_WINDOWS.md) về chuyển dữ liệu cũ, cổng bị chiếm và cấu hình ngân hàng.

### Chỉnh tài khoản nhận tiền trong Admin

Vào **Quản trị → Quản lý hệ thống → Tài khoản nhận tiền**. Bạn có thể nhập/sửa **tên ngân hàng**, **mã ngân hàng VietQR (6 chữ số)**, **số tài khoản**, **tên chủ tài khoản** rồi bấm **Lưu tài khoản nhận tiền**. Mã VietQR khác mã chi nhánh và số tài khoản; nếu chưa xác nhận được mã, để trống và giữ ô **Bật thanh toán chuyển khoản cho đơn mới** ở trạng thái tắt. Thông tin chưa đủ vẫn lưu được dưới dạng nháp; không tạo QR bằng mã giả. **Hủy chỉnh sửa** tải lại thông tin đã lưu, không ghi thay đổi.

Khi chưa từng lưu trong Admin, hệ thống đọc bốn biến `BANK_NAME`, `BANK_BIN`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` như trước. Sau khi lưu, cấu hình Admin được ưu tiên và có hiệu lực với đơn mới ngay, không cần khởi động lại. Đơn cũ và lần gửi lại cùng mã yêu cầu giữ nguyên thông tin nhận tiền/QR đã lưu. Tắt ô bật chuyển khoản rồi lưu để ngừng nhận đơn chuyển khoản mới; COD vẫn dùng được. Cấu hình dùng bảng `site_settings` hiện có, không cần migration hay xóa dữ liệu.

Chỉ người có quyền xem cấu hình mới xem được màn hình; cần quyền sửa cấu hình để lưu. Kiểm tra phiên đăng nhập, CSRF và phiên bản dữ liệu vẫn được áp dụng. Nhật ký chỉ ghi người thao tác, thời gian và bật/tắt, không ghi số tài khoản hoặc tên chủ tài khoản. Thông tin ngân hàng không được đưa vào `/api/site` hay phần thông tin công ty công khai; khách chỉ nhận thông tin thanh toán trong đơn được phép xem. Không nhập mật khẩu ngân hàng, API key hoặc token SePay vào đây.

Sau khi cập nhật source, rebuild stack Docker hiện có để có màn hình mới; chưa có triển khai tự động. Kiểm tra bằng tay: lưu nháp khi thiếu mã → tải lại thấy dữ liệu còn → điền đủ thông tin đã xác minh và bật → tạo đơn chuyển khoản thử → đổi thông tin và kiểm tra đơn cũ không đổi → tắt rồi kiểm tra đơn mới chỉ còn COD. Dùng dữ liệu thử, không cần chuyển tiền thật. `npm run test:bank` bao gồm kiểm tra API và trình duyệt cho cấu hình ngân hàng. Tích hợp webhook SePay chưa được thực hiện trong phần này.

Xem [báo cáo cấu hình ngân hàng, danh sách file và kết quả kiểm thử](docs/validation/BANK_SETTINGS.md).

### Đối soát thủ công và đơn quá hạn

Admin → Đơn hàng → **Chờ đối soát** hiển thị đơn chuyển khoản cũ nhất trước, tiền cần thu, nội dung và dấu hiệu khách báo đã chuyển. Khi xác nhận, nhập số tiền thực nhận; mã giao dịch khuyến khích nhập. Chênh lệch cần tick xác nhận sau khi kiểm tra: đơn được đánh dấu đã thanh toán và nhân viên xử lý phần thiếu/thừa riêng. Báo cáo tiền đã thu dùng thực nhận; số phải thu và QR gốc của đơn được giữ nguyên.

Tự hủy mặc định tắt: `ORDER_EXPIRY_ENABLED=false`, `BANK_TRANSFER_TTL_HOURS=24`. Chạy `npm run orders:expire -- --dry-run` để xem trước (chỉ đọc, không migration/hủy). Khi bật và khởi động lại, job mỗi 10 phút dùng advisory lock, kiểm tra lại từng đơn trong transaction rồi hủy qua luồng hiện có, lý do **Hết hạn thanh toán**. COD/paid không bị hủy. Đơn cũ chưa có hạn được xét theo ngày tạo + TTL; cần xem dry-run trước khi bật trên dữ liệu thật.

Khách xem hạn/thời gian còn lại, sao chép thông tin và bấm **Tôi đã chuyển khoản** để báo nhân viên, tối đa một lần mỗi 5 phút; nút không xác nhận tiền. Đơn hủy/hết hạn chặn xác nhận và hướng dẫn hoàn tiền/tạo lại đơn.

Telegram chỉ là thông báo nhân viên, không kết nối ngân hàng: mặc định `STAFF_NOTIFY_ENABLED=false`. Muốn bật, cấu hình `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PUBLIC_BASE_URL` HTTPS riêng trong môi trường rồi khởi động lại. Tin chỉ có mã đơn, số tiền và link Admin. Gửi sau phản hồi, có timeout/hàng đợi thử lại; lỗi gửi không làm hỏng đặt hàng. Không đưa token vào code hoặc Admin.

Xem [hướng dẫn kiểm tra, bật/tắt, migration và giới hạn](docs/validation/MANUAL_BANK_WORKFLOW.md). Chưa có deploy tự động; cần cập nhật source và rebuild Docker theo quy trình hiện có.

## Chạy trong môi trường đám mây đã chuẩn bị

Cần **Node.js >=24.11** và PostgreSQL. Không chiếm hoặc dừng cổng **3000**.

```sh
npm ci
# Trong cloud workspace đã chuẩn bị:
npm run db:local
npm start
```

Máy chủ mặc định `0.0.0.0:3001`. Dùng PostgreSQL cục bộ tại `/workspace/.postgres/data`, Unix socket `/workspace/.postgres/socket`, cổng socket 5433, xác thực OS peer và **không mở TCP database**. Binary PostgreSQL 17.11 đã chuẩn bị tại `/workspace/pg17`. Nếu cần dựng lại trên cùng Debian cloud image: `npm run db:install` tải gói từ kho Debian có chữ ký; không dùng sudo, không tắt xác minh TLS/chữ ký/checksum. `npm run db:local` chạy lại an toàn và không reset database.

Với PostgreSQL bên ngoài, đặt `DATABASE_URL` qua cấu hình an toàn hoặc `.env` (đã Git ignore); `.env.example` chỉ chứa cấu hình phát triển không có mật khẩu. Không cần chạy db:local khi dùng server PostgreSQL riêng. Khi phục vụ qua HTTPS, đặt `COOKIE_SECURE=true`; `NODE_ENV=production` cũng bật cookie Secure. Không triển khai tài khoản có mật khẩu trên HTTP công khai.

API cần Node/PostgreSQL và ổ đĩa bền vững; GitHub Pages không chạy backend này. Website chưa có URL công khai chỉ nhờ push GitHub.

## Theo dõi lỗi Sentry và kiểm tra sức khỏe

`GET /api/health` không cần đăng nhập, không cache. Máy chủ chạy `SELECT 1` vào PostgreSQL rồi trả `{status:"ok", time, version}`; khi không truy cập được database trả HTTP **503**, `status:"error"`, không trả chi tiết lỗi. `time` là giờ UTC dạng ISO; `version` là phiên bản ứng dụng trong `package.json`.

Sentry mặc định **tắt**. Điền các biến bên dưới vào cấu hình riêng của máy chạy; không commit DSN/token/mật khẩu. Native dùng `.env`; Docker local dùng `.env.local`; production dùng biến môi trường của stack hiện có.

| Biến | Ý nghĩa |
|---|---|
| `SENTRY_DSN_BACKEND` | DSN của project Sentry cho máy chủ. Để trống để tắt backend. |
| `SENTRY_DSN_FRONTEND` | DSN HTTPS của project Sentry cho trình duyệt. Đây là cấu hình công khai, không phải token quản trị. Để trống để tắt frontend. |
| `SENTRY_ENVIRONMENT` | Tên môi trường, ví dụ `development` hoặc `production`; không chứa dữ liệu cá nhân. |
| `GIT_COMMIT` | SHA commit làm release. Checkout Git tự đọc HEAD nếu không điền; Docker không chứa `.git` nên cần điền SHA từ `git rev-parse HEAD` trước khi chạy/rebuild. Nếu cả hai đều thiếu, không gắn release. |

`npm start`, `npm run dev`, `npm run demo:server` và Docker đã nạp `instrument.mjs` trước server. Nếu chạy Node trực tiếp, dùng `node --import ./instrument.mjs --env-file-if-exists=.env server.mjs`. Backend lấy mẫu trace ở tỷ lệ **5%** và ghi nhận lỗi 5xx/ngoại lệ chưa xử lý. Frontend tải SDK Sentry **11.12.0** từ `browser.sentry-cdn.com` chỉ khi có DSN hợp lệ; CSP chỉ thêm CDN và nơi nhận sự kiện tương ứng khi bật. Không bật session replay, theo dõi phiên, console breadcrumbs hoặc tự động thu dữ liệu người dùng. SDK/CDN không tải được thì website vẫn hoạt động.

Bộ lọc chung cho hai phía chỉ giữ loại lỗi, tên file source cho phép và số dòng/cột; bỏ nội dung lỗi tự do, người dùng, request/body (bao gồm `/api/orders`, `/api/auth/*`), cookie, Authorization, URL/query/token, breadcrumbs và dữ liệu bổ sung. Trace chỉ giữ thời gian và mã kỹ thuật; tên request được thay bằng tên chung, bỏ span chi tiết. Cách này ưu tiên bảo vệ thông tin khách; nội dung chẩn đoán trong Sentry sẽ ít chi tiết hơn. Không upload source map hay gửi email/đơn hàng thật để thử lỗi.

Tự kiểm tra:

1. Để hai DSN trống, khởi động bằng `npm start` hoặc rebuild stack Docker hiện có. Mở trang chủ, tài khoản và giỏ hàng; các trang phải hoạt động bình thường.
2. Mở `/api/health`: thấy `status: "ok"`, thời gian và phiên bản; DevTools → Network cho thấy HTTP 200 và `Cache-Control: no-store`.
3. Muốn bật, điền DSN tương ứng, tên môi trường và commit rồi khởi động lại/rebuild. Kiểm tra trình duyệt chỉ tải SDK khi đã bật; `/api/site` không chứa DSN backend.
4. Trên **môi trường thử nghiệm, không dùng dữ liệu thật**, mở Console và chạy `window.Sentry?.captureException(new Error("Kiem tra theo doi loi"))`. Kiểm tra Sentry có sự kiện với nội dung lỗi đã ẩn, không có thông tin khách/cookie/body. Nếu chặn CDN trong DevTools, trang vẫn mua sắm được.
5. Chạy `npm run test:monitoring`: kiểm tra 200/503, bộ lọc và vận hành khi không có DSN. Test dùng schema riêng; không cần dừng database thật để giả lập lỗi.

Để tắt: xóa giá trị của DSN tương ứng rồi khởi động lại/rebuild, tải lại trang. Health check tiếp tục hoạt động. Không có migration hay thay đổi cấu trúc database cho tính năng này. Hoàn tác code bằng quy trình Git/rebuild hiện có; không xóa database hoặc volume. Chưa cấu hình DSN hay triển khai thay cho chủ dự án.

## Các màn hình

- `/`: trang chủ, danh mục, ưu đãi, tìm kiếm không dấu.
- `/san-pham`: lọc thương hiệu/độ tuổi/giá, sắp xếp, phân trang.
- `/san-pham/:slug`: SKU, lựa chọn quy cách cùng sản phẩm cha, thông số và thêm giỏ.
- `/gio-hang`, `/thanh-toan`: báo giá từ server, ưu đãi, checkout COD hoặc chuyển khoản ngân hàng/VietQR; có địa chỉ đã lưu cho người đăng nhập.
- `/tai-khoan`: đăng ký/đăng nhập, sửa họ tên/email, đổi mật khẩu, thêm/sửa/xóa địa chỉ và lịch sử đơn; giỏ tài khoản lưu PostgreSQL.
- `/tra-cuu-don-hang`: khách mua không đăng nhập tra bằng mã đơn và điện thoại.
- `/quan-tri`: tổng quan, sửa giá/trạng thái SKU, xử lý đơn, điều chỉnh kho có lý do, ghi nhận thu COD hoặc đối soát chuyển khoản, nhật ký thao tác.

Tài khoản mới chỉ có quyền khách hàng. Mọi API quản trị kiểm quyền ở server, không dựa vào việc ẩn nút. Không có tài khoản/mật khẩu admin mặc định.

```sh
npm run admin:create
```

Lệnh hỏi email, điện thoại và mật khẩu riêng trong terminal; mật khẩu không hiển thị khi gõ. Có thể cấp `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` qua môi trường an toàn cho vận hành tự động; không commit các giá trị. Lệnh không tự nâng quyền một tài khoản khách đã có. Mật khẩu bcrypt 12 vòng, tối thiểu 10 ký tự/tối đa 72 byte UTF-8. Cookie session HttpOnly/SameSite, DB chỉ giữ hash token; mutation tài khoản cần CSRF. Đổi hoặc xóa email cần mật khẩu hiện tại; đổi mật khẩu thu hồi toàn bộ phiên, yêu cầu đăng nhập lại. Xóa địa chỉ mặc định tự chọn địa chỉ còn lại mới nhất làm mặc định; không thay địa chỉ đã chụp trong đơn cũ.

## Cấu hình chuyển khoản / VietQR

Cấp đủ bốn biến trong môi trường máy chủ hoặc `.env` đã được Git ignore:

```dotenv
BANK_BIN=
BANK_NAME=
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
```

`BANK_BIN` là mã ngân hàng NAPAS 6 chữ số; `BANK_ACCOUNT_NUMBER` là tài khoản nhận tiền, `BANK_ACCOUNT_NAME` là tên chủ tài khoản. Ví dụ giữ trống trong `.env.example`; không cần mật khẩu ngân hàng hoặc khóa API. Khởi động lại máy chủ sau khi thay cấu hình. Thiếu hoặc sai cấu hình sẽ tắt lựa chọn chuyển khoản, và server từ chối tạo đơn chuyển khoản trước khi giữ tồn/ghi đơn.

Khi tạo đơn, server tính số tiền và lưu cố định ngân hàng, tài khoản, tên người nhận, nội dung chuyển khoản, số tiền và payload QR trong `bank_transfer_details`. Thay cấu hình sau đó không làm đổi hướng dẫn của đơn cũ. Mã QR được tạo cục bộ theo NAPAS/EMVCo, không gọi dịch vụ QR bên ngoài. Khách có thể quét QR, sao chép thông tin và làm mới trạng thái đơn.

**Quét QR hoặc gửi lệnh chuyển khoản không tự chuyển đơn thành đã thanh toán.** Nhân viên có quyền `orders.manage` phải kiểm tra tiền thực nhận trong ngân hàng rồi xác nhận ở quản trị. Xác nhận được khóa transaction, chống ghi nhận lặp và tạo `payment_events`/`audit_logs`. Chưa có webhook hoặc kết nối sao kê xác minh tự động. Hệ thống chặn xuất giao đơn chuyển khoản chưa xác nhận; đơn đã nhận chuyển khoản không hủy qua luồng thông thường vì cần quy trình hoàn tiền riêng.

## Dữ liệu và migration

- Nguồn dữ liệu chạy là PostgreSQL. Không tự seed danh mục demo khi database trống. Bộ dữ liệu cũ đã chuyển vào `db/fixtures/catalog.json` để kiểm thử; chỉ được nạp khi opt-in rõ ràng bằng `JIELIEN_DEMO_DATA=true` trong môi trường thử nghiệm riêng, không bật trên máy công ty.
- ID cũ được giữ ở `product_variants.id`. `products.id` là sản phẩm cha. Mã đơn JL cũ nằm trong `orders.order_number`; FK dùng `orders.id` nội bộ.
- `order_items` giữ tên/SKU/ảnh/giá lúc mua. Sửa giá SKU không làm thay đổi đơn cũ.
- `available = on_hand - reserved` ở kho normal đang active. Tạo đơn giữ tồn; hủy trước xuất giao nhả giữ; xuất giao giảm thực có và giữ.
- Giao xong không tự ghi đã thu tiền. Nhân viên có quyền ghi nhận COD riêng, tạo payment_event và audit.
- MEBE50 giảm 50K từ 500K, FREESHIP miễn ship từ 299K. Phí chuẩn 25K, tự miễn từ 499K. Điều kiện/mã/lượt dùng lưu database và cập nhật transaction; mỗi đơn một mã.

```sh
npm run db:migrate  # migration có phiên bản/checksum, chạy lại an toàn
npm run db:import   # seed + nhập SQLite cũ đúng một lần
npm run db:status   # chỉ xem metadata bảng
```

Lần khởi động live đầu tự nhập `data/store.sqlite` nếu tồn tại. Import tạo backup SQLite nhất quán có WAL tại `data/backups/`, kiểm integrity, sau đó ghi một transaction PG và đánh dấu `legacy_imports`. File SQLite cũ không bị xóa. Khi chuyển live cần ngừng đúng tiến trình 3001 trước bản nhập cuối để không có đơn mới ở SQLite sau snapshot. Không nhập dữ liệu vận hành vào test.

Với đơn cũ chưa giao, tồn thực có mới bằng tồn khả dụng SQLite cộng phần đang giữ; tồn khả dụng giữ nguyên. Giữ mã đơn, token tra cứu, fingerprint/idempotency và snapshot giá. Có kiểm thử nhập lại không nhân đôi đơn hoặc trừ tồn hai lần. Không dùng xóa/reseed để thay migration.

Backup PostgreSQL bằng `pg_dump`, khôi phục vào database khác để kiểm tra trước khi thay bản vận hành. Không copy thư mục data PG đang chạy như một bản backup logic. Tên/tokens/địa chỉ khách không được đưa vào log, Git hoặc báo cáo test.

## Tài khoản khách hàng

Đăng ký không OTP: nhập họ tên, số điện thoại, mật khẩu và email tùy chọn để tạo tài khoản và đăng nhập ngay. Không cần SMS/email để đăng ký; các biến `AUTH_VERIFICATION_*` cũ không còn được dùng.

Quên mật khẩu dùng link một lần gửi tới email đã lưu; tài khoản chỉ có số điện thoại cần admin xác minh và hỗ trợ. Admin xem hồ sơ, địa chỉ và đơn hàng tại Tài khoản & Phân quyền → Xem khách hàng. Guest vẫn mua hàng với đủ thông tin nhận hàng. Xem [cấu hình email, nâng cấp và thao tác hỗ trợ](docs/REGISTRATION.md) và [kết quả kiểm thử mới](docs/qa/CUSTOMER-ACCOUNT-RESULTS.md).

## Kiểm thử

```sh
npm test                 # API, migration, tài khoản, RBAC, kho và thanh toán
npm run test:browser      # 14 nhóm luồng storefront
npm run test:management   # tài khoản và quản trị thực qua trình duyệt
npm run test:account      # sửa hồ sơ, địa chỉ, mật khẩu và phục hồi giỏ lỗi
npm run test:bank         # chuyển khoản/VietQR và đối soát qua giao diện
npm run test:customer-flows # đăng ký, reset, hồ sơ khách admin và guest checkout
```

Browser tests cần Chromium (mặc định `/usr/bin/chromium`, đổi qua `CHROMIUM_PATH`). Tất cả test tạo schema PostgreSQL tạm, server cổng ngẫu nhiên, rồi dọn dẹp; không dùng đơn live, không tác động cổng 3000/3001. Kiểm cả mất response sau COMMIT và retry, cạnh tranh tồn/lượt mã, snapshot, phiên/cookie/CSRF, quyền sở hữu đơn/địa chỉ, UI mobile và lỗi tài nguyên.

## Phạm vi còn lại

Đây là bản phát triển có luồng xử lý nội bộ. Chuyển khoản/VietQR dùng đối soát thủ công; chưa kết nối cổng thanh toán hoặc xác minh ngân hàng tự động, giao hàng hay SMS. Adapter email khôi phục đã có nhưng cần cấu hình Resend, xác thực tên miền và thử gửi thật trước khi vận hành. Các phạm vi thương mại còn lại xem tài liệu release/nâng cấp bên dưới. Không có bên bán thực tế tự giao đơn thử nghiệm.

## Cấu trúc

```text
server.mjs                HTTP, validation, cookie/CSRF, authorization, static pages
lib/database.mjs          PostgreSQL pool, connection configuration
lib/auth.mjs              accounts, password/session hash, ownership, addresses
lib/cart.mjs              account carts
lib/vietqr.mjs            local NAPAS/EMVCo payload, CRC and bank configuration
/db/migrations            versioned PostgreSQL SQL
/db/store.mjs             pricing, order/stock/payment transactions and audit
/db/seed.mjs              initial sample catalogue (no overwrites)
/db/import-legacy.mjs      SQLite backup + one-time normalized import
/public                   storefront, account and management UI, sample assets
/scripts                  local PG bootstrap, migrations, explicit admin creation
/tests                    isolated PostgreSQL and browser verification
/docs                     database, roadmap, acceptance evidence
```

Triển khai LAN, phân quyền và backup: xem [LAN_DEPLOYMENT.md](docs/LAN_DEPLOYMENT.md).

## Nâng cấp trải nghiệm mua sắm và Admin

Chi tiết phần đã làm và backlog: [UPGRADE_DELIVERY.md](docs/UPGRADE_DELIVERY.md), đối chiếu [đặc tả](docs/UPGRADE_SPEC.md). Admin → Cấu hình công ty có form hotline/Zalo/Messenger, địa chỉ, giờ làm việc và chính sách; để trống kênh chưa dùng. Ví dụ trong placeholder không được lưu tự động. `DEMO_MODE=true` bật nhãn kiểm thử ở website; mặc định tắt nhãn, không thay đổi catalog mẫu thành hàng thật. Không bật nhận đơn thật chỉ vì nhãn đã tắt.

`npm run test:upgrade` kiểm tra trải nghiệm mới bằng Chromium và schema PostgreSQL tạm; `npm run test:contrast` kiểm tra tương phản các cặp màu thiết kế chính. Không cần migration mới cho bản này.

## Website riêng: tích hợp nhánh và production

Xem [RELEASE_READINESS.md](docs/RELEASE_READINESS.md) để biết bản gộp V3 + UX + sửa checkout LAN, kết quả kiểm thử mới, thông tin cần chuẩn bị và điều kiện mở bán. Có stack HTTPS riêng `compose.production.yaml`, `npm run production:check` (nạp môi trường bảo mật trước) và `npm run db:backup:production`. Không dùng compose local với cookie không Secure làm cấu hình public. Merge/push Git không đồng nghĩa đã triển khai.

### Demo công khai bằng ngrok

Dùng `npm run demo:ngrok` để mở website đang chạy tại cổng 3001 (hoặc cổng cấu hình). Cần tài khoản/token ngrok riêng; xem [NGROK_DEMO.md](docs/NGROK_DEMO.md) để cấu hình Windows/cloud, HTTPS và cách dừng link.
