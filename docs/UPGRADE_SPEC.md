# JIELIEN — ĐẶC TẢ NÂNG CẤP GIAO DIỆN VÀ CHỨC NĂNG (dành cho Codex)

Tài liệu này mô tả chi tiết các thay đổi cần làm trên repo Jielien, dựa trên bản review source code và ảnh chụp giao diện. Đặt file này vào `docs/UPGRADE_SPEC.md` rồi giao cho Codex làm theo từng giai đoạn.

---

## 0. PROMPT MỞ ĐẦU (dán vào Codex)

```
Đọc AGENTS.md, README.md, docs/COMMERCE_RELEASE.md và docs/UPGRADE_SPEC.md.
Thực hiện nâng cấp theo docs/UPGRADE_SPEC.md, CHỈ làm giai đoạn tôi chỉ định
(ví dụ: "Giai đoạn 1, các task S1 đến S9").
Quy tắc: làm từng task một, mỗi task một commit riêng, đúng tiêu chí nghiệm thu
của task đó. Không viết lại toàn bộ file. Không giả lập tích hợp bên ngoài.
Nếu thiếu thông tin chủ shop (mục 9), để trống hoặc ẩn tính năng, tuyệt đối
không tự bịa số điện thoại, chính sách, đánh giá hay số liệu.
Sau mỗi task: chạy test liên quan, chụp ảnh ở 320/375/768/1440/1920px, xem ảnh,
rồi báo cáo file đã sửa, hành vi mới, test đã chạy và giới hạn còn lại.
```

---

## 1. BỐI CẢNH VÀ MỤC TIÊU

- Website bán hàng mẹ và bé, Node.js thuần (ES modules), PostgreSQL 17, giao diện render bằng template string trong JavaScript, chạy Docker.
- **Ưu tiên số 1: khách mua hàng nhanh, ít bước, ít nhầm.** Mọi thay đổi phải trả lời được: "Việc này giúp khách mua dễ hơn hay cản trở?"
- Ưu tiên số 2: trang quản trị giúp chủ shop xem nhanh đơn hàng, tồn kho theo SKU, báo cáo.
- Ưu tiên số 3: giao diện đẹp, đồng bộ, chuyên nghiệp, tạo niềm tin. Số 4: hiệu ứng tinh tế, có mục đích, không làm chậm.

### Bản đồ file chính

| Việc | File |
|---|---|
| Khung trang cửa hàng (header, footer, menu dưới điện thoại) | `public/index.html` |
| Logic và render cửa hàng (trang chủ, danh sách, chi tiết, giỏ, thanh toán) | `public/app.js` |
| Trang tin tức, bài viết, trang chính sách (render phía server) | `lib/seo.mjs` |
| CSS cửa hàng | `public/brand.css`, `public/style.css`, `public/storefront.css` |
| Quản trị: render | `public/admin.js`, `public/commerce-admin.js`, `public/admin.html` |
| Quản trị: CSS | `public/management.css` (cấu trúc), `public/admin-workspace.css` (giao diện) |
| Icon SVG cục bộ | `public/ui-icons.js` |
| Báo giá, đơn, kho, thanh toán (logic và SQL) | `db/store.mjs` |
| API và định tuyến | `server.mjs`, `lib/commerce-routes.mjs` |
| Cài đặt công ty, banner, mã giảm giá | `lib/operations.mjs` |
| Migration | `db/migrations/` (001 đến 012 bất biến) |

Số dòng ghi trong tài liệu chỉ để định vị, có thể đã lệch. Luôn đọc lại code trước khi sửa.

---

## 2. QUY TẮC BẮT BUỘC

1. Tuân thủ `AGENTS.md`: sửa component hiện có thay vì chồng thêm CSS override trùng selector; style admin trong `admin-workspace.css`, style cửa hàng trong `storefront.css`; chữ nhập liệu admin tối thiểu 14px, nút tối thiểu 40px; icon dùng SVG cục bộ, không phụ thuộc font.
2. **Không đổi migration 001 đến 012.** Thay đổi cơ sở dữ liệu chỉ qua migration mới `013_*.sql` trở đi, forward-only, có kiểm thử nâng cấp trên dữ liệu có sẵn (xem `tests/commerce-upgrade.test.mjs`).
3. Không reset database, không đổi mật khẩu, không đụng `.env*`, không commit bí mật hoặc dữ liệu khách. Test dùng schema tạm.
4. Giá, ưu đãi, phí ship, quyền hạn **luôn do server quyết định**. Client chỉ hiển thị.
5. **Không bịa dữ liệu**: không tạo số liệu giả cho biểu đồ, không tạo đánh giá giả, không hiện số điện thoại hay chính sách chưa được chủ shop cung cấp. Thiếu dữ liệu thì dùng trạng thái rỗng có hướng dẫn hoặc ẩn tính năng.
6. Không giả lập tích hợp ngoài (cổng thanh toán, vận chuyển, email). Chưa cấu hình thì tính năng bị tắt và hiển thị trung thực.
7. Mọi chữ hiển thị cho khách bằng tiếng Việt, ngôn ngữ của người mua hàng, không dùng thuật ngữ kỹ thuật ("máy chủ", "SKU", "database"...). Admin được dùng "SKU" nhưng không dùng ID nội bộ.
8. Mọi văn bản người dùng nhập khi hiển thị phải `escape()` như code hiện tại.
9. Mỗi thay đổi giao diện phải đạt: không tràn ngang ở 320/375/768/1440/1920px, vùng bấm cửa hàng tối thiểu 44x44px, focus bàn phím rõ, tương phản chữ tối thiểu 4,5:1 (chữ lớn 3:1), không chỉ dùng màu để truyền thông tin.
10. Kiểm tra trên trình duyệt thật rồi **xem ảnh chụp** (theo `AGENTS.md`); test pass không thay thế việc xem bố cục.

---

## 3. HỆ THỐNG THIẾT KẾ (làm đầu tiên, các task sau dùng chung)

Tạo khối biến CSS trong `public/brand.css` (dùng chung cửa hàng và admin). Thay dần các giá trị cứng trong `style.css`, `storefront.css`, `admin-workspace.css` bằng biến này khi sửa tới component đó. Không cần thay hàng loạt một lần.

```css
:root {
  /* Màu thương hiệu */
  --navy: #0B1B34;
  --green: #86B529;        /* CHỈ dùng làm nền nút/huy hiệu, chữ trên đó là navy (tương phản ~7:1) */
  --green-700: #5A7D0F;    /* chữ, link, viền nhấn trên nền trắng (~4,8:1) */
  --green-800: #476410;    /* hover của link/nút viền */
  --green-50: #F2F7E6;

  /* Màu nền và chữ */
  --bg: #F6F8FB;
  --surface: #FFFFFF;
  --text: #0B1B34;
  --text-muted: #55627A;   /* phải kiểm tra >= 4,5:1 trên --surface và --bg */
  --border: #E1E6EE;

  /* Màu trạng thái (kèm icon và chữ, không chỉ màu) */
  --success: #1E7B34;
  --warning: #B25E09;
  --danger:  #C0392B;
  --info:    #1D5FA8;

  /* Chữ */
  --font-heading: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --font-body: system-ui, -apple-system, "Segoe UI", "Noto Sans", Arial, sans-serif;
  --fs-12: .75rem; --fs-14: .875rem; --fs-16: 1rem; --fs-18: 1.125rem;
  --fs-20: 1.25rem; --fs-24: 1.5rem; --fs-32: 2rem; --fs-40: 2.5rem;
  --lh-body: 1.6; --lh-heading: 1.25;

  /* Khoảng cách (bội số 4/8) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

  /* Hình khối */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
  --shadow-1: 0 1px 2px rgba(11,27,52,.06);
  --shadow-2: 0 6px 18px rgba(11,27,52,.08);
  --shadow-3: 0 16px 40px rgba(11,27,52,.14);

  /* Chuyển động */
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --dur-fast: 150ms; --dur-base: 220ms; --dur-slow: 320ms;
}
```

Quy tắc dùng:

- **Phông chữ:** tiêu đề dùng `--font-heading` (Be Vietnam Pro, hỗ trợ tiếng Việt tốt, giấy phép OFL), nội dung dùng `--font-body`. Tối đa 2 họ chữ. Tự lưu file `.woff2` (subset latin và vietnamese) trong `public/fonts/`, khai báo `@font-face` với `font-display: swap`, preload font tiêu đề. Không tải từ CDN bên ngoài. Nếu Codex không tải được font do không có mạng, để fallback stack và ghi lại để chủ shop tải thủ công.
- **Cỡ chữ:** nội dung 16px trên điện thoại (admin dạng bảng 14px), tiêu đề `line-height` 1,25, nội dung 1,6, độ dài dòng văn bản 45 đến 75 ký tự.
- **Giá tiền:** `font-variant-numeric: tabular-nums`, đậm 700, màu `--navy`; giá gốc gạch ngang màu `--text-muted`; huy hiệu giảm giá nền `--danger` chữ trắng.
- **Một màu nút chính:** nút mua hàng (CTA) duy nhất là nền `--green` chữ `--navy`. Nút phụ là viền. Một màn hình không có hai nút xanh cạnh tranh nhau.
- Kiểm tra tương phản bằng một script nhỏ (tính tỷ lệ WCAG) cho các cặp màu chính, đưa kết quả vào báo cáo. Giá trị màu ở trên là đề xuất, nếu cặp nào không đạt thì chỉnh cho đạt chứ không bỏ qua.
- **Vấn đề hiện tại cần sửa:** `#86B529` đang bị dùng làm màu chữ link trên nền trắng (tương phản khoảng 2,4:1, không đạt). Chuyển sang `--green-700`.
- Tiêu đề section "ϟ SẢN PHẨM NỔI BẬT" đang in nghiêng, viết hoa, khác hẳn các tiêu đề còn lại: đưa về cùng kiểu với "Sữa & dinh dưỡng cho bé" (viết thường chuẩn, không nghiêng), icon bằng SVG.

---

## 4. HIỆU ỨNG VÀ VI TƯƠNG TÁC (áp dụng xuyên suốt)

Thêm một khối "Motion" trong `storefront.css` (cửa hàng) và `admin-workspace.css` (admin). Quy tắc chung:

- Chỉ animate `transform` và `opacity`. Thời lượng 150 đến 320ms, easing `--ease-out`. Ngoại lệ duy nhất: skeleton shimmer.
- Giữ và mở rộng khối `@media (prefers-reduced-motion: reduce)` đã có (`style.css` gần dòng 2271, `storefront.css` gần dòng 304): khi bật, tắt mọi hiệu ứng không thiết yếu (bay vào giỏ, shimmer, reveal, shake, count-up, tự chuyển banner).
- Không có hiệu ứng nào được che khuất hoặc làm chậm thao tác mua hàng. Nội dung phải hiển thị đầy đủ khi JavaScript lỗi.
- Không tự chạy nhấp nháy, không quá 3 lần chớp mỗi giây.

| Hiệu ứng | Chi tiết | Nơi dùng |
|---|---|---|
| Nút | hover nâng `translateY(-1px)` và đổ bóng, `:active` thu `scale(.98)`; `:focus-visible` viền 3px `--green-700`, cách 2px | toàn bộ |
| Thẻ sản phẩm | hover: ảnh `scale(1.04)` trong khung `overflow:hidden`, thẻ nâng nhẹ bằng `--shadow-2` | `.product-card` |
| Thêm vào giỏ | nút đổi thành "Đã thêm ✓" (icon SVG) khoảng 1,2 giây rồi trở lại; huy hiệu số lượng giỏ nảy `scale 1→1.25→1` trong 280ms; mini-cart trượt ra (task S6); tùy chọn: ảnh sản phẩm bay vào giỏ tối đa 450ms, chỉ máy tính và khi không bật reduced-motion | `addToCart` |
| Skeleton | thay dòng chữ "Đang chuẩn bị thế giới nhỏ cho bé…" bằng khung xám có shimmer đúng kích thước lưới sản phẩm, trang chi tiết, trang giỏ; giữ chỗ để CLS gần 0 | `render()` trong `app.js` |
| Xuất hiện khi cuộn | fade và trượt lên 12px, 300ms, chỉ một lần, chỉ các section dưới màn hình đầu của trang chủ, dùng `IntersectionObserver`; class chỉ thêm sau khi JS chạy để không ẩn nội dung khi JS lỗi | trang chủ |
| Thông báo (toast) | trượt lên và mờ dần vào/ra, 220ms; giữ `role="status"` | `toast()` |
| Lỗi form | ô sai rung ngang ±4px trong 240ms, viền `--danger`, thông báo lỗi ngay dưới ô, focus vào ô sai đầu tiên | checkout, tài khoản |
| Hộp thoại/ngăn kéo | mờ nền và trượt/phóng nhẹ 180 đến 260ms, có bẫy focus, Esc để đóng | mini-cart, dialog admin |
| Admin: số liệu | đếm tăng từ 0 trong 600ms, chỉ lần tải đầu, không chạy lại khi bấm "Làm mới" | dashboard |
| Admin: dòng bảng | hover đổi nền nhẹ; dòng vừa đổi trạng thái được tô sáng 1 giây | bảng đơn, kho |
| Banner trang chủ | tự chuyển mỗi 6 giây, **có nút tạm dừng**, tạm dừng khi rê chuột hoặc focus, hỗ trợ vuốt trên điện thoại, tắt tự chuyển khi reduced-motion | task S8 |

---

# GIAI ĐOẠN 1 — LÀM NGAY (trước khi mở bán)

Mục tiêu: bỏ dáng "bản thử nghiệm", tạo niềm tin, sửa các điểm cản trở mua hàng rõ nhất. Mỗi task nhỏ, làm độc lập, không cần migration (trừ S7 nếu cần cột mới).

## S1. Gỡ nhãn thử nghiệm và nội dung nhà phát triển

**Vấn đề:** khách nhìn thấy chữ "bản thử nghiệm", tên website khác, làm mất niềm tin.

**Vị trí cần sửa:**
- `public/index.html`: dòng thanh khuyến mãi trên cùng ("Jielien International · Sản phẩm và tin tức từ công ty"), thẻ `<span class="demo-tag">BẢN PHÁT TRIỂN · ĐẶT HÀNG THỬ</span>`, dòng "Không phải website chính thức của AVAKids", đoạn mô tả phương thức thanh toán ("Đơn tạo ở môi trường thử nghiệm, chưa chuyển đơn cho đơn vị vận chuyển"), đoạn "Website độc lập, dữ liệu và hình sản phẩm minh họa".
- `public/app.js`: hàng "Dữ liệu: Minh họa phục vụ phát triển website" trong `detailTab` (bảng thông số); đoạn `p.notice` "Sản phẩm, thương hiệu và giá ở đây là dữ liệu thử nghiệm. Chưa có đánh giá người mua thực tế."; chữ "Đây là đơn thử nghiệm, chưa được giao thực tế." trong ô đồng ý ở `checkoutPage`; nội dung trang "Giới thiệu" (khoảng dòng 500) nhắc đến việc xây dựng theo mô hình AVAKids.
- `lib/seo.mjs`: các trang chính sách/giới thiệu nếu còn nhắc nội dung trên.

**Yêu cầu:**
1. Xóa hoặc thay các chữ trên bằng nội dung thật. Chữ nào cần thông tin của chủ shop thì lấy từ cài đặt công ty (task S4) hoặc ẩn đi nếu chưa có.
2. Thanh khuyến mãi trên cùng: hiển thị thông điệp thật lấy từ cài đặt (ví dụ "Miễn phí giao hàng từ 499.000đ"), với con số lấy từ server (task S6). Không có dữ liệu thì ẩn thanh này.
3. Nếu chủ shop vẫn muốn chế độ thử nghiệm khi phát triển: cho phép bật bằng biến môi trường `DEMO_MODE=true` (mặc định tắt), công khai qua `/api/site`. Khi bật mới hiện nhãn thử nghiệm. Ghi biến này vào `.env.example`.
4. Cập nhật các test đang kiểm tra những chuỗi chữ cũ (`tests/browser.test.mjs`, `tests/commerce.browser.mjs`, `tests/bank-checkout.browser.mjs`...).

**Nghiệm thu:** tìm toàn repo (trừ `docs/`, `tests/`) không còn "AVAKids", "BẢN PHÁT TRIỂN", "ĐẶT HÀNG THỬ", "dữ liệu thử nghiệm", "minh họa phục vụ", "đơn thử nghiệm" khi `DEMO_MODE` tắt; ô đồng ý ở thanh toán vẫn bắt buộc như hiện tại nhưng nội dung đã sạch.

## S2. Thay toàn bộ icon ký tự Unicode bằng SVG

**Vấn đề:** header, thanh điều hướng điện thoại, giỏ hàng, nút yêu thích dùng ký tự (♙ ▤ ♡ ♧ ☰ ⌂ ▦ ϟ ♥ ↗). Mỗi máy/hệ điều hành vẽ một kiểu, có chỗ hiện ô vuông lỗi (thấy rõ ở admin: nút "Xem website", mục "Truy cập nhanh"). Menu admin dùng chung một icon hộp cho mọi mục.

**Yêu cầu:**
1. Mở rộng `public/ui-icons.js` (hiện có: grid, box, file, chart, settings, users, search, check, clock, arrow). Thêm đồng bộ cùng nét (stroke 1,7, bo tròn): `user`, `receipt` (đơn hàng), `heart`, `heart-filled`, `cart`, `menu`, `close`, `bolt`, `home`, `phone`, `chat`, `truck`, `shield`, `refresh`, `external`, `star`, `star-filled`, `plus`, `minus`, `trash`, `printer`, `download`, `alert`, `tag`, `warehouse`, `return`, `image`, `news`, `percent`, `log`. Hàm `icon(name, { size, className, label })`.
2. `index.html` là HTML tĩnh nên không import được module: nhúng một **SVG sprite** (`<svg hidden><symbol id="i-user">…`) ngay đầu `<body>` và dùng `<svg><use href="#i-user"></svg>`. Tạo sprite từ cùng nguồn với `ui-icons.js` để không lệch nhau (script nhỏ hoặc hàm dùng chung).
3. Thay trong: `index.html` (header, nút menu, giỏ, thanh dưới điện thoại, "ϟ Ưu đãi hôm nay"), `app.js` (nút yêu thích ở `card()`, tiêu đề section nổi bật, hộp trống `empty()`, checkout), `lib/seo.mjs` (header/footer SSR), `admin.js` và `commerce-admin.js` (ký tự `↗` ở `workspace-action`, nút "Xem website").
4. Admin: mỗi mục menu một icon riêng theo nghĩa (Tổng quan `grid`, Báo cáo `chart`, Đơn hàng `receipt`, Sản phẩm `box`, Kho `warehouse`, Đổi trả `return`, Mã giảm giá `percent`, Tin tức `news`, Thư viện ảnh `image`, Nhật ký `log`, Tài khoản `users`, Cài đặt `settings`...).
5. Icon trang trí có `aria-hidden="true"`; nút chỉ có icon phải có `aria-label` tiếng Việt.

**Nghiệm thu:** tìm trong `public/` và `lib/seo.mjs` không còn các ký tự trên dùng làm icon; chụp ảnh header/thanh dưới/admin không có ô vuông lỗi; kích thước icon 20 đến 24px, vùng bấm ≥ 44px.

## S3. Danh mục động và đồng bộ khung trang (menu, header, footer)

**Vấn đề:** menu chỉ ghi cứng 4 danh mục (`index.html`), trong khi `app.js` ghi cứng 7 (`const categories`, dòng 22) nên trang chủ có "Đồ dùng cho bé", "Đồ chơi", "Dành cho mẹ" mà menu thì không. Đồng thời trang SSR (`lib/seo.mjs`, tin tức/bài viết/chính sách) dùng header và footer đơn giản hơn hẳn trang chính, nhìn như hai website khác nhau.

**Yêu cầu:**
1. API `GET /api/categories` đã có. Dùng nó làm nguồn duy nhất cho: thanh menu, menu thả xuống `#category-dropdown` (`app.js` gần dòng 1270), ô danh mục trang chủ, bộ lọc trang danh sách.
2. Thanh menu hiển thị tối đa 6 danh mục cấp cao nhất (sắp xếp theo thứ tự cơ sở dữ liệu), cộng "Tin tức & Cẩm nang" và "Ưu đãi hôm nay". Ngăn kéo điện thoại hiển thị tất cả, có cấp con thụt vào.
3. Ảnh/icon danh mục: nếu danh mục có ảnh trong dữ liệu thì dùng; nếu không, dùng bảng ánh xạ slug → SVG hiện có làm dự phòng; không có thì dùng icon chung. Nếu gọi API lỗi, dùng danh sách tĩnh hiện tại làm dự phòng.
4. Tạo **một hàm dùng chung** trong `lib/seo.mjs` (ví dụ `siteShell({ body, ... })`) dựng header và footer giống `index.html` bằng HTML tĩnh (không phụ thuộc JS): logo, ô tìm kiếm dạng form GET tới `/san-pham?q=`, tài khoản, tra cứu đơn, giỏ, menu danh mục, footer đủ cột (hỗ trợ mua sắm, chính sách, liên hệ, thanh toán). Số lượng giỏ hàng trên trang SSR có thể được cập nhật nhẹ bằng một đoạn JS nhỏ đọc `localStorage` (không bắt buộc).
5. Giữ nguyên SEO: không làm mất HTML dựng sẵn, canonical, JSON-LD, breadcrumb hiện có.

**Nghiệm thu:** thêm một danh mục trong admin thì xuất hiện ở menu và trang chủ mà không sửa code; mở `/tin-tuc` và `/chinh-sach/doi-tra` thấy header/footer giống trang chủ; test SEO hiện có vẫn pass.

## S4. Liên hệ nhanh: Zalo, hotline, Messenger (cực kỳ quan trọng với hàng mẹ và bé)

**Vấn đề:** hoàn toàn chưa có (không có chữ "zalo", "hotline", "messenger" trong code). Khách mẹ và bé thường hỏi tư vấn trước khi mua.

**Yêu cầu:**
1. **Dữ liệu:** dùng cơ chế cài đặt công ty có sẵn (migration 008, danh sách khóa cho phép trong `lib/operations.mjs`, hiển thị ở `#company-contact` và admin "Thông tin công ty"). Thêm các khóa nếu chưa có: `hotline`, `zalo` (số hoặc link `zalo.me`), `messenger_url`, `working_hours`, `store_address`, `email_support`. Có kiểm tra định dạng (số điện thoại Việt Nam, URL https). Nếu cần khóa mới trong danh sách cho phép thì sửa code/migration hợp lệ, không sửa 008.
2. **Nút nổi** (`.contact-fab`): góc phải dưới, bấm mở một menu nhỏ với các kênh đã cấu hình (Gọi hotline `tel:`, Chat Zalo, Messenger). Chỉ hiện kênh có dữ liệu; không có kênh nào thì không hiện nút.
   - Điện thoại: đặt phía trên thanh điều hướng dưới (`bottom: calc(64px + env(safe-area-inset-bottom) + 12px)`), kích thước 48px; trên trang chi tiết sản phẩm phải nâng lên để không đè thanh mua cố định (S5).
   - Không che nút chính hoặc ô nhập.
3. **Header:** hiện hotline (icon `phone`) ở màn hình rộng; **trang chi tiết sản phẩm** có dòng "Cần tư vấn? Gọi/Chat Zalo" dưới nút mua; **footer** liệt kê đầy đủ thông tin liên hệ, giờ làm việc, địa chỉ.
4. Số điện thoại và link đều là phần tử `<a>` thật (gọi được, chạm được), có `aria-label`.

**Nghiệm thu:** cấu hình hotline và Zalo trong admin thì nút nổi hiện đúng và gọi/chat được; xóa cấu hình thì nút biến mất; test đọc cài đặt công ty vẫn pass; ảnh chụp 375px thể hiện không che thanh mua.

## S5. Trang chi tiết sản phẩm: thanh mua cố định và chọn quy cách tại chỗ

**Vị trí:** `details()`, `detailTab()`, `quantityControl()` trong `public/app.js`; CSS `.detail-top`, `.buy-row`, `.variants`.

**Vấn đề:** (1) trên điện thoại, nút "Thêm vào giỏ / Mua ngay" trôi mất khi cuộn; (2) chọn quy cách là các link sang trang khác nên khách mất ngữ cảnh; (3) hiện cả "Còn 500 sản phẩm" và các câu kỹ thuật: "Giá theo phân loại SKU. Tổng thanh toán được máy chủ xác nhận.", "Ưu đãi được máy chủ kiểm tra khi đặt hàng."

**Yêu cầu:**
1. **Thanh mua cố định (≤ 700px):** hiện khi khối `.buy-row` gốc cuộn ra khỏi màn hình (`IntersectionObserver`), ẩn khi nó còn thấy. Bố cục: bên trái giá hiện tại (đậm) và quy cách đang chọn; bên phải hai nút "Thêm vào giỏ" (viền) và "Mua ngay" (xanh). Nằm ngay trên thanh điều hướng dưới (hoặc thay thế thanh điều hướng dưới trên trang này). `padding-bottom` cho trang để không che nội dung; dùng `env(safe-area-inset-bottom)`. Hết hàng: thay bằng nút "Tạm hết hàng" vô hiệu.
2. **Chọn quy cách tại chỗ:** biến các link quy cách thành nhóm nút chọn (`role="radiogroup"`, mỗi nút `role="radio"`, `aria-checked`). Mỗi nút hiển thị tên quy cách (cân nặng/dung tích/combo) và, nếu khác nhau, giá. Khi chọn, cập nhật ngay không tải lại trang: giá, giá gốc, % giảm, mã SKU, tình trạng tồn, ảnh chính (nếu quy cách có ảnh), số lượng tối đa của ô số lượng, và URL bằng `history.replaceState` sang đường dẫn của quy cách đó (giữ SEO: mỗi quy cách vẫn có URL riêng, mở thẳng URL đó phải ra đúng quy cách). Dữ liệu các quy cách cùng `productId` đã có sẵn trong mảng `products`, không cần API mới. Quy cách hết hàng vẫn hiện nhưng mờ và có chữ "Hết hàng", vẫn chọn xem được.
3. **Tình trạng tồn:** nếu tồn > 5 chỉ hiện "Còn hàng"; tồn từ 1 đến 5 hiện "Chỉ còn N sản phẩm" (màu cảnh báo, kèm icon); tồn 0 hiện "Tạm hết hàng". Không lộ số tồn lớn.
4. **Nội dung:** xóa các câu kỹ thuật nói trên. Thay "Ưu đãi được máy chủ kiểm tra khi đặt hàng" bằng "Nhập mã ưu đãi ở bước giỏ hàng".
5. **Khối cam kết ngắn dưới nút mua** (icon + 1 dòng, mỗi mục chỉ hiện khi có dữ liệu thật): giao hàng (ngưỡng miễn phí lấy từ server, xem S6), đổi trả (link `/chinh-sach/doi-tra`, chỉ nêu số ngày nếu chính sách thật có), thanh toán (COD, chuyển khoản), hỗ trợ (hotline từ S4).
6. Ô số lượng: nút tăng giảm 44px, chặn vượt tồn bằng thông báo "Chỉ còn N sản phẩm".
7. Thứ tự trên điện thoại: ảnh → tên → giá → chọn quy cách → số lượng → nút mua → cam kết → mô tả. Ảnh chính có `width`/`height` và `fetchpriority="high"`.

**Nghiệm thu:** test trình duyệt: chọn quy cách khác thì giá, SKU, URL đổi, thêm vào giỏ đúng SKU đó; ở 375px, cuộn xuống thì thanh mua hiện, cuộn lên đầu thì ẩn; không còn câu kỹ thuật; 5 độ rộng không tràn ngang.

## S6. Phản hồi khi thêm giỏ: mini-cart và thanh miễn phí giao hàng

**Vị trí:** `addToCart`, `persistCart`, `summaryMarkup`, `couponMarkup`, `cartPage`; `db/store.mjs` hàm báo giá (khoảng dòng 246: `shipping = subtotal >= 499000 ? 0 : 25000`).

**Vấn đề:** thêm vào giỏ chỉ hiện thông báo nhỏ; giỏ chỉ có dòng chữ "Mua từ 499.000đ để được miễn phí giao hàng" cố định; ngưỡng 499.000 và phí 25.000 ghi cứng ở cả client lẫn server; ghi chú mã giảm giá cũng ghi cứng ("MEBE50: giảm 50K từ 500K · FREESHIP…") và ô nhập có placeholder "(MEBE50)", dễ sai khi chủ shop đổi mã trong admin; `couponMarkup` hiện "Theo điều kiện máy chủ".

**Yêu cầu:**
1. **Server:** gom `FREE_SHIPPING_THRESHOLD` và `STANDARD_SHIPPING_FEE` thành hằng/cài đặt tại một chỗ (ưu tiên đọc từ cài đặt, mặc định giữ 499.000 và 25.000 để không đổi hành vi). Trả `freeShippingThreshold` và `shippingFee` trong phản hồi `POST /api/quote` và `/api/site`. Client không còn số cứng.
2. **Thanh tiến độ miễn phí ship** (component dùng chung): đã đủ → "✓ Bạn được miễn phí giao hàng" (icon SVG); chưa đủ → thanh tiến độ và "Mua thêm **{số tiền}** để được miễn phí giao hàng". Dùng ở mini-cart, trang giỏ, tóm tắt thanh toán. Tính theo `subtotal` sau giảm giá nếu server quy định như vậy (đọc đúng quy tắc server, không tự suy).
3. **Mini-cart:** sau khi `addToCart` thành công từ thẻ sản phẩm hoặc nút "Thêm vào giỏ" ở chi tiết, mở ngăn kéo (bên phải ở máy tính, dạng bảng trượt từ dưới ở điện thoại) gồm: danh sách sản phẩm (ảnh, tên, quy cách, giá, tăng/giảm số lượng, xóa), thanh miễn phí ship, tạm tính (lấy từ `/api/quote`, có debounce 250ms và trạng thái đang tải), nút "Xem giỏ hàng" và "Thanh toán →" (xanh). Nút "Mua ngay" thì **không** mở mini-cart, đi thẳng thanh toán như hiện tại. Có thể mở lại bằng cách bấm biểu tượng giỏ ở header (máy tính). Bẫy focus, Esc đóng, `aria-modal`, trả focus về nút đã mở. Giỏ trống có trạng thái rỗng đẹp.
4. Hiệu ứng nút "Đã thêm ✓", huy hiệu giỏ nảy (mục 4).
5. **Mã ưu đãi:** bỏ ghi chú và placeholder ghi cứng; ô nhập placeholder "Nhập mã ưu đãi"; bên dưới liệt kê các mã đang áp dụng từ `siteData.coupons` (bấm để điền/áp dụng); sửa chữ "Theo điều kiện máy chủ" thành "Theo điều kiện của mã". Lỗi mã hiện ngay tại ô, giữ nội dung đã nhập.

**Nghiệm thu:** đổi ngưỡng miễn phí ship ở một nơi thì mọi chỗ hiển thị đổi theo; thêm sản phẩm thì mini-cart mở đúng, thanh tiến độ đúng số tiền còn thiếu; đổi mã giảm giá trong admin thì gợi ý ở giỏ đổi theo; test báo giá và đặt hàng hiện có vẫn pass (không đổi tổng tiền).

## S7. Thanh toán: địa chỉ chuẩn Việt Nam, kiểm tra lỗi từng ô, nút đặt hàng cố định

**Vị trí:** `checkoutPage`, `prefillCheckout`, `submitOrder` trong `public/app.js`; validation địa chỉ trong `server.mjs`, `lib/auth.mjs` (địa chỉ đã lưu), `db/store.mjs` (tạo đơn: các cột `province`, `district`).

**Vấn đề:** "Tỉnh/Thành phố" và "Quận/Huyện/Khu vực" là ô gõ tay (khách gõ sai chính tả, đơn vị vận chuyển khó xử lý). Từ 01/07/2025 Việt Nam áp dụng chính quyền địa phương hai cấp, không còn cấp quận/huyện, nên nhãn "Quận/Huyện" đã lỗi thời. **Codex phải xác minh danh sách đơn vị hành chính hiện hành theo nguồn chính thức hoặc bộ dữ liệu mở đáng tin, ghi rõ nguồn và ngày lấy trong file dữ liệu; không dựa vào trí nhớ.**

**Yêu cầu:**
1. Thay hai ô bằng: **Tỉnh/Thành phố** (ô chọn có tìm kiếm gõ không dấu) → **Phường/Xã** (phụ thuộc tỉnh, có tìm kiếm) → **Địa chỉ chi tiết** (số nhà, đường). Dữ liệu đặt ở `public/data/vn-addresses.json`, tải lười (lazy) khi vào trang thanh toán hoặc tài khoản, có phiên bản và nguồn.
2. **Cơ sở dữ liệu:** migration mới `013_address_ward.sql` thêm cột `ward` (cho `orders` và bảng địa chỉ đã lưu), cho phép `district` NULL cho đơn mới, **giữ nguyên dữ liệu đơn cũ** (đơn cũ vẫn hiển thị `district`). Cập nhật validation server: đơn mới yêu cầu `province` + `ward` + `address`, vẫn nhận `district` cũ để tương thích. Cập nhật snapshot địa chỉ trong đơn, trang tra cứu đơn, admin chi tiết đơn, in phiếu (A2), CSV. Giữ nguyên cơ chế chống gửi lặp (fingerprint/idempotency): chỉnh công thức fingerprint có tính `ward` nhưng không làm hỏng test hiện có.
3. **Kiểm tra lỗi từng ô:** kiểm tra khi rời ô (blur) và khi gửi; thông báo tiếng Việt cụ thể dưới từng ô ("Số điện thoại cần 10 số, bắt đầu bằng 0"); khi gửi lỗi, focus ô sai đầu tiên; `aria-invalid`, `aria-describedby`; giữ nguyên dữ liệu đã nhập (cơ chế `checkoutDraft/restoreDraft` hiện có).
4. Điện thoại: `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`; email `inputmode="email"`; mọi ô có `autocomplete` phù hợp (`name`, `address-level1`, `street-address`...).
5. **Phương thức thanh toán** hiển thị dạng thẻ chọn lớn (icon + tên + mô tả ngắn, trạng thái được chọn rõ), thẻ không khả dụng mờ kèm lý do. Nhãn nút đặt hàng đổi theo phương thức (đã có `orderButtonLabel`, giữ).
6. **Điện thoại:** thanh đặt hàng cố định ở đáy hiện **tổng tiền** và nút "Đặt hàng"; khối tóm tắt đơn có thể thu gọn/mở rộng ở đầu trang. Thanh bước (Giỏ hàng → Thông tin giao hàng → Hoàn tất) có dấu ✓ (SVG) ở bước đã qua.
7. Ô đồng ý điều khoản: **giữ bắt buộc như hiện tại** cho đến khi chủ shop quyết định khác (mục 9); chỉ sửa nội dung cho sạch (S1).
8. Địa chỉ đã lưu của tài khoản (có sẵn) phải tương thích: địa chỉ cũ có `district` mà chưa có `ward` thì hiển thị và yêu cầu khách chọn lại Phường/Xã khi dùng.

**Nghiệm thu:** test API và trình duyệt cho đặt hàng COD và chuyển khoản vẫn pass (đã sửa theo trường mới); đặt đơn với địa chỉ chọn từ danh sách, đơn lưu đúng `ward`; migration nâng cấp trên dữ liệu có sẵn giữ nguyên đơn cũ; ảnh chụp 375px thể hiện thanh đặt hàng cố định.

## S8. Trang chủ: nhiều banner, thương hiệu, tiêu đề đồng nhất

**Vị trí:** `heroMarkup()`, `home()`, phần thương hiệu trong `app.js`; API `/api/site` (banner).

**Vấn đề:** khi có banner, chỉ dùng `siteData.banners?.[0]` (không có slide); khi chưa có banner mới dùng 3 slide dự phòng. Banner chỉ có tiêu đề và nút, ảnh bị đặt trong khung có nền. Mục thương hiệu chỉ là chữ.

**Yêu cầu:**
1. Hiển thị **tất cả banner đang hiệu lực** (đúng lịch hiển thị server trả về) dạng slide: dấu chấm điều hướng, nút trước/sau, vuốt trên điện thoại, tự chuyển 6 giây có **nút tạm dừng**, tạm dừng khi hover/focus, tắt tự chuyển nếu reduced-motion. Banner đầu tiên tải ngay (`fetchpriority="high"`, có `width`/`height`), các banner sau `loading="lazy"`. Giữ `alt_text` từ dữ liệu.
2. Chỉ 1 banner thì không hiện điều khiển. Không có banner thì dùng 3 slide dự phòng hiện tại.
3. Mục "Thương hiệu": dùng logo thương hiệu nếu có trong dữ liệu (ảnh), nếu không có thì chữ như hiện tại; mỗi thương hiệu là link `/san-pham?brand=<tên>` (bộ lọc thương hiệu đã có). Lấy từ `/api/brands`.
4. Tiêu đề "Sản phẩm nổi bật" đồng nhất kiểu (xem mục 3). Dải mã giảm giá: nút sao chép mã có phản hồi "Đã sao chép ✓".
5. Thứ tự gợi ý trên điện thoại: banner → danh mục → mã ưu đãi → sản phẩm nổi bật → các section còn lại. Thanh "lợi ích" bốn ô (Lựa chọn rõ ràng, Theo dõi đơn hàng...) thu gọn thành một hàng cuộn ngang hoặc lưới 2x2 nhỏ, không chiếm quá nửa màn hình đầu.
6. Hiệu ứng reveal khi cuộn (mục 4) cho các section dưới màn hình đầu.

**Nghiệm thu:** tạo 3 banner trong admin thì trang chủ chạy đủ 3 slide; test banner hiện có (tạo → xuất bản → sửa → hiển thị) vẫn pass; không có chuyển động khi bật reduced-motion.

## S9. Thẻ sản phẩm, lưới sản phẩm, trạng thái tải và rỗng

**Yêu cầu:**
1. `card()`: bỏ nhãn "Còn hàng" (thừa); chỉ hiện nhãn khi đặc biệt ("Sắp hết", "Hết hàng"). Giá lớn nhất thẻ, giá gốc và % giảm nhỏ cạnh bên. Nút "Thêm vào giỏ" rộng toàn thẻ, cao ≥ 44px. Nút yêu thích dùng SVG (S2), vùng bấm 44px. Tên sản phẩm tối đa 2 dòng (cắt bằng `line-clamp`). Ảnh khung tỷ lệ cố định để không giật bố cục, có `width`/`height`, `loading="lazy"` (ảnh đầu tiên của trang chủ thì không lazy).
2. Lưới: 2 cột ở ≤ 480px, 3 cột ≤ 900px, 4–5 cột lớn hơn; khoảng cách `--space-4` (điện thoại) đến `--space-6`.
3. Trang danh sách (`listing()`): bộ lọc thương hiệu/độ tuổi/giá trên điện thoại mở bằng nút "Bộ lọc" thành bảng trượt từ dưới có nút "Áp dụng" và "Xóa lọc", hiện số kết quả; có các chip bộ lọc đang áp dụng, xóa từng chip; sắp xếp có nhãn rõ.
4. Trạng thái tải dùng skeleton (mục 4); trạng thái không có kết quả có gợi ý ("Thử bỏ bớt bộ lọc", link danh mục phổ biến).
5. Gợi ý tìm kiếm (`#suggestions`): thêm ảnh nhỏ và giá cho gợi ý sản phẩm; có trạng thái "Không tìm thấy" kèm gợi ý. Điều hướng bằng phím mũi tên, Enter, Esc.

**Nghiệm thu:** test lọc/sắp xếp/phân trang hiện có vẫn pass; ảnh 320/375/768/1440/1920 không tràn ngang; CLS khi tải danh sách gần 0 (đo thủ công bằng DevTools, ghi lại kết quả, không tuyên bố số liệu người dùng thật).

---

# GIAI ĐOẠN 2 — TĂNG CHỐT ĐƠN VÀ VẬN HÀNH

Làm sau khi Giai đoạn 1 xong và chạy ổn. Các task có tích hợp ngoài chỉ làm khi chủ shop đã chọn nhà cung cấp và cấp thông tin (mục 9).

## B1. Quản trị: Tổng quan (dashboard) làm lại để phục vụ công việc hằng ngày

**Vị trí:** `dashboardMarkup()` trong `public/admin.js`, `store.dashboard()` trong `db/store.mjs` (SQL gần dòng 1050), `GET /api/admin/dashboard` (`server.mjs`).

**Hiện trạng:** chỉ 4 thẻ số (đơn hàng, doanh số, sản phẩm cha, cảnh báo tồn thấp), sau đó là 8 nút "Truy cập nhanh" lặp lại menu và khối chữ "Vận hành theo từng bước" giải thích nghiệp vụ, chiếm chỗ mà không giúp xử lý việc. API đã tính `pending_orders` nhưng giao diện không hiển thị. Ngưỡng "tồn thấp" ghi cứng `< 10` dù mỗi SKU đã có `low_stock_threshold` (migration 011).

**Yêu cầu:**
1. **Hàng thẻ chỉ số** (bấm vào thẻ thì chuyển tới danh sách đã lọc sẵn): Đơn chờ xử lý; Đơn chuyển khoản chờ đối soát; Doanh thu hôm nay và 7 ngày (ghi rõ "Giá trị đơn" khác "Tiền đã thu", theo đúng `payments` đã paid, không gộp); SKU sắp hết/hết hàng.
2. **Sửa ngưỡng tồn thấp:** dùng `low_stock_threshold` của từng SKU (mặc định theo giá trị cột nếu có, dự phòng 10), tính `available = on_hand − reserved` ở kho normal đang hoạt động (đúng định nghĩa trong README).
3. **Khối "Cần xử lý hôm nay":** bảng tối đa 8 đơn chờ xử lý mới nhất (mã đơn, khách, tổng tiền, thời gian chờ, hình thức thanh toán, nút "Xử lý" mở chi tiết đơn) và bảng tối đa 8 SKU sắp hết (tên, SKU, có thể bán, ngưỡng, nút "Nhập kho" mở phiếu nhập). Có trạng thái rỗng "Không có đơn nào đang chờ".
4. **Biểu đồ doanh thu và số đơn 7/30 ngày:** endpoint mới `GET /api/admin/dashboard/series?days=7|30` trả dữ liệu theo ngày từ bảng đơn/thanh toán thật. Vẽ bằng **SVG tự viết, không thêm thư viện**. Có so sánh với kỳ trước (% tăng giảm), chú giải, trục có nhãn, tooltip khi hover/focus; không có đơn thì hiện trạng thái rỗng, **không vẽ dữ liệu giả**.
5. **Top 5 SKU bán chạy 30 ngày** (từ `order_items`, theo số lượng và doanh thu, trừ đơn đã hủy).
6. **Xóa** khối "Truy cập nhanh" (menu bên trái đã làm việc này) và khối "Vận hành theo từng bước" (chuyển nội dung thành một trang/nút "Hướng dẫn" ở góc nếu muốn giữ). Giữ khối cảnh báo trung thực về hệ thống đang phát triển chỉ khi `DEMO_MODE`.
7. Phân quyền: mỗi khối chỉ hiện khi người dùng có quyền tương ứng (`has(permission)`); vai trò `boss` chỉ xem. Quyền kiểm ở server cho mọi endpoint mới.
8. Hiệu ứng đếm số lúc tải đầu (mục 4); nút "Làm mới" không chạy lại hiệu ứng.

**Nghiệm thu:** test admin (`test:management`, `test:usability`, `test:admin-access`) cập nhật và pass; với đơn fixture thật, số trên thẻ khớp API; ngưỡng tồn theo từng SKU được kiểm chứng bằng test; ảnh chụp 1440 và 375.

## B2. Quản trị: Đơn hàng — lọc mạnh, phân trang, thao tác hàng loạt, in phiếu giao

**Vị trí:** `ordersMarkup()`, `orderTable()`, `filterOrders()`, `openOrder()`, `orderDetail()` trong `admin.js`; API `GET /api/admin/orders`.

**Hiện trạng:** có ô tìm kiếm và bảng; không thấy in phiếu hay thao tác hàng loạt trong code.

**Yêu cầu:**
1. **Thanh lọc:** tìm theo mã đơn/tên/SĐT; các chip trạng thái kèm số lượng; khoảng ngày; hình thức thanh toán (COD/chuyển khoản); trạng thái thanh toán; sắp xếp (mới nhất, tổng tiền). Lọc và phân trang **ở server** (`?status=&q=&from=&to=&payment=&paid=&sort=&page=&pageSize=`) để chạy tốt khi có hàng nghìn đơn; nếu API hiện chưa hỗ trợ thì bổ sung, giữ tương thích ngược. Giữ giá trị lọc khi làm mới trang (query string).
2. **Bảng:** cột Mã đơn, Thời gian, Khách, SĐT, Số SP, Tổng tiền (căn phải, `tabular-nums`), Thanh toán, Trạng thái, Hành động. Header cố định khi cuộn, nền dòng khi hover, bấm dòng mở chi tiết (hộp thoại hiện có). Trạng thái là huy hiệu có **icon + chữ + màu** (chờ xử lý, đã xác nhận, đang chuẩn bị, đang giao, đã giao, đã hủy; thanh toán: chưa thanh toán, chờ đối soát, đã thanh toán). Điện thoại: mỗi dòng thành thẻ.
3. **Chọn nhiều đơn:** ô chọn từng dòng và "chọn tất cả trong trang"; thanh thao tác nổi lên khi có đơn được chọn: "In phiếu giao hàng", "Xuất CSV đơn đã chọn", "Chuyển trạng thái" (chỉ các bước hợp lệ chung cho mọi đơn đã chọn). Chuyển trạng thái hàng loạt **gọi lại đúng logic chuyển trạng thái hiện có của từng đơn** (mỗi đơn một giao dịch riêng, giữ kiểm tra tồn kho, chặn xuất giao đơn chuyển khoản chưa nhận tiền), cuối cùng hiển thị bảng kết quả từng đơn thành công/thất bại kèm lý do. Có xác nhận trước khi thực hiện. Mọi thao tác ghi nhật ký (audit).
4. **In phiếu giao hàng:** trang `/quan-tri/in-don?ids=...` (cần đăng nhập và quyền `orders.read`, giới hạn tối đa 50 đơn mỗi lần), CSS `@media print` cho khổ A5 (hoặc 100×150mm, cấu hình được), mỗi đơn một trang: logo, thông tin cửa hàng (từ cài đặt công ty), mã đơn kèm mã QR/mã vạch của mã đơn (thư viện `qrcode` đã có), người nhận, SĐT, địa chỉ đầy đủ (gồm `ward`), danh sách sản phẩm (tên, quy cách, SKU, số lượng), ghi chú, **số tiền COD cần thu** (đơn COD = tổng cộng, đơn đã chuyển khoản/đã thanh toán = 0đ). Có nút in ngay trong hộp thoại chi tiết đơn.
5. Chi tiết đơn: dòng thời gian trạng thái (lịch sử xử lý), khối thanh toán rõ ràng, nút sao chép SĐT/địa chỉ. Giữ nguyên toàn bộ form cập nhật trạng thái, đối soát, thu COD hiện có và các kiểm tra phiên bản.
6. Nút "Xuất CSV" áp dụng đúng bộ lọc đang chọn, chống công thức Excel (đã có cơ chế cho CSV nhật ký, dùng lại).

**Nghiệm thu:** test mới cho lọc/phân trang/xuất CSV theo bộ lọc, chuyển trạng thái hàng loạt (một đơn hợp lệ, một đơn không hợp lệ → kết quả đúng từng đơn), in phiếu (không có quyền thì bị từ chối), COD hiển thị đúng; ảnh in thử (PDF/ảnh chụp) để xem.

## B3. Quản trị: Kho và tồn theo SKU

**Vị trí:** `inventoryMarkup()`, `inventoryTable()`, `adjustInventory()` trong `admin.js`; phiếu kho trong `commerce-admin.js`; `lib/inventory-documents.mjs`.

**Yêu cầu:**
1. Thanh lọc: tìm theo tên/SKU/mã vạch, trạng thái tồn (Tất cả / Hết hàng / Sắp hết / Đủ hàng), kho (normal/damaged), sắp xếp theo "có thể bán" tăng dần. Tóm tắt phía trên: số SKU hết hàng, sắp hết.
2. Cột: Ảnh nhỏ, Tên + quy cách, SKU, Tồn thực, Đang giữ, **Có thể bán** (in đậm), Ngưỡng cảnh báo, Trạng thái (huy hiệu icon + chữ: Hết hàng/Sắp hết/Đủ hàng). Số căn phải, header cố định.
3. **Điều chỉnh nhanh ngay trên dòng:** nút "Điều chỉnh" mở khung nhỏ (popover/hộp thoại) nhập số lượng mới hoặc ±, **bắt buộc có lý do** (đã là quy tắc hiện tại), gọi `POST /api/admin/inventory/adjust` hiện có, giữ kiểm tra phiên bản; hiển thị lại dòng với hiệu ứng tô sáng.
4. Nút "Nhập kho" tạo sẵn phiếu nhập cho SKU đó (dùng luồng phiếu hiện có: nháp → gửi → duyệt → ghi sổ).
5. Xuất CSV tồn kho (tồn thực, giữ, có thể bán, ngưỡng) theo bộ lọc.
6. Xem lịch sử nhập/xuất của một SKU (lấy từ sổ kho hiện có) trong hộp thoại chi tiết SKU.

**Nghiệm thu:** test điều chỉnh có lý do, bị từ chối khi thiếu lý do, không cho `available` âm; giữ nguyên phân quyền (`warehouse` không duyệt kho, `boss` chỉ xem).

## B4. Quản trị: Báo cáo có biểu đồ

**Vị trí:** màn "Báo cáo" (`commerce-admin.js`/`admin.js`), API `/api/admin/reports/summary`, `/api/admin/reports/export`.

**Yêu cầu:** giữ bộ lọc ngày và chọn nhanh 7/30/90 ngày, xuất CSV. Bổ sung: biểu đồ doanh thu theo ngày (SVG tự viết, dùng lại thành phần của B1); so sánh kỳ trước; bảng top SKU (số lượng, doanh thu); doanh thu theo hình thức thanh toán; số đơn theo trạng thái; tỷ lệ hủy; tóm tắt đổi trả (từ `returns`). Luôn tách "Giá trị đơn" và "Tiền đã thu"; không suy diễn lợi nhuận khi chưa có giá vốn. **Lợi nhuận**: chỉ làm khi chủ shop đồng ý nhập giá vốn (thêm cột `cost_price` cho SKU qua migration, nhập qua màn sản phẩm và CSV; báo cáo hiển thị lợi nhuận gộp chỉ với SKU có giá vốn và nói rõ phần nào thiếu).

## B5. Quản trị: Hoàn thiện giao diện

**Hiện trạng (nhìn thấy trong ảnh):** ô "Tìm chức năng…" trong thanh bên bị tràn ra ngoài khung; tiêu đề nhóm menu ("TỔNG QUAN", "BÁN HÀNG & KHO"...) cỡ chữ lớn hơn chính các mục menu; mọi mục dùng cùng icon; menu dài phải cuộn; ký tự lỗi `▯` ở các nút; form nhân viên liệt kê vai trò bằng tên kỹ thuật (`catalog_manager`...) xếp bằng thẻ `<br>`.

**Yêu cầu:**
1. Sửa ô tìm kiếm trong sidebar (box-sizing, chiều rộng) trong `admin-workspace.css`; tiêu đề nhóm 11–12px, in hoa nhẹ, màu mờ, mục menu 14px; icon riêng (S2); nhóm có thể thu gọn và nhớ trạng thái (localStorage, bọc try/catch).
2. Vai trò: bảng ánh xạ nhãn tiếng Việt + mô tả một dòng cho từng vai trò (`admin` Quản trị viên, `boss` Chủ cửa hàng (chỉ xem), `sales` Bán hàng, `warehouse` Kho, `finance` Kế toán, `catalog_manager` Quản lý sản phẩm, `writer` Biên tập viên, `seo` SEO, `content` Nội dung, `viewer` Chỉ xem). Form nhân viên dùng danh sách ô chọn có nhãn và mô tả, nhóm theo chức năng, không còn `<br>`. Danh sách nhân viên hiển thị nhãn tiếng Việt.
3. Bảng dữ liệu dùng chung: header cố định, số căn phải, hover dòng, trạng thái rỗng, skeleton khi tải, phân trang đồng nhất; điện thoại chuyển thẻ (đã có cho danh mục, mở rộng).
4. Thông báo thành công/lỗi dạng toast thống nhất; hành động nguy hiểm (hủy đơn, khóa tài khoản, lưu trữ sản phẩm) có hộp thoại xác nhận nêu rõ hậu quả.
5. Kiểm tra giới hạn đăng nhập sai (rate limit/khóa tạm) trong `lib/auth.mjs`; nếu chưa có thì bổ sung giới hạn thử đăng nhập theo IP+tài khoản có kiểm thử. (Mục kiểm tra bảo mật nhỏ, chưa xác minh trong code.)

## C1. Email giao dịch và "Quên mật khẩu"

**Hiện trạng:** chưa có gửi email/SMS/OTP (README ghi rõ).

**Yêu cầu:**
1. Cấu hình SMTP qua biến môi trường (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`; ghi vào `.env.example` không có giá trị thật). Có thể thêm phụ thuộc `nodemailer` (ghi lại lý do trong báo cáo).
2. Migration mới tạo bảng hàng đợi `email_outbox` (loại, người nhận, nội dung, trạng thái, số lần thử, lỗi, thời gian) và bộ gửi nền có thử lại với giãn cách tăng dần; **không chặn** việc tạo đơn nếu email lỗi. Không ghi nội dung nhạy cảm (mật khẩu, token) vào log.
3. Mẫu email tiếng Việt (HTML + chữ thuần): **xác nhận đơn hàng** (mã đơn, danh sách, tổng tiền, địa chỉ, link tra cứu có token, hướng dẫn chuyển khoản nếu có), **đơn đã giao cho vận chuyển/đã giao**, **đặt lại mật khẩu**.
4. **Quên mật khẩu:** link "Quên mật khẩu?" ở trang đăng nhập → nhập email → luôn trả cùng thông báo ("Nếu email tồn tại, chúng tôi đã gửi hướng dẫn") để không lộ tài khoản có tồn tại; token ngẫu nhiên, chỉ lưu **hash**, hết hạn 30 phút, dùng một lần, giới hạn số lần yêu cầu; đặt lại mật khẩu thu hồi toàn bộ phiên (như đổi mật khẩu hiện có). Chỉ áp dụng cho tài khoản có email.
5. **Chưa cấu hình SMTP:** tính năng tự tắt trung thực: ẩn link "Quên mật khẩu", ô email ở thanh toán vẫn không bắt buộc, màn "Vận hành" trong admin hiện "Chưa cấu hình email". Không giả lập thành công.

**Nghiệm thu:** test với máy chủ SMTP giả cục bộ trong test (không gửi ra ngoài); token hết hạn/đã dùng bị từ chối; phiên cũ bị thu hồi; test đơn hàng không bị ảnh hưởng khi email lỗi.

## C2. Đánh giá sản phẩm có kiểm duyệt

**Nguyên tắc:** chỉ hiển thị đánh giá thật; không tạo sẵn đánh giá hay điểm số. `AggregateRating` trong JSON-LD chỉ xuất khi có ít nhất 1 đánh giá đã duyệt.

**Yêu cầu:**
1. Migration: bảng `product_reviews` (id, product_id, variant_id nullable, user_id, order_item_id, rating 1–5, title, body, status `pending|approved|rejected`, created_at, moderated_by, moderated_at, lý do từ chối) + bảng ảnh đánh giá (tối đa 3 ảnh mỗi đánh giá, qua `lib/media.mjs`). Ràng buộc: **mỗi `order_item` một đánh giá**, chỉ khách có đơn **đã giao** chứa sản phẩm đó mới được viết (huy hiệu "Đã mua hàng").
2. API: tạo đánh giá (cần đăng nhập, CSRF, giới hạn tần suất, độ dài nội dung), danh sách đánh giá đã duyệt theo sản phẩm (phân trang), thống kê (trung bình, số lượng theo sao).
3. Giao diện: trên trang chi tiết thêm tab/khối "Đánh giá" với thanh phân bố sao, danh sách, nút "Viết đánh giá" (hiện khi đủ điều kiện, nếu chưa đủ thì giải thích vì sao); thẻ sản phẩm hiện sao và số đánh giá **chỉ khi > 0**. Sao dùng SVG, có chữ cho trình đọc màn hình ("4,5 trên 5 sao").
4. Admin: màn "Đánh giá" (quyền mới `reviews.moderate` gán cho `admin`, `content`, `seo`), lọc theo trạng thái, duyệt/từ chối kèm lý do, ghi audit.
5. SEO: `lib/seo.mjs` thêm `aggregateRating` và `review` vào JSON-LD sản phẩm chỉ khi có dữ liệu thật.

## C3. Phí vận chuyển theo vùng/cân nặng và tích hợp vận chuyển

**Hiện trạng:** phí cố định 25.000đ, miễn phí từ 499.000đ; cơ sở dữ liệu đã có cân nặng và kích thước SKU (migration 011) nhưng chưa dùng; chưa có mã vận đơn hay theo dõi hành trình.

**C3a — Biểu phí nội bộ (không cần nhà vận chuyển):**
- Bảng quy tắc phí do admin cấu hình: theo nhóm tỉnh/thành × bậc cân nặng (hoặc bậc giá trị đơn), có phí mặc định và ngưỡng miễn phí. Server tính phí trong hàm báo giá từ `province` và tổng cân nặng; `/api/quote` nhận thêm tỉnh khi khách đã chọn để hiển thị phí chính xác sớm (ở giỏ nếu đã biết, nếu chưa thì "Tính ở bước thanh toán"). Không đổi đơn cũ (phí đã snapshot).

**C3b — Tích hợp nhà vận chuyển (GHN/GHTK/Viettel Post, theo lựa chọn của chủ shop):**
- Giao diện adapter `lib/shipping/<provider>.mjs` với các hàm: tính phí, tạo vận đơn, hủy vận đơn, tra cứu hành trình, nhận webhook (xác thực chữ ký/khóa). Khóa API chỉ qua biến môi trường.
- Admin: nút "Tạo vận đơn" trên đơn (từ trạng thái phù hợp), lưu mã vận đơn và hãng vào bảng giao hàng hiện có, in nhãn vận đơn của hãng, cập nhật trạng thái qua webhook (idempotent), hiển thị hành trình ở trang tra cứu đơn của khách.
- Chưa có nhà vận chuyển được chọn và khóa API thì **không làm C3b**, không dùng dữ liệu giả.

## C4. Tự động xác nhận chuyển khoản và thanh toán điện tử

**Hiện trạng:** VietQR tạo cục bộ nhưng nhân viên phải tự kiểm tra tiền; hệ thống đã chặn xuất giao đơn chuyển khoản chưa xác nhận và không hủy đơn đã nhận tiền (giữ nguyên các rào chắn này).

**Yêu cầu (sau khi chủ shop chọn dịch vụ nhận biến động số dư hoặc cổng thanh toán):**
1. Endpoint webhook (ví dụ `POST /api/payments/bank-webhook`): xác thực bằng khóa/chữ ký của nhà cung cấp, chống phát lại (lưu mã giao dịch ngân hàng duy nhất, idempotent), đọc nội dung chuyển khoản để khớp mã đơn, **chỉ đánh dấu đã thanh toán khi khớp mã đơn VÀ đúng số tiền**; khác số tiền hoặc không khớp mã → vào danh sách "Cần đối soát thủ công" trong admin, không tự duyệt. Ghi `payment_events` và `audit_logs` như luồng xác nhận thủ công hiện có.
2. Tái dùng đúng hàm xác nhận chuyển khoản hiện có (khóa giao dịch, chống ghi lặp) thay vì viết logic mới.
3. Ví điện tử/cổng (MoMo, VNPay, ZaloPay…): làm theo cùng mẫu adapter: tạo giao dịch → chuyển khách sang cổng → nhận IPN có xác thực chữ ký → đối chiếu số tiền → cập nhật. Hiển thị trong `paymentOptions()` chỉ khi đã cấu hình. Làm từng cổng một, mỗi cổng có kiểm thử trên môi trường thử của nhà cung cấp.
4. Trang thanh toán thành công: tự làm mới trạng thái thanh toán (polling nhẹ mỗi 5–10 giây, có giới hạn) khi đơn đang chờ chuyển khoản.

## C5. Đo lường (Analytics) có đồng ý của khách

**Yêu cầu:**
1. Cài đặt công ty có `ga4_measurement_id` và `meta_pixel_id` (rỗng = tắt). Chỉ nạp script sau khi khách đồng ý trên **thanh đồng ý cookie** đơn giản (Chấp nhận / Từ chối, lưu lựa chọn); không nạp gì trước khi đồng ý. Mặc định tắt nếu chưa cấu hình.
2. Sự kiện: `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (kèm giá trị và danh sách hàng). `purchase` chỉ gửi **một lần** cho mỗi đơn ở trang hoàn tất (đánh dấu đã gửi). Không gửi thông tin cá nhân (tên, SĐT, địa chỉ, email).
3. Kiểm tra chính sách bảo mật (`/chinh-sach/bao-mat`) có nội dung về cookie/đo lường; báo chủ shop bổ sung (không tự bịa văn bản pháp lý).
4. Cập nhật CSP/header nếu server có đặt (kiểm tra `server.mjs`).

## C6. Các cải tiến mua sắm nhỏ

- **Đã xem gần đây:** lưu tối đa 10 sản phẩm vào `localStorage` (bọc try/catch), hiển thị ở trang chi tiết và giỏ trống.
- **Mua kèm / gợi ý:** khối "Thường mua cùng" dựa trên cùng danh mục/thương hiệu hoặc dữ liệu thật từ đơn đã giao (đồng xuất hiện trong đơn); không đủ dữ liệu thì dùng cùng danh mục như hiện nay.
- **Báo khi có hàng:** nút trên SKU hết hàng, khách để email (hoặc SĐT nếu có kênh nhắn); cần C1; khi tồn từ 0 lên > 0, gửi email một lần rồi đánh dấu đã báo.
- **Trang tra cứu đơn:** hiển thị dòng thời gian trạng thái trực quan (icon, mốc thời gian), mã vận đơn khi có (C3b).
- **Câu hỏi thường gặp (FAQ)** trên trang sản phẩm và trang chính sách: dùng trình soạn bài viết hiện có hoặc khối nội dung do admin nhập; JSON-LD FAQ chỉ khi có nội dung thật.

---

# GIAI ĐOẠN 3 — DÀI HẠN (cần thiết kế riêng trước khi code)

## D1. Lô và hạn sử dụng (sữa bột, đồ ăn dặm)

**Vì sao:** README ghi chưa có; với sữa và đồ ăn dặm, hạn dùng là yêu cầu an toàn và bắt buộc trong vận hành.

**Hướng làm (viết thiết kế ngắn và xin chủ shop duyệt trước khi code, vì ảnh hưởng đến giữ tồn):**
- Cờ `tracks_expiry` trên SKU; bảng `inventory_lots` (SKU, kho, mã lô, ngày sản xuất, **hạn dùng**, số lượng thực có); phiếu nhập bắt buộc nhập lô và hạn với SKU có cờ.
- Xuất kho theo nguyên tắc **FEFO** (lô hết hạn sớm xuất trước); giữ tồn vẫn theo SKU nhưng khi xuất giao thì phân bổ xuống lô; **không bán lô đã hết hạn**.
- Báo cáo/cảnh báo lô sắp hết hạn trong 30/60/90 ngày; hiển thị trong dashboard.
- Bảo toàn dữ liệu cũ: tồn hiện có chuyển thành "lô không xác định" cho đến khi kiểm kê.
- Giữ tính đúng đắn các test giữ tồn/cạnh tranh hiện có.

## D2. Các hạng mục khác

Tích điểm khách hàng qua sổ giao dịch; combo sản phẩm; đa kho/đa điểm bán; đồng bộ sàn (Shopee/TikTok Shop); xác thực hai lớp cho tài khoản nhân viên; đa ngôn ngữ. Mỗi hạng mục cần đặc tả riêng.

---

## 5. TIÊU CHÍ HIỆU NĂNG VÀ TRUY CẬP (áp dụng cho toàn bộ)

- Ảnh: luôn có `width`/`height` hoặc `aspect-ratio`; ảnh dưới màn hình đầu `loading="lazy"`; ảnh đầu trang `fetchpriority="high"`; ảnh tải lên đã được chuyển WebP bởi `lib/media.mjs`.
- Mục tiêu đo trong phòng thí nghiệm (Lighthouse mobile): LCP < 2,5s, CLS < 0,1, không có tác vụ dài đáng kể khi tải; ghi rõ đây là số đo thử nghiệm, không tuyên bố số liệu người dùng thật.
- Thẻ HTML ngữ nghĩa, một `h1` mỗi trang, thứ tự tiêu đề hợp lý, `alt` có ý nghĩa, nhãn `aria` cho nút chỉ có icon, điều hướng đầy đủ bằng bàn phím, không bẫy focus ngoài hộp thoại.
- Không dùng thư viện front-end lớn mới. Mỗi phụ thuộc mới phải được nêu lý do trong báo cáo.

## 6. KIỂM THỬ VÀ BÀN GIAO (mỗi task)

1. Chạy: `npm test`, và tùy phần sửa: `npm run test:browser` (cửa hàng), `npm run test:management`, `npm run test:usability`, `npm run test:commerce`, `npm run test:admin-access`, `npm run test:account`, `npm run test:bank`. Cập nhật test cũ khi chuỗi chữ hoặc luồng thay đổi có chủ đích; thêm test mới cho hành vi mới.
2. Chụp ảnh ở 320/375/768/1440/1920px cho các màn hình đã sửa, lưu trong `docs/screenshots/upgrade/`, ghi rõ dữ liệu là fixture. **Mở xem ảnh** và sửa lỗi bố cục trước khi báo hoàn thành.
3. Cập nhật tài liệu: `docs/COMMERCE_RELEASE.md` (bảng chức năng), `specs/001-jielien-commerce/tasks.md` (chỉ đánh `[x]` khi đủ tiêu chí), `README.md` nếu có biến môi trường mới, `.env.example`.
4. Báo cáo cuối mỗi task gồm: file đã sửa, thay đổi hành vi, migration mới (nếu có), test đã chạy và kết quả, giới hạn còn lại. **Không nói đã triển khai lên máy công ty khi mới đẩy lên GitHub**; kèm hướng dẫn cập nhật và rebuild Docker (theo `docs/COMMERCE_WINDOWS.md`).
5. Nhánh làm việc: `feature/ux-upgrade-phase1` (và phase2...). Mỗi task một commit, thông điệp commit tiếng Việt hoặc tiếng Anh nhất quán, nêu mã task (ví dụ `S5: thanh mua cố định và chọn quy cách tại chỗ`).

## 7. THỨ TỰ LÀM ĐỀ XUẤT TRONG GIAI ĐOẠN 1

1. Mục 3 (biến thiết kế) và S2 (icon) vì các task sau dùng chung.
2. S1 (gỡ nhãn thử nghiệm) → S3 (danh mục động, khung trang) → S4 (liên hệ nhanh).
3. S5 (trang sản phẩm) → S6 (mini-cart, miễn phí ship) → S7 (thanh toán, địa chỉ).
4. S8 (trang chủ) → S9 (thẻ, lưới, bộ lọc).
5. Hiệu ứng (mục 4) làm kèm trong từng task, không làm một lần riêng.

## 8. NHỮNG THỨ KHÔNG ĐƯỢC LÀM

- Không đổi logic tính tiền, giữ tồn, trạng thái đơn, quyền hạn (chỉ hiển thị lại hoặc gọi lại đúng hàm hiện có).
- Không thêm bước đăng ký bắt buộc vào luồng mua hàng; khách vẫn đặt hàng không cần tài khoản.
- Không dùng pop-up chặn màn hình, không đếm ngược giả, không "N người đang xem" giả, không đánh giá hay doanh số giả.
- Không nhúng font hoặc script từ CDN bên ngoài; không gọi dịch vụ ngoài khi chưa cấu hình.

## 9. THÔNG TIN CẦN CHỦ SHOP CUNG CẤP (Codex không được tự bịa)

| Thông tin | Dùng cho |
|---|---|
| Hotline, Zalo (số hoặc link), Messenger, email hỗ trợ, giờ làm việc, địa chỉ cửa hàng | S4, footer, phiếu giao hàng |
| Nội dung thật: Giới thiệu, Chính sách đổi trả (số ngày, điều kiện), Giao hàng và thanh toán, Bảo mật | S1, S5, C5 |
| Logo nền trong suốt (SVG/PNG) thay cho JPEG hiện tại; logo các thương hiệu | S8, header, in phiếu |
| Ảnh và mô tả sản phẩm thật, thương hiệu thật | thay dữ liệu minh họa |
| Ngưỡng miễn phí ship, phí tiêu chuẩn muốn dùng; biểu phí theo vùng | S6, C3a |
| Quyết định về ô đồng ý điều khoản khi đặt hàng (giữ bắt buộc hay chuyển thành dòng thông báo) | S7 |
| Nhà vận chuyển đã chọn và khóa API | C3b |
| Dịch vụ nhận biến động số dư hoặc cổng thanh toán đã chọn và khóa | C4 |
| Máy chủ SMTP (host, tài khoản, địa chỉ gửi) | C1 |
| Mã GA4, Meta Pixel | C5 |
| Giá vốn từng SKU (nếu muốn báo cáo lợi nhuận) | B4 |
| Danh sách nhân viên và vai trò thực tế | B5 |
