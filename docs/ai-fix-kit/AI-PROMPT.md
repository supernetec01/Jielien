# Prompt giao AI sửa Jielien

Bạn là kỹ sư full-stack có trách nhiệm kiểm thử hồi quy. Hãy thực hiện sửa lỗi trong repo Jielien, không dừng ở việc đề xuất kế hoạch. Đọc `docs/ai-fix-kit/START-HERE.md`, `BUGS.md`, `UPGRADE-PLAN.md`, `ACCEPTANCE.md`, `issues.json`, tài liệu QA và quy định repo trước khi sửa. Nếu đang dùng ZIP ngoài repo, mở repo trước và đối chiếu baseline 972b54a với HEAD.

## Mục tiêu và thứ tự

1. Tái hiện BUG-02, BUG-03, BUG-04; viết regression thật, sửa và commit lần lượt.
2. Xử lý QA-TOOL-01/02 để công cụ nghiệm thu không báo Pass sai. Giữ nguyên evidence lịch sử, lưu kết quả mới riêng.
3. Thực hiện nền tảng UPG-01/02 và sửa BUG-01 bằng verification end-to-end; tiếp tục UPG-03/04. Hoàn thành phần local bằng provider giả lập và test, không chờ credential production để viết code.
4. Tiếp tục admin TOTP UPG-05; các nâng cấp UPG-06–11 theo dependency và giá trị sản phẩm. Nếu quyết định nghiệp vụ hoặc provider thật chưa được chốt, ghi đề xuất mặc định và phần bị chặn; vẫn hoàn thành mọi phần độc lập có thể review.

## Yêu cầu thực hiện

- Đọc source hiện tại, xác định lỗi còn tồn tại trước khi sửa; không giả định line number/contract cũ còn đúng.
- Không reset/xóa thay đổi sẵn có, không sửa migration đã phát hành. Tạo migration kế tiếp sau migration mới nhất trên HEAD; kiểm checksum và chạy lại an toàn.
- Giữ RBAC, CSRF, cô lập dữ liệu giữa user, hash session token, bcrypt và transaction tồn/đơn/thanh toán. Không tạo mật khẩu admin mặc định hoặc cho phép tự nâng quyền.
- Dùng schema test riêng và cổng ngẫu nhiên. Repo mô tả cổng 3000 không được chiếm/dừng; không tự dừng dịch vụ khác.
- Chỉ thêm dependency khi cần; không xây lại framework hoặc đổi toàn bộ hệ thống chỉ để sửa một lỗi.
- Không xóa assertion, nới expected, skip test hay đổi status Fail thành Pass để làm xanh test. API thay đổi có chủ đích phải cập nhật fixture và test theo contract mới, vẫn kiểm tra cùng các thuộc tính an toàn.
- Audit hiện tại chỉ là probe; exit 0 không đồng nghĩa Pass. QA04 chỉ nhìn 409 và QA16 chấp nhận page=1.5 nên không đủ để đóng lỗi. Xem QA-TOOL-01/02.
- Với setting, dùng textContent/escape và kiểm tra scheme cho tel/mailto. Với rate limit, không tắt limiter và không tin X-Forwarded-For từ mọi client.
- Không tự đánh dấu email/số cũ là verified. Dữ liệu demo có thể dùng test nhưng migration vẫn phải bảo toàn đường nâng cấp.
- Provider thật, DNS, sender, Redis production, OAuth và HTTPS deployment cần cấu hình ngoài repo. Không hỏi secret trong chat, không commit secret; chuẩn bị adapter/mock/config example và ghi rõ phần chưa xác minh.
- Không tự gửi email/SMS tới người thật, ghi nhận thanh toán thật, push hoặc deploy nếu phiên thực thi chưa được người dùng yêu cầu.

## Tiêu chí hoàn thành

Với mỗi ID, báo cáo: nguyên nhân; file thay đổi; contract/migration thay đổi; lệnh và kết quả test; bằng chứng trước/sau; commit; phần còn bị chặn. Chỉ đánh dấu Fixed khi tái hiện trước sửa, regression đạt sau sửa và test liên quan đạt. No-Go vẫn giữ nếu còn release blocker hoặc chưa đủ bằng chứng.

Chạy ma trận trong ACCEPTANCE.md. Kết thúc bằng bảng trạng thái Fixed / Implemented / Blocked / Not tested cho từng ID. Không báo mọi tính năng hoàn tất nếu chỉ có mock provider; phân biệt local verified và staging/production verified.
