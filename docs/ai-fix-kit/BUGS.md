# 4 bug có bằng chứng — đặc tả sửa lỗi

Tất cả trạng thái ban đầu: **Open**, chưa sửa. Chi tiết môi trường/bằng chứng đầy đủ trong `qa/QA-REPORT.md`, `qa/evidence/probe-results.json` và `qa/evidence/probe.log`.

## BUG-02 — CMS nhận tagIds sai kiểu gây HTTP 500

- Mức độ: Minor; ưu tiên Medium; độc lập, sửa trước.
- Vị trí: `lib/cms.mjs`, sanitize; `lib/commerce-common.mjs`, validation; route `/api/admin/cms/articles` trong `lib/commerce-routes.mjs`.
- Tái hiện: đăng nhập admin, POST route trên với cookie + CSRF hợp lệ và `{"title":"Bài QA","slug":"bai-qa","tagIds":"bad"}`.
- Thực tế: 500/internal_error, server log TypeError (QA15). Mong đợi: 400/validation_error có thông báo trường sai.
- Nguyên nhân từ source: `(b.tagIds || []).map(id)` thực thi trước kiểm tra Array.isArray; relatedProductIds có cùng pattern. Không coi lỗi relatedProductIds đã được runtime xác nhận cho đến khi chạy test.
- Cách sửa: định nghĩa helper mảng ID; bỏ qua field có nghĩa mặc định []; field có mặt phải là array (null sai kiểu nếu chọn contract này); giới hạn 20 phần tử trước map, ID nguyên dương an toàn; xử lý trùng nhất quán; tham chiếu không tồn tại trả 400. Kiểm tra contentBlocks theo contract tương tự mà không làm mất validation hiện có.
- Nghiệm thu: string/object/number/boolean/null trả 400; array quá dài, ID âm/0/thập phân/chuỗi sai trả 400; mảng hợp lệ và omitted hoạt động; không ghi bài, revision, links hay audit khi request lỗi; writer không được sửa bài người khác. Chỉ admin không có CSRF vẫn phải bị 403 trước xử lý.
- Test đề xuất: `tests/cms-validation.test.mjs` và commerce.test.mjs.

## BUG-03 — Tên công ty đã lưu không hiện ở storefront

- Mức độ: Minor; ưu tiên Medium; không cần migration cho bản sửa cơ bản.
- Vị trí: `lib/operations.mjs` settings/saveSetting; public/app.js siteData; public/index.html footer; xem cả `lib/seo.mjs` vì news SSR có template khác.
- Tái hiện trên schema mới: admin PATCH `/api/admin/settings/site`, body `{"key":"companyName","value":"QA COMPANY CHECK"}` → 200; GET `/api/site` chứa giá trị; mở trang chủ đợi tải siteData → tên mới không hiện (QA17/18).
- Nguyên nhân: settings trả array `{key,value_json,version}`; frontend chỉ dùng banners, chưa nối các key setting vào DOM tĩnh.
- Cách sửa: adapter allowlist cho companyName/contactPhone/contactEmail/address/footerText; node DOM rõ ràng ở vùng thông tin công ty; fallback hiện hành khi thiếu/sai kiểu/lỗi mạng. Không thay logo thương hiệu bằng tên pháp nhân nếu không được yêu cầu. Đồng bộ trang chủ, catalog, account và news SSR tại các vị trí thực sự có thông tin công ty; route change/reload không mất setting.
- Nghiệm thu: lưu từng key và mở mới/reload thấy đúng; kiểm tra anonymous user; text chứa `<img ...>` chỉ là text; không nội suy HTML thô; tel/mailto không cho URL tùy ý. API site lỗi không phá checkout. Không tuyên bố mọi key đều đã có lỗi runtime: QA hiện xác minh companyName, các key còn lại là phạm vi mở rộng cần test.
- Test đề xuất: `tests/site-settings.browser.mjs`, commerce browser, storefront smoke.

## BUG-04 — Login hợp lệ bị tính vào quota 15 request/IP/15 phút

- Mức độ: Major; ưu tiên High; có dependency hạ tầng khi chạy nhiều instance.
- Vị trí: server.mjs rateLimit và nhánh POST `/api/auth/login`; lib/auth.mjs login.
- Tái hiện đã chạy: trên app/IP mới có 1 login đúng + 2 login sai; tiếp tục 13 login đúng, 12 đầu 200, lần cuối 429 (QA23). Chưa có bằng chứng deploy proxy thật.
- Nguyên nhân: bộ đếm tăng trước xác thực, key chỉ kind + remoteAddress, cả thành công lẫn thất bại dùng cùng ngưỡng thấp. Tác động nhiều người chung NAT; tác động proxy là rủi ro cần xác minh.
- Cách sửa: giữ limiter burst IP cho mọi request với ngân sách phù hợp sản phẩm; tách limiter thất bại theo HMAC định danh chuẩn hóa + IP, thêm giới hạn định danh phân tán thận trọng để tránh khóa account do bên khác. Login đúng không tăng counter thất bại. Không cho thành công ở account A xóa quota lỗi của account B. Không xóa quota burst chỉ vì thành công.
- Storage: interface in-memory cho local/test và Redis atomic TTL cho multi-instance. Counter phải bounded/expire. Lỗi Redis xử lý theo chính sách rõ (fallback giới hạn chặt có metric hoặc fail-closed 503); không âm thầm bỏ bảo vệ. Chuẩn hóa identifier cùng logic login, không leak account/identifier vào log.
- IP: mặc định remoteAddress. Chỉ đọc forwarded header khi peer thuộc proxy allowlist/CIDR được cấu hình; không tin IP client tự gán. 429 có Retry-After tính từ TTL thực.
- Nghiệm thu: >=16 login đúng trong ngân sách burst hoạt động; 2 tài khoản cùng IP không khóa nhau bởi tổng success; sai liên tục bị chặn; TTL hết thì khôi phục bằng clock giả, không sleep 15 phút; race không vượt quota; spoof forwarded header không né limiter; Redis adapter chia sẻ quota giữa 2 instance; generic response không lộ user tồn tại. Giá trị ngưỡng phải có config và test, không chỉ nâng max từ 15 lên số lớn.
- Test đề xuất: `tests/auth-rate-limit.test.mjs`, test adapter storage và integration proxy.

## BUG-01 — Public registration tiết lộ email/số tồn tại

- Mức độ: Major; ưu tiên High; phụ thuộc UPG-01/02, contract API và migration.
- Vị trí: lib/auth.mjs normalizeDatabaseError/register; server.mjs register response/cookie; public/account.js; users, user_sessions và migrations mới.
- Tái hiện: đăng ký cùng email viết khác hoa/thường, số mới và mật khẩu hợp lệ; 409/account_exists khác với 201 + phiên của đăng ký mới (QA03/04).
- Nguyên nhân: response phân biệt unique conflict; tạo active user và session ngay khi chưa xác minh quyền sở hữu.
- Phương án đề xuất: endpoint bắt đầu đăng ký trả cùng HTTP 202/body chung, không cookie phiên đăng nhập, không userId/verified/existence flag cho cả mới và trùng. Gửi hướng dẫn qua kênh sở hữu; hoàn tất verification một lần mới cấp customer session theo chính sách đã chọn. Không để retry ghi đè mật khẩu hoặc hồ sơ tài khoản đã tồn tại.
- Mâu thuẫn cần xử lý: email hiện tùy chọn, số VN bắt buộc; không thể email-only cho mọi tài khoản. Mặc định đề xuất xác minh số bằng SMS cho signup chỉ có số, email khi có; quyết định định danh chính và kênh recovery cần được ghi rõ trước bật production. Thiếu provider vẫn làm local mock, không tự coi tài khoản là verified.
- Migration: thêm trạng thái verification riêng; `users.status` hiện chỉ cho active/inactive. Không ghi pending vào cột này nếu chưa đổi constraint; không sửa migrations cũ. Tài khoản legacy được giữ, verified_at không được backfill giả. Cần policy chuyển đổi legacy và hỗ trợ admin để tránh khóa mọi tài khoản hiện có.
- Nghiệm thu: signup mới/trùng email/trùng số trả cùng status, shape, cookie và thông báo; không lộ trạng thái trong lỗi phụ/resend. Xác minh đúng activate/cấp phiên một lần; token hết hạn/sửa/sai purpose/sai recipient/replay bị chặn; request cạnh tranh không tạo user/session trùng. Đăng ký email/số đã tồn tại không thay credential; không link tài khoản theo email chưa verified. Sự khác biệt timing cần đo có phương pháp, tránh assertion thời gian quá sát gây flaky.
- Thay đổi có chủ đích: các test cũ mong 201/409 + auto-login phải đổi theo contract verification mới và fixture verified riêng. Giữ test unique constraint, roles customer, CSRF, IDOR và checkout. QA03 không còn phải expected 409 ở public API, nhưng vẫn phải chứng minh không tạo tài khoản trùng trong DB.

## Vấn đề công cụ QA — chưa phải bug sản phẩm mới

### QA-TOOL-01 — Probe không phải cổng nghiệm thu tự động

`tests/qa-audit.mjs` exit 0 khi có Fail; QA04 chỉ kiểm tra status khác 409 nên 500 cũng có thể bị ghi Pass. Probe còn phụ thuộc cookie signup ngay và thứ tự request rate-limit. AI cần chuyển assertion sửa lỗi sang node:test, fixtures độc lập và cleanup finally; exit khác 0 khi case Fail/không hoàn thành. Browser đợi response nên đăng ký wait trước goto, có timeout hữu hạn, không nuốt lỗi tải rồi báo Pass. Evidence baseline giữ nguyên; kết quả mới lưu thư mục khác.

### QA-TOOL-02 — QA16 chưa chứng minh phân trang đúng

Observed `/api/news?page=1.5` trả 200/page=1.5. Probe hiện coi mọi 200 là Pass. Đây là observation cần xác minh, không tính thêm bug thứ 5. Chốt contract page phải nguyên >=1: trả 400 hoặc chuẩn hóa nhất quán; test có >12 bài, kiểm tra ID giữa trang 1/2 không trùng/thiếu, page lẻ/âm/0/NaN/quá lớn và giữ query khi chuyển trang. Chỉ sau tái hiện sai nghiệp vụ mới mở bug sản phẩm riêng.
