# Báo cáo QA Jielien — 09/11/2026

## Phạm vi và kết luận

Kiểm tra source tại commit `972b54a`, nhánh `feature/jielien-commerce-cms`. Commit này lưu toàn bộ thay đổi có sẵn trước đợt QA, theo yêu cầu chủ repo. Chưa push lên remote. Đợt QA không sửa mã nghiệp vụ.

**No-Go cho phát hành công khai có tài khoản/dữ liệu thật.** Demo nội bộ có thể tiếp tục dùng với các hạn chế dưới đây. Phát hiện 4 lỗi đã tái hiện, gồm 2 Major và 2 Minor. Không phát hiện Critical trong phạm vi đã chạy; điều này không chứng minh hệ thống không còn lỗi.

## Môi trường và chiến lược

- Linux cloud, Node.js 24.22.1, PostgreSQL 17, Chromium headless qua Playwright; HTTP loopback, cổng ngẫu nhiên.
- Mỗi bộ test dùng schema PostgreSQL riêng, dọn schema sau khi kết thúc; không dùng đơn hoặc tài khoản vận hành. Không gọi dịch vụ gửi email/SMS hay chuyển tiền thật.
- Ưu tiên: đăng ký/đăng nhập/session/CSRF/RBAC/IDOR → đổi mật khẩu/hồ sơ/địa chỉ → giỏ hàng/thanh toán/tồn kho → CMS/quản trị → responsive và lỗi đầu vào.
- Kiểm tra desktop và viewport mobile/tablet, có kích thước 320, 375, 768, 1440px trong bộ commerce. Viewport mobile không thay cho kiểm thử thiết bị thật.
- Giả định chính sách đăng nhập cần phục vụ nhiều người dùng chung IP; công ty thay đổi cấu hình cần được phản ánh ở storefront. Nếu nghiệp vụ chủ đích khác, hai kết quả tương ứng cần phân loại lại theo yêu cầu được duyệt.

## A. Test case và kết quả

`Test-cases.csv` có đúng các cột test case được yêu cầu, kèm trạng thái, thực tế và bằng chứng: **46 case: 19 Pass, 4 Fail, 14 Blocked, 9 Not tested**.

14 case Blocked là tính năng chưa tìm thấy luồng triển khai; không tính thành lỗi runtime. 9 Not tested là phạm vi chưa thực thi hoặc cần môi trường bổ sung. QA16 chỉ đạt điều kiện không trả 500; API vẫn trả page=1.5, chưa chứng minh phân trang số lẻ đúng nghiệp vụ.

Các bộ hồi quy có sẵn được thống kê riêng, vì đơn vị đo và phạm vi trùng với các case QA:

| Bộ kiểm thử | Kết quả | Bằng chứng |
|---|---:|---|
| npm test | 31/31 test Pass | evidence/npm-test.log |
| commerce.test + local-setup.test | 8/8 test Pass | evidence/extra-tests.log |
| Storefront browser | 14/14 nhóm Pass | evidence/browser.log |
| Management browser | 11/11 nhóm Pass | evidence/management.log |
| Account browser | 9/9 nhóm Pass | evidence/account.log |
| Bank checkout browser | 7/7 nhóm Pass | evidence/bank.log |
| Commerce CMS browser | 8/8 nhóm Pass | evidence/commerce-browser.log |
| QA bổ sung | 19 Pass, 4 Fail / 23 case | evidence/probe-results.json |

Đã có bằng chứng cho hash mật khẩu/token, phiên hết hạn/thu hồi, cookie HttpOnly/SameSite, CSRF, phân quyền server, cô lập địa chỉ/đơn giữa khách hàng, mất response checkout sau COMMIT, cạnh tranh tồn/mã giảm giá, thu hồi phiên khi đổi mật khẩu, CMS publication/revision, upload ảnh giả bị từ chối và escaping nội dung cơ bản. Đây không phải đánh giá bảo mật toàn diện.

## B. Bug report

### BUG-01 — Đăng ký tiết lộ email/số điện thoại đã tồn tại

- Module: Đăng ký; **Major / High**.
- Môi trường: Node/PostgreSQL local HTTP, API client; không phụ thuộc trình duyệt.
- Điều kiện: có tài khoản demo với email `Buyer+qa@EXAMPLE.test`.
- Tái hiện: (1) POST `/api/auth/register` với email trên viết thường, số điện thoại demo khác, họ tên và mật khẩu hợp lệ. (2) So sánh với đăng ký email/số mới.
- Thực tế: email trùng trả 409, `account_exists`, “Email hoặc số điện thoại đã được sử dụng.”; tài khoản mới trả 201 và cấp phiên. Có thể phân biệt tài khoản tồn tại. Rate limit hiện tại giảm tần suất, không loại bỏ việc tiết lộ.
- Mong đợi: theo yêu cầu chống user enumeration, phản hồi công khai không phân biệt trạng thái tồn tại; hướng dẫn tiếp tục qua kênh sở hữu đã xác minh.
- Bằng chứng: QA03–QA04 trong `evidence/probe-results.json`; `lib/auth.mjs`, hàm normalizeDatabaseError/register.
- Đề xuất: đăng ký theo mô hình pending verification; phản hồi đồng nhất, gửi hướng dẫn phù hợp qua email/SMS, giới hạn theo IP và định danh. Không chỉ đổi câu thông báo trong khi status/luồng vẫn khác.

### BUG-02 — CMS trả HTTP 500 khi tagIds sai kiểu

- Module: CMS tạo bài viết; **Minor / Medium**.
- Môi trường: API local HTTP; session admin, CSRF hợp lệ.
- Tái hiện: (1) Đăng nhập admin. (2) POST `/api/admin/cms/articles` với JSON `{"title":"Bài QA","slug":"bai-qa","tagIds":"bad"}`.
- Thực tế: HTTP 500, `internal_error`; log server `Request failed: TypeError`.
- Mong đợi: HTTP 400, thông báo lỗi dữ liệu cho tagIds; không tạo bài viết.
- Bằng chứng: QA15; `evidence/probe.log`; `lib/cms.mjs`, sanitize gọi `.map` trước khi kiểm tra mảng.
- Đề xuất: kiểm tra Array.isArray, độ dài và kiểu phần tử cho tagIds/relatedProductIds/contentBlocks trước khi sử dụng. Thêm regression cho sai kiểu, null, phần tử sai và giới hạn mảng.

### BUG-03 — Cấu hình tên công ty lưu thành công nhưng storefront không cập nhật

- Module: Cấu hình công ty → storefront; **Minor / Medium**.
- Môi trường: Chromium desktop, app local, session admin để lưu.
- Tái hiện: (1) PATCH `/api/admin/settings/site` với `{"key":"companyName","value":"QA COMPANY CHECK"}` trên database mới. (2) GET `/api/site`. (3) Mở lại trang chủ, đợi dữ liệu sản phẩm/site tải xong.
- Thực tế: lưu trả 200, API chứa giá trị mới; nội dung hiển thị trang chủ không có tên đã cấu hình. Source tải siteData nhưng storefront chỉ dùng banners; tên/footer hiện là nội dung tĩnh.
- Mong đợi: tên công ty cấu hình xuất hiện ở vị trí thông tin công ty tương ứng; cập nhật bền vững sau reload.
- Bằng chứng: QA17–QA18; `evidence/company-footer.png`; public/app.js và public/index.html.
- Đề xuất: có adapter ánh xạ site settings vào các vị trí hiển thị, escape text và fallback khi thiếu; kiểm thử xuyên suốt admin → API → storefront. Nếu setting chỉ dành cho dùng sau, UI phải ghi rõ chưa áp dụng.

### BUG-04 — Lượt đăng nhập thành công vẫn làm khóa cả IP

- Module: Đăng nhập / rate limiting; **Major / High**.
- Môi trường: một app Node và một IP loopback; chỉ thực hiện 16 request, không load test.
- Tái hiện: (1) Trên app mới, thực hiện tổng cộng 15 POST `/api/auth/login` cùng IP; có thể tất cả dùng thông tin hợp lệ. (2) Gửi lần thứ 16 với tài khoản và mật khẩu đúng.
- Thực tế: HTTP 429, yêu cầu đợi 15 phút. Counter tăng trước xác thực, khóa theo `kind + req.socket.remoteAddress`, không phân biệt thành công/thất bại hay tài khoản. Chuỗi probe sau 3 lượt login trước đó: 12 lượt thành công rồi lượt kế tiếp trả 429.
- Mong đợi: giữ cơ chế chống brute force nhưng không khóa mọi người dùng chỉ vì tổng login hợp lệ dùng chung IP; chính sách cần có ngưỡng burst hợp lý và giới hạn thất bại theo định danh.
- Bằng chứng: QA23; `server.mjs`, rateLimit và nhánh login.
- Tác động: người dùng cùng NAT có thể khóa lẫn nhau; nếu reverse proxy làm mọi request có cùng remoteAddress, phạm vi có thể rộng hơn. Chưa kiểm tra cấu hình proxy thực tế.
- Đề xuất: limiter dùng Redis cho nhiều instance, kết hợp IP + hash định danh và bộ đếm thất bại; chỉ tin forwarded IP từ proxy được cấu hình rõ. Thêm Retry-After và kiểm thử nhiều tài khoản chung IP; vẫn giữ giới hạn burst chống lạm dụng.

## C. Chức năng chưa hoàn thiện và hướng triển khai

Chưa tìm thấy các luồng sau trong auth/API/UI hiện tại. Đây là missing feature, không phải xác nhận lỗi thực thi.

| Chức năng | Hiện trạng | Thiếu sót | Đề xuất |
|---|---|---|---|
| Xác minh email/điện thoại | Đăng ký tạo user active và cấp session ngay | Không chứng minh quyền sở hữu email/số | pending → verified; cho phép guest checkout riêng; giới hạn quyền dựa trên trạng thái |
| Quên/reset mật khẩu | Chưa có luồng | Người quên mật khẩu không tự phục hồi | Ưu tiên email reset một lần, phản hồi công khai đồng nhất |
| OTP email/SMS | Chưa có provider và workflow | Thiếu challenge, TTL, resend, giới hạn thử | Chuẩn bị sandbox provider, lưu hash mã và ràng buộc user/recipient/purpose |
| Social login | Chưa có | Thiếu callback và chính sách liên kết | Google OIDC trước nếu có nhu cầu; state/nonce/PKCE; không tự liên kết chỉ vì email trùng |
| 2FA | Chưa có | Admin chỉ dùng mật khẩu | Ưu tiên TOTP cho admin; backup code dùng một lần; sau đó cân nhắc passkey |
| Phiên đa thiết bị | Có nhiều session; đổi mật khẩu thu hồi toàn bộ | Chưa có danh sách phiên và logout-all độc lập | Trang thiết bị/phiên, thu hồi từng phiên/toàn bộ, xác thực lại thao tác nhạy cảm |
| Đổi số điện thoại | Số đăng nhập được giữ nguyên | Chưa có quy trình xác minh số mới | Xác thực lại + OTP số mới + kiểm tra trùng + thông báo kênh cũ |
| Xóa tài khoản | Chưa có luồng khách yêu cầu | Thiếu chính sách lưu giữ đơn/chứng từ | Định nghĩa retention, vô hiệu tài khoản, ẩn danh theo chính sách, audit |
| Cảnh báo bảo mật | Chưa tích hợp email/SMS | Không thông báo đổi mật khẩu/email | Transactional outbox + worker, retry có giới hạn và idempotency |
| Hoàn tiền | Có API hoàn hàng/tăng tồn | Chưa có quy trình hoàn tiền thực tế đầy đủ | Tách return và refund; quyền tài chính, đối soát, idempotency, audit |
| Avatar khách hàng | Không có luồng cập nhật avatar | Media admin không thay cho avatar user | Chỉ làm khi cần: giới hạn dung lượng/pixel, decode và re-encode, kiểm quyền sở hữu |

### Chuẩn bị trước khi triển khai xác thực mở rộng

1. Chốt định danh chính: hiện số VN bắt buộc, email tùy chọn. Nếu ưu tiên email reset, phải có cơ chế thêm/xác minh email; tài khoản chỉ có số cần SMS hoặc quy trình hỗ trợ xác minh. Không âm thầm loại tài khoản cũ.
2. Chọn nhà cung cấp email giao dịch và SMS/OTP có sandbox; chuẩn bị domain gửi, SPF/DKIM/DMARC, sender/brandname nếu dùng SMS, mẫu tiếng Việt và hạn mức chi phí. Nhập API key qua secret manager/cấu hình an toàn, không commit.
3. Chuẩn bị HTTPS/domain/callback chuẩn, môi trường staging độc lập, Redis cho limiter phân tán, worker và hàng đợi/outbox cho gửi tin; log che email/số/token/OTP.
4. Bổ sung verified_at/trạng thái verification; bảng auth_challenges gồm hash token/mã, user/recipient, purpose, expires_at, consumed_at, số lần thử và thời gian resend. Ràng buộc challenge với người nhận tại thời điểm phát hành.
5. Quy định TTL và giới hạn: ví dụ email reset 15–30 phút; OTP 3–5 phút, tối đa 5 lần thử, resend tối thiểu 60 giây và quota ngày. Đây là giá trị đề xuất, cần chốt theo sản phẩm/provider. OTP ngắn nên dùng HMAC với secret server, không hash thuần dễ dò offline.
6. Token reset ngẫu nhiên đủ mạnh, chỉ lưu hash; consume atomically trong transaction, vô hiệu challenge cũ khi phát hành mới; reset mật khẩu thu hồi session. Không ghi token URL vào analytics/log; trang reset dùng Referrer-Policy phù hợp.
7. Chuẩn bị tài khoản test email/SMS kiểm soát được, clock điều khiển trong test, stub provider, test hai user/hai purpose, resend cạnh tranh, token dùng hai lần, reset đồng thời login, lỗi provider và retry.

### Thứ tự thực hiện đề xuất

- **P0:** xử lý 4 phát hiện; chốt chính sách verification/password/rate limit, kiểm tra HTTPS qua proxy và chạy lại regression.
- **P1:** email verification + quên/reset mật khẩu + outbox/worker; bổ sung quản lý phiên. Hoàn thành test replay/expiry/IDOR và chống dò tài khoản trước khi public.
- **P2:** TOTP cho admin, backup code và quy trình recovery có audit; SMS OTP nếu số điện thoại là kênh định danh chính. SMS không bắt buộc phải có trước email nếu sản phẩm chọn email làm kênh đầu tiên.
- **P3:** Google OIDC nếu cần, tiếp theo Apple/Facebook theo nhu cầu; đổi số/xóa tài khoản. Social login không phải điều kiện release nếu chưa cam kết với người dùng.

## D. Đánh giá tổng kết

| Mức độ | Xác thực | CMS | Cấu hình | Tổng |
|---|---:|---:|---:|---:|
| Critical | 0 | 0 | 0 | 0 |
| Major | 2 | 0 | 0 | 2 |
| Minor | 0 | 1 | 1 | 2 |
| Trivial | 0 | 0 | 0 | 0 |

Top 5 rủi ro:

1. Rate limit IP hiện tại làm người dùng hợp lệ khóa lẫn nhau; cần đánh giá triển khai sau proxy.
2. Đăng ký tiết lộ định danh tồn tại và chưa xác minh quyền sở hữu email/số điện thoại.
3. Chưa có khôi phục mật khẩu tự phục vụ, tăng rủi ro mất quyền truy cập và xử lý hỗ trợ thủ công.
4. Admin chưa có MFA, trong khi có quyền thao tác tài khoản, giá, tồn và ghi nhận thanh toán.
5. Chưa có bằng chứng cho TLS/proxy production, browser ngoài Chromium, tải thực tế và toàn bộ return/refund; không suy ra readiness từ các test local đã Pass.

Điều kiện xem xét Go: khắc phục/xác nhận chính sách cho BUG-01/04; sửa validation CMS và nối setting storefront; hoàn tất cơ chế recovery/verification được chọn; kiểm thử HTTPS, trình duyệt mục tiêu, bảo vệ admin và các luồng kinh doanh bắt buộc. Không cần triển khai mọi social provider mới được release.

### Tái chạy

```sh
npm run db:local
npm test
node --test tests/commerce.test.mjs tests/local-setup.test.mjs
npm run test:browser
npm run test:management
npm run test:account
npm run test:bank
node tests/commerce.browser.mjs
node tests/qa-audit.mjs
```

Audit script ghi từng Pass/Fail vào `work/qa/probe-results.json`; exit code 0 chỉ thể hiện script hoàn tất, không có nghĩa mọi case Pass. Đọc trường status để đánh giá. Các browser suite có sẵn có thể tái tạo ảnh trong docs/screenshots; không coi thay đổi ảnh là sửa mã nghiệp vụ.
