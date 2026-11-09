# Jielien riêng: bàn giao tích hợp và điều kiện mở bán

Trạng thái cập nhật tập trung: [CHUC_NANG_CHUA_TRIEN_KHAI.md](CHUC_NANG_CHUA_TRIEN_KHAI.md). Bản `main` hợp nhất ngày 09/11/2026 đã có đăng ký không OTP, khôi phục mật khẩu và hồ sơ khách trong Admin; các số test bên dưới là bằng chứng của đợt tích hợp trước, không phải lượt chạy mới.

## Phạm vi đã chốt

Chủ shop chọn **website Jielien riêng trước**, chưa cần Shopee/TikTok Shop. Có thể khởi đầu với COD và chuyển khoản đối soát thủ công. Tích hợp sàn, carrier webhook, ví điện tử, email tự động không được giả đã hoạt động.

## Các nhánh được tích hợp

- `feature/ux-upgrade-phase1`: UX, mini-cart, thanh mua/đặt hàng mobile, form liên hệ/chính sách, báo cáo và Admin.
- `feat/frontend-v3` tại `fc00f08`: giao diện V3 chung SSR/client, catalog có phân trang/giới hạn từ database, không public catalog fixture, Banner & Poster Studio, mobile art direction, role banner_manager. Migration 013/014 giữ nguyên nguồn.
- `fix/checkout-lan-browser-compatibility` tại `283f383`: chứa toàn bộ V3 và bổ sung secure getRandomValues fallback khi HTTP LAN không có randomUUID, tương thích thanh toán và responsive.

Nhánh fix đã chứa V3 nên merge nhánh fix sẽ giữ toàn bộ lịch sử của cả hai; không cherry-pick trùng và không xóa nhánh nguồn. Bản tích hợp giữ renderer V3, đồng thời mang lại mini-cart, chọn quy cách radio, quote, form chính sách/liên hệ, biểu đồ và mobile cards. Form công ty hỗ trợ cả tagline/trust/legal của V3. Không phục hồi danh mục hoặc banner giả vào production.

## Điều đã kiểm chứng

- 66 test API/unit pass, không skip/fail, gồm migration, quyền, tồn kho, thanh toán, chống gửi trùng, không randomUUID và kiểm tra cấu hình production/backup.
- Browser: storefront 14, V3 12 (gồm axe A/AA), management 11, usability 9, commerce 13, admin-access 6, account 9, bank 7, upgrade 10 nhóm pass.
- Local setup: 6 test pass.
- Tải lab: 120 request, concurrency 8, 0 lỗi; p50 14ms, p95 51ms, max 92ms. Không phải cam kết tải/độ trễ trên máy chủ thật.
- Build Docker thành công với TLS/checksum giữ nguyên. Compose production render hợp lệ. Caddy validate hợp lệ (chưa xin certificate hoặc kết nối DNS thật).
- Chạy app + PostgreSQL bằng production compose trên project Docker cô lập, **không chạy gateway, không publish cổng**: health PostgreSQL OK, catalog mặc định rỗng, session có Secure, anonymous Admin bị chặn.
- `pg_dump` rồi restore vào database khác trong project test: khôi phục được tài khoản fixture. Đã dọn đúng project/volume test, không đụng volume vận hành.
- Đã chụp và mở xem ảnh giao diện sau gộp. Log tại `docs/validation/branch-integration/`; ảnh fixture tại `docs/screenshots/upgrade/`.

Các kiểm tra trên giảm rủi ro, **không đảm bảo không bao giờ có lỗi**. Chưa kiểm chứng DNS/HTTPS public, nhà cung cấp thanh toán/vận chuyển, máy chủ thật hoặc iOS vật lý. Chưa thể gọi website đã được nghiệm thu để mở bán thật.

## Bạn cần cung cấp hoặc nhập gì?

| Ưu tiên | Thông tin cần có | Nơi nhập / tác dụng |
|---|---|---|
| Bắt buộc | Tên miền muốn dùng và nơi quản lý DNS | Cấu hình SITE_DOMAIN; trỏ DNS về máy chủ sau UAT |
| Bắt buộc | Máy chủ/VPS, hệ điều hành, dung lượng, nơi lưu backup ngoài máy chủ | Chọn cấu hình triển khai, dung lượng ảnh, giám sát và khôi phục. Không gửi mật khẩu SSH trong chat |
| Bắt buộc | Tên cửa hàng/pháp lý, mã đăng ký nếu có, địa chỉ, hotline, Zalo, giờ hỗ trợ | Nhập tại Admin → Thông tin cửa hàng; kênh trống được ẩn |
| Bắt buộc | Sản phẩm thật: ảnh, mô tả, quy cách/SKU, giá, tồn đã kiểm kê, nguồn gốc và hạn dùng nếu có | Nhập qua Admin/CSV. Không dùng hàng mẫu để nhận đơn thật |
| Bắt buộc | Chính sách giao hàng/đổi trả/bảo mật/điều khoản đã duyệt, phạm vi phục vụ | Nhập bốn nội dung chính sách trong Admin; xử lý thủ tục thương mại điện tử áp dụng cho đơn vị kinh doanh |
| Bắt buộc | Quy tắc phí ship/ngưỡng miễn ship, thời gian chuẩn bị, cách tiếp nhận và xử lý đơn | Hiện giữ phí 25.000đ, miễn từ 499.000đ. Nếu khác phải cấu hình/code và test lại server, không sửa riêng dòng chữ |
| Bắt buộc | Nhân viên nào bán hàng/kho/kế toán/admin; người nhận cảnh báo và xử lý sự cố | Tạo tài khoản riêng, quyền tối thiểu. Không có admin mặc định; password nhập an toàn tại máy chủ |
| Nếu dùng chuyển khoản | BANK_BIN, BANK_NAME, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_NAME | Cấu hình môi trường máy chủ. Không cần mật khẩu Internet Banking; chuyển khoản vẫn đối soát thủ công |
| Nếu dùng tự khôi phục qua email | Tài khoản Resend, tên miền gửi đã xác thực, `RESEND_API_KEY`, `PASSWORD_RESET_FROM_EMAIL` | Code outbox/token một lần đã có; cấp key qua môi trường bảo mật và thử gửi thật. Xem REGISTRATION.md; không cần SMS/SMTP cho adapter này |
| Nếu muốn tự tạo vận đơn | Hãng vận chuyển, địa chỉ lấy hàng, sandbox/API theo hợp đồng | Tích hợp adapter và test; chưa có thì nhân viên tạo vận đơn ngoài hệ thống |

Bạn có thể nhập thông tin công khai trực tiếp trong Admin; không cần nhắn tất cả trong chat. Secret/API key chỉ qua kênh cấu hình bảo mật. Với COD trước, không cần chờ chọn cổng ví điện tử hoặc sàn.

## Phần code còn lại, không nên nhầm là “chờ bạn”

Danh sách địa chỉ hành chính chuẩn và luồng chọn/đối chiếu; email báo đơn; in/bulk/phân trang đơn server; lịch sử/xuất tồn; đánh giá có kiểm duyệt; lô/hạn dùng/FEFO; báo cáo lợi nhuận theo giá vốn vẫn cần phát triển tiếp. Cột mã tỉnh/phường đã có trong migration 001; không sửa migration 013 của banner để thêm địa chỉ. Quên mật khẩu đã có code, còn cần cấu hình và thử email thật. Chi tiết và thông tin chủ cửa hàng cần cung cấp được quản lý tại `CHUC_NANG_CHUA_TRIEN_KHAI.md`. Website COD không bắt buộc phải có mọi tính năng nâng cao, nhưng hàng có hạn dùng cần quy trình kiểm hạn thủ công cho đến khi có module lô.

## Cấu hình production mới

`compose.production.yaml` là stack riêng, không ghi đè stack local. Chỉ gateway Caddy publish 80/443; app 3001 và PostgreSQL chỉ trong mạng Docker. Cookie Secure và NODE_ENV production bật, catalog demo tự seed tắt; indexing mặc định tắt đến khi nội dung đã duyệt.

Tại máy chủ, tạo `.env.production` bằng công cụ bảo mật, không commit. Các khóa tối thiểu cho preflight hiện tại: SITE_DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL. Compose production tạo PUBLIC_BASE_URL từ SITE_DOMAIN. Password PostgreSQL tối thiểu 24 ký tự URL-safe ngẫu nhiên. Các BANK_* tùy chọn phải đủ bốn trường nếu bật. Giữ mật khẩu ổn định sau khi volume được tạo; đổi file env không tự đổi password trong database đã có.

Kiểm tra trước khi triển khai:

```sh
node --env-file=.env.production scripts/check-production.mjs
docker compose --env-file .env.production -f compose.production.yaml config -q
```

Lệnh kiểm tra không in secret và không chứng minh domain/nhận tiền/gửi hàng đã hoạt động. `docker compose config` nếu không có `-q` có thể in credential, không chia sẻ output đó.

Sau khi hạ tầng/DNS được xác nhận và bạn cho triển khai:

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml exec app node scripts/create-admin.mjs
npm run db:backup:production
```

`db:backup:production` chọn đúng file production/env, giữ bundle database + media/checksum; backup local mặc định không đổi. Backup xuất tại `data/backups/production/`, cần copy mã hóa ra nơi khác và đặt lịch. Phải thử restore vào database riêng trước khi tin cậy backup. Không đổi project name/volume hoặc dùng `down -v` trên hệ thống vận hành. Mọi thao tác rollback cần backup tương thích và tag/source đã thử; migration mới forward-only, không sửa migration cũ.

## Nghiệm thu trên môi trường thật trước mở bán

1. HTTPS certificate hợp lệ; chuyển HTTP sang HTTPS; session đăng nhập/cookie Secure hoạt động sau proxy.
2. Tạo đơn COD, sửa giỏ, lỗi mạng/retry, tra cứu, trạng thái đơn, thu tiền trên máy tính và điện thoại thật.
3. Nếu chuyển khoản: kiểm tra người nhận thật bằng giao dịch nhỏ được chủ shop cho phép, đối soát đúng mã/số tiền; không chuyển tiền trong phiên code này.
4. Khách không vào Admin; từng nhân viên chỉ có quyền cần thiết.
5. Nội dung/ảnh/giá/tồn/chính sách chính xác; không còn dữ liệu mẫu hiển thị như hàng thật.
6. Backup có lịch, restore thành công, giám sát health/dung lượng/lỗi và người chịu trách nhiệm; xác định giờ bảo trì/rollback.

Push GitHub hoặc merge main **không tự triển khai website**. Hiện không mở cổng public hoặc thay DNS trong phiên này.
