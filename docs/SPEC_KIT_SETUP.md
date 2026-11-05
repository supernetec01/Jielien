# Spec Kit đã cài

Checkout chính thức https://github.com/github/spec-kit.git tại /workspace/tools/spec-kit, commit ec9a6f3b; Specify CLI 1.3.1.dev0 được cài bằng uv vào /workspace/tools/bin/specify. `specify check` và init Codex skills thành công. Thêm `/workspace/tools/bin` vào PATH cho phiên shell nếu cần. CLI là công cụ phát triển, không bắt buộc trên máy nhân viên/production.

Lệnh đã chạy: `specify init --here --force --non-interactive --integration codex --integration-options="--skills"` sau commit baseline. Giữ constitution từ kit Jielien thay vì template. Feature ở specs/001-jielien-commerce; dùng `SPECIFY_FEATURE_DIRECTORY=/workspace/Jielien/specs/001-jielien-commerce` khi gọi script prerequisites trên nhánh feature/jielien-commerce-cms. Các workflow specify/plan/tasks/analyze/implement là skills cho agent; không phải lệnh shell cùng tên. Không tái khởi tạo app hay database.
