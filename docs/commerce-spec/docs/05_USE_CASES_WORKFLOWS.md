# 05 — Use cases & workflow end-to-end

## Quy ước
Actor: Guest (khách vãng lai), Customer, CatalogManager, WarehouseStaff, Sales, Finance, Writer, SEOEditor, Admin, Boss, SystemJob. Các UC có happy path, lỗi và dữ liệu thay đổi. Toàn bộ phản hồi 4xx/5xx phải giữ input form khi hợp lý và giải thích rõ.

## UC-01 Khách tìm và mua 1 SKU (P1)
**Tiền điều kiện:** website truy cập được; product `published`, variant `active`, có available>0; không cần đăng nhập.
1. Guest vào trang chủ → tìm theo từ khóa → GET catalog/products server-side paginated. Kết quả trả product parent với SKU representative.
2. Guest mở `/san-pham/:slug` (giữ slug variant hiện có). Server trả product, variants, options, images, stock availability. SEO HTML initial có title/H1/description/schema.
3. Guest chọn `Màu xanh`, `240 ml` → front-end resolve đúng `variant_id` theo map combination; cập nhật giá, ảnh, SKU, stock và URL hợp lệ.
4. Thêm `quantity=2`: frontend lưu giỏ tạm, hiển thị SKU và số lượng; nếu Customer, sync giỏ với API hiện có.
5. Tới checkout: POST `/api/quote` tính lại toàn bộ tiền từ DB. Hiển thị subtotal, discount, shipping fee, total; không tin price trên client.
6. Điền người nhận + chọn COD/VietQR → POST `/api/orders` kèm `idempotencyKey` duy nhất cho lần submit.
7. Transaction lock inventory balance, check available, reserve, create order/items snapshots/payment/shipment/audit tương ứng, commit; trả order number và token tra cứu hợp lệ.
8. Guest thấy trang cảm ơn có mã đơn, cách tra cứu, thông tin chuyển khoản nếu có và enabled.
**Lỗi:** SKU hết hàng trước checkout → `409 insufficient_stock`, không tạo đơn, UI gợi ý thay quantity; mất response sau COMMIT → retry cùng key trả **chính đơn đó**, không trừ tồn lần 2; chuyển khoản không cấu hình → chỉ cho COD, không tạo đơn lỗi.
**Bất biến:** `on_hand >= reserved >= 0`; không mua hàng hư; order items snapshot bất biến khi sửa giá sau đặt.

## UC-02 Nhân viên tạo Product + 3 SKU + ảnh (P1)
**Actor:** CatalogManager; permission `catalog.create/edit`, `media.upload`, `catalog.publish` khi được cấp.
1. Admin → Sản phẩm → Tạo mới; lưu `draft` Product cha có name, brand, primary category, mô tả ngắn/dài, SEO, parent ID.
2. Chọn nhóm attribute `Dung tích=[160ml,240ml]`, `Màu=[Xanh,Hồng]`; hệ thống đề xuất 4 combinations, người dùng có thể loại một → còn 3 SKU.
3. Cho mỗi dòng điền SKU unique, barcode (optional), price VND, compare-at optional, hình riêng, status. Validate duplicate SKU/barcode/combo, price integer>=0 và business rules.
4. Chọn cover từ media library/upload; điền alt, mô tả chi tiết, bảng thông số, FAQ và ảnh trong nội dung.
5. Chọn kho không trực tiếp điền stock từ Product editor; nếu có `initial stock` phải mở chứng từ nhập kho có audit và posted transaction.
6. Preview desktop/mobile, slug và metadata. `Publish` chạy checklist, ghi publish_at, publish log, sitemap queue.
7. Frontend và catalog API hiển thị product real-time; Google chỉ index khi public HTTPS, noindex LAN test.
**Lỗi:** SKU trùng → `409 sku_conflict`; 2 editor cùng sửa → stale version `409 version_conflict` kèm current version; thiếu cover/valid category → `422 publish_requirements` với danh sách fields; media upload lỗi → trạng thái retry, không làm mất draft.

## UC-03 Quản lý 2 kho, nhập – xuất – chuyển – hoàn (P2)
**Actors:** WarehouseStaff lập phiếu, người có quyền duyệt quyết định posted.
**Nhập kho:** Create receipt draft → items(variant_id,warehouse_id,qty>0,cost optional) → submit → approve → post trong một DB transaction cập nhật inventory_balances + movement rows + audit. Receipt posted immutable; số liệu chỉ cộng **một lần** theo idempotency key/doc status.
**Chuyển kho:** Chọn nguồn normal, đích damaged, SKU 5 đơn vị → lock hai balances theo thứ tự cố định, validate source physical non-reserved available; `-5` source và `+5` target, 2 movement records chung `document_id`, commit hoặc rollback toàn bộ.
**Trả hàng:** Sales tạo RMA tham chiếu order + qty<=đã giao trừ returns trước; kho nhận, đánh giá A nguyên chưa mở → normal / B mở/hư → damaged; approve/post một lần; refund riêng theo payment flow; không mặc định tự hoàn tiền.
**Kiểm kê:** Snapshot expected; nhân viên count actual, approve discrepancy → `stocktake_adjustment` có reason và audit, không cho on_hand < reserved. **Không** trực tiếp UPDATE số tồn trong UI mà không có ledger.
**Lỗi:** transfer nguồn không đủ `409 insufficient_stock`; post lặp `409 already_posted` hoặc idempotent same result theo contract; hủy posted = reversal document có người phê duyệt, không xóa ledger.

## UC-04 Nhân viên xử lý đơn hàng và thu tiền (P1)
Sales lọc `pending` → xác nhận → preparing → shipped → delivered. Mỗi bước server validate transition, actor, timestamp, append history. Khi shipped: consume inventory reservations đúng một lần và tạo movement sale; khi cancel trước shipped: release; khi COD delivered thì **không** tự paid, Finance/Sales được quyền ghi nhận thu thực tế. Khi VietQR: nhân viên xác minh trong ngân hàng rồi chọn Confirm paid; không chuyển shipped trước paid; không hủy thường sau khi đã paid nếu chưa có quy trình refund. Xử lý `409 invalid_transition`, double click, concurrent editing bằng lock/version.

## UC-05 Biên tập và xuất bản bài tin tức SEO (P1)
1. Writer mở CMS → thêm bài viết title/slug/category/tags/excerpt/cover; soạn thảo bằng block (H2/H3, text, ảnh alt, links, sản phẩm liên quan, FAQ hợp lệ nếu có).
2. Auto-save draft với version; HTML sanitation/approved blocks. Mỗi lần gửi duyệt tạo revision và audit.
3. SEOEditor xem preview có auth (preview không index, không xuất hiện sitemap), rà nội dung, nguồn, title, meta, canonical, internal links, ngôn ngữ và claim sản phẩm. Trả lại có lý do hoặc approve.
4. Publish now hoặc schedule publish_at trong timezone Asia/Ho_Chi_Minh; DB dùng timestamptz UTC.
5. Job atomically claim due publications, skip already-published/revoked, emit structured logs; sau publish server trả 200 HTML với Article JSON-LD và metadata, sitemap lastmod cập nhật, homepage related list cập nhật.
6. Khi đổi slug: tạo 301 old→new; canonical trỏ final URL; tránh redirect loop/chain. Khi unpublish: trả 404/410 hợp lý hoặc redirect có chủ đích; không lộ content draft.
**Lỗi:** schedule quá khứ (nếu trạng thái cần future) → 422; bài chưa approved → 403; stale revision → 409; broken media → preview cảnh báo, không publish nếu cover bắt buộc.

## UC-06 Khách từ bài SEO đến sản phẩm (P1)
Google hoặc link mạng xã hội → `/tin-tuc/:slug` published có nội dung chính trong HTML response → đọc bài → product embed link/call-to-action → product page → chọn SKU → đặt hàng. Track UTM ở analytics first-party/private (nếu có) nhưng canonical không chứa UTM, không đặt conversion giả. Link sản phẩm inactive ẩn CTA, hiển thị nội dung liên quan khác.

## UC-07 Admin cấp quyền và khóa nhân viên (P1)
1. Admin có `users.manage` truy cập danh sách, mời/tạo staff theo quy trình an toàn. User role `customer` mặc định; không tự cấp quyền khi đăng ký public.
2. Gán role theo RBAC_MATRIX (permission server-side). Admin không thể tự nâng vượt quyền hoặc làm hệ thống mất người quản trị cuối cùng.
3. Staff đăng nhập; admin menu ẩn phần không có quyền, endpoint vẫn kiểm permission độc lập.
4. Khóa nhân viên → revoke sessions; login tiếp theo bị từ chối, audit actor và lý do.
**Lỗi:** nhân viên truy cập API qua DevTools → 403; request xóa quyền admin cuối cùng → 409.

## UC-08 Đổi giá khi đang có khách đặt đơn (P1)
CatalogManager đang cập nhật SKU price từ 179000 → 189000, khách đã ở checkout với quote 179000. Khi khách submit, server recompute giá tại thời điểm lock và yêu cầu khách chấp nhận mức giá mới trước khi tạo order nếu quote khác; không âm thầm tăng giá. Đơn tạo trước khi update giữ snapshot 179000; đơn sau cập nhật là 189000. Không sửa trực tiếp order_items.

## UC-09 Mở LAN và chuyển public sau (P0/P3)
LAN: one host Docker app (port3001) + PostgreSQL volume non-public. Bind app to LAN IP/interface cấu hình, Windows Firewall Private LocalSubnet, nhân viên truy cập `http://IP:3001`, xác thực phân quyền, media lưu volume durable. Khi public: backup+restore verify, reverse proxy domain/HTTPS, env COOKIE_SECURE/NODE_ENV production, PUBLIC_BASE_URL, trust proxy đúng, security headers, content SEO index enabled sau kiểm duyệt; không tái tạo database mới rồi bỏ dữ liệu cũ.

## Luồng hệ thống dạng state machines
- Product: `draft → in_review (optional) → published → archived`; published→draft hoặc unpublished chỉ có permission và hậu quả SEO rõ; variant active/inactive/draft độc lập nhưng publish product kiểm SKU eligible.
- Article: `draft → in_review → approved → scheduled → published → archived`; `approved→published` ngay; rejection `in_review→draft` có reason.
- Order existing: `pending→confirmed→processing→shipped→delivered`; hủy từ pending/confirmed/processing theo ràng buộc payment; không thêm trạng thái trong orders CHECK nếu chưa thiết kế migration đầy đủ.
- Inventory document: `draft→submitted→approved→posted`; reject từ submitted; reversal một chứng từ khác; `posted` immutable.
- Return: `requested→approved→received→inspected→closed/rejected`; refund có state riêng, không đồng nhất return closed với money refunded.
- Refund: `requested→approved→processing→completed/failed/cancelled`; completed chỉ sau bằng chứng tiền trả, idempotent.

## Quy tắc hệ thống nếu frontend và backend mất kết nối
- Client có retry/backoff cho read; mutation có idempotency token, không tự retry mù quáng khi có thể tạo trùng.
- User nhận thông báo mất kết nối; draft được lưu khi an toàn; không báo "thành công" trước response server.
- Jobs background có lease/lock; app restart không nhân đôi publish/sitemap/notify.
- Realtime không bắt buộc giai đoạn đầu: refresh/poll hợp lý + conflict detection là đủ cho công ty quy mô nhỏ.
