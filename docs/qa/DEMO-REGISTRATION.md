# Đăng ký demo localhost — kết quả kiểm thử 09/11/2026

Đã thêm chế độ opt-in `AUTH_VERIFICATION_MODE=demo`, chỉ cho development/localhost. Mã thử nghiệm hiện ngay ở màn hình xác minh, không gọi provider và không ghi vào outbox. Tài khoản có nhãn demo, không ghi false proof vào phone_verified_at/email_verified_at, và tài khoản/phiên/challenge demo không được chấp nhận trong provider mode. Migration mới 017 chỉ thêm cờ, không sửa migration cũ hoặc xóa dữ liệu.

| Lệnh | Kết quả | Bằng chứng |
|---|---|---|
| npm test | 76/76 Pass | demo-evidence/full.log |
| npm run test:local | 7/7 Pass | demo-evidence/local.log |
| npm run test:registration-demo | 4 nhóm Pass | demo-evidence/browser.log |
| npm run test:account | 9 nhóm Pass | demo-evidence/account.log |
| npm run test:qa-fixes | 4 nhóm Pass | demo-evidence/provider-ui.log |

Test demo đi từ form đăng ký tới mã hiện trên UI, nhập mã để tạo customer, đăng xuất/đăng nhập và đăng ký không email. API test kiểm tra không có user/phiên trước mã, không gửi tin, không lưu verified thật, không dùng mã/phiên/tài khoản demo trong provider mode và từ chối Host/Origin ngoài localhost. Bộ test cấu hình chặn production, LAN, public URL và trộn provider thật.

Đã chụp và xem ảnh ở 320/375/768/1440/1920px trong docs/screenshots/registration-demo; không tràn ngang. Mã trên ảnh chỉ là dữ liệu fixture đã hết hiệu lực sau khi dọn schema. Không dùng browser test sandbox để khẳng định Docker trên máy người dùng đã được cập nhật.

Đã sửa thêm trạng thái tab: sau đăng ký thành công, đăng xuất quay về form đăng nhập. Bộ 76 test chạy trước thay đổi nhỏ về tab và câu chữ demo cuối cùng; account/provider UI và demo browser đã chạy lại trên code sau thay đổi, đều Pass.

Cách bật trên Windows Docker Desktop nằm ở docs/REGISTRATION.md. Mặc định vẫn là provider; người dùng phải chọn mode demo rõ ràng trong .env.local và rebuild. Không có fallback tự động khi provider thật lỗi. Chưa chạy Docker end-to-end trong đợt này; test:local kiểm logic khởi tạo/kiểm tra cấu hình, không phải test deployment Docker thực tế.
