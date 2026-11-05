import { createReturns } from "./returns.mjs";
import { createCatalogImport } from "./catalog-import.mjs";
import { createCatalog } from "./catalog.mjs";
import { createCms } from "./cms.mjs";
import { createMedia } from "./media.mjs";
import { createInventoryDocuments } from "./inventory-documents.mjs";
import { createOperations } from "./operations.mjs";
import {
  permit,
  id,
  reject,
  renderBlocks,
  escape,
} from "./commerce-common.mjs";
export function createCommerce(pool, { mediaDirectory, publicProducts } = {}) {
  const returns = createReturns(pool);
  const importer = createCatalogImport(pool);
  const catalog = createCatalog(pool, publicProducts),
    cms = createCms(pool),
    media = createMedia(pool, mediaDirectory),
    inventory = createInventoryDocuments(pool),
    ops = createOperations(pool);
  async function api({ req, res, path, url, user, auth, readBody, json }) {
    const method = req.method;
    if (method === "GET" && path === "/api/news") {
      json(
        res,
        200,
        await cms.publicList(Object.fromEntries(url.searchParams)),
      );
      return true;
    }
    if (method === "GET" && /^\/api\/news\/[a-z0-9-]+$/.test(path)) {
      json(res, 200, { article: await cms.publicGet(path.split("/").at(-1)) });
      return true;
    }
    if (method === "GET" && path === "/api/site") {
      json(res, 200, {
        settings: await ops.settings(),
        banners: await ops.banners(true),
      });
      return true;
    }
    if (method === "GET" && path === "/api/catalog/search") {
      const q = String(url.searchParams.get("q") || "");
      if (q.length > 120) reject(400, "validation_error", "Từ khóa quá dài.");
      const norm = (v) =>
        String(v)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")
          .toLowerCase();
      let items = (await catalog.publicProducts()).filter((p) =>
        norm([p.name, p.sku, p.brand, p.category].join(" ")).includes(norm(q)),
      );
      const category = url.searchParams.get("category");
      if (category) items = items.filter((p) => p.category === category);
      const sort = url.searchParams.get("sort");
      if (["price_asc", "price_desc"].includes(sort))
        items.sort((a, b) =>
          sort === "price_asc" ? a.price - b.price : b.price - a.price,
        );
      const page = Math.max(
          1,
          Math.floor(Number(url.searchParams.get("page")) || 1),
        ),
        total = items.length;
      json(res, 200, {
        items: items.slice((page - 1) * 20, page * 20),
        page,
        total,
      });
      return true;
    }
    const publicProduct = path.match(
      /^\/api\/catalog\/products\/([a-z0-9-]+)$/,
    );
    if (method === "GET" && publicProduct) {
      const all = await catalog.publicProducts(),
        product = all.find((p) => p.slug === publicProduct[1]);
      if (!product) reject(404, "not_found", "Không tìm thấy sản phẩm.");
      json(res, 200, {
        product,
        variants: all.filter((p) => p.productId === product.productId),
      });
      return true;
    }
    if (!path.startsWith("/api/admin/")) return false;
    const check = (p) => permit(user, p),
      body = () => readBody(req);
    let match;
    if (path === "/api/admin/users" && method === "POST") {
      check("users.manage");
      json(res, 201, { user: await auth.createStaff(user.id, await body()) });
      return true;
    }
    if (path === "/api/admin/catalog/export" && method === "GET") {
      check("catalog.read");
      json(res, 200, { csv: await importer.exportCsv() });
      return true;
    }
    if (path === "/api/admin/catalog/import" && method === "POST") {
      check("catalog.create");
      check("catalog.edit");
      const b = await body();
      if (typeof b.csv !== "string")
        reject(400, "invalid_csv", "Cần nội dung CSV");
      json(
        res,
        200,
        b.commit
          ? { summary: await importer.commit(b.csv, b.token, user) }
          : await importer.plan(b.csv),
      );
      return true;
    }
    if (path === "/api/admin/catalog/products") {
      if (method === "GET") {
        check("catalog.read");
        json(
          res,
          200,
          await catalog.list(Object.fromEntries(url.searchParams)),
        );
        return true;
      }
      if (method === "POST") {
        check("catalog.create");
        const b = await body();
        if (b.status === "active") check("catalog.publish");
        json(res, 201, { product: await catalog.save(null, b, user.id) });
        return true;
      }
    }
    if (
      (match = path.match(
        /^\/api\/admin\/catalog\/products\/(\d+)(?:\/(variants|media))?$/,
      ))
    ) {
      const productId = id(match[1]),
        part = match[2];
      if (method === "GET" && !part) {
        check("catalog.read");
        json(res, 200, { product: await catalog.get(productId) });
        return true;
      }
      if (["POST", "PATCH", "PUT"].includes(method)) {
        check("catalog.edit");
        const b = await body();
        if (!part) {
          if (b.status === "active") check("catalog.publish");
          if (b.status === "inactive") check("catalog.archive");
        }
        json(res, 200, {
          product:
            part === "variants"
              ? await catalog.variants(productId, b, user.id)
              : part === "media"
                ? await catalog.media(productId, b, user.id)
                : await catalog.save(productId, b, user.id),
        });
        return true;
      }
    }
    if (
      (match = path.match(
        /^\/api\/admin\/catalog\/(categories|brands|attributes)(?:\/(\d+))?$/,
      ))
    ) {
      if (method === "GET") {
        check("catalog.read");
        json(res, 200, { items: await catalog.taxonomy(match[1]) });
        return true;
      }
      if (["POST", "PATCH"].includes(method)) {
        check("catalog.edit");
        json(res, method === "POST" ? 201 : 200, {
          item: await catalog.saveTaxonomy(
            match[1],
            match[2],
            await body(),
            user.id,
          ),
        });
        return true;
      }
    }
    if (path === "/api/admin/media/uploads" && method === "POST") {
      check("media.upload");
      json(res, 201, { asset: await media.upload(req, user.id) });
      return true;
    }
    if (path === "/api/admin/media" && method === "GET") {
      check("media.read");
      json(res, 200, { items: await media.list() });
      return true;
    }
    if (path === "/api/admin/returns") {
      check("returns.manage");
      if (method === "GET") {
        json(res, 200, { items: await returns.list() });
        return true;
      }
      if (method === "POST") {
        json(res, 201, { item: await returns.create(await body(), user) });
        return true;
      }
    }
    if (
      (match = path.match(
        /^\/api\/admin\/returns\/(\d+)\/(authorize|receive|inspect|approve|complete|reject)$/,
      )) &&
      method === "POST"
    ) {
      json(res, 200, {
        item: await returns.action(match[1], match[2], await body(), user),
      });
      return true;
    }
    if (path === "/api/admin/inventory/documents") {
      if (method === "GET") {
        check("inventory.read");
        json(res, 200, {
          items: await inventory.list(),
          warehouses: (
            await pool.query(
              "SELECT id,name,type FROM warehouses WHERE status='active' ORDER BY id",
            )
          ).rows,
        });
        return true;
      }
      if (method === "POST") {
        check("inventory.manage");
        json(res, 201, {
          document: await inventory.create(await body(), user.id),
        });
        return true;
      }
    }
    if (
      (match = path.match(
        /^\/api\/admin\/inventory\/documents\/(\d+)\/(submit|approve|post)$/,
      )) &&
      method === "POST"
    ) {
      permit(
        user,
        {
          submit: "inventory.manage",
          approve: "inventory.approve",
          post: "inventory.post",
        }[match[2]],
      );
      json(res, 200, {
        document: await inventory.action(
          match[1],
          match[2],
          await body(),
          user,
        ),
      });
      return true;
    }
    if (path === "/api/admin/cms/articles") {
      if (method === "GET") {
        check("content.read");
        json(res, 200, { items: await cms.list(user) });
        return true;
      }
      if (method === "POST") {
        check("content.write");
        json(res, 201, { article: await cms.save(null, await body(), user) });
        return true;
      }
    }
    if (
      (match = path.match(
        /^\/api\/admin\/cms\/articles\/(\d+)(?:\/(submit|approve|reject|publish|archive|revisions|preview))?$/,
      ))
    ) {
      if (method === "GET") {
        check("content.read");
        json(
          res,
          200,
          match[2] === "revisions"
            ? { items: await cms.revisions(match[1], user) }
            : { article: await cms.get(match[1], user) },
        );
        return true;
      }
      if (method === "PATCH" && !match[2]) {
        check("content.write");
        json(res, 200, {
          article: await cms.save(match[1], await body(), user),
        });
        return true;
      }
      if (
        method === "POST" &&
        ["submit", "approve", "reject", "publish", "archive"].includes(match[2])
      ) {
        json(res, 200, {
          article: await cms.action(match[1], match[2], await body(), user),
        });
        return true;
      }
      if (method === "POST" && match[2] === "preview") {
        check("content.read");
        const a = await cms.get(match[1], user);
        json(res, 200, {
          html: renderBlocks(a.snapshot.contentBlocks),
          article: a.snapshot,
        });
        return true;
      }
    }
    if ((match = path.match(/^\/api\/admin\/cms\/(categories|tags)$/))) {
      if (method === "GET") {
        check("content.read");
        json(res, 200, { items: await cms.taxonomy(match[1]) });
        return true;
      }
      if (method === "POST") {
        check("content.manage");
        json(res, 201, {
          item: await cms.saveTaxonomy(match[1], await body(), user),
        });
        return true;
      }
    }
    if (path === "/api/admin/settings/site") {
      if (method === "GET") {
        check("settings.read");
        json(res, 200, { items: await ops.settings() });
        return true;
      }
      if (method === "PATCH") {
        check("settings.write");
        json(res, 200, { item: await ops.saveSetting(await body(), user) });
        return true;
      }
    }
    if (method === "GET" && path === "/api/admin/operations/status") {
      check("settings.read");
      json(res, 200, await ops.status());
      return true;
    }
    if (method === "GET" && path === "/api/admin/reports/export") {
      check("reports.read");
      json(res, 200, {
        csv: await ops.reportCsv(Object.fromEntries(url.searchParams)),
      });
      return true;
    }
    if (
      method === "GET" &&
      ["/api/admin/audit/search", "/api/admin/audit/export"].includes(path)
    ) {
      check("audit.read");
      const q = Object.fromEntries(url.searchParams);
      json(
        res,
        200,
        path.endsWith("export")
          ? { csv: await ops.auditCsv(q) }
          : { items: await ops.auditList(q) },
      );
      return true;
    }
    if (path === "/api/admin/reports/summary" && method === "GET") {
      check("reports.read");
      json(res, 200, {
        report: await ops.reports(Object.fromEntries(url.searchParams)),
      });
      return true;
    }
    if ((match = path.match(/^\/api\/admin\/(coupons|banners)(?:\/(\d+))?$/))) {
      if (method === "GET") {
        check(match[1] === "coupons" ? "promotions.manage" : "settings.read");
        json(res, 200, {
          items:
            match[1] === "coupons" ? await ops.coupons() : await ops.banners(),
        });
        return true;
      }
      if (["POST", "PATCH"].includes(method)) {
        check(match[1] === "coupons" ? "promotions.manage" : "settings.write");
        json(res, 201, {
          item:
            match[1] === "coupons"
              ? await ops.saveCoupon(match[2], await body(), user)
              : await ops.saveBanner(match[2], await body(), user),
        });
        return true;
      }
    }
    return false;
  }
  return { api, catalog, cms, media, ops };
}
