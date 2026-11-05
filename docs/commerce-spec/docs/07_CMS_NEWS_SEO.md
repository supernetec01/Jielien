# 07 — Trang Tin tức / CMS / SEO kỹ thuật Jielien

## 1. Mục tiêu
Xây tài sản organic lâu dài: trang sản phẩm và danh mục có SEO tự nhiên, hub kiến thức/tin tức theo nhu cầu thật của khách, quản lý nội dung ngay trong admin. Website đang dùng `server.mjs` phục vụ shell `index.html` và JavaScript client render: cần **HTML response có nội dung chính cho từng URL public** để crawl tin cậy (SSR route chọn lọc hoặc pre-render + invalidation). Không cần đổi toàn bộ stack framework nếu có phương án nhỏ gọn phù hợp.

## 2. Cấu trúc website được index
| URL | Mục đích | Index? | Meta/schema |
|---|---|---|---|
| `/` | trang chủ Jielien | yes public | `Organization`, WebSite; title/canonical |
| `/san-pham` | danh sách tất cả sản phẩm | yes tùy chiến lược | CollectionPage + BreadcrumbList |
| `/danh-muc/:slug` | trang nhóm sản phẩm | yes khi có nội dung giá trị | CollectionPage + BreadcrumbList |
| `/san-pham/:slug` | product/variant detail | yes published | Product + Offer, optionally ProductGroup variants, Breadcrumb |
| `/tin-tuc` | blog/news hub | yes | CollectionPage + BreadcrumbList |
| `/tin-tuc/chuyen-muc/:slug` | category bài | yes khi đủ content, tránh thin duplicate | CollectionPage |
| `/tin-tuc/:slug` | bài viết | yes published | Article/BlogPosting + BreadcrumbList |
| `/gio-hang`,`/thanh-toan`,`/tai-khoan`,`/quan-tri` | giao dịch/admin | noindex + auth as appropriate | none |
| `/tra-cuu-don-hang`, kết quả tìm kiếm nội bộ, filter tổ hợp | task-specific | noindex theo policy | none |
| `/api/*`, preview, upload private | API/không public | không đưa sitemap, quyền/403 nếu private | none |

**LAN pre-release:** không mở indexing ngoài Internet, không tự khai báo public domain giả. Dùng `PUBLIC_BASE_URL` và `SEO_INDEXING_ENABLED` trong production config; không bật indexing khi chưa public domain/HTTPS. `robots.txt` không phải cách bảo mật thông tin; admin, draft phải protected auth. Khi public thì không để `noindex` toàn website do copy từ staging.

## 3. CMS editor: fields và lifecycle
Fields tối thiểu `title` (H1), `slug` unique, `excerpt`, `body_blocks` JSON schema + renderer sanitized, `cover_asset_id`, `cover_alt`, `article_category_id`, `tags`, `author_id`, `related_product_ids`, `seo_title`, `meta_description`, `og_image_asset_id`, `canonical_url` (optional constrained), `status`, `scheduled_at`, `published_at`, `updated_at`, `version`, `created_by`, `approved_by`, `last_revision_id`.

Block types: paragraph, heading H2/H3 (H1 do template), bullet/numbered list, quote, figure/caption/alt, table (simple), internal/external link, YouTube embed allowlist optional, product embed, FAQ section content (markup only when qualifying), callout. Không lưu raw HTML tùy ý chưa sanitize. Preview có auth + anti indexing; khi xuất bản render from published revision, không dùng unsaved draft.

Workflow: draft → review → approve → schedule (optional) → publish; edit published tạo draft revision, không thay đổi public page cho đến khi update được duyệt; archive có redirect/410/404 policy rõ; duplicate published slugs blocked. Editor có thể diff revisions và khôi phục thành draft mới.

## 4. UX Tin tức
**Listing:** hero H1 `Tin tức & Cẩm nang`, featured post, chip chuyên mục, search, cards 3/2/1 columns, summary/date/author, pagination links real, related products nếu phù hợp.
**Detail:** breadcrumb, H1, excerpt, cover với caption/alt, byline, publish & modified date, TOC auto H2/H3 anchored, share, body width ~720–780px, mobile readability, related links/posts/products, sticky toc optional desktop, author card nguồn rõ.
**Admin:** article list filters (status/category/author/dates), actions Draft/Edit/Preview/Review/Publish/Schedule/Archive/Redirect, SEO sidebar, article preview snippets (không bảo đảm Google hiển thị), broken link warning, media picker, autosave/v-conflict.

## 5. Technical SEO (acceptance)
- **HTML initial** (view-source/curl): `<title>`, meta description, canonical absolute HTTPS URL production, H1, heading/article/product main content, accessible anchor links and JSON-LD tương ứng. Không chỉ nội dung được JS chèn sau load.
- Mỗi URL published trả HTTP 200 thật, archived/unknown slug trả 404/410 thật; renamed slug trả 301 cùng host canonical, giới hạn 1 hop khi có thể; không trả 200 index.html cho 404.
- Canonical tự tham chiếu và nhất quán với sitemap/internal links; query `utm_*` không tạo canonical riêng. Filter sorting/pagination xác định index/noindex có policy, tránh canonical toàn trang phân trang về trang 1 khi nội dung khác mà không cân nhắc.
- `robots.txt`, `sitemap.xml` hoặc `sitemap-index.xml`; chỉ URL canonical public/published. Sitemap phản ánh `lastmod` nội dung thật, shard khi cần (limit 50,000 URL/50MB uncompressed per sitemap). Cache and refresh when published changes. Không cho private/staging URL.
- `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card` chuẩn; image absolute public; tránh placeholder không có thật.
- Product JSON-LD theo Product / Offer (priceCurrency VND, price, availability, url, image, sku) khớp **giá/tồn server hiện tại**; ProductGroup cho SKU families khi hợp lệ. Không tạo `aggregateRating`, `review` giả. Shipping/returns structured data chỉ khi policy thật, đúng yêu cầu Google.
- Article JSON-LD: headline, image, datePublished, dateModified, author (người thực), publisher organization, mainEntityOfPage; không đẩy bài chưa published.
- BreadcrumbList theo actual link; Organization company info có thật; LocalBusiness chỉ khi có dữ liệu địa điểm thực không bịa.
- URL: chữ thường, không dấu, dấu gạch nối, unique, không chứa text unsafe; slug change phải redirect 301, lưu lịch sử. Internal links admin phải preview và kiểm tra dead links.
- Titles/descriptions độc nhất, không keyword stuffing; media alt mô tả đúng ảnh; lazy loading ảnh dưới fold, hero ưu tiên tải; width/height tránh CLS.
- Index now không có nghĩa bảo đảm thứ hạng/hiển thị rich results; Google tự quyết định.

## 6. Nội dung SEO và tổ chức chủ đề
Không auto copy bài bên khác, không spam AI hay reup nguyên văn từ TikTok khác. Bắt đầu với chủ đề có liên quan thật tới danh mục bán hàng: hướng dẫn lựa chọn hàng mẹ và bé, bảo quản/sử dụng, so sánh quy cách, lưu ý an toàn, hậu mãi, câu hỏi trước mua. Nếu mở thêm ngành hàng như dây ràng/thiết bị, phân chuyên mục riêng để tránh nội dung mẹ bé lấn át nội dung kỹ thuật.

Mỗi **topic cluster**: 1 bài trụ cột (pillar) + 4–8 bài vệ tinh + liên kết danh mục/sản phẩm đúng ý định tìm kiếm. Mỗi bài có người chịu trách nhiệm nội dung, nguồn tham khảo, ngày rà soát, CTA nhẹ tới đúng SKU, không quảng cáo công dụng chưa được kiểm chứng. Chủ đề sức khỏe trẻ em: yêu cầu kiểm duyệt nội dung chuyên môn, không phát biểu chắc chắn về hiệu quả dinh dưỡng hoặc điều trị không có bằng chứng.

## 7. SEO Admin quality dashboard (P2)
- Coverage theo trạng thái SEO: indexable pages, missing meta, missing cover alt, duplicate title/slug, 404 internal links, redirects.
- Bài theo lịch, overdue, published, lượt click thực từ Search Console nếu tích hợp API & cấp quyền; không bịa số liệu khi chưa nối.
- URL inspection manual checklist sau publish, robots/sitemap test, valid JSON-LD via Rich Results Test.
- Khi nối Google Search Console: verify domain, submit sitemap, theo dõi Indexing, Merchant Listings, CWV; API connector optional, cần chủ sở hữu bật quyền.

## 8. Hiệu năng và đo lường
Core Web Vitals mục tiêu p75 real users trên public: **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1**; Lighthouse lab bổ sung cho trước launch. Cache public HTML với invalidation khi publish/đổi giá/tồn khi cần (không cache stale Offer lâu), assets fingerprint, image WebP/AVIF và fallback, preload hero đúng cách, tránh JS nặng đầu trang.

## 9. Bộ kiểm thử SEO tự động + thủ công
1. `curl -I /tin-tuc/existing` 200 + `text/html`, `curl` source chứa H1 + Article JSON-LD, canonical; không cần headless browser để có nội dung cơ bản.
2. `/tin-tuc/draft` không có trong API public/sitemap, trả 404/403 theo policy; preview authenticated + noindex.
3. Đổi slug article: old 301→new 200, canonical new và sitemap chỉ new.
4. Stock `0`: markup Offer availability `OutOfStock`; PDP CTA disabled, no mismatch markup/UI/API.
5. Product without real ratings: JSON-LD không có fabricated review or aggregateRating.
6. Product URL, news URL, category URL in sitemap absolute HTTPS only in production; staging noindex.
7. No script injection qua article editor; all media alt; H1 unique, screenreader headings structured.
8. Core web vitals collect lab baseline and compare after UI redesign.

## 10. Nguồn hướng dẫn chính thức kiểm tra ngày 2026-11-05
- Google Search Central JS SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google Merchant Listings/Product: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Google Product Variants: https://developers.google.com/search/docs/appearance/structured-data/product-variants/
- Canonical: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Web Vitals: https://web.dev/articles/vitals
