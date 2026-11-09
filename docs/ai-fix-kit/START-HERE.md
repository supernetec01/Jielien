# Jielien — Bộ bàn giao sửa lỗi cho AI

Ngày lập: 09/11/2026 (Asia/Bangkok). Ngôn ngữ: Tiếng Việt.

**Mục đích:** AI có source repo có thể tái hiện, sửa và nghiệm thu từng lỗi; chuẩn bị nâng cấp xác thực theo các giai đoạn. Bộ này không sửa mã nghiệp vụ và không tuyên bố các lỗi đã được khắc phục.

## Nguồn và phạm vi

- Baseline source đã kiểm thử: `972b54a`.
- Commit chứa QA/evidence: `4fda65d41e88097b3e8ea89c7f2232a949af724f`.
- Nhánh lúc bàn giao: `feature/jielien-commerce-cms`.
- Nếu HEAD mới hơn, AI phải đối chiếu diff trước; bằng chứng đính kèm mô tả baseline, không mặc định trạng thái HEAD mới.
- 4 bug có bằng chứng; 11 nhóm tính năng thiếu/nâng cấp; 2 vấn đề công cụ QA cần chỉnh trước nghiệm thu; 9 nhóm phạm vi chưa kiểm thử. Không có cam kết đã tìm mọi bug của hệ thống.
- Hồi quy: 39 test API/database và 49 nhóm browser Pass; audit 23 case có 19 Pass, 4 Fail. Bảng mở rộng 46 case có 14 Blocked và 9 Not tested. Các tập có phạm vi trùng, không cộng thành một số test độc lập.

## Dùng bộ này

1. Mở repo Jielien ở commit hiện hành, đọc AGENTS.md nếu có và README.md.
2. Gửi nguyên nội dung `AI-PROMPT.md` cho AI có quyền đọc/sửa repo.
3. AI đọc `BUGS.md`, `UPGRADE-PLAN.md`, `ACCEPTANCE.md`, `issues.json` và tài liệu QA đính kèm trước khi thực hiện.
4. Thứ tự: sửa BUG-02 → BUG-03 → BUG-04; sau đó xây nền verification/outbox để sửa BUG-01; tiếp tục reset, quản lý phiên, MFA và nâng cấp theo nhu cầu.
5. Mỗi lỗi có regression test và commit riêng; mỗi đợt nâng cấp có migration/rollout/test riêng. Không đóng BUG-01 chỉ bằng đổi câu thông báo.

## Các file

| File | Vai trò |
|---|---|
| AI-PROMPT.md | Prompt giao việc có thể sao chép ngay |
| BUGS.md | Triệu chứng, tái hiện, nguyên nhân, hướng sửa, tiêu chí từng bug |
| UPGRADE-PLAN.md | Thiết kế đề xuất, các phần cần chuẩn bị, thứ tự triển khai |
| ACCEPTANCE.md | Ma trận nghiệm thu, lệnh test, migration, rollback và phạm vi còn thiếu |
| issues.json | Backlog có ID/dependency/acceptance, dùng cho AI hoặc nhập vào công cụ quản lý việc |
| qa/ | Bản sao báo cáo, 46 test case và bằng chứng lịch sử |
| reproduction/qa-audit.mjs | Bản sao script audit; bản chạy trong repo là tests/qa-audit.mjs |
| MANIFEST.json | Danh sách file, kích thước và SHA-256 để kiểm tra gói |

ZIP là gói tài liệu và bằng chứng, **không chứa toàn bộ source, node_modules, database hay secrets**. AI vẫn cần repo. Script trong reproduction giữ import tương đối như file tests; không chạy trực tiếp tại thư mục reproduction. Dùng `node tests/qa-audit.mjs` trong repo.

## Giới hạn cần giữ rõ

- Chưa có kiểm thử mới trong lần đóng gói này; dùng bằng chứng của đợt QA trước.
- Redis, TTL/quota, hợp đồng API verification và thứ tự nâng cấp là đề xuất thiết kế, không phải tính năng đã có.
- Chính sách nhiều người dùng chung IP và tên công ty hiển thị ở storefront là giả định sản phẩm đã dùng để ghi nhận BUG-03/04. Nếu thay đổi chính sách, ghi quyết định và lý do, không sửa bằng chứng cũ thành Pass.
- Chưa push hay triển khai. Chỉ tạo/commit bộ bàn giao vào repo.
