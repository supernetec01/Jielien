# Chức năng còn thiếu và thông tin chủ cửa hàng cần cung cấp

Cập nhật: **09/11/2026**. Đây là file theo dõi tập trung cho phiên bản hợp nhất trên **`main`**, gồm giao diện Admin mới và sửa lỗi tài khoản tại `ece1af9`. Dùng file này trước các báo cáo QA, ZIP AI fix kit và bảng backlog cũ; các tài liệu đó mô tả thời điểm trước đây và có mục đã được xử lý.

## Cách đọc và cập nhật

- **Thiếu cấu hình/dữ liệu:** đã có code, chưa thể dùng thật cho đến khi nhập thông tin và nghiệm thu.
- **Còn phát triển:** chưa có hoặc chưa đủ code. Cung cấp thông tin không tự làm chức năng hoạt động; AI/lập trình viên phải triển khai và kiểm thử tiếp.
- **Chưa nghiệm thu thực tế:** đã có kiểm thử trong cloud, còn cần kiểm tra trên máy, mạng hoặc dịch vụ thật.
- **Ngoài phạm vi đã chọn:** chỉ triển khai khi chủ cửa hàng chọn làm tiếp.

Ưu tiên **P0** trước mở bán thật, **P1** cho vận hành tiếp theo, **P2** cho nâng cấp sau. Các mục “nếu dùng” chỉ bắt buộc khi chọn dùng chức năng đó. Không gửi mật khẩu/API key/token trong chat hay commit lên Git; nhập secret qua cấu hình bảo mật của môi trường chạy.

## Những chức năng đã có, không cần triển khai lại

- Đăng ký khách hàng **không OTP**, đăng nhập ngay; điện thoại bắt buộc, email tùy chọn. Không cần thuê SMS cho luồng này. Không coi thông tin nhập vào là đã xác minh.
- Mua hàng không cần tài khoản, bắt buộc thông tin nhận hàng; không tự gắn đơn guest theo số điện thoại/email trùng.
- Đổi mật khẩu khi đăng nhập cần mật khẩu hiện tại. Quên mật khẩu có token một lần, hết hạn 30 phút, outbox email Resend và thu hồi phiên; **gửi email thật còn cần cấu hình ở mục A04**.
- Admin xem hồ sơ/địa chỉ/lịch sử đơn khách, cấp link hỗ trợ sau xác minh người sở hữu và nhập lại mật khẩu admin. Tài khoản demo cũ có quy trình chuyển đổi bằng link hỗ trợ, không reset database.
- Catalog sản phẩm cha/SKU, giá/tồn, thuộc tính, ảnh, danh mục/thương hiệu, CSV có preview; sửa và xóa danh mục/thương hiệu/nhóm thuộc tính chưa sử dụng (mục đang có liên kết được bảo vệ), menu desktop cố định toàn chiều cao; tài khoản/quyền nhân viên; đơn COD/chuyển khoản VietQR **đối soát thủ công**; phiếu kho và nhận hàng hoàn cơ bản.
- CMS duyệt/xuất bản/lên lịch, SEO HTML chính, banner theo slot/lịch, thông tin cửa hàng/chính sách, báo cáo giá trị đơn và tiền đã thu, backup database + media. Các giới hạn mở rộng nằm bên dưới.

## A. Thiếu cấu hình, dữ liệu hoặc nghiệm thu để dùng thật

| Mã / ưu tiên | Chức năng và trạng thái | Bạn cần cung cấp hoặc chuẩn bị gì? | Việc còn phải thực hiện / điều kiện hoàn thành |
| --- | --- | --- | --- |
| A01 · P0 | Website công khai/HTTPS: có mẫu Docker + Caddy, chưa triển khai/kiểm chứng trên hạ tầng thật | Tên miền, nơi quản lý DNS, VPS/máy chủ và hệ điều hành, dung lượng dự kiến, người quản trị, ngân sách và thời điểm mở bán. Truy cập máy chủ/DNS cấp bằng kênh bảo mật | Cấu hình `SITE_DOMAIN`, `ACME_EMAIL`, secret PostgreSQL riêng; DNS/TLS, cookie Secure, health, firewall và rollback; kiểm tra thực tế rồi mới mở nhận đơn. Xem [RELEASE_READINESS.md](RELEASE_READINESS.md) |
| A02 · P0 | Nội dung và hàng hóa thật: công cụ nhập đã có, dữ liệu hiện tại là demo | Tên/pháp lý cửa hàng, địa chỉ, hotline/Zalo/email/giờ hỗ trợ; sản phẩm/SKU, ảnh được phép dùng, giá, tồn kiểm kê, thương hiệu/nguồn gốc, cân nặng/kích thước nếu tính ship | Nhập tại Admin/CSV, kiểm tra trước xuất bản; không tự biến dữ liệu mẫu thành hàng bán thật. Logo nền trong suốt/SVG và logo thương hiệu cần bản được duyệt |
| A03 · P0 | Chính sách/quy trình cửa hàng: có form, chưa chốt nội dung vận hành | Nội dung giao hàng/thanh toán, đổi trả, bảo mật, điều khoản; khu vực phục vụ; thời gian xử lý; đầu mối khiếu nại; thủ tục thương mại điện tử áp dụng | Chủ cửa hàng duyệt rồi nhập Admin; kiểm tra hiển thị công khai. Nếu chưa có module hạn dùng, phải có quy trình kiểm hạn thủ công cho hàng có hạn |
| A04 · P0 nếu dùng tự khôi phục email | Gửi email khôi phục: **code đã có**, chưa cấu hình/kiểm chứng gửi thật | Tài khoản Resend, tên miền gửi và quyền DNS, email gửi, API key có quyền gửi. Cấp key qua secret `RESEND_API_KEY`; đặt `PASSWORD_RESET_FROM_EMAIL` | Xác thực DNS theo Resend, cấu hình origin HTTPS tin cậy (`PUBLIC_BASE_URL`, production lấy từ `SITE_DOMAIN`), thử hộp thư/Spam/quota và link reset. `production:check` hiện yêu cầu cấu hình này. Không cần SMTP hoặc SMS để dùng adapter hiện tại. Chưa cấu hình thì forgot trả thông báo chung nhưng không gửi thư; admin hỗ trợ vẫn dùng được. Chi tiết [REGISTRATION.md](REGISTRATION.md) |
| A05 · P0 nếu dùng chuyển khoản | VietQR/đối soát thủ công: có code, cần tài khoản nhận tiền thật | Mã NAPAS 6 số, tên ngân hàng, số tài khoản nhận, tên chủ tài khoản; nhân viên đối soát. Không cần mật khẩu Internet Banking | Nhập đủ `BANK_BIN`, `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`; chủ shop kiểm tra người nhận/giao dịch thử được cho phép. Quét QR không tự đánh dấu đã thanh toán |
| A06 · P0 | Backup ngoài máy chủ/giám sát vận hành: có script backup/restore, chưa thiết lập lịch và nơi lưu thật | Nơi lưu ngoài máy chủ, thời gian giữ, mức mất dữ liệu/thời gian khôi phục chấp nhận được, người nhận cảnh báo và lịch bảo trì | Lập lịch backup database + media, bảo vệ bản sao, thử restore vào DB riêng, giám sát health/dung lượng/lỗi/outbox và diễn tập rollback. Khóa mã hóa outbox hiện cùng database; backup là dữ liệu nhạy cảm |
| A07 · P0 | Nghiệm thu Windows/LAN/mobile/production: cloud tests đã có, chưa đủ bằng chứng môi trường người dùng | Máy Windows/Docker Desktop, trình duyệt/điện thoại thực, PC thứ hai nếu dùng LAN, đầu mối và thời gian UAT | Kiểm tra cập nhật giữ dữ liệu, đăng ký/đăng nhập/khôi phục, guest COD, phân quyền, tồn, đối soát và restore. Chưa chứng minh Safari/iOS thật, HTTPS public hoặc khả năng chịu tải production bằng số đo lab |
| A08 · P0 | Phân công nhân viên và xác minh khách qua hỗ trợ: có quyền và form, cần quy trình thực tế | Danh sách vai trò/người phụ trách kho, bán hàng, kế toán, admin; cách xác minh khách khi mất email/chỉ có SĐT; kênh chuyển link riêng | Tạo tài khoản riêng, cấp quyền tối thiểu, hướng dẫn support. Chỉ biết SĐT/email không đủ chứng minh chủ tài khoản; không bỏ bước xác minh vì có checkbox |

## B. Chức năng còn phải phát triển

| Mã / ưu tiên | Chức năng chưa đủ / còn thiếu code | Thông tin bạn cần bổ sung | Hướng triển khai và tiêu chí hoàn thành |
| --- | --- | --- | --- |
| B01 · P1 | Email báo đơn mới cho cửa hàng; email xác nhận cho khách chưa triển khai | Email/nhóm nhận nội bộ; có gửi cho khách không; nội dung và dữ liệu khách được phép đưa vào thư; người xử lý lỗi gửi | Outbox sự kiện đơn trong transaction, chống trùng theo đơn, worker retry/lease, trạng thái/retry theo quyền trong Admin, sender thật/sandbox. Có thể đánh giá tái dùng Resend; không nhầm outbox reset hiện có đã gửi email đơn. Xem [đề xuất](proposals/ORDER_EMAIL_NOTIFICATION.md) |
| B02 · P1 | Nhân viên tạo đơn hộ khách trong Admin | Quy trình đặt qua điện thoại/Zalo, quyền ai được tạo, cách chọn khách/địa chỉ, có cho sửa giá/chiết khấu không | Màn tạo đơn dùng báo giá/giữ tồn/idempotency chung, quyền riêng và audit; không ghi tiền đã thu từ yêu cầu tạo đơn. Không cần credential để bắt đầu code |
| B03 · P1 | Phí ship sửa trong Admin, theo vùng/cân nặng | Bảng phí, vùng phục vụ, ngưỡng miễn ship, phụ phí/COD, cách tính trọng lượng, cân nặng/kích thước SKU | Hiện dùng `lib/shipping-policy.mjs`: 25.000đ, miễn từ 499.000đ trước giảm giá. Cần cấu hình có quyền/validation và quote server; giữ snapshot phí đơn cũ. Sửa nội dung chính sách không đổi được phép tính |
| B04 · P1 | Chọn tỉnh/phường-xã từ danh sách chuẩn và chuyển đổi địa chỉ | Nguồn dữ liệu hành chính được duyệt, ngày phiên bản/giấy phép, cách dùng địa chỉ cũ và vùng giao thực tế | Đã có cột `province_code`/`ward_code` trong migration 001, nhưng chưa có bộ dữ liệu chuẩn và luồng chọn/đối chiếu đầy đủ. Migration 013 hiện dành cho banner V3, **không sửa/đổi mục đích migration cũ**. Thiết kế migration bổ sung nếu cần, giữ địa chỉ/snapshot/đơn cũ và kiểm thử tương thích |
| B05 · P1 | Tự tạo vận đơn, tracking đồng bộ, webhook hãng vận chuyển | Chọn GHN/GHTK/Viettel Post hoặc hãng khác; địa chỉ lấy hàng, hợp đồng/tài liệu API, sandbox và secret; cách thu COD/đối soát/hoàn hàng | Adapter hãng, xác thực/chống trùng webhook, mapping trạng thái, audit và retry; kiểm chứng đầu cuối. Hiện nhân viên làm vận đơn bên ngoài; bảng `shipments` không chứng minh đã tích hợp hãng |
| B06 · P1 nếu cần tự động | Báo có ngân hàng/cổng thanh toán, ví và hoàn tiền tự động | Chọn nhà cung cấp, tài khoản nhận tiền/merchant, tài liệu API/chữ ký, sandbox/secret; quy tắc sai số, thừa/thiếu/chuyển trễ và hoàn tiền | Xác minh số tiền/đơn/chữ ký, webhook idempotent, sổ thanh toán và quy trình đối soát. Giữ đối soát thủ công hiện có đến khi tích hợp được nghiệm thu |
| B07 · P1 | Phê duyệt hoàn tiền có chứng từ và đảo phiếu kho | Người/phân cấp duyệt, mẫu chứng từ, quy tắc hoàn phí/ship, cách điều chỉnh sai và thời hạn đổi trả | Workflow hoàn tiền, audit/evidence, bút toán bù không sửa ledger cũ; phân biệt nhận hàng hoàn và đã hoàn tiền. Permission dự phòng không có nghĩa workflow đã hoàn thành |
| B08 · P1 | Lọc/phân trang đơn tại server, chọn nhiều đơn/bulk status, in phiếu, export theo lọc | Chọn khổ A5 hay 100×150, mẫu phiếu/máy in; bộ lọc và thao tác hàng loạt mong muốn | Hiện Admin tải tối đa 200 đơn, lọc chính ở client; cần API phân trang/export, kiểm quyền và xử lý lỗi từng đơn. In thử đúng kích thước, không làm sai tiền COD hoặc trạng thái |
| B09 · P1 | Xuất tồn CSV chuyên dụng, lịch sử từng SKU ngay trong dialog, nhập kho điền sẵn | Mẫu CSV/cột mong muốn nếu có; quy trình nhập/kiểm kê | Nối sổ kho/phiếu vào UI, export theo quyền và bộ lọc, dữ liệu thật. Đã có phiếu và ledger nền; không cần bạn cấp dịch vụ ngoài để code |
| B10 · P1 | Lô/hạn dùng/FEFO | Có quản lý hạn dùng không; mã lô/ngày sản xuất/hết hạn của tồn hiện tại, quy trình nhận/kiểm/xuất, ngưỡng cảnh báo, cách chuyển tồn cũ | Đặc tả và migration riêng, giữ/nhả/xuất tồn theo lô, kiểm kê/hàng hoàn, cảnh báo và test cạnh tranh. Cần chốt thiết kế trước vì tác động tồn và đơn |
| B11 · P1 | Báo cáo lợi nhuận, chi phí, hoàn tiền; dashboard nghiệp vụ đầy đủ | Cách tính giá vốn, giá vốn SKU/lô, phí thanh toán/ship, cách phân bổ giảm giá/hoàn; KPI và người được xem | Hiện có giá trị đơn/tiền đã thu/series/top SKU nền. Cần sổ chi phí/giá vốn và định nghĩa số liệu; UI tiền đã thu theo ngày/phương thức và bảng đơn/SKU cần xử lý còn cần nối/mở rộng. Không suy lợi nhuận từ giá bán |
| B12 · P1 | Đổi tên/ngừng dùng/xóa/gộp giá trị thuộc tính đã lưu; category slug redirect tự động | Quy tắc khi giá trị đang gắn SKU, có cho gộp/ngừng dùng không; cây danh mục chính thức | Hiện chỉ thêm giá trị, bỏ được dòng chưa lưu; backend cần bảo toàn liên kết/tổ hợp SKU và lịch sử. Đổi slug danh mục cần redirect được kiểm tra, tránh vòng lặp |
| B13 · P2 | Catalog nâng cao: bulk publish/facets, editor/diff, CSV round-trip | Cột import/export, số dòng, tiêu chí lọc và thao tác hàng loạt thực tế | CSV hiện tối đa 200 dòng/envelope 32 KiB, lưu nháp, không ghi tồn; export chưa là template round-trip đầy đủ. Cần mở rộng API/preview/version/audit và kiểm thử thay vì bỏ giới hạn tùy tiện |
| B14 · P2 | Media đa cỡ/AVIF, crop/video; logo/ảnh thương hiệu chuẩn | Logo gốc được duyệt, ảnh/banner desktop/mobile có quyền sử dụng; có thực sự cần video/crop không | Hiện upload ảnh được kiểm tra, chuyển WebP, chưa tự sinh đủ biến thể/AVIF/video. Bổ sung pipeline/cache/storage/backup và nghiệm thu bố cục; không tự sửa nhận diện thương hiệu |
| B15 · P2 | CMS phong phú: table/video/FAQ/product block, diff revision trực quan, collection CMS | Kiểu nội dung cần dùng, mẫu bài/collection, quy trình biên tập | Mở schema block/sanitize/renderer/preview/SEO và quyền. Workflow, revision, related product và banner hiện có không đồng nghĩa đã có mọi block hoặc collection |
| B16 · P2 | Đánh giá “đã mua” có kiểm duyệt | Ai duyệt, quy định ảnh/nội dung, có giới hạn một đánh giá/mặt hàng không | Schema/API xác minh người mua, moderation, upload an toàn và SEO đúng dữ liệu; không tạo đánh giá/rating giả. Không cần thuê dịch vụ ngoài cho phần code |
| B17 · P2 | GA4/Meta Pixel/consent, newsletter | Measurement ID/Pixel ID, mục đích thu thập, nội dung cookie/đồng ý được duyệt; newsletter chọn nhà cung cấp và quy trình hủy đăng ký | Chỉ tải tracker theo cấu hình/consent phù hợp; newsletter cần backend đăng ký/đồng ý/hủy đăng ký. Form newsletter hiện ẩn, chưa có backend. Secret gửi qua môi trường bảo mật |
| B18 · P2 | UX bổ sung: xem gần đây, mua kèm nâng cao, báo có hàng, FAQ, timeline giao hàng | Nội dung FAQ, quy tắc mua kèm/báo tồn, có gửi email khi có hàng không | Cần phát triển từng luồng; báo tồn phụ thuộc sender và consent, timeline tự động phụ thuộc carrier. Wishlist cơ bản đã có, không cần triển khai lại |
| B19 · P2 | Hoàn thiện UX/a11y/hiệu năng theo toàn bộ spec | Thiết bị/trình duyệt mục tiêu; ưu tiên màn hình nếu có. **Không cần credential để sửa code** | Còn cần rà keyboard/ARIA search combobox, skeleton từng route, cây danh mục/chính sách SSR, giá trên từng nút quy cách, tối ưu cập nhật vùng, gesture banner, cảnh báo rời editor chưa lưu, menu/confirm/toast nhất quán. Đã có responsive/axe một số trang và số đo lab; cần Lighthouse/đo production và nghiệm thu toàn ứng dụng |
| B20 · P2 | Thư viện banner phân trang/quản lý quy mô lớn, cập nhật tab mở lâu | Số banner dự kiến; có cần cập nhật realtime không | Admin library hiện giới hạn 180 entry, public 10/slot; cần server pagination/UX nếu vượt quy mô, realtime là tính năng riêng. Không tăng public cap không giới hạn |

## C. Ngoài phạm vi đã chọn / chỉ làm khi có yêu cầu tiếp

| Mã | Chức năng | Bạn cần quyết định/cung cấp gì? | Phần còn thiếu |
| --- | --- | --- | --- |
| C01 | Shopee/TikTok Shop/đồng bộ sàn/livestream | Có muốn làm sau website riêng không, sàn nào, quy tắc nguồn tồn/giá/đơn và tài khoản đối tác | Đặc tả, adapter theo hợp đồng, mapping SKU/webhook/rate limit/đối soát; chưa có tích hợp thật |
| C02 | Tích điểm/hạng thành viên/combo nâng cao/đa ngôn ngữ | Chính sách điểm/hết hạn/đổi trả, cách chia giá combo và tồn, ngôn ngữ/nội dung dịch | Thiết kế và code riêng; không coi coupon hiện tại là đã có loyalty/combo |
| C03 | MFA/2FA, OTP SMS | Có muốn tăng bảo vệ admin/nhân viên hoặc bổ sung SMS sau này không | MFA cần thiết kế và triển khai riêng. **OTP đăng ký khách đã được chủ cửa hàng chủ động bỏ; không phải blocker và không cần thuê SMS cho phiên bản hiện tại** |

## Thông tin bạn có thể chuẩn bị trước

Điền mẫu này khi muốn làm tiếp; có thể ghi “chưa quyết định”. Các thông tin công khai cũng có thể nhập trực tiếp trong Admin.

```text
1. Chạy localhost/LAN hay mở bán công khai trước:
2. Tên miền / nơi quản lý DNS / máy chủ dự kiến / ngân sách:
3. Tên cửa hàng, pháp lý, địa chỉ, hotline, giờ hỗ trợ:
4. File sản phẩm/SKU, ảnh/logo, giá/tồn đã kiểm kê:
5. Chính sách giao hàng/đổi trả/bảo mật/điều khoản đã duyệt:
6. Vùng giao, bảng phí, ngưỡng miễn ship, cân nặng/kích thước SKU:
7. COD hay chuyển khoản; tài khoản ngân hàng nhận (không mật khẩu):
8. Email gửi khôi phục / domain gửi / email hoặc nhóm nhận đơn mới:
9. Hãng vận chuyển và dịch vụ thanh toán tự động nếu muốn tích hợp:
10. Danh sách vai trò nhân viên, quy trình xác minh khách, đầu mối vận hành:
11. Khổ in/máy in, mẫu CSV/báo cáo, quy tắc giá vốn/hoàn tiền:
12. Có quản lý lô/hạn dùng không; dữ liệu lô tồn hiện tại:
13. Nơi lưu/lịch backup, mục tiêu khôi phục và người nhận cảnh báo:
14. Ba mục ưu tiên muốn AI triển khai tiếp (ghi mã A/B/C ở trên):
```

Với API key/credential: chỉ cho biết đã có và sẽ cấu hình ở môi trường nào; không điền giá trị vào file này.

## Dành cho AI/lập trình viên làm tiếp

1. Đọc `AGENTS.md`, file này và source mới nhất trên `main`; xác minh lại từng mục trước khi sửa. Không khôi phục OTP đăng ký hoặc áp dụng lỗi từ ZIP QA cũ mà chưa kiểm tra hiện trạng.
2. Chọn mã công việc, ghi thiết kế/API/migration và tiêu chí nghiệm thu. Mục không cần thông tin ngoài có thể phát triển trên schema/sender sandbox; không đổ việc thiếu code thành “chờ cấp tài khoản”.
3. Giữ migration 001–018 đã có, mật khẩu/config và volume. Chỉ thêm migration mới khi cần; test trên database/schema riêng.
4. Sau triển khai, cập nhật **chính file này**: trạng thái, ngày/commit, bằng chứng test, cấu hình còn thiếu và nghiệm thu thật. Chỉ chuyển “đã có code” sang “dùng thật” sau khi phần phụ thuộc được kiểm chứng.

## Tình trạng hợp nhất Git và cách lấy bản mới

Các đầu nhánh GitHub tại thời điểm kiểm tra đều đã nằm trong lịch sử `main` sau merge:

| Nhánh nguồn | Commit đã kiểm tra | Nội dung |
| --- | --- | --- |
| `feat/frontend-v3` | `fc00f08` | Storefront V3, catalog/banner/SEO |
| `fix/checkout-lan-browser-compatibility` | `283f383` | Tương thích checkout HTTP LAN |
| `feature/ux-upgrade-phase1` | `da147a8` | UX và tích hợp giao diện |
| `feature/jielien-commerce-cms` | `ece1af9` | Commerce/CMS, QA fixes và tài khoản không OTP/khôi phục/hồ sơ khách |
| `main` trước đợt hợp nhất | `c693548` | Layout Admin, đơn hàng và editor thuộc tính/SKU mới |

Giữ các nhánh nguồn để tra lịch sử; **không cần pull/merge từng nhánh trên máy người dùng**. Các thay đổi mới phát sinh sau các commit trên phải được kiểm tra và gộp riêng.

```powershell
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
npm.cmd run local:start
```

Nếu có thay đổi local, lưu bằng commit hoặc stash trước khi chuyển nhánh; không ghi đè file cấu hình. Giữ `.env.local` và volume, backup trước nâng cấp. Source mới trên GitHub không tự cập nhật localhost hoặc triển khai Internet.

## Bằng chứng và tài liệu đối chiếu

- Kiểm tra lại trên bản hợp nhất `main` ngày 09/11/2026: `npm test` **78/78**, `test:customer-flows` **6/6 nhóm** (gồm 5 viewport), `test:local` **7/7**; không có fail/skip ở các bộ unit. Các đầu nhánh nguồn được kiểm tra bằng Git ancestry, bản merge có cùng source chạy với `ece1af9`. Log lần hợp nhất: `docs/validation/main-merge/`. Không gửi email thật, thử Docker Desktop/production hoặc thay dữ liệu vận hành trong lượt này.
- Tài khoản/khôi phục/guest/admin: [CUSTOMER-ACCOUNT-RESULTS.md](qa/CUSTOMER-ACCOUNT-RESULTS.md), [REGISTRATION.md](REGISTRATION.md).
- Code hiện tại: `lib/password-recovery.mjs`, `lib/shipping-policy.mjs`, `lib/auth.mjs`, `server.mjs`, `public/commerce-admin.js`; giới hạn schema trong `db/migrations/`.
- Giới hạn catalog/SKU: [validation/admin-catalog-layout/README.md](validation/admin-catalog-layout/README.md). Giới hạn V3: [frontend-v3/RESULTS.md](frontend-v3/RESULTS.md).
- Yêu cầu nâng cấp chi tiết: [UPGRADE_SPEC.md](UPGRADE_SPEC.md); phần chưa hoàn thành lịch sử: [UPGRADE_DELIVERY.md](UPGRADE_DELIVERY.md), [COMMERCE_RELEASE.md](COMMERCE_RELEASE.md). Trạng thái mới trong file này thay thế các mô tả cũ về OTP, khôi phục mật khẩu và số migration địa chỉ.
