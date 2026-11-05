# F1 — baseline

- Base: `main` tại `2b4e299` (PR #4), working tree sạch trước khi tạo `feat/frontend-v3`.
- Tệp đầu vào thực nhận: `CODEX_FRONTEND_IMPLEMENTATION.md` và `JIELIEN_FRONTEND_V3.html`; bản nguyên văn/checksum trong `reference/`. Không có ZIP trong lượt gửi này; hai tệp trên cung cấp đủ yêu cầu F1–F8.
- Các ảnh `baseline/` sao chép từ bằng chứng của baseline, không phải ảnh V3: home desktop, catalog mobile, Banner Admin desktop.
- Baseline có 51 test backend/unit và các regression browser. Kết quả CI của baseline đã thành công trước tác vụ V3; kiểm thử cuối V3 ghi trong `RESULTS.md`.
- Đã tạo PostgreSQL custom archive của database phát triển cloud tại `/workspace/backups/jielien-before-v3.dump` (ngoài Git). Không kết nối, sao lưu hay sửa database trên máy công ty. Bundle backup/restore tests của repo vẫn được giữ.
- Không xóa/reset PostgreSQL, không thay mật khẩu, không ghi demo từ HTML vào database. Source mẫu chỉ lưu trong docs, không đặt trong public.
