# Kiểm chứng Jielien Commerce/CMS

Ngày 2026-11-05, nhánh feature/jielien-commerce-cms; Linux cloud, Node.js 24.22.1, PostgreSQL 17.11, Chromium, Docker Engine 29.9.2. Chỉ dùng dữ liệu giả và schema/project Docker độc lập. Không truy cập database công ty.

| Lệnh / kiểm tra | Kết quả |
|---|---|
| npm test | 46 pass, 0 fail / skipped / cancelled |
| npm run test:local | 6 pass; mật khẩu/file cũ được giữ, validate IP/port |
| npm run test:browser | 14 kiểm tra storefront pass |
| npm run test:management | 11 kiểm tra quản trị pass |
| npm run test:account | 9 kiểm tra tài khoản pass |
| npm run test:bank | 7 kiểm tra VietQR/đối soát pass |
| npm run test:commerce | 10 kiểm tra mới pass, gồm username admin, 3 SKU, upload/gallery, nhân viên, autosave, CMS review/publish, SEO HTML và 320/375/768/1440px |
| npm run test:local:stack | Pass: Compose localhost/LAN, DB không expose; Node/Postgres, register/CSRF/VietQR; upload decode, media host bind; recreate container giữ order/session/stock/media; pg_dump custom + media checksum + pg_restore vào DB drill riêng giữ order/media metadata |
| node tests/commerce-load.mjs | 120 request, concurrency 8, 0 lỗi; p50/p95/max thực tế trong load.json |
| git diff --check / node --check | Chạy trước commit cuối |

## Evidence có thể tái chạy

- `tests/commerce-upgrade.test.mjs`: checksum cố định migration 001–004; dựng schema LAN cũ, seed mẫu và tạo user/order/order_item, snapshot dữ liệu, chạy migration mới, so sánh chính xác ID/SKU/giá/order snapshot/user/stock, rerun và seed không ghi đè.
- `tests/commerce.test.mjs`: catalog 3 SKU, image magic/decode/private/unattached, publish gate, concurrent product 409, gallery legacy, unique combination/weight/threshold, preview auth, history slug ownership/301, CSV preview read-only/atomic/replay, promotion quote, settings whitelist, banner path, staff role/login/revoke, CMS writer/approval/scheduler race/restore, returns bounds/idempotency/damaged stock/payment unchanged, public HTML/Offer/canonical/sitemap/noindex, audit/report access.
- `tests/backup.test.mjs`: binary nguyên vẹn; lỗi exit/header không công bố; DB/media bundle atomic, checksum, từ chối symlink/path traversal/truncated stream/checksum sai.
- `tests/local-stack.mjs`: project Docker riêng và bind temp, không dùng volume live. Volume test được giữ lại có chủ đích; không chạy down --volumes. Cleanup chỉ media test sau khi backup đã kiểm chứng. Native/host-owned media và container-owned media đều được test.
- `tests/commerce.browser.mjs`: tạo qua UI, không chỉ gọi API; ảnh chụp trong docs/screenshots/commerce với dữ liệu giả. Lỗi HTTP 401 ban đầu ở /api/auth/me là trạng thái chưa đăng nhập được dự kiến, không phải test fail.

## Phân biệt giới hạn

Kết quả lab không chứng minh đã chạy Windows Docker Desktop/PowerShell 5.1, hai PC LAN, firewall/VLAN, scheduler Windows hoặc restore DB công ty. Những bước đó phải được IT/UAT xác nhận theo COMMERCE_WINDOWS.md. Không đo Lighthouse hoặc Core Web Vitals p75 người dùng thật; không cam kết Google ranking/capacity production. A11y có keyboard/responsive/focus trong E2E, chưa phải chứng nhận WCAG độc lập.

Lần Docker đầu khi thêm media đã phát hiện quyền file do root container tạo khiến host Linux không đọc/dọn được. Helper đã sửa sang stream media qua app container, không chmod hoặc sửa dữ liệu live; Docker drill sau sửa đạt. Một test cũ yêu cầu unknown product/category trả SPA HTTP 200 được cập nhật thành 404 đúng yêu cầu SEO; các API nghiệp vụ giữ tương thích.

Không có test failed/unexplained được chấp nhận là pass. Các phần chưa triển khai của đặc tả được nêu trong COMMERCE_RELEASE.md và tasks.md; không dùng kết quả test phần lõi để tuyên bố hoàn tất toàn bộ backlog.

GitHub Actions workflow `.github/workflows/commerce-tests.yml` đã bổ sung để chạy lại các guard trên PostgreSQL CI cô lập và Chrome. Các lệnh tương ứng đã chạy trong cloud; kết quả GitHub Actions sau push chưa được giả định là pass.

Ảnh home/catalog được chụp sau khi JS hydrate (.hero/.product-card đã xuất hiện); bài/news giữ kiểm tra SSR riêng. Footer cấu hình công ty có test ghi qua admin và kiểm chứng DOM thật, không chỉ xác minh API.
