# Chạy bản demo Jielien trên Windows

Cài Git, Node.js 24.11 trở lên và Docker Desktop (Linux containers). Mở Docker Desktop trước. PostgreSQL và Node chạy trong container; không cần tự cài PostgreSQL.

## Cập nhật bản cũ

Mở PowerShell:

```powershell
cd D:\SuperNet\Jielien
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
npm run local:start
npm run local:status
```

Nếu `git status` có file sửa, giữ công việc đó bằng commit riêng hoặc `git stash push -m "local changes before demo update"` rồi mới chuyển nhánh. Không ghi đè `.env.local`. Nếu trước đây theo nhánh feature đã bị xóa, chuyển sang `main` như trên. Nếu Git báo dubious ownership, thêm ngoại lệ **chỉ cho thư mục tin cậy** rồi chạy lại:

```powershell
git config --global --add safe.directory D:/SuperNet/Jielien
```

Lần đầu cài ở máy mới:

```powershell
git clone https://github.com/supernetec01/Jielien.git
cd Jielien
npm run local:start
```

`local:start` tự tạo `.env.local` nếu thiếu và build phiên bản mới. Không cần `npm install` để chạy Docker. Với bản đang dùng, giữ file cấu hình và volume cũ; không cần xóa/reset database để xem giao diện mới. App tự áp dụng migration còn thiếu. Lần nâng cấp giao diện này không thêm migration.

- Website: http://localhost:3001
- Tài khoản: http://localhost:3001/tai-khoan
- Admin: http://localhost:3001/quan-tri

Nếu vẫn thấy giao diện cũ sau rebuild, nhấn Ctrl+F5. Kiểm tra lỗi bằng `npm run local:logs`.

## Tạo Admin và nhân viên

```powershell
npm run local:admin
```

Nhập username `admin`, email, điện thoại Việt Nam hợp lệ và mật khẩu riêng tối thiểu 10 ký tự. Mỗi câu hỏi nhập một dòng; mật khẩu được ẩn khi gõ. Không có tài khoản/mật khẩu cài sẵn. Nếu đã có Admin, dùng tài khoản đó. Vào Admin → Tài khoản & Phân quyền → Tạo nhân viên. Admin tạo nhân viên nội bộ; khách tự đăng ký ở trang tài khoản. Khách và nhân viên chưa được cấp quyền quản trị không thấy liên kết Admin.

## Cho đồng nghiệp xem qua LAN

Trong `.env.local`, sửa hoặc thêm đúng một dòng cho mỗi biến:

```dotenv
JIELIEN_BIND_IP=0.0.0.0
JIELIEN_PORT=3001
```

```powershell
npm run local:start
npm run local:status
ipconfig
```

Kết quả phải có `0.0.0.0:3001->3001/tcp`. Dùng IPv4 của card mạng đang kết nối công ty. Đồng nghiệp mở `http://IP-MAY-CHU:3001`, ví dụ `http://192.168.1.20:3001`. Tất cả dùng cùng PostgreSQL trên máy chủ; không clone/chạy database riêng ở từng máy.

Nếu cần, mở PowerShell bằng quyền Administrator và tạo rule cho mạng Private:

```powershell
New-NetFirewallRule -DisplayName "Jielien LAN 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private -RemoteAddress LocalSubnet
```

Máy chủ phải bật, Docker chạy và không sleep. Không cần mở cổng PostgreSQL hoặc port-forward router.

## Dừng và kiểm thử

```powershell
npm run local:stop
```

Lệnh dừng giữ dữ liệu. Backup tùy nhu cầu demo: `npm run db:backup`. Hướng dẫn backup/restore đầy đủ nằm ở [COMMERCE_WINDOWS.md](COMMERCE_WINDOWS.md).

Kiểm thử phát triển cần `npm ci`, PostgreSQL test riêng và `DATABASE_URL` tương ứng; `npm test` tạo schema tạm. Các test trình duyệt cần Chrome/Chromium và biến `CHROMIUM_PATH` trỏ đến file thực thi. Không chạy script `db:local` (bash/cloud) trong PowerShell.

Các chức năng thanh toán/vận chuyển chưa tích hợp nhà cung cấp thật vẫn có giới hạn nêu tại [COMMERCE_RELEASE.md](COMMERCE_RELEASE.md). Đây là bản demo hoạt động với backend, không phải xác nhận sẵn sàng vận hành thương mại.
