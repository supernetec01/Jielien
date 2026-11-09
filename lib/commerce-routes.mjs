import { createWarehouseCatalog } from "./warehouse-catalog.mjs";
import { shippingPolicy } from "./shipping-policy.mjs";
import { createPublicCatalog } from "./public-catalog.mjs";
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
  const warehouseCatalog = createWarehouseCatalog(pool);
  const publicCatalog = createPublicCatalog(pool);
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
        ...shippingPolicy,
        demoMode: process.env.DEMO_MODE === "true",
        settings: await ops.settings(true),
        banners: await ops.banners(true),
        coupons: await ops.publicCoupons(),
      });
      return true;
    }
    if (method === "GET" && path === "/api/categories") {
      json(res, 200, { categories: await publicCatalog.categories() });
      return true;
    }
    if (
      method === "GET" &&
      (path === "/api/catalog/search" || path === "/api/products")
    ) {
      json(
        res,
        200,
        await publicCatalog.search(
          {
            limit: path === "/api/products" ? 48 : 20,
            ...Object.fromEntries(url.searchParams),
          },
          {
            clamp: path !== "/api/catalog/search",
          },
        ),
      );
      return true;
    }
    if (method === "GET" && path === "/api/catalog/skus") {
      const ids = (url.searchParams.get("ids") || "")
        .split(",")
        .filter(Boolean)
        .map(Number);
      json(res, 200, { products: await publicCatalog.byIds(ids) });
      return true;
    }
    const publicProduct = path.match(
      /^\/api\/catalog\/products\/([a-z0-9-]+)$/,
    );
    if (method === "GET" && publicProduct) {
      json(res, 200, await publicCatalog.detail(publicProduct[1]));
      return true;
    }
    if (!path.startsWith("/api/admin/")) return false;
    const check = (p) => permit(user, p),
      body = () => readBody(req);
    let match;
    if (
      (match = path.match(
        /^\/api\/admin\/warehouses\/(\d+)\/products\/(\d+)$/,
      )) &&
      method === "DELETE"
    ) {
      check("inventory.manage");
      json(res, 200, {
        item: await warehouseCatalog.removeProduct(
          match[1],
          match[2],
          await body(),
          user.id,
        ),
      });
      return true;
    }
    if (
      (match = path.match(
        /^\/api\/admin\/warehouses(?:\/(\d+))?(?:\/skus(?:\/(\d+))?)?$/,
      ))
    ) {
      if (method === "GET") {
        check("inventory.read");
        json(res, 200, await warehouseCatalog.list(match[1]));
        return true;
      }
      check("inventory.manage");
      const b = await body();
      if (match[2] && ["POST", "PUT", "DELETE"].includes(method))
        json(res, 200, {
          item: await warehouseCatalog.stock(
            match[1],
            match[2],
            b,
            user.id,
            method,
          ),
        });
      else if (!path.includes("/skus") && ["POST", "PATCH"].includes(method))
        json(res, match[1] ? 200 : 201, {
          warehouse: await warehouseCatalog.saveWarehouse(match[1], b, user.id),
        });
      else reject(405, "method_not_allowed", "Thao tác không hợp lệ.");
      return true;
    }
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
        /^\/api\/admin\/catalog\/products\/(\d+)(?:\/(variants|media|preview))?$/,
      ))
    ) {
      const productId = id(match[1]),
        part = match[2];
      if (method === "DELETE" && !part) {
        check("catalog.archive");
        check("inventory.manage");
        json(res, 200, {
          product: await catalog.remove(productId, await body(), user.id),
        });
        return true;
      }
      if (method === "GET" && part === "preview") {
        check("catalog.read");
        const p = await catalog.get(productId);
        json(res, 200, {
          html: `<article><h1>${escape(p.name)}</h1><p>${escape(p.description)}</p>${renderBlocks(p.content_blocks)}${p.media.map((m) => `<img width="180" src="${escape(m.url)}" alt="${escape(m.alt_text || p.name)}">`).join("")}<ul>${p.variants.map((v) => `<li>${escape(v.name)}: ${v.price} VND (${escape(v.status)})</li>`).join("")}</ul></article>`,
        });
        return true;
      }
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
      if (method === "DELETE" && match[2]) {
        check("catalog.edit");
        json(res, 200, {
          item: await catalog.deleteTaxonomy(match[1], match[2], user.id),
        });
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
        json(res, 200, {
          items: await cms.list(user, Object.fromEntries(url.searchParams)),
        });
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
        /^\/api\/admin\/cms\/articles\/(\d+)(?:\/(submit|approve|reject|publish|archive|restore|revisions|preview))?$/,
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
      if (method === "POST" && match[2] === "restore") {
        check("content.write");
        json(res, 200, {
          article: await cms.restore(match[1], await body(), user),
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
    if (path === "/api/admin/seo/redirects") {
      check("seo.manage");
      if (method === "GET") {
        json(res, 200, { items: await ops.redirects() });
        return true;
      }
      if (method === "POST") {
        json(res, 201, { item: await ops.saveRedirect(await body(), user) });
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
        check(
          match[1] === "coupons"
            ? "promotions.manage"
            : user.permissions.includes("banners.read")
              ? "banners.read"
              : "settings.read",
        );
        json(res, 200, {
          items:
            match[1] === "coupons" ? await ops.coupons() : await ops.banners(),
        });
        return true;
      }
      if (["POST", "PATCH"].includes(method)) {
        check(
          match[1] === "coupons"
            ? "promotions.manage"
            : user.permissions.includes("banners.write")
              ? "banners.write"
              : "settings.write",
        );
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
  return { publicCatalog, api, catalog, cms, media, ops };
}
