# JIELIEN International — Frontend redesign V3

**Bản bàn giao cho Codex** · Repository: `https://github.com/supernetec01/Jielien.git` · Nhánh cơ sở: kiểm tra `main` mới nhất trước khi làm · Ngôn ngữ: Tiếng Việt.

## 0. Tài liệu gốc và mục tiêu

- Tài liệu trực quan: `JIELIEN_FRONTEND_V3.html` (HTML/CSS/JS tự chứa, mở bằng Chrome/Edge, không cần server, npm hoặc internet).
- Đồ họa sản phẩm trong HTML **chỉ là minh họa vector** cho UX; không được nhập ảnh, giá, nội dung, mã SKU hoặc stock mẫu vào database vận hành.
- File HTML dùng route hash `#/...` để mô phỏng chuyển trang mà không cần server. **Khi triển khai thật, phải dùng URL thật `/san-pham`, `/san-pham/:slug`, `/tin-tuc`, `/tin-tuc/:slug` và SSR/HTML indexable đã có; không chuyển sang hash-routing cho production.**
- Mục tiêu: redesign **toàn bộ frontend công khai** Jielien thành một website **đa ngành**, không giữ giao diện thiên về mẹ & bé; giữ thương hiệu navy `#0B1B34` và xanh lá `#8AB72A` (hài hòa với logo thật). Mẹ & Bé là một ngành bình thường, không phải toàn bộ website.
- Không tái sử dụng thanh demo chuyển giữa Store / Admin. Không đặt liên kết `Quản trị`, `Admin`, dashboard hoặc các thông tin nội bộ trong header/menu/footer công khai. Backend `/api/admin/*` tiếp tục bảo vệ bằng RBAC; liên kết vào trang quản trị chỉ hiện trong trang tài khoản khi session có quyền hợp lệ.

## 1. Thành phần màn hình cần khớp

| Khu vực | Thiết kế trong HTML | Yêu cầu khi triển khai |
|---|---|---|
| Top strip | Navy mỏng, tagline và thông tin hỗ trợ | Đọc text từ company settings, không dùng số điện thoại giả |
| Header | Logo nguyên bản, search lớn, tài khoản, yêu thích, giỏ | Trỏ đến luồng account/cart sẵn có; avatar/role đúng session |
| Navigation | Danh mục mẹ & bé, gia dụng, làm đẹp, công nghệ, quà tặng... | Danh mục thật từ DB; menu responsive; không hardcode cố định |
| Hero | Hero lớn trái (tỉ lệ khoảng 65%), 2 poster phải | Banner theo slot do Admin quản lý, lịch đăng, link, desktop/mobile |
| Trust strip | Lợi ích | Thông điệp đã được công ty chấp thuận |
| Category grid | 8 ngành hàng, icon/ảnh đặc trưng | Danh mục/ảnh/logo từ DB, có fallback khi thiếu |
| Campaign strip | Banner quảng cáo ngang | Quản lý vị trí bằng Admin |
| Product showcase | Tab theo ngành + 4 card/row desktop, 2 card/row mobile | Dữ liệu catalog thực, tồn/giá theo SKU từ backend |
| Product detail | Gallery, variant selector, stock, qty, giỏ hàng, mô tả | Sử dụng backend quote/order giữ tồn, không tính giá ở client |
| News | 3 card editorial, listing và bài viết | API CMS + SSR, canonical, OG, Article JSON-LD, sitemap |
| Newsletter | Form minh họa | Chỉ bật nếu có backend lưu consent hợp lệ; nếu chưa có, ẩn khỏi production |
| Footer | 4 cột có thương hiệu, danh mục, hỗ trợ, công ty | Thông tin pháp lý chính xác từ settings; không có liên kết Admin công khai |
| Mobile | Menu, search, bottom navigation, hero gọn | Tránh overlap sticky/footer, screen 320–430px |

## 2. Bố cục và quy chuẩn thiết kế

- Chiều rộng nội dung tối đa `1360px`, padding desktop `28px`, mobile `15px`.
- Header desktop 102px; nav 58px; hero desktop 481px; mô hình 2/3 hero + 1/3 poster stack.
- Màu: navy `#0B1B34`, heading `#14243B`, xanh lá `#8AB72A`, nền trắng `#FFFFFF`, nền trang `#F7F8F7`, viền `#E6EAE8`.
- Dùng chung CSS variables/tokens. Không viết CSS trùng lặp gây xung đột giữa `brand.css`, `style.css`.
- Layout 4 card desktop, 3 card tablet, 2 card mobile. Ảnh cover theo tỷ lệ thiết kế, `object-fit:cover` cho ảnh chiến dịch và `contain` cho ảnh sản phẩm tách nền. Có skeleton, empty state, loading, error, unavailable.
- Phong cách: clean, editorial commerce, navy + green, bo góc 12–22px, nhiều whitespace, hover nhẹ, keyboard focus rõ, icon cùng phong cách.
- Sử dụng logo gốc và phiên bản trong suốt có xác minh với thương hiệu; không tự vẽ lại logo bằng chữ/icon.

## 3. Banner/Poster: nơi công ty tự đăng ảnh và quản lý

Phải có các slot độc lập: `home_hero`, `home_side_top`, `home_side_bottom`, `home_wide`, `category_hero`, `article_featured`. Mỗi entry cần tối thiểu:

```
id, slot, asset_desktop_id, asset_mobile_id, alt, title, subtitle,
cta_label, target_path, sort_order, status,
start_at, end_at, version, created_by, updated_by
```

- Admin chọn vị trí, chọn media từ thư viện, nhập CTA/link nội bộ, cấu hình lịch chạy, thứ tự, trạng thái, preview desktop và mobile. Không cho banner hết hạn xuất hiện.
- Có banner dự phòng khi slot trống; fallback có thể ẩn không gian quảng cáo thay vì để khoảng trống.
- Upload ảnh phải được backend xác minh MIME/magic bytes, giới hạn file/kích thước; phục vụ qua `/media/`, giữ immutable assets; không chấp nhận SVG/HTML không an toàn nếu chưa sanitize.
- Đề xuất kích thước (tùy bộ crop tự động): hero desktop 1600×900 px; poster phải 700×550 px; wide 1600×450 px; hero mobile 750×920 px; category banner 1600×420 px. **Đây là thông số thiết kế khuyến nghị, không phải kích thước upload bắt buộc.**
- Có lịch trình, ảnh mobile, crop focal point và giới hạn chiều cao/trọng số để đạt LCP hợp lý. `srcset/sizes`, WebP/AVIF nếu pipeline hỗ trợ; tránh CLS bằng aspect ratio cố định.
- Hệ thống đang có `page_banners`/`media_assets` và API `/api/site` (nếu tại commit đang dùng vẫn có); mở rộng bằng migration forward-only, **không** drop/overwrite bảng hay dữ liệu cũ.

## 4. Map kiến trúc source hiện có

Kiểm tra commit thật trong `main` trước khi sửa, vì repo đã tiến hóa. Các file được quan sát trên GitHub:

- `public/index.html`: cấu trúc trang công khai; thay markup header/nav/footer, không thay route bằng hash.
- `public/style.css` + `public/brand.css`: thiết kế mới, CSS tokens, responsive.
- `public/app.js`: render home, catalog, detail, cart, search; bỏ `const categories = ["Sữa", ...]` cứng; thay bằng API taxonomy.
- `lib/catalog.mjs`, `lib/commerce-routes.mjs`: sử dụng API sản phẩm có sẵn, chỉ bổ sung dữ liệu cần thiết.
- `lib/operations.mjs`: API banner hiện có; bổ sung slot, phân loại mobile, lịch/crop nếu thiếu.
- `public/commerce-admin.js`: Admin Banner/Poster Studio dùng các slot mới, phân quyền thích hợp; không copy trang demo vào Admin.
- `lib/seo.mjs`, `lib/cms.mjs` + `server.mjs`: không làm mất HTML render SSR, canonical, 301, sitemap, robots rules.
- `public/account.js` và `public/admin-access.js`: kiểm soát hiển thị điều hướng nhân viên theo role/permissions; không hạ bảo mật backend.
- Các migration thêm mới, **không sửa migration đã áp dụng, không reset PostgreSQL**.

## 5. Data contract mong muốn

- `GET /api/categories`: public, danh sách danh mục active có `id, slug, name, image_url, parent_id, sort_order` (hoặc tương đương), không trả admin-only fields.
- `GET /api/products`: có product parent/variant, category, brand, cover, price hiển thị, stock/availability, badge; dữ liệu bán thực và lọc tại server, phân trang; không tải cả catalog nếu lớn.
- `GET /api/site`: `banners` đã lọc theo published và lịch, nhóm slot; company settings public whitelist.
- `GET /api/news`, `/tin-tuc/:slug`: chỉ published; không hiện draft hoặc bài đang chờ duyệt.
- `GET /api/auth/me`: chỉ dùng quản lý phiên theo tài khoản; khách không được tự nâng quyền qua UI.
- Tên API/format giữ tương thích backward với frontend hiện có nếu có thể; bổ sung contract rõ cho thay đổi mới.

## 6. Use case bắt buộc

1. Guest mở trang chủ, thấy hero + poster đúng slot/thiết bị/lịch; không thấy Admin.
2. Guest tìm sản phẩm bằng từ khóa, chọn danh mục động và sắp xếp; URL chia sẻ được, state/scroll ổn định.
3. Guest mở chi tiết sản phẩm, chọn thuộc tính/biến thể; ảnh, SKU, tồn/giá cập nhật đúng; nếu hết hàng không được mua.
4. Guest thêm hàng vào giỏ, tăng/giảm, giữ dữ liệu khi tải lại; đăng nhập hợp nhất giỏ theo xử lý hiện có.
5. Checkout COD/VietQR hoạt động như hiện tại với server quote, CSRF, stock reservation và idempotency; không lấy tổng tiền DOM làm nguồn tin cậy.
6. Guest đọc bài SEO: URL thật, HTML có nội dung indexable, metadata, breadcrumbs, related products, sitemap.
7. Staff có quyền Banner quản lý vị trí/ảnh/thời hạn; người không có quyền không truy cập API mutation.
8. Khách nhập thẳng `/quan-tri` không xem dữ liệu; backend trả 401/403 tương ứng. Không lộ nút Admin trên trang công khai.
9. Khi slot thiếu ảnh mobile, fallback desktop có crop phù hợp; khi thiếu tất cả ảnh, layout không bị vỡ.
10. Tối ưu các trạng thái slow, error, empty, unauthorized, expired/banner draft, nhiều sản phẩm/danh mục.

## 7. Tiêu chí nghiệm thu

- UI quan sát được tương đương HTML tham chiếu tại desktop 1440/1366, tablet 1024/768, mobile 430/390/375/320; không tràn ngang.
- Header, main hero, poster stack, category grid, sản phẩm, editorial/news, footer giữ hình khối/độ tương phản theo mẫu.
- Admin dashboard/link không xuất hiện ở website khách, kể cả trước khi JS hydrate hoặc khi API lỗi; ẩn UI không thay thế RBAC backend.
- Navigation public dùng dữ liệu thật, không hardcode category mẹ & bé; banner qua Admin không cần sửa code.
- Không có nội dung demo, ảnh giá stock/mã SKU giả, toast thành công giả hay số liên hệ giả trong production.
- Tất cả regression/API/browser test hiện có phải đạt; bổ sung test mới cho banner slot/expiry/responsive/catalog/permission/cart/SEO SSR; kiểm chứng với PostgreSQL test riêng.
- Kết thúc mỗi giai đoạn: screenshots, test report, changed file list, migration plan, fallback, PR **chưa merge** để duyệt.
- Không merge hoặc deploy production, không thao tác database công ty nếu chưa được phê duyệt.

## 8. Thứ tự nhiệm vụ

- **F1**: Chốt baseline repo + ảnh chụp UI cũ, giữ API, backup và test.
- **F2**: Tách Design System + header/nav/footer + mobile global layout.
- **F3**: Home hero, poster slots, trust, category rail, campaign strip; backend banner slot.
- **F4**: Category listing/search/filter/sort + Product Cards + detail/variant/media gallery.
- **F5**: Journal listing/detail dùng SSR và CMS hiện có; editorial block related content.
- **F6**: Giỏ hàng & account styling, giữ hành vi giao dịch backend.
- **F7**: Admin banner/editor dùng đúng quyền và metadata mới.
- **F8**: Integration tests, responsive screenshots, performance/accessibility, migration/rollback docs.

## 9. Chỉ dẫn triển khai cho Codex

> Đọc `JIELIEN_FRONTEND_V3.html` để hiểu bố cục, spacing, màu sắc, product cards, hero/poster và các tương tác. Đây là mẫu **frontend công khai** chứ không phải source thay thế ứng dụng. Implement trong `public/*` và API hiện có, lấy dữ liệu PostgreSQL thật, không dùng mock arrays và không chuyển sản phẩm/SEO sang hash routing. Không thay backend khi không cần. Hoàn thiện theo F1-F8, viết test và tạo PR để review.
