# JIELIEN INTERNATIONAL — UI/UX Redesign Implementation Specification

**Dành cho Codex — triển khai trực tiếp trong repository** `https://github.com/supernetec01/Jielien.git`  
**Nhánh gốc:** `main` (hãy đọc source hiện tại trước khi sửa; nên tạo nhánh `feat/jielien-brand-redesign`)  
**Mục tiêu:** Hoàn thiện giao diện website bán hàng mẹ & bé + tài khoản + quản trị, thống nhất nhận diện **JIELIEN INTERNATIONAL** lấy từ ảnh logo do chủ dự án cung cấp. **Đây là yêu cầu triển khai CODE, không phải chỉ báo cáo/đề xuất/mockup.**

## A. Phạm vi, nguyên tắc bắt buộc

1. **Chỉ sửa phần giao diện, tài nguyên hình ảnh, HTML/CSS và JavaScript render giao diện khi cần.** Không tự ý sửa business logic, schema, migration, API contract, dữ liệu seed, xác thực, quyền, cổng thanh toán, tồn kho, đơn hàng, Docker hoặc thông tin bí mật.
2. Giữ nguyên tất cả luồng hoạt động: xem sản phẩm, tìm kiếm/bộ lọc, SKU, giỏ hàng, checkout COD/chuyển khoản, đăng ký/đăng nhập, thông tin tài khoản, địa chỉ, quản trị SKU, đơn hàng, tồn kho, nhật ký. **Không làm mất phần tử `id`, `data-*`, route và hook DOM đang được các file JavaScript sử dụng.** Nếu thay HTML bắt buộc, cập nhật logic tương thích và test.
3. **Không reset/xóa/seed lại PostgreSQL**; không chạy `docker compose down -v`, không sửa file `.env.local`, không hardcode thông tin thật, không nâng quyền, không tạo admin mặc định.
4. Không đổi tên các đường dẫn công khai (`/`, `/san-pham`, `/san-pham/:slug`, `/gio-hang`, `/thanh-toan`, `/tai-khoan`, `/quan-tri`, `/tra-cuu-don-hang`, các trang phụ tương ứng). Không chuyển framework, không thêm thư viện UI nặng nếu không cần; giữ HTML/CSS/JS thuần theo kiến trúc repo.
5. Mục tiêu kết quả **được code và test chạy thật**, có ảnh chụp trước/sau hoặc ít nhất ảnh chụp sau trên desktop và mobile. Không dừng ở việc chỉnh 5–10 biến màu. Không dùng ảnh stock để làm logo.
6. Hiện website thuộc ngành **mẹ & bé**: giữ danh mục, nội dung và hành vi thương mại điện tử; **nhận diện doanh nghiệp** là JIELIEN INTERNATIONAL. Không ép toàn bộ nội dung thành website giới thiệu công ty thuần túy.
7. Nếu tính năng giao diện đang placeholder/dữ liệu minh họa, giữ đúng phạm vi và không mô tả sai là đã kết nối thực tế.

## B. Tài nguyên thương hiệu và xử lý logo

**Tài nguyên chính thức kèm theo gói:** `assets/JIELIEN_logo_original.jpg` (ảnh JPG gốc 645×643 do chủ dự án đưa). Logo gồm chữ cách điệu **JL** màu xanh lá và navy, tên **JIELIEN** xanh lá và dòng chữ **INTERNATIONAL** xám.

Yêu cầu xử lý:

- Copy file nguồn vào repo tại `public/assets/brand/jielien-logo-original.jpg` (hoặc đường dẫn đồng nhất khác). Tạo thư mục `public/assets/brand/`.
- Tạo **logo ngang dùng trong header** từ nguồn ảnh thật, crop bỏ khoảng trắng lớn; nếu chuyển nền trong suốt thì thực hiện xử lý cẩn thận, giữ nguyên đường nét/độ dày/chữ của logo. **Không tự vẽ lại symbol khác, không viết chữ “JL” thay cho logo chính thức khi sản phẩm đã bàn giao.**
- Tạo thêm bản sử dụng trên nền sáng/nền tối và favicon từ biểu tượng JL, nhưng chỉ khi bảo toàn hình dạng từ ảnh thật. Nếu không thể tạo vector chất lượng chính xác, dùng PNG/WebP tối ưu thay vì dựng SVG sai khác; ghi rõ giới hạn nguồn JPG.
- Giữ tỷ lệ hình, không kéo giãn, không đổ bóng sặc sỡ, không gắn gradient vào logo. Bố trí logo để chữ đọc được trên desktop lẫn mobile.
- Chèn logo thực vào header storefront, trang tài khoản, trang quản trị và footer; thêm `alt="Jielien International"`/nhãn truy cập thích hợp. Favicon và `theme-color` cũng theo thương hiệu.
- Logo gốc không được tự tải lên dịch vụ ngoài; không commit phiên bản nguồn có thêm thông tin không mong muốn.

## C. Hướng thiết kế phải áp dụng

**Tên concept:** JIELIEN — Fresh & Trust  
**Phong cách:** Modern / Clean / Premium / Trustworthy, tối giản vừa đủ, hình sản phẩm rõ, nhiều khoảng trắng, màu doanh nghiệp nhất quán. Không dùng kiểu pastel hồng cũ, không giống trang demo trẻ con, nhưng vẫn thân thiện với nhóm mẹ & bé.

### Design tokens (đặt ở `public/brand.css` hoặc file token dùng chung)

| Token | Giá trị khởi tạo | Sử dụng |
|---|---|---|
| `--brand-green` | `#86B529` | Nút CTA chính (chữ navy), điểm nhấn, icon |
| `--brand-green-hover` | `#739C21` | Hover CTA |
| `--brand-navy` | `#0B1B34` | Header, sidebar admin, tiêu đề, footer |
| `--brand-navy-soft` | `#1D304C` | Hover, khối nền navy phụ |
| `--brand-green-light` | `#F2F7E6` | Background vùng nhấn, thẻ khuyến mãi |
| `--page-bg` | `#F7F9FC` | Background toàn trang |
| `--surface` | `#FFFFFF` | Card, form, bảng, modal |
| `--text-primary` | `#0B1B34` | Văn bản chính |
| `--text-secondary` | `#64748B` | Văn bản phụ |
| `--border-color` | `#E3E9EE` | Viền, phân cách |
| `--danger` | `#C62828` | Lỗi, hủy, thao tác phá hủy (không thay bằng xanh) |
| `--warning` | `#A8610A` | Trạng thái cần chú ý |
| `--success` | `#18794E` | Hoàn tất/đã thanh toán (phân biệt xanh thương hiệu) |
| `--radius-card` | `16px` | Thẻ thông tin |
| `--radius-control` | `10px` | Button, input |
| `--shadow-card` | `0 8px 24px rgba(11,27,52,.06)` | Nổi khối nhẹ |

**Lưu ý màu:** Mã màu khởi tạo lấy xấp xỉ từ ảnh JPG, có thể tinh chỉnh rất nhẹ để bảo đảm tương phản. **Chữ trên nút xanh lá phải là navy, không phải trắng** (trắng trên #86B529 tương phản không đủ). Dùng tỷ lệ thẩm mỹ khoảng 70% trắng/xám nhạt, 20% navy, 10% xanh thương hiệu, không cố phủ toàn site bằng xanh lá.

### Typography & spacing

- Font hệ thống ưu tiên `system-ui, "Segoe UI", Arial, sans-serif` (hiển thị tiếng Việt tốt). Không dùng font ngoại tuyến bắt buộc hay CDN không kiểm soát.
- H1 desktop ~32–40px; mobile ~26–30px; H2 ~22–28px; body 14–16px, line height 1.5–1.65. Giá tiền nổi bật bằng weight/size, **không dựa vào màu đỏ hồng cũ**.
- Nhịp spacing 4/8/12/16/24/32/48/64px. Vùng nội dung desktop khoảng 1200–1280px, mobile padding 16px.
- Card bo 12–16px; hình sản phẩm thống nhất tỷ lệ; shadow mảnh; hover tinh tế dưới 200ms; giảm motion với `prefers-reduced-motion`.
- Tương phản WCAG AA: chữ thường ≥4.5:1, chữ lớn và thành phần UI ≥3:1, focus visible rõ; nhấn nút ít nhất khoảng 44×44 CSS px trên điện thoại.

## D. Giao diện cần triển khai chi tiết

### D1. Shell thương mại điện tử, áp dụng tất cả trang storefront

- **Promo top bar:** thanh mảnh navy hoặc green-light, mã khuyến mãi còn hiệu lực hiển thị rõ, tránh toàn bộ nền hồng. Không tự ý thay mã khuyến mãi/backend.
- **Header desktop:** logo JIELIEN thực ở trái, tìm kiếm lớn ở giữa (nút/icon tìm kiếm rõ), tài khoản/tra cứu/giỏ hàng bên phải; header background trắng hoặc navy có thể phân tầng, đảm bảo logo đủ tương phản. Sticky không che nội dung.
- **Category navigation:** xanh lá nhấn trạng thái active, nền trắng/green-light; rõ phân cấp danh mục, trạng thái hover/focus, dropdown.
- **Header mobile:** logo rõ, nút menu, search, giỏ; menu trượt/collapse không tràn màn hình, không che CTA checkout; tính năng tìm kiếm gợi ý giữ hoạt động.
- **Footer:** nền navy, logo, các vùng link chính sách/hỗ trợ/danh mục, text đọc được; không thêm thông tin liên hệ công ty hoặc chính sách giả.
- **Empty/loading/error/success:** thiết kế đồng bộ, nhãn tiếng Việt dễ hiểu; không làm biến mất cảnh báo hệ thống.

### D2. Trang chủ `/`

- Hero hiện đại 2 vùng: thông điệp mẹ & bé và CTA bên trái, ảnh minh họa sản phẩm hiện có bên phải hoặc layout tương đương. Navy dùng cho tiêu đề, xanh lá làm CTA, nền trắng/green-light. Không thêm thông tin sản phẩm/ưu đãi không đúng dữ liệu hiện tại.
- Danh mục nổi bật dạng card hình ảnh/icon thống nhất; sản phẩm bán chạy/nổi bật với thẻ giá, giảm giá, tồn kho, CTA; section hướng dẫn/ưu điểm/khuyến mãi chỉ sử dụng logic dữ liệu hiện có.
- Chuyển các banner hồng hiện tại sang ngôn ngữ hình ảnh và màu mới; nếu tài nguyên SVG demo cũ lệch nhận diện, chỉnh style/color không làm hỏng nội dung.
- Responsive desktop/tablet/mobile, không horizontal overflow.

### D3. Danh sách `/san-pham`, danh mục, chi tiết `/san-pham/:slug`

- Desktop: bộ lọc ở sidebar/top tùy kích thước, sản phẩm 3–4 cột tùy viewport; mobile 2 cột khi đủ rộng, trường hợp quá nhỏ 1 cột hoặc 2 cột hợp lý.
- Card ảnh có vùng nền trắng, chiều cao ảnh đồng nhất, tên tối đa 2–3 dòng, giá hiện rõ, giá gạch ngang, badge khuyến mãi đủ tương phản; hover/focus.
- Chi tiết sản phẩm: gallery rõ, chọn SKU, giá/tồn/quantity/CTA; preserve JS state, cập nhật giá và tình trạng SKU; không tự thêm review/ratings giả.
- Bộ lọc/URL query/giỏ/tìm kiếm/sắp xếp vẫn hoạt động như trước.

### D4. Giỏ hàng, thanh toán, tra cứu đơn

- Giỏ: layout hai cột desktop (item + order summary), một cột mobile; nút +/- và remove dễ thao tác, subtotal, discount, shipping, total rõ.
- Checkout: trường nhập, validation, địa chỉ, COD/VietQR, xác nhận và loading; **không thay cách tính tiền/khuyến mãi ở server**. Mã QR không bị méo/tràn mobile.
- Tra cứu đơn: trạng thái đủ rõ, không chỉ dựa vào màu; các hộp thông báo không nhấn màu xanh lá cho lỗi.

### D5. Tài khoản `/tai-khoan`

- Logo và header đầy đủ brand; form đăng nhập/đăng ký trên card sạch, label và lỗi xác thực rõ; tab/focus/keyboard hoàn chỉnh.
- Hồ sơ, đổi mật khẩu, sổ địa chỉ, đơn hàng của tôi; mỗi thẻ/biểu mẫu/notification/modal dùng chung tokens.
- Không sửa `account.js` trừ khi cần điều chỉnh render markup/style hooks, khi sửa phải giữ API/CSRF/session.

### D6. Trang quản trị `/quan-tri`

- Sidebar **navy** desktop, logo thực ở đầu, active link dùng xanh lá hoặc green-light đủ contrast, label rõ, không che scroll; trên mobile là menu toggle/collapse dễ dùng.
- Header admin gọn: tên module/người dùng/xem website. Nền nội dung `--page-bg`, các bảng/card trắng.
- Dashboard: thẻ KPI đơn hàng/doanh thu/sản phẩm/cảnh báo tồn thấp, typography dễ đọc và không để tràn số liệu. Không tạo số liệu giả/charts ảo.
- Sản phẩm & SKU: filter/search, bảng responsive (trên mobile có horizontal scroll có chủ đích hoặc card layout), nút sửa; form dialog có focus, kích thước phù hợp.
- Đơn hàng: nhãn trạng thái có text, nút hành động rõ cấp độ, cảnh báo khi xác nhận/đổi trạng thái; các trạng thái danger/warning/success dùng semantic color, **không dùng chung màu xanh brand**.
- Kho: số lượng, reserved/available, form điều chỉnh cần lý do, hiển thị lỗi/không đủ tồn; audit log có thể đọc.
- Không làm lộ chức năng khi user không có permission; các điều kiện permission trong `public/admin.js` phải được giữ nguyên.

### D7. Các trang/nhóm phụ

- Danh mục, kết quả tìm kiếm, đơn hàng chi tiết, yêu thích, bài viết, chính sách, loading/toast/dialog và nội dung render từ `public/app.js` đều cần soát giao diện.
- Chỉnh `meta[name="theme-color"]` từ hồng sang navy cho `index.html`, `account.html`, `admin.html`; cập nhật favicon.

## E. File cần đọc/sửa (mapping theo repo thực tế)

**Đã xác minh repo có các file chính:**

```text
public/index.html        # storefront shell, promo, navigation, logo, metadata
public/style.css         # storefront CSS, hiện :root --pink:#ed1164
public/app.js            # render các route và component động
public/account.html      # trang tài khoản, CSS management
public/account.js        # render account/profile/address/order
public/admin.html        # trang quản trị, CSS management
public/admin.js          # dashboard, SKU, orders, inventory, audit
public/management.css    # CSS quản trị và tài khoản, hiện :root --pink:#ed1164
public/assets/          # SVG demo và tài nguyên tĩnh
public/catalog.json      # dữ liệu danh mục minh họa: không sửa vì đổi giao diện
server.mjs               # backend: không sửa vì đổi giao diện
```

**Đề xuất tạo thêm:**

```text
public/brand.css                   # design tokens + primitives dùng chung
public/assets/brand/              # logo/favicon/banner asset đã tối ưu
/docs/BRAND_UI_GUIDE.md            # hướng dẫn thêm màn hình sau này
```

- Cần import `brand.css` **trước** stylesheet từng nhóm, giải quyết xung đột giữa CSS cũ và CSS mới. Được phép refactor nhẹ CSS để thay references `var(--pink)` bằng semantic tokens, nhưng tránh global replace mù quáng (vì màu danger/sale/success cần khác nhau).
- Kiểm tra các màu HEX hardcoded xuyên suốt `style.css`, `management.css`, HTML, `app.js`, `account.js`, `admin.js` và các asset; không chỉ sửa `:root`.
- Các class/selectors của `data-link`, `id="search"`, `id="main"`, `id="admin-main"`, `.logo`, `.management-logo`, button/dialog, data attributes đang được JS query phải hoạt động bình thường.

## F. Quy trình thực hiện theo commit/PR

**Phase 0 — Baseline:** pull nhánh gốc mới nhất, `git status`, đọc README/tests, ghi lại chức năng và ảnh chụp các route chính; chạy baseline tests nếu môi trường cho phép. Đọc logo gốc trong package, rà màu cũ.

**Phase 1 — Foundation:** assets logo/favicon đã tối ưu, tạo `brand.css`, màu semantic, typography/spacing/control/button/badge/panel/modal, meta theme-color. Commit `feat(ui): add Jielien brand system`.

**Phase 2 — Storefront:** refactor `index.html`, `style.css`, các UI render `app.js` của home/category/product/cart/checkout/lookup, responsive và state. Commit `feat(ui): redesign storefront`.

**Phase 3 — Account/Admin:** refactor `account.html`, `admin.html`, `management.css`, UI động account/admin, iconography, sidebar/table/dialog. Commit `feat(ui): redesign account and management`.

**Phase 4 — QA:** visual regression/baseline screenshots, manual smoke tests, automated tests khả dụng, contrast + keyboard + mobile, sửa lỗi; tạo docs ngắn. Commit `test(ui): verify responsive Jielien redesign`.

Không làm một commit khổng lồ nếu có thể chia giai đoạn; không push trực tiếp main nếu quy trình dự án có branch/PR.

## G. Tiêu chí nghiệm thu bắt buộc

1. Logo thật (không phải chữ JL vẽ thay) xuất hiện rõ ở storefront/header/footer, account, admin và favicon; không bị kéo giãn hoặc viền trắng thừa khó chịu.
2. Không còn theme hồng `#ed1164`, `#c40a4e`, `#fff0f5` ở các thành phần chính; các sắc màu hồng khác chỉ còn nếu chúng thật sự là hình sản phẩm/ảnh không thể sửa.
3. CSS brand tokens áp dụng thống nhất trên các trang và trạng thái nút/table/dialog; không mất semantic color danger/success/warning.
4. Kiểm tra giao diện tại viewport `1440×900`, `1024×768`, `768×1024`, `390×844`, `375×812` và tốt nhất cả 320px; không vỡ layout/scroll ngang ngoài vùng bảng có chủ đích.
5. Navbar, tìm kiếm/suggest, bộ lọc, SKU, thêm/sửa/xóa giỏ, checkout, đăng nhập/đăng ký, account, tất cả hành động admin vẫn hoạt động.
6. Màn hình loading/empty/error/validation/toast/dialog có kiểu hiển thị thống nhất; tab, focus, disabled, hover rõ.
7. Không có thay đổi DB/migration/backend API hoặc file secrets; không mất dữ liệu người dùng/đơn/kho.
8. Nếu có kiểm thử trình duyệt: ghi link screenshot hoặc lưu ảnh vào artifacts của CI/PR; kiểm tra kích thước viewport và trường hợp user chưa/đã đăng nhập.
9. Các script kiểm thử trong `package.json` (`npm test`, `npm run test:browser`, `npm run test:management`, `npm run test:account`, `npm run test:bank`) chạy được trong môi trường đủ điều kiện; nếu môi trường thiếu PostgreSQL/Chromium, báo rõ chưa chạy được, **không khẳng định đã pass**.
10. Bàn giao danh sách file thay đổi, hình ảnh so sánh, kết quả kiểm thử, điểm còn hạn chế, hướng dẫn cập nhật app Docker Windows mà không làm hỏng dữ liệu.

## H. Phần ngoài phạm vi — không tự ý làm

- Không đổi database, điều chỉnh giá thật, thêm sản phẩm/hàng tồn, làm lại hệ thống bán hàng, sửa thuật toán giá/VietQR, cấp quyền user, mở LAN/deploy domain, viết lại bằng React/Vue, thay đổi cổng, sửa login, tích hợp API mới.
- Không tạo thông tin đánh giá 5 sao, chứng nhận, số lượng mua, hotline/chính sách, banner khuyến mãi giả để trang trông hấp dẫn.
- Nếu đang có nhánh tác vụ LAN/phân quyền song song, phải tách branch và tránh ghi đè code của tác vụ đó.

## I. Mẫu báo cáo Codex sau khi triển khai

```text
1. Branch / commit / PR:
2. File được sửa/tạo:
3. Kết quả brand/logo/theme:
4. Các màn hình đã hoàn thành:
5. Responsive: 1440/1024/768/390/375 (mô tả)
6. Kiểm thử: lệnh, pass/fail, lý do chưa chạy (nếu có)
7. Screenshots: đường dẫn đến ảnh/artifacts
8. Có thay đổi API/database/data không? (phải là KHÔNG)
9. Các lỗi hoặc hạn chế còn lại:
10. Cách cập nhật từ repo về Windows Docker mà không reset dữ liệu:
```
