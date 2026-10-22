# Chạy Jielien trên Windows với Docker Desktop

Website chạy trên máy bạn độc lập với website trong môi trường đám mây. Bản cập nhật trên GitHub chỉ có hiệu lực ở máy bạn sau khi kéo mã và khởi động lại đúng ứng dụng. Bản có tài khoản, checkout COD và VietQR chạy ở **http://localhost:3001**. Cổng **3000** dành cho công việc khác và không bị các lệnh bên dưới thay đổi.

## Chuẩn bị

Cài Git, Node.js **18 trở lên** cùng npm và Docker Desktop. Mở Docker Desktop, chọn **Linux containers**, đợi Docker Engine sẵn sàng. Ứng dụng dùng Node.js 24 và PostgreSQL 17 bên trong container; máy Windows không cần cài PostgreSQL, không cần chạy script Bash `db:local` dành cho cloud, và không cần cài dependency ứng dụng bằng `npm ci` khi dùng Docker.

PowerShell kiểm tra được các lệnh:

```powershell
git --version
node --version
npm --version
docker version
docker compose version
```

## Cập nhật đúng repo và chạy bản mới

Mở PowerShell trong thư mục repo `supernetec01/Jielien` đã clone. Nếu dùng `cd`, thay đường dẫn minh họa bằng vị trí thật trên máy:

```powershell
cd "C:\duong-dan\Jielien"
git status --short
git pull --ff-only origin main
npm run local:start
```

Nếu Git báo conflict, thay đổi local hoặc không thể fast-forward, giữ nguyên các tệp đang có và xử lý thông báo trước khi chạy bản mới. Không dùng reset hoặc xóa thư mục `data` để giải quyết việc cập nhật.

`local:start` tự tạo `.env.local` một lần, giữ lại file này ở các lần chạy sau, build image từ source hiện tại và đợi hai dịch vụ khỏe. Lần đầu có thể mất thời gian tải image/dependency. Sau khi lệnh thành công, mở:

- Trang chủ: **http://localhost:3001**
- Đăng ký/đăng nhập: **http://localhost:3001/tai-khoan**
- Giỏ hàng: **http://localhost:3001/gio-hang**
- Quản trị: **http://localhost:3001/quan-tri**
- Kiểm tra backend: **http://localhost:3001/api/health** — JSON cần có `status: "ok"`, `database: "postgresql"`.

Nhấn **Ctrl+Shift+R** nếu trình duyệt còn giữ giao diện cũ. Địa chỉ `localhost:3000` không phải bản vừa chạy. Nút đăng ký nhận bản tin của giao diện demo cũ không phải trang tạo tài khoản.

## Các lệnh vận hành local

| Lệnh | Tác dụng |
| --- | --- |
| `npm run local:init` | Chỉ tạo `.env.local` nếu chưa có; giữ cấu hình đã tồn tại |
| `npm run local:start` | Khởi tạo nếu cần, build source hiện tại và chạy app/database |
| `npm run local:status` | Xem trạng thái container |
| `npm run local:logs` | Theo dõi log gần nhất; Ctrl+C chỉ thoát việc xem log |
| `npm run local:admin` | Tạo quản trị qua terminal tương tác |
| `npm run local:stop` | Dừng local, giữ database volume và tệp dữ liệu |

Khi tạo quản trị, nhập email, số điện thoại và mật khẩu do bạn chọn; mật khẩu không hiển thị khi gõ. Tài khoản khách không tự trở thành quản trị và không có tài khoản/mật khẩu quản trị mặc định.

## Bật chuyển khoản / VietQR trên máy bạn

Cấu hình nhận tiền trong cloud không tự xuất hiện trong Git hoặc máy cá nhân. `.env.local` đã được Git ignore. Lần khởi tạo đầu, helper chỉ chép thông tin nhận tiền đầy đủ, hợp lệ từ biến môi trường hoặc `.env` đang có; nếu thiếu, cả nhóm sẽ để trống và chuyển khoản bị tắt.

Mở `.env.local`, giữ nguyên hai dòng database đã tạo, điền đủ bốn dòng sau bằng thông tin nhận tiền của bạn:

```dotenv
BANK_BIN=
BANK_NAME=
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
```

Tên ngân hàng/chủ tài khoản có khoảng trắng có thể đặt trong dấu nháy. Không nhập mật khẩu ngân hàng, mã OTP hoặc thông tin đăng nhập. Sau khi lưu, chạy lại:

```powershell
npm run local:start
```

Thông tin nhận tiền được lưu snapshot khi tạo đơn. Thay cấu hình không sửa ngân hàng/nội dung của đơn đã tạo. QR tạo cục bộ; quét QR hoặc bấm cập nhật không tự xác nhận đã nhận tiền. Nhân viên có quyền cần kiểm tra ngân hàng rồi xác nhận trong quản trị.

## Giữ dữ liệu và cấu hình

PostgreSQL Docker lưu trong named volume của project `jielien-local`. Lệnh stop dùng `docker compose down` và **không xóa volume**. Không chạy `down -v`, xóa volume trong Docker Desktop hoặc đổi mật khẩu database trong `.env.local` sau khi đã khởi tạo. Thay mật khẩu trong file không đổi mật khẩu role PostgreSQL đã tồn tại và có thể làm app mất kết nối.

Giữ `.env.local` cùng với bản sao lưu database; không commit hoặc gửi toàn bộ file này qua chat. File `.env` native vẫn nguyên vẹn. Container app dùng `LOCAL_DATABASE_URL` từ `.env.local` để kết nối service `db`, nên đường dẫn Unix socket của môi trường cloud trong `.env` không được dùng bên trong Docker.

Thư mục `data` của repo được gắn đọc/ghi vào `/app/data`, giữ SQLite cũ và các backup. Khi khởi động, ứng dụng có thể nhập `data/store.sqlite` vào **database Docker mới** và tạo backup trước khi nhập; file SQLite không bị xóa. Nếu hệ thống cũ vẫn đang ghi đơn vào SQLite đó, hãy dừng đúng hệ thống ghi dữ liệu trong lúc chuyển đổi, không tự dừng dịch vụ ở cổng 3000 chỉ vì cổng trùng với bản demo.

Database PostgreSQL đã có ở máy bạn hoặc trong cloud là database riêng; Docker local không tự chuyển dữ liệu từ những database này. Sao lưu trước khi chuyển môi trường. Muốn giữ dữ liệu PG cũ cần quy trình dump/restore phù hợp, không seed/reset để thay thế. Marker nhập SQLite có lưu đường dẫn nguồn; không đổi đường dẫn rồi cố nhập lại vào một PG đã có đơn. Khi app từ chối nhập để bảo vệ dữ liệu, giữ nguyên dữ liệu và xem log để xử lý đúng nguồn.

## Khi chưa mở được trang

Nếu báo không tìm thấy Docker hoặc không kết nối Engine, mở Docker Desktop và đợi Engine sẵn sàng rồi chạy lại `local:start`.

Nếu cổng **3001** đang được dùng, PowerShell có thể xem PID đang lắng nghe:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Xác định ứng dụng sở hữu PID trước khi quyết định xử lý. Các lệnh local không tự dừng tiến trình host và không chiếm cổng 3000.

Nếu app chưa khỏe, xem `npm run local:status` và `npm run local:logs`. Lỗi xác thực database sau khi sửa `.env.local` thường cần khôi phục đúng mật khẩu đã dùng khi tạo volume, không xóa volume. Nếu `/api/health` trả 404 hoặc trang chỉ báo demo chưa kết nối, kiểm tra lại địa chỉ cổng 3001 và thư mục repo/commit đang chạy.

Hướng dẫn này mô tả quy trình chạy local; kết quả chạy trong cloud không chứng minh dịch vụ đã khởi động trên máy Windows của bạn.
