# Kế hoạch nghiệm thu và bàn giao sau sửa

## Chuẩn bị

- Git status và diff trước khi sửa; đọc quy định repo hiện hành.
- Node >=24.11, PostgreSQL và Chromium/Playwright theo README. Không dùng database vận hành làm test; fixture hiện có tạo schema tạm. Cloud dùng Unix socket tại /workspace/.postgres/socket:5433; máy khác cấu hình DATABASE_URL an toàn.
- Repo có `npm run db:local` dành cho cloud đã chuẩn bị; không mặc định binary/socket này tồn tại trên máy người nhận. Cài dependency bằng lockfile khi thiếu, không đổi lock chỉ vì chạy test.
- Giữ evidence lịch sử bất biến. Mỗi lượt sau sửa ghi `work/qa/<run-id>/` rồi chọn evidence cần commit, che secret. Không cộng lại các nhóm test trùng phạm vi.

## Ma trận test bắt buộc

| ID | Test trước/sau | Đạt khi |
|---|---|---|
| BUG-02 | CMS types/ranges/references + RBAC/CSRF | 400 đúng dữ liệu sai, không side effect; hợp lệ vẫn lưu được |
| BUG-03 | Admin save → public API → DOM + reload + fallback + text XSS | Setting từng key đúng vị trí, không HTML injection, lỗi optional API không phá checkout |
| BUG-04 | Success/shared IP/failure/TTL/race/forwarded header/storage | Success không tăng failure quota; fail/burst vẫn bị chặn; 429 có Retry-After |
| BUG-01 | New/duplicate/email/phone/verify/replay/race/legacy | Contract công khai đồng nhất, không tự gán verified, no takeover, không tạo session sớm |
| UPG-01/02 | Expiry/consume/purpose/recipient/resend/provider failure/retry | Một lần, gửi có quota, transaction/outbox đúng, mock khác production |
| UPG-03 | Forgot/reset + hai phiên cũ + concurrent login/reset | Generic forgot, token một lần, mật khẩu đổi đúng, phiên/challenge cũ hết hiệu lực |
| UPG-04/05 | IDOR session, logout-all, MFA replay/recovery/enforcement | Owner-only, revoke hiệu lực, admin không bypass MFA, backup dùng một lần |
| Migration | DB có dữ liệu cũ + fresh DB + migrate lần hai | Không mất user/order, không false verified, checksum hợp lệ, version không chạy trùng |
| UPG-06–11 | Happy path + negative/edge + quyền + concurrency theo module | Acceptance từng ticket có bằng chứng; thiếu môi trường ghi Blocked |

## Hồi quy sẵn có

Chạy sau nhóm thay đổi liên quan và chạy full trước bàn giao cuối. Không chạy song song các browser script nếu chúng ghi đè cùng file ảnh/evidence.

```sh
npm test
node --test tests/commerce.test.mjs tests/local-setup.test.mjs
npm run test:browser
npm run test:management
npm run test:account
npm run test:bank
node tests/commerce.browser.mjs
```

`node tests/qa-audit.mjs` là công cụ tái hiện baseline, cần sửa theo QA-TOOL-01/02 trước dùng làm gate. Không dùng exit 0 của phiên bản cũ để kết luận Pass. Những assertion public signup 201/409 phải được thay bằng contract verification và fixture mới có chủ đích khi sửa BUG-01; không giữ mâu thuẫn với yêu cầu chống enumeration.

Các test mới thêm vào script npm test hoặc CI rõ ràng để tránh “có file test nhưng không chạy”. Chỉ report Pass khi lệnh đã chạy và có assertion; test môi trường thiếu là Blocked, không Pass hay skip im lặng.

## 9 nhóm chưa có bằng chứng trong đợt QA gốc

1. Firefox desktop.
2. Safari/WebKit desktop.
3. Safari trên iPhone thật.
4. Chrome trên Android thật.
5. Hiệu năng tải đồng thời/p95 theo SLO đã chốt, gồm bcrypt và quota provider.
6. HTTPS/Secure cookie/HSTS và trusted proxy deployment thật.
7. Screen reader, tương phản, keyboard toàn hệ thống.
8. Return workflow và cạnh tranh số lượng hoàn.
9. CSV import/export cạnh tranh và banner theo lịch đầy đủ.

Không đổi các nhóm trên thành “bug” chỉ vì chưa chạy. Riêng page=1.5 là observation QA-TOOL-02 cần xác minh với dữ liệu nhiều trang.

## Migration, rollout và rollback

1. Đánh giá DB schema HEAD, tạo migration additive tiếp theo, migration thử trên schema test có dữ liệu legacy. Dùng backup logic và restore thử vào DB khác nếu chuẩn bị release; không copy data directory đang chạy.
2. Feature flag cho verification/provider/MFA nếu cần. Chốt account legacy, email optional, số phone và đường recovery trước bật enforcement. Không backfill verified_at giả để test xanh.
3. Staging: cấu hình provider sandbox, Redis/proxy thật, email/SMS kiểm soát được; test cả lỗi provider/storage, cooldown, resend và retry. Code local Pass chưa phải staging Pass.
4. Rollback app chỉ sau xác minh app cũ đọc được schema mới; không rollback bằng xóa challenge/outbox/users/orders. Dừng/khóa worker hoặc feature flag theo playbook để tránh gửi lặp. Không khôi phục session đã bị revoke hoặc tái sử dụng reset token để rollback.
5. Theo dõi login fail/429/5xx, độ trễ, outbox retry/dead-letter, chi phí SMS, reset/verify success và audit admin; metric/log không chứa thông tin xác thực hay PII không cần thiết.

## Cổng phát hành

- Bản sửa nhỏ: BUG-02/03/04 có regression và hồi quy liên quan Pass.
- Public có account thật: BUG-01 và verification/recovery phù hợp hoàn tất; rate limit/proxy/HTTPS đã kiểm; admin protection và yêu cầu business bắt buộc đạt. TOTP là đề xuất ưu tiên cho admin, chính sách enforce cần được duyệt và có recovery.
- Social login, avatar và các nâng cấp tùy chọn không tự động trở thành điều kiện release nếu chưa cam kết.
- Nếu còn blocker hoặc chưa xác minh hạ tầng bắt buộc: No-Go hoặc ghi rõ phạm vi release giới hạn, không tuyên bố đủ điều kiện chung.

## Mẫu báo cáo AI sau sửa

| ID | Trạng thái | Nguyên nhân | File/commit | Test và evidence mới | Migration/contract | Còn bị chặn |
|---|---|---|---|---|---|---|
| BUG-xx / UPG-xx | Fixed / Implemented / Blocked / Not tested | ... | ... | Lệnh thực chạy + kết quả | ... | ... |

Kèm hướng chạy, biến cấu hình cần cấp (chỉ tên), điểm thay đổi API, tác động account cũ, giới hạn đã biết và cách rollback. Không sửa evidence baseline thành kết quả sau fix.
