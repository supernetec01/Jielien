# Jielien — cửa hàng mẹ và bé, PostgreSQL

Giai đoạn 1 theo thiết kế e-commerce người dùng cung cấp: **35 bảng nghiệp vụ + 1 bảng migration**, sản phẩm cha/SKU, kho/giữ tồn, đơn/chi tiết/thanh toán/giao hàng, tài khoản/phân quyền/nhật ký. Website độc lập, không liên kết với AVAKids; hàng hóa, thương hiệu và hình SVG vẫn là dữ liệu minh họa.

- [Thiết kế database: cột, PK, FK và ERD](docs/DATABASE.md)
- [Phân tích và lộ trình](docs/ROADMAP.md)
- [Kết quả kiểm chứng](docs/ACCEPTANCE.md)
- [Giới hạn khảo sát website gốc](docs/REFERENCE_ANALYSIS.md)
- [Cập nhật và chạy trên Windows/Docker Desktop](docs/LOCAL_WINDOWS.md)

## Chạy trên máy cá nhân bằng Docker Desktop

Máy cá nhân và môi trường đám mây là hai bản chạy riêng. Push mã lên GitHub không cập nhật tiến trình `localhost` trên máy bạn. Bản mới dùng **cổng 3001**; giữ nguyên dịch vụ ở cổng **3000**.

Cần Git, Node.js **18 trở lên** để chạy lệnh hỗ trợ, và Docker Desktop đang mở ở chế độ **Linux containers**. Node.js 24 và PostgreSQL 17 của ứng dụng chạy bên trong Docker; không cần cài PostgreSQL hoặc `npm ci` trên máy để dùng cách này.

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

- Nguồn dữ liệu chạy là PostgreSQL. `public/catalog.json` chỉ dùng seed ban đầu; seed chạy lại không ghi đè giá/tồn đang vận hành.
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

## Kiểm thử

```sh
npm test                 # API, migration, tài khoản, RBAC, kho và thanh toán
npm run test:browser      # 14 nhóm luồng storefront
npm run test:management   # tài khoản và quản trị thực qua trình duyệt
npm run test:account      # sửa hồ sơ, địa chỉ, mật khẩu và phục hồi giỏ lỗi
npm run test:bank         # chuyển khoản/VietQR và đối soát qua giao diện
```

Browser tests cần Chromium (mặc định `/usr/bin/chromium`, đổi qua `CHROMIUM_PATH`). Tất cả test tạo schema PostgreSQL tạm, server cổng ngẫu nhiên, rồi dọn dẹp; không dùng đơn live, không tác động cổng 3000/3001. Kiểm cả mất response sau COMMIT và retry, cạnh tranh tồn/lượt mã, snapshot, phiên/cookie/CSRF, quyền sở hữu đơn/địa chỉ, UI mobile và lỗi tài nguyên.

## Phạm vi còn lại

Đây là bản phát triển có luồng xử lý nội bộ. Chuyển khoản/VietQR dùng đối soát thủ công; chưa kết nối cổng thanh toán hoặc xác minh ngân hàng tự động, giao hàng, OTP/email/SMS, chưa có hoàn trả/lô hạn dùng/đồng bộ sàn/tích điểm/livestream. Quản trị hiện sửa SKU, xử lý đơn và điều chỉnh kho; CRUD đầy đủ danh mục/sản phẩm cha/media/quyền nhân viên thuộc các bước tiếp theo. Không có bên bán thực tế tự giao đơn thử nghiệm.

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
