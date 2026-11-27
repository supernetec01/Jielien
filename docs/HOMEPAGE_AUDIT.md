# Audit và refactor trang chủ Jielien

## 1. Architecture Analysis

Node.js 24, JavaScript ES modules và PostgreSQL. HTTP server của repo phục vụ HTML, tài nguyên tĩnh và API JSON. UI dùng template string và Custom CSS trong `brand.css`, `style.css`, `storefront.css`, `language.css`. CMS nội bộ quản lý banner, cấu hình cửa hàng và tin tức. Trang chủ render SSR mỗi request, sau đó SPA tải dữ liệu và render lại. Journal dùng SSR và `shell-v3.js`.

## 2. Homepage Audit Report

| Phần | Điểm vào và phụ thuộc | Hiện trạng |
| --- | --- | --- |
| Shell | `public/index.html`, `app.js`, `shell-v3.js`, `category-navigation.js`, `language.js`, `ui-icons.js` | Logo, search, nav, menu, tài khoản, wishlist và giỏ rải trên nhiều hàng. Danh mục lặp ở nav, menu và footer. Menu có Escape và điều khiển bàn phím. |
| Hero | `server.mjs` → `lib/seo.mjs` → `public/v3-storefront.js`; trình duyệt gọi cùng renderer từ `app.js` | Banner CMS phủ nền dưới chữ, CTA đơn. Hai poster cạnh tranh sự chú ý. Không có ảnh mặc định khi CMS trống. |
| Danh mục | `renderHome`, `categoryLink`, API danh mục | Tám ô nhỏ và danh sách bộ lọc cùng lặp nhãn. Ảnh nhỏ trên điện thoại. |
| Sản phẩm | `renderCard` dùng chung listing, yêu thích và homepage; catalog API | Giá, SKU, hàng và thao tác giỏ có dữ liệu. Empty state chiếm nguyên section. Không có nguồn rating hoặc thứ hạng bán chạy công khai. |
| Journal | `renderHome`, `lib/cms.mjs`, `lib/journal.mjs` | Tin mới có link và thumbnail nhưng thiếu ngày và chuyên mục ở homepage. Section vẫn hiện khi dữ liệu trống. |
| Footer | `index.html`, `hydratePublicShell` | Có nhận diện, tài khoản, tra cứu và thông tin CMS. Đổi trả và giao hàng chưa có link tại footer. |
| Newsletter và bằng chứng xã hội | Kiểm tra routes, migrations và cấu hình CMS | Không có luồng đăng ký newsletter, số khách, điểm đánh giá hoặc tài khoản social đã xác minh. |

## 3. Technical Debt Report

`app.js` khoảng 70 KB, `storefront.css` khoảng 70 KB và `style.css` khoảng 30 KB chưa nén. Nhiều lớp CSS ghi đè hero, grid và header. Các selector minh họa hero cũ còn trong CSS. Việc tải lại cả trang chủ qua SPA có thể thay ảnh và dịch bố cục. Banner và sản phẩm đã có kích thước ảnh, ảnh dưới màn hình đầu đã lazy load. Nút hamburger, search, CTA và một số action thiếu vùng bấm tối thiểu 40 px trên viewport nhỏ; nhãn trợ năng wishlist và search đã có. CSS cũ khó cô lập tác động lên các route dùng chung.

## 4. SEO Audit

SSR đã có một H1, liên kết nội bộ và noindex theo cấu hình. Title lặp tên thương hiệu; description chung chung; thiếu og:image và Twitter title/description/image; JSON-LD chỉ có Organization tối giản. Canonical phụ thuộc HTTPS origin cấu hình, đúng cho môi trường phát triển. Liên kết category từ nội dung đã SSR, còn danh mục shell xuất hiện sau JavaScript. Poster dùng H3 trước H2. Journal không xuất ngày trong markup trang chủ. Giữ nguyên chính sách robots và canonical origin.

## 5. Responsive Audit

Chromium, fixture repo riêng, viewport cao 900 px, trước thay đổi.

| Rộng (px) | Tràn ngang | Cột sản phẩm | Mép dưới CTA hero (px) | Vấn đề |
| --- | --- | --- | --- | --- |
| 320 | 0 | 2 | 486 | Hamburger 37 px, nút tìm kiếm, giỏ và CTA dưới 40 px |
| 375 | 0 | 2 | 462 | Tương tự 320, danh mục rất hẹp |
| 768 | 0 | 3 | 510 | Ba action dưới 40 px |
| 1024 | 0 | 3 | 544 | Ba action dưới 40 px |
| 1280 | 0 | 4 | 623 | Hero CTA thấy được, nav cuộn khi nhiều danh mục |
| 1440 | 0 | 4 | 644 | Hero CTA thấy được |
| 1920 | 0 | 4 | 650 | Nội dung dừng mở rộng theo container |

## 6. Existing APIs Used

`GET /api/categories`, `GET /api/products?limit=8&category=…`, `GET /api/news`, `GET /api/site`. Search dùng `GET /api/catalog/search`. Các hành động mua hàng dùng `GET /api/catalog/skus?ids=…`, `GET /api/auth/me`, các thao tác hiện có trên `/api/cart`, `POST /api/quote` và `POST /api/orders`. Search, giỏ và tài khoản tiếp tục dùng helper Fetch `api()` với cookie same-origin và CSRF khi cần. Không có framework hooks. Các điểm tái sử dụng là `loadCatalog`, `renderCard`, `renderHero`, `hydratePublicShell` và `setupCategoryNavigation`.

## 7. Existing Data Contracts

Danh mục từ `categories` với `id`, `slug`, `name`, `image_url`. Catalog từ `items`, `total`, `page`, `pages`, `facets`; card dùng `id`, `slug`, `name`, `brand`, `image`, `price`, `oldPrice`, `priceVaries`, `stock`, `weight`, `sku`. News từ `items` với `slug`, `title`, `excerpt`, `coverUrl`, `coverAlt`, `publishedAt` và `categoryId`. Public DTO có ID chuyên mục nhưng thiếu tên chuyên mục. Site trả `settings` theo `key/value_json` và `banners` với slot, ảnh desktop/mobile, focal point và CTA.

## 8. Existing Business Rules

Giữ thứ tự catalog, giới hạn tám sản phẩm, category filter, giá theo SKU/kho, badge giảm giá, trạng thái tồn, wishlist và giỏ. Chỉ banner và bài hợp lệ công khai qua nguồn hiện tại. Giữ slot hero, hai poster phụ, banner ngang và cơ chế dừng/chuyển. Không sửa endpoint, payload, schema, quyền, sự kiện hoặc checkout.

## 9. Potential Breaking Changes

Bỏ data attributes có thể làm hỏng listener hoặc test. Ẩn toàn bộ section khi filter rỗng sẽ khóa bộ lọc. Áp CSS không giới hạn homepage có thể đổi listing và checkout. Gắn tên “bán chạy” cho catalog mặc định, rating, số khách, newsletter giả hay danh mục chưa tồn tại sẽ làm sai dữ liệu. Giữ selector nghiệp vụ, đưa filter rỗng về CTA, scope CSS theo route và dùng nội dung CMS đã tồn tại.

## 10. Refactor Plan

| Vấn đề | Nguyên nhân | Cách xử lý | Tác động dự kiến |
| --- | --- | --- | --- |
| Hero và CTA thiếu trọng tâm | Overlay và poster cạnh tranh | Chia 50/50, ảnh dự phòng, CTA chính/phụ, giữ banner CMS | Cao |
| Mật độ mobile và empty state | Grid cũ và section luôn render | Grid theo breakpoint, ẩn section rỗng, giữ lối thoát khi lọc | Cao |
| Thiếu trust và hỗ trợ | Nội dung và liên kết nằm rải rác | Dùng cấu hình cửa hàng và chính sách hiện có | Trung bình |
| Thiếu metadata | Nhánh SSR chỉ định metadata cơ bản | Hoàn thiện metadata và JSON-LD ở trang chủ | Cao |
| Rủi ro regression | Renderer dùng chung và SPA routing | Scope trang chủ, kiểm thử empty/populated và luồng Chromium | Cao |

## 11. Files To Modify

`public/v3-storefront.js`, `public/index.html`, `public/app.js`, `public/category-navigation.js`, `public/homepage.css`, `public/locale-zh.js`, ảnh WebP dự phòng, `lib/seo.mjs`, `server.mjs` cho nén tệp tĩnh và các kiểm thử homepage bị ảnh hưởng.

## 12. Code Changes

- Header sticky và blur, hàng desktop 80 px, hamburger trên màn hình nhỏ, đường dẫn tới bộ lọc thương hiệu và thông tin liên hệ. Footer có chính sách đổi trả, vận chuyển, tài khoản, tra cứu và dữ liệu liên hệ CMS.
- Hero 50/50 ở desktop, xếp dọc trên mobile, có hai CTA. Banner CMS giữ ảnh desktop/mobile, focal point và điều khiển xoay/dừng. Hero SSR được tái sử dụng khi markup trùng với lần render phía trình duyệt. Hai bộ ảnh WebP minh họa do AI tạo chỉ dùng khi CMS thiếu ảnh chiến dịch.
- Ba danh mục nổi bật lấy từ catalog, ưu tiên các danh mục yêu cầu nếu có và giữ toàn bộ danh mục trong menu. Bộ lọc sản phẩm giữ nguyên. Grid sản phẩm 1/2/4 cột, giữ nguyên giá, tồn kho và nút mua. Ẩn mục sản phẩm và Journal khi nguồn rỗng. Với bộ lọc đang chọn, giữ nút đổi bộ lọc nếu kết quả rỗng.
- Bốn thẻ hỗ trợ dùng nội dung CMS hoặc liên kết hiện có. Bộ sưu tập ưu tiên banner ngang CMS và giữ hai slot poster phụ. Journal có ảnh, tên bài, trích đoạn và ngày xuất bản.
- SEO SSR có H1 duy nhất, canonical theo origin HTTPS đã cấu hình, Open Graph, Twitter Card và JSON-LD Organization/WebSite. Tệp CSS và JavaScript tĩnh hỗ trợ gzip khi trình duyệt yêu cầu.

## 13. Final Result

Chromium kiểm tra dữ liệu fixture qua schema riêng, không dùng dữ liệu khách hàng. Viewport cao 900 px.

| Rộng (px) | Tràn ngang (px) | Cột sản phẩm | Mép dưới cụm CTA (px) | Nút nhỏ nhất (px) |
| --- | --- | --- | --- | --- |
| 320 | 0 | 1 | 535 | 44 |
| 375 | 0 | 1 | 455 | 44 |
| 768 | 0 | 2 | 406 | 44 |
| 1024 | 0 | 4 | 495 | 44 |
| 1280 | 0 | 4 | 572 | 44 |
| 1440 | 0 | 4 | 613 | 44 |
| 1920 | 0 | 4 | 618 | 44 |

- `npm test` 101/101, `npm run test:browser` 14/14, `npm run test:frontend-v3` 12/12, `npm run test:storefront-language` qua năm độ rộng. Axe báo 0 vi phạm trong lần kiểm tra trang chủ V3.
- Lighthouse 13.6 với fixture cục bộ đạt Performance 97 mobile, 100 desktop, Accessibility 100 và SEO 100 trên cả hai. CLS 0.003 / 0.005, LCP 2.50 s / 0.55 s. Best Practices 96 do guest nhận 401 từ luồng xác định phiên hiện có. Đây là kết quả đo trong môi trường thử nghiệm.
- Ứng dụng cloud đã được khởi động lại. Health và HTML SSR phản hồi thành công.
- [Mobile 375 px, catalog và banner thử](screenshots/homepage-refactor/catalog-mobile.png)
- [Desktop 1440 px, catalog trống và ảnh dự phòng](screenshots/homepage-refactor/empty-catalog-desktop.png)

Catalog hiện dùng nhãn “Sản phẩm nổi bật” vì chưa có nguồn xếp hạng bán chạy. Điểm đánh giá, số liệu social proof, tài khoản mạng xã hội và tuyển dụng cần nội dung xác minh. Newsletter cần luồng consent và đăng ký. Journal hiển thị nhãn chung và ngày xuất bản vì DTO công khai hiện chỉ có ID chuyên mục. Mức hiệu năng và kết quả kiểm thử trên môi trường triển khai thật vẫn cần được đo với dữ liệu thật.
