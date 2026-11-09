import { createHash } from "node:crypto";
import { parseCsv, csvEncode } from "./csv.mjs";
import {
  tx,
  id,
  integer,
  slug,
  text,
  reject,
  audit,
} from "./commerce-common.mjs";
import { createCatalog } from "./catalog.mjs";
export function createCatalogImport(pool) {
  async function plan(source, c = pool) {
    const rows = parseCsv(source);
    if (!rows.length) reject(400, "invalid_csv", "CSV rỗng.");
    const errors = [],
      groups = new Map(),
      skus = new Set();
    for (const [i, r] of rows.entries()) {
      try {
        if (!["create", "update"].includes(r.mode))
          reject(400, "validation_error", "mode phải create hoặc update");
        if (r.publish_action !== "draft")
          reject(
            400,
            "validation_error",
            "Import chỉ lưu nháp; xuất bản riêng sau kiểm tra",
          );
        const parentSlug = slug(r.parent_slug),
          sku = text(r.variant_sku, "SKU", 80, 1).toUpperCase();
        if (!/^[A-Z0-9_-]+$/.test(sku))
          reject(400, "validation_error", "SKU sai định dạng");
        if (skus.has(sku)) reject(409, "duplicate_sku", "SKU lặp trong CSV");
        skus.add(sku);
        for (const key of ["price_vnd", "original_price_vnd"])
          if (r[key] && !/^\d+$/.test(r[key]))
            reject(400, "validation_error", "Giá phải nguyên VND");
        const price = integer(Number(r.price_vnd)),
          original = r.original_price_vnd
            ? integer(Number(r.original_price_vnd))
            : price;
        if (original < price)
          reject(400, "validation_error", "Giá gốc nhỏ hơn giá bán");
        const weightGrams = r.weight_grams
          ? integer(Number(r.weight_grams), 0, 100000000)
          : null;
        const category = (
          await c.query(
            "SELECT id FROM categories WHERE slug=$1 AND status='active'",
            [slug(r.primary_category_slug)],
          )
        ).rows[0];
        if (!category)
          reject(400, "invalid_reference", "Danh mục chưa tồn tại");
        const brand = r.brand
          ? (
              await c.query(
                "SELECT id FROM brands WHERE name=$1 AND status='active'",
                [r.brand],
              )
            ).rows[0]
          : null;
        if (r.brand && !brand)
          reject(400, "invalid_reference", "Thương hiệu chưa tồn tại");
        const parent = (
          await c.query("SELECT id,version FROM products WHERE slug=$1", [
            parentSlug,
          ])
        ).rows[0];
        if ((r.mode === "create" && parent) || (r.mode === "update" && !parent))
          reject(
            409,
            "mode_conflict",
            "Sản phẩm không phù hợp mode create/update",
          );
        const existing = (
          await c.query(
            "SELECT id,product_id,row_version,slug FROM product_variants WHERE upper(sku)=$1",
            [sku],
          )
        ).rows[0];
        if (
          (r.mode === "create" && existing) ||
          (existing && existing.product_id !== parent?.id)
        )
          reject(409, "duplicate_sku", "SKU đã thuộc sản phẩm khác");
        const variantSlug = slug(
          r.variant_slug || sku.toLowerCase().replace(/_/g, "-"),
        );
        const slugOwner = (
          await c.query("SELECT id FROM product_variants WHERE slug=$1", [
            variantSlug,
          ])
        ).rows[0];
        if (slugOwner && slugOwner.id !== existing?.id)
          reject(409, "duplicate_slug", "Slug SKU đã tồn tại");
        const options = [];
        for (const [col, code] of [
          ["attribute_color", "color"],
          ["attribute_capacity", "capacity"],
        ])
          if (r[col]) {
            const v = (
              await c.query(
                "SELECT av.id FROM attribute_values av JOIN attributes a ON a.id=av.attribute_id WHERE a.code=$1 AND av.value=$2",
                [code, r[col]],
              )
            ).rows[0];
            if (!v)
              reject(
                400,
                "invalid_attributes",
                `Tạo thuộc tính ${code}/${r[col]} trước`,
              );
            options.push(v.id);
          }
        let media;
        if (r.cover_asset_key) {
          media = (
            await c.query("SELECT id FROM media_assets WHERE storage_key=$1", [
              r.cover_asset_key,
            ])
          ).rows[0];
          if (!media)
            reject(
              400,
              "invalid_media",
              "cover_asset_key phải là storage_key đã upload",
            );
        }
        const metadata = {
          name: text(r.product_name, "Tên", 200, 2),
          slug: parentSlug,
          brandId: brand?.id || null,
          categoryIds: [category.id],
          shortDescription: r.short_description || "",
          description: r.full_description || "",
          descriptionBlocks: [],
          seoTitle: r.seo_title || "",
          seoDescription: r.meta_description || "",
          status: "draft",
        };
        let group = groups.get(parentSlug);
        if (!group) {
          group = {
            metadata,
            mode: r.mode,
            id: parent?.id,
            version: parent?.version,
            variants: [],
            media: media ? [{ assetId: media.id, alt: r.image_alt }] : [],
          };
          groups.set(parentSlug, group);
        } else if (
          group.mode !== r.mode ||
          group.metadata.name !== metadata.name
        )
          reject(
            400,
            "inconsistent_parent",
            "Thông tin sản phẩm cha không nhất quán",
          );
        group.variants.push({
          id: existing?.id,
          rowVersion: existing?.row_version,
          name: text(r.variant_name, "Tên SKU", 200, 2),
          sku,
          slug: variantSlug,
          barcode: r.barcode || null,
          price,
          originalPrice: original,
          status: r.variant_status || "active",
          attributeValueIds: options,
          weightGrams,
        });
      } catch (error) {
        errors.push({ line: i + 2, message: error.message });
      }
    }
    const items = [...groups.values()];
    const token = createHash("sha256")
      .update(JSON.stringify({ source, items }))
      .digest("hex");
    return { items, errors, token, rows: rows.length };
  }
  async function commit(source, token, user) {
    return tx(pool, async (c) => {
      await c.query(
        "LOCK TABLE products,product_variants IN SHARE ROW EXCLUSIVE MODE",
      );
      const prior = (
        await c.query(
          "SELECT actor_id,summary FROM catalog_import_jobs WHERE id=$1",
          [token],
        )
      ).rows[0];
      if (prior) {
        if (prior.actor_id !== user.id)
          reject(403, "permission_denied", "Import thuộc người khác");
        return prior.summary;
      }
      const p = await plan(source, c);
      if (p.errors.length)
        reject(400, "invalid_csv", "CSV có lỗi; xem preview trước.");
      if (p.token !== token)
        reject(
          409,
          "version_conflict",
          "Dữ liệu đã thay đổi từ lúc preview; chạy preview lại.",
        );
      const catalog = createCatalog(c);
      for (const g of p.items) {
        let product = await catalog.save(
          g.id,
          { ...g.metadata, version: g.version },
          user.id,
        );
        product = await catalog.variants(
          product.id,
          { version: product.version, variants: g.variants },
          user.id,
        );
        if (g.media.length)
          await catalog.media(
            product.id,
            { version: product.version, media: g.media },
            user.id,
          );
      }
      const summary = { products: p.items.length, rows: p.rows };
      await c.query(
        "INSERT INTO catalog_import_jobs(id,actor_id,summary) VALUES($1,$2,$3)",
        [token, user.id, JSON.stringify(summary)],
      );
      await audit(
        c,
        user.id,
        "catalog.csv_imported",
        "catalog_import",
        token,
        summary,
      );
      return summary;
    });
  }
  async function exportCsv() {
    const rows = (
      await pool.query(
        `SELECT p.slug AS parent_slug,p.name AS product_name,v.sku AS variant_sku,v.name AS variant_name,v.price AS price_vnd,v.original_price AS original_price_vnd,v.barcode,v.status AS variant_status FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.id,v.id LIMIT 10000`,
      )
    ).rows;
    const columns = [
      "parent_slug",
      "product_name",
      "variant_sku",
      "variant_name",
      "price_vnd",
      "original_price_vnd",
      "barcode",
      "variant_status",
    ];
    return csvEncode([columns, ...rows.map((r) => columns.map((c) => r[c]))]);
  }
  return { plan, commit, exportCsv };
}
