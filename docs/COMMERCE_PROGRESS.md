# Jielien Commerce — đối chiếu và tiến độ

Base main c1e7b3b; kế thừa nhánh LAN 8b460eb (chưa merge main). Nhánh triển khai feature/jielien-commerce-cms, không merge/public tự động.
Bộ đặc tả gốc và checksum được giữ trong docs/commerce-spec. Không dùng dữ liệu mẫu trong kit để seed live.

| Phase | Baseline thực tế | Quyết định |
|---|---|---|
| P0 | REAL: PostgreSQL, migration checksum, LAN opt-in, backup binary, test schema riêng | Giữ nguyên IDs/volume/password. Kiểm chứng restore Docker riêng trước migration |
| P1 | INCOMPLETE: pink demo, text logo | Dùng logo gốc, tokens navy/green, cải thiện components responsive |
| P2 | INCOMPLETE: chỉ sửa SKU, thiếu CRUD product/media | Module catalog mới, không sửa order snapshot |
| P3 | REAL RBAC read/write, INCOMPLETE tạo nhân viên/phiếu kho | Admin tạo nhân viên; khách đăng ký vẫn customer |
| P4 | NOT IMPLEMENTED CMS/SEO HTML | Structured blocks escaped trên server; revision/publication tách draft; jobs khóa DB |
| P5 | INCOMPLETE báo cáo/settings/promotion | Tái sử dụng dashboard/payments thật |
| P6 | INCOMPLETE kiểm thử phần mới/UAT | Tests riêng và regression; LAN/Windows thực tế do IT xác nhận |

Không thay framework. Backend mới tách lib; schema forward-only từ 005. Chỉ thao tác schema tạm/project Docker test; không có quyền truy cập database công ty. Trước deploy live phải backup DB và media, restore drill, đối soát counts, có phê duyệt cutover.
