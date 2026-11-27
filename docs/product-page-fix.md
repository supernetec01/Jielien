# Sửa ảnh và trạng thái SKU trên trang chi tiết Jielien

## Phần 0 — Chẩn đoán trước khi sửa

Đo trên commit `9fe2950` bằng Chromium headless 156.0.8078.79, ở 375, 768 và 1280 CSS px, lần lượt DPR 1 và 2. Catalog đang chạy trên cloud trả về 0 sản phẩm. Ba sản phẩm dưới đây dùng hình minh họa có sẵn trong repo, đưa qua trình tải ảnh thật vào schema PostgreSQL và thư mục media tạm. URL dưới đây là đường dẫn thực đo trong lần chạy fixture. Các URL hết hiệu lực sau khi dọn fixture. Chưa có số đo cho catalog đang bán.

### Điểm render và nguồn tồn kho

| Vị trí ở commit gốc | Vai trò |
| --- | --- |
| `public/v3-storefront.js:237–267` | `renderDetail` dựng ảnh, nhóm SKU, nhãn tồn, số lượng và nút mua |
| `lib/seo.mjs:299–303`, `public/app.js:216–223,469–475` | SSR và trình duyệt gọi cùng renderer. Trình duyệt nhận `{ product, variants }` từ `GET /api/catalog/products/:slug` |
| `public/app.js:806–811,840–875,1395–1417,1509–1571` | Đổi ảnh, thêm giỏ, mua ngay, số lượng, thanh mua mobile và phím mũi tên của SKU |
| `public/style.css:481–515,522–530,1059–1065,1102–1143,1379–1392` | Khung ảnh, thumbnail, nhãn và kích thước cố định theo breakpoint |
| `public/storefront.css:2780–2788,3111–3113,3423–3449,3505–3517` | Các override storefront, thanh mua mobile và nút SKU |

Nguồn duy nhất cho hết hàng là `product.stock` hoặc `variant.stock` của SKU đó. `lib/public-catalog.mjs:130–142` đọc `variantSQL`. `db/store.mjs:153,174` tổng hợp `SUM(on_hand - reserved)` trên các kho `type='normal'` và `status='active'`, dùng 0 khi không có dòng, rồi đưa số đó vào DTO dưới tên `stock`. Giao diện hiện tại kiểm tra `p.stock > 0` ở nhãn và giá trị `stock` của từng SKU ở chip và nút mua. Số liệu là tổng khả dụng cho SKU, gồm tác động của lượng đã giữ, không phải tồn của một kho chọn riêng.

### URL và kích thước ảnh thực trong trình duyệt

Ảnh chính ban đầu lấy từ `p.image`. SQL ưu tiên ảnh riêng của SKU, rồi ảnh chung của sản phẩm theo thứ tự (`db/store.mjs:150–151`). Thứ tự hiển thị của gallery có thể khác thứ tự chọn ảnh chính. Một thumbnail trong mỗi gallery trỏ tới **cùng URL và cùng file** với ảnh chính. Ảnh tại thumbnail chỉ nhỏ ở lớp CSS. DTO cung cấp `image` và `gallery[{url, alt}]`, không có biến thể kích thước của cùng một ảnh. Không có `srcset`, `sizes` hoặc `picture` ở cả ảnh chính và thumbnail đã đo.

| Ảnh trong fixture | URL tương đối, thứ tự thumbnail | `naturalWidth × naturalHeight` |
| --- | --- | --- |
| Tã Baby Soft (Túi Nhỏ) | 1 `/media/b342e260-c12e-4adb-8031-de0084288212.webp` | 960 × 1080 |
| Ảnh chính Túi Nhỏ | 2 `/media/aa469cb5-7476-4ba0-b372-8e3b01e7c767.webp` | 1440 × 1620 |
| Tã Baby Soft | 3 `/media/19552063-05a8-45b8-b898-b15970f7e0a5.webp` | 960 × 1080 |
| Tã Baby Soft | 4 `/media/74c5cd30-ccd5-4cad-80b9-6dcd74dd5e5a.webp` | 700 × 700 |
| Tã Baby Soft | 5 `/media/3756879d-9c49-4edb-b8d1-3b2877f9f4fc.webp` | 700 × 700 |
| Ảnh chính bình Little Love | 1 `/media/37fc420f-b33b-433d-88f0-5fc72a73b279.webp` | 360 × 405 |
| Bình Little Love | 2 `/media/185930b2-cdfa-4753-8f9f-72f3465c3a23.webp` | 900 × 900 |
| Ảnh chính sữa Little Grow | 1 `/media/a6bff387-2790-432e-9a52-40c685a79a2c.webp` | 1600 × 1800 |
| Sữa Little Grow | 2 `/media/61351f1f-379a-45e9-b427-37fe66050a60.webp` | 800 × 900 |

Bảng sau là kích thước phần tử `img` đo bằng `getBoundingClientRect()`, theo thứ tự URL ở trên. Các ô CSS giống nhau trên hai DPR. DPR 2 cần gấp đôi số pixel ở mỗi chiều. Cột ảnh thực vẽ đã loại phần trắng do `object-fit: contain` để xác định có nội suy hay không.

| Sản phẩm | Viewport | Ảnh chính CSS ở DPR 1 và 2 | Ảnh chính thực vẽ | Thumbnail CSS ở DPR 1 và 2 |
| --- | ---: | ---: | ---: | --- |
| Tã Baby Soft | 375 | 283,50 × 270 | 240 × 270 | #1–3 38,22 × 43, #4–5 43 × 43 |
| Tã Baby Soft | 768 | 328,50 × 265 | 235,56 × 265 | #1–3 47,11 × 53, #4–5 53 × 53 |
| Tã Baby Soft | 1280 | 488,55 × 340 | 302,22 × 340 | #1–3 47,11 × 53, #4–5 53 × 53 |
| Bình Little Love | 375 | 279,89 × 270 | 240 × 270 | #1 38,22 × 43, #2 43 × 43 |
| Bình Little Love | 768 | 297,89 × 265 | 235,56 × 265 | #1 47,11 × 53, #2 53 × 53 |
| Bình Little Love | 1280 | 488,55 × 340 | 302,22 × 340 | #1 47,11 × 53, #2 53 × 53 |
| Sữa Little Grow | 375 | 279,89 × 270 | 240 × 270 | #1–2 38,22 × 43 |
| Sữa Little Grow | 768 | 297,89 × 265 | 235,56 × 265 | #1–2 47,11 × 53 |
| Sữa Little Grow | 1280 | 488,55 × 340 | 302,22 × 340 | #1–2 47,11 × 53 |

### Kết luận chẩn đoán

- Ở trạng thái đã tải, ảnh và các phần tử tổ tiên đều có `filter: none`, `transform: none`, `scale: none`, `opacity: 1`, `image-rendering: auto`, `backdrop-filter: none` và `zoom: 1` trong cả 18 lần đo. CSS cũ dùng khung be chiều cao cố định và ảnh chính rộng 90%, tạo viền rỗng quanh phần trắng của file. Thumbnail nhận `object-fit: fill` mặc định và lấy kích thước theo chiều cao, không tạo một ô ảnh vuông 72 px. Quy tắc hover chung ở `public/style.css:57–60` dùng `brightness(0.95)` cho nút, kể cả thumbnail. Trước khi trang tương tác được, CSS `button:disabled` chung hạ opacity thumbnail xuống 0,5.
- Ảnh bình 360 × 405 còn nguyên kích thước sau upload. Ở 1280/DPR 2, vùng hình thực cần khoảng 604 × 680 pixel trên màn hình, nên trình duyệt nội suy ảnh nhỏ. Đây là nguyên nhân giảm nét xác nhận được ở mẫu này. Hai ảnh chính còn lại đủ pixel ở các kích thước đo. Chưa thể gán nguyên nhân đó cho ảnh sản phẩm thật khi chưa có dữ liệu để đo.
- Pipeline hiện tại dùng Sharp, xoay theo EXIF, chặn input trên 5 MiB hoặc 25 triệu pixel, giới hạn cạnh dài ở 1800 px bằng `fit: inside` và `withoutEnlargement: true`, rồi mã hóa **WebP quality 85** (`lib/media.mjs:7–19,45–61`). Mẫu hộp sữa upload 2400 × 2700 lưu thành 1600 × 1800. Đây là cấu hình encoder, không phải điểm chất lượng suy ra từ file. Pipeline và ảnh gốc nằm ngoài bản sửa giao diện này.

## Phần 1–2 — Thay đổi giao diện

- Khung ảnh chính vuông, nền trắng, viền 1 px, bo 16 px, tối đa 640 px. Phần tử ảnh chiếm toàn bộ vùng bên trong và dùng `object-fit: contain`. Ảnh chính ưu tiên tải và có kích thước khai báo. URL vẫn lấy từ ảnh chính của SKU. Mỗi ảnh khác trong gallery giữ URL riêng vì API chỉ cung cấp một kích thước cho mỗi ảnh.
- Thumbnail là nút 72 × 72 px, tải lazy, có tên dạng “Xem ảnh 2/5” và `aria-current`. Renderer đánh dấu đúng ảnh chính dù thumbnail đó nằm sau ảnh khác. Khi đổi ảnh, handler cập nhật dấu chọn cùng với URL và alt từ media. Trên mobile hàng thumbnail cuộn ngang và bám theo từng nút. Bỏ hiệu ứng làm tối khi hover và opacity thấp của nút gallery lúc SSR.
- Chip SKU có viền và biểu tượng phân biệt. SKU hết hàng dùng xám và nhãn chữ ở dòng riêng. Khi được chọn, chip đó vẫn giữ nền xám, thêm dấu ✓ và vòng ngoài navy. Nhãn tồn cạnh mã SKU và thanh mua mobile dùng “Hết hàng”. Nhãn còn hàng có dấu ✓ và tiếp tục hiển thị số còn lại khi tồn từ 1 đến 5.
- Hiển thị “Phân loại này tạm hết hàng” ngay trên hai nút mua khi SKU có `stock = 0`. Hai nút mua vẫn dùng điều kiện vô hiệu hiện có. Ô số lượng giữ hành vi đã tải và `max=1` ở SKU hết hàng, với nền xám và chữ rõ. Chuyển lời nhắc kiểm tra quy cách xuống dưới nút mua, cỡ 14 px.

### Kích thước sau sửa

Ba trang fixture có cùng kích cỡ khung ở từng viewport. Số đo từ Chromium giống nhau ở DPR 1 và DPR 2.

| Viewport | Khung ảnh chính CSS | Phần tử ảnh CSS | Pixel cần cho hình dọc thực vẽ ở DPR 2 |
| ---: | ---: | ---: | ---: |
| 375 | 311 × 311 | 309 × 309 | 550 × 618 |
| 768 | 331 × 331 | 329 × 329 | 585 × 658 |
| 1280 | 542,84 × 542,84 | 540,84 × 540,84 | 962 × 1082 |

Nút thumbnail là 72 × 72 px. Vùng ảnh trong nút là 70 × 70 px với viền 1 px và 68 × 68 px với viền chọn 2 px. Hai ảnh chính có đủ pixel. Ảnh bình sữa 360 × 405 vẫn phải nội suy ở DPR 2, và cả DPR 1 tại 1280 px do ảnh hiển thị lớn hơn. Đây là cảnh báo chất lượng nguồn, không phải lỗi bố cục.

### Tương phản

Tính theo độ chói sRGB của WCAG. Test Playwright kiểm tra màu thực tế của chip, vòng chọn và điều khiển mua.

| Thành phần | Màu | Nền | Tỉ lệ |
| --- | --- | --- | ---: |
| Chữ và biểu tượng hết hàng, nút mua vô hiệu | `#4B5563` | `#E9EBEF` | 6,33:1 |
| Nhãn và lời nhắc hết hàng trên panel | `#4B5563` | `#FFFFFF` | 7,56:1 |
| Nhãn còn hàng có dấu ✓ | `#4E7A0E` | `#FFFFFF` | 5,10:1 |
| Chữ và vòng chọn navy trên chip trắng | `#091432` | `#FFFFFF` | 18,14:1 |
| Dấu ✓ navy trên chip hết hàng | `#091432` | `#E9EBEF` | 15,20:1 |
| Lời nhắc kiểm tra quy cách dưới nút mua | `#62716D` | `#FFFFFF` | 5,12:1 |
| Viền xanh chip còn hàng và thumbnail được chọn | `#87BB2A` | `#FFFFFF` | 2,29:1 |
| Viền chip hết hàng | `#C9CDD4` | `#E9EBEF` | 1,34:1 |
| Viền khung ảnh và thumbnail | `#E5E7EB` | `#FFFFFF` | 1,24:1 |

Các cặp chữ và nền mới đều trên 4,5:1. Các dòng viền ghi riêng vì dùng cho đường biên. Trạng thái SKU còn được thể hiện bằng chữ, dấu ✓ và vòng navy. Ảnh đang xem được xác định bằng `aria-current`.

## Phần 3 — Kiểm thử và ảnh đối chiếu

- `npm run test:browser` đạt 14/14, `npm run test:account` đạt 10/10, `npm run test:frontend-v3` đạt 12/12.
- `npm run test:bank` đạt tất cả nhóm, gồm 7 kiểm tra checkout, 3 kiểm thử cài đặt, 6 kiểm tra trình duyệt cài đặt, 6 kiểm thử đối soát và 4 kiểm tra trình duyệt đối soát. Các bộ test cũ được chạy nguyên trạng.
- `node tests/product-page.browser.mjs` đạt ở 375/768/1280 px với DPR 1 và DPR 2. Kiểm tra thêm bố cục ở 320/1440/1920 px và HTML SSR khi tắt JavaScript. Test xác minh khung vuông, nút thumbnail 72 px, chọn bằng Tab/Enter, cuộn nội bộ, cập nhật ảnh và `aria-current` mà không gọi API, thay SKU bằng mũi tên và kiểu nút mua. Ảnh thiếu pixel được in URL cảnh báo, không làm test thất bại.

Ảnh chụp dùng dữ liệu fixture cùng cấu hình ở commit gốc và nhánh sửa, DPR 1. Viewport chụp cao 1500 px để thấy toàn bộ khối mua trên mobile.

| Rộng | Trước | Sau |
| ---: | --- | --- |
| 375 px | [Trước](screenshots/product-page/before-375.png) | [Sau](screenshots/product-page/after-375.png) |
| 768 px | [Trước](screenshots/product-page/before-768.png) | [Sau](screenshots/product-page/after-768.png) |
| 1280 px | [Trước](screenshots/product-page/before-1280.png) | [Sau](screenshots/product-page/after-1280.png) |

### Tự kiểm tra và hoàn tác

1. Trong checkout có nhánh `fix/product-page-image-sku`, chạy `npm run local:start` để build và chạy bản Docker. Mở một sản phẩm có cả SKU còn hàng và SKU hết hàng ở cổng 3001.
2. Thu màn hình về 375 px. Cuộn hàng ảnh, Tab đến một thumbnail rồi Enter. Kiểm tra ảnh chính đổi đúng, khung vẫn vuông và viền xanh theo thumbnail đã chọn.
3. Tab đến SKU hiện tại rồi dùng phím mũi tên để chuyển sang SKU hết hàng. Kiểm tra chip vẫn xám, có ✓ và vòng navy, giá và ảnh là của SKU đang xem, hai nút mua vô hiệu. Chuyển lại SKU còn hàng và kiểm tra nút mua.
4. Nếu cần hoàn tác sau khi đã áp dụng bản sửa, dùng `git revert <mã-commit-bản-sửa>`, rồi chạy lại `npm run local:start` để build lại ứng dụng.

### Việc cần kiểm tra với catalog thật

Đo URL của ảnh chính đang chọn trên thiết bị DPR 2. Nếu file nhỏ hơn gấp đôi vùng vẽ, hãy tải lại ảnh gốc đủ pixel và đặt làm ảnh chính của đúng SKU. Ảnh vuông hiển thị tối đa 640 px cần khoảng 1280 × 1280 pixel ở DPR 2. Nếu ảnh gốc đủ lớn nhưng file sau upload vẫn thiếu độ nét, so sánh ảnh trước và sau upload để đánh giá riêng giới hạn 1800 px và WebP quality 85.

## Cập nhật bố cục danh sách và chi tiết

Danh sách ưu tiên ảnh, tên, giá và một nhãn hoặc thao tác mua trên mỗi thẻ. Trang chi tiết đặt ảnh thu nhỏ bên trái trên desktop và dưới ảnh chính trên điện thoại. Một ảnh hoặc một SKU không cần bộ chọn riêng. Thông tin mua gồm giá, mã SKU, số lượng, trạng thái hàng và hai nút. Mô tả, thông số và lưu ý vẫn có ở phần dưới.

Ứng dụng đo kích thước nội tại của ảnh raster sau khi tải và giới hạn phần hiển thị theo DPR của màn hình. Chromium đo ảnh fixture WebP 360 × 405 px hiển thị ở 360 × 405 CSS px tại DPR 1 và 180 × 202,5 CSS px tại DPR 2 trên viewport rộng 1440 px. Ảnh giữ tỉ lệ trong khung vuông. Chính sách upload và tệp WebP giữ nguyên. Chưa có tệp gốc hoặc URL đang bán của sản phẩm Khăn ướt để xác nhận nguyên nhân cụ thể của ảnh đó.

Các màu chữ đã kiểm tra với công thức độ chói sRGB của WCAG.

| Vị trí | Chữ | Nền | Tỉ lệ |
| --- | --- | --- | ---: |
| Nút chính Thêm vào giỏ | `#FFFFFF` | `#0B1B34` | 17,20:1 |
| Chip và nút hết hàng | `#4B5563` | `#E9EBEF` | 6,33:1 |
| Nhãn Hết hàng cạnh số lượng | `#4B5563` | `#F7F8F7` | 7,10:1 |
| Nhãn Còn hàng cạnh số lượng | `#4E7A0E` | `#F7F8F7` | 4,79:1 |
| Mã SKU và giá cũ | `#62716D` | `#F7F8F7` | 4,81:1 |

Ảnh chụp dùng dữ liệu fixture từ PostgreSQL và ảnh minh họa tải qua trình tải ảnh của ứng dụng.

| Màn hình | Desktop 1440 px | Điện thoại 375 px |
| --- | --- | --- |
| Danh sách | [Danh sách desktop](screenshots/product-display/catalog-desktop.png) | [Danh sách điện thoại](screenshots/product-display/catalog-mobile.png) |
| Chi tiết | [Chi tiết desktop](screenshots/product-display/detail-desktop.png) | [Chi tiết điện thoại](screenshots/product-display/detail-mobile.png) |
