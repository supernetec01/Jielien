# Kết quả sửa lỗi sau cập nhật giao diện — 09/11/2026

## Source được đối chiếu

- Đã fetch và tích hợp `origin/main` tại `da147a8` (bản nâng cấp storefront/Admin mới).
- Merge `3b3e849` lấy source hiện hành từ origin, giữ nguyên bộ QA/handoff lịch sử của nhánh local. Không phục hồi source giao diện cũ.
- Các bản sửa chính: `415e6b7` (CMS), `f2c7a8a` và `52a0922` (login quota), `0519d24` (đăng ký có xác minh).
- Không sửa migration đã phát hành; thêm 015/016. Không push/deploy, không gửi SMS/email hoặc ghi nhận thanh toán thật, không thay đổi dữ liệu vận hành.

## Trạng thái 4 bug

| ID | Trạng thái source | Kết quả |
|---|---|---|
| BUG-01: đăng ký lộ định danh tồn tại | Đã sửa; local/sandbox verified; provider thật chưa cấu hình | New/duplicate đều 202, cùng body shape/thông báo và không Set-Cookie; OTP chứng minh số và email nếu cung cấp trước khi tạo customer/session. Duplicate không thay credential/quyền. Chưa thể kết luận gửi/nhận mã thật hoạt động. |
| BUG-02: CMS sai kiểu trả 500 | Source mới đã chặn tagIds string; đã siết thêm | Mảng/ID/giới hạn/tham chiếu và contentBlocks sai được từ chối 400; request lỗi không để lại article/revision/link/audit; omitted mặc định và ID hợp lệ hoạt động. |
| BUG-03: tên công ty không hiển thị | Đã có bản sửa trên origin; xác minh lại đạt | Admin API lưu → API public → DOM anonymous sau reload hiển thị tên/footer đúng; script/HTML mẫu chỉ hiện như text. Giữ renderer giao diện mới. |
| BUG-04: login đúng bị khóa theo tổng IP | Đã sửa và kiểm thử | Quota failure/in-flight riêng theo IP + identifier, success nhả đúng lượt; burst IP vẫn còn. PostgreSQL dùng chung giữa instance/restart; 429 có Retry-After; không tin X-Forwarded-For client tự gửi. |

Giới hạn cấu hình đăng nhập: mặc định burst 120/IP/phút và 15 failure/in-flight trên cặp IP/identifier trong 15 phút. Sau reverse proxy không được tin cậy, IP proxy có thể dùng chung ngân sách burst; cần xác minh kiến trúc/tải thực tế trước public, xem docs/REGISTRATION.md.

## Test đã thực thi

| Lệnh | Kết quả | Evidence |
|---|---:|---|
| npm test | 74/74 Pass | fixes-evidence/full-tests-final.log |
| npm run test:local | 6/6 Pass | fixes-evidence/local.log |
| node tests/qa-audit.mjs | 8/8 Pass; tập con của npm test, chạy lại sau chỉnh worker | fixes-evidence/audit-final.log |
| npm run test:qa-fixes | 4 nhóm Pass | fixes-evidence/qa-browser-final.log |
| npm run test:management | 11 nhóm Pass | fixes-evidence/management.log |
| npm run test:account | 9 nhóm Pass | fixes-evidence/account.log |
| npm run test:bank | 7 nhóm Pass | fixes-evidence/bank.log |
| npm run test:usability | 9 nhóm Pass | fixes-evidence/usability.log |
| npm run test:commerce | 13 nhóm Pass | fixes-evidence/commerce-browser.log |
| npm run test:admin-access | 6 nhóm Pass | fixes-evidence/admin-access.log |
| npm run test:browser | 14 nhóm Pass | fixes-evidence/storefront.log |
| npm run test:frontend-v3 | 12 nhóm Pass | fixes-evidence/frontend-v3.log |
| npm run test:upgrade | 10 nhóm Pass | fixes-evidence/upgrade.log |

Không cộng test gate 8 vào tổng 74 vì trùng nhau. Browser có tổng 95 nhóm kiểm tra, phạm vi giao nhau. Full suite 74 chạy sau thay đổi verification email/phone và deployment config; sau chỉnh chặn queue worker tăng vô hạn/chặn bấm resend lặp, gate 8 và browser QA 4 nhóm đã được chạy lại, đều Pass. Không viết lại kết quả baseline cũ.

Đã mở/xem ảnh verification ở 320/375/768/1440/1920px tại `docs/screenshots/qa-fixes/`: không tràn ngang, nhãn/lỗi/nút thao tác hiển thị. Ảnh và dữ liệu test đều là fixture trên schema tạm đã dọn. Các mã xuất hiện trên ảnh là mã test đã hết hiệu lực sau dọn schema.

### Nội dung test an toàn trọng yếu

- Chuẩn hóa email/số; public signup mới/trùng đồng nhất, không tạo user/phiên trước verification.
- Không dùng mã SMS cho email hoặc ngược lại; xác minh đủ cả hai kênh nếu có email; role luôn customer.
- Hết hạn, cooldown/resend, tối đa 5 lượt thử, dùng lại, hai request consume đồng thời, vô hiệu challenge cũ.
- Outbox retry có giới hạn, claim giữa hai worker, xóa payload khi thành công; provider thiếu cấu hình không bypass xác minh.
- 16 login đúng không bị khóa do tổng success; failure, burst, normalization, quota dùng chung, expiry, race và completion window cũ được kiểm.
- Hồ sơ/địa chỉ, revoke session sau đổi mật khẩu, IDOR, CSRF/RBAC, giá/tồn/kho/thanh toán, UI Admin/storefront mới vẫn được hồi quy.

## Thay đổi công cụ QA

`tests/qa-audit.mjs` cũ đã thay bằng assertion runner. Khi test fail hoặc không chạy được, exit code khác 0; không còn coi “status khác 409” là chống enumeration thành công. Script cũ và evidence baseline giữ nguyên trong handoff.

Quan sát page=1.5 đã được source origin xử lý; test hồi quy hiện có kiểm tra phân trang hữu hạn/số lẻ. Không tạo thêm bug thứ 5 từ một observation đã được xử lý.

## Cần chuẩn bị trước dùng thật

1. Cấu hình bridge HTTPS SMS/email qua `AUTH_VERIFICATION_WEBHOOK_URL` và `AUTH_VERIFICATION_WEBHOOK_TOKEN`. Bridge phải gửi mỗi mã tới đúng kênh và dùng idempotency theo challenge/channel; xem contract chi tiết tại docs/REGISTRATION.md.
2. Thiếu bridge, public signup trả 503 rõ ràng và đồng nhất. Login account cũ/guest checkout vẫn hoạt động. Không có OTP mặc định hay bypass production.
3. Staging kiểm gửi/nhận thực tế, quota/chi phí, lỗi provider, retry và độ trễ; kiểm reverse proxy/HTTPS và ngân sách burst theo tải.
4. Khi cập nhật máy công ty: giữ env/data/volumes, cập nhật source đúng nhánh đã tích hợp, rebuild app; không reset DB để xử lý migration. Dừng nếu checksum migration cũ không khớp, đối chiếu lịch sử và backup thay vì sửa/xóa record để ép chạy.

Docker stack end-to-end, Firefox/Safari/thiết bị thật, provider thực và load production **chưa được thực thi trong đợt này**. `test:local` là test cấu hình local, không phải chứng minh Docker deployment thật.

Các đề xuất quên/reset mật khẩu, quản lý phiên, MFA, social login và quy trình tài chính nâng cao vẫn ở backlog; đợt này tập trung 4 bug. Không coi toàn bộ bộ nâng cấp 11 nhóm đã hoàn thành.

**Release:** các bản sửa có bằng chứng local/sandbox; vẫn No-Go cho mở đăng ký công khai tới khi cấu hình và nghiệm thu provider/HTTPS/proxy cùng các điều kiện vận hành được chọn. Không suy ra đã cập nhật máy công ty chỉ từ commit local.
