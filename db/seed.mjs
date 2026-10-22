import { readFile } from "node:fs/promises";

const slugify = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const familyPairs = [
  ["sua-little-grow-so-3-800g", "sua-little-grow-so-3-hop-doi"],
  ["sua-little-grow-so-2-800g", "sua-little-grow-so-2-hop-nho"],
  ["binh-sua-little-love-240ml", "binh-sua-little-love-160ml"],
  ["tam-goi-pure-baby-400ml", "tam-goi-pure-baby-200ml"],
  ["khau-giay-uot-baby-soft-80", "khau-giay-uot-baby-soft-combo-3"],
  ["gau-bong-tiny-friends-25cm", "gau-bong-tiny-friends-35cm"],
];

export async function seedCatalog(pool, catalogPath) {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (
    !Array.isArray(catalog) ||
    !catalog.length ||
    new Set(catalog.map((p) => p.id)).size !== catalog.length
  )
    throw new Error("Catalog must contain unique product IDs.");
  for (const p of catalog)
    if (
      !Number.isSafeInteger(p.id) ||
      p.id <= 0 ||
      !Number.isSafeInteger(p.price) ||
      p.price <= 0 ||
      !Number.isInteger(p.stock) ||
      p.stock < 0 ||
      typeof p.name !== "string"
    )
      throw new Error("Invalid catalog product.");
  const family = new Map();
  for (const pair of familyPairs) {
    const entries = pair
      .map((slug) => catalog.find((p) => p.slug === slug))
      .filter(Boolean);
    if (entries.length === 2)
      for (const p of entries) family.set(p.id, entries[0]);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':catalog-seed'))",
    );
    await client.query(
      "INSERT INTO warehouses(id,name,type,status) VALUES (1,'Kho chính','normal','active'),(2,'Kho hàng hư hỏng','damaged','active') ON CONFLICT(id) DO NOTHING",
    );
    for (const p of catalog) {
      const brandName = p.brand || "Jielien";
      let result = await client.query("SELECT id FROM brands WHERE name=$1", [
        brandName,
      ]);
      const brandId =
        result.rows[0]?.id ??
        (
          await client.query(
            "INSERT INTO brands(name,description) VALUES($1,$2) RETURNING id",
            [brandName, "Thương hiệu dữ liệu mẫu"],
          )
        ).rows[0].id;
      const categoryName = p.category || "Sản phẩm";
      const categorySlug = slugify(categoryName) || "san-pham";
      result = await client.query("SELECT id FROM categories WHERE slug=$1", [
        categorySlug,
      ]);
      const categoryId =
        result.rows[0]?.id ??
        (
          await client.query(
            "INSERT INTO categories(name,slug,sort_order,status) VALUES($1,$2,$3,'active') RETURNING id",
            [categoryName, categorySlug, Number(p.id)],
          )
        ).rows[0].id;
      const parent = family.get(p.id) || p;
      await client.query(
        "INSERT INTO products(id,brand_id,name,slug,description,status) VALUES($1,$2,$3,$4,$5,'active') ON CONFLICT(id) DO NOTHING",
        [
          parent.id,
          brandId,
          parent.name,
          parent.slug || `san-pham-${parent.id}`,
          parent.description || "",
        ],
      );
      await client.query(
        "INSERT INTO product_categories(product_id,category_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [parent.id, categoryId],
      );
      const added = await client.query(
        "INSERT INTO product_variants(id,product_id,name,sku,slug,price,original_price,age,weight,type,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') ON CONFLICT(id) DO NOTHING RETURNING id",
        [
          p.id,
          parent.id,
          p.name,
          `JL-${String(p.id).padStart(4, "0")}`,
          p.slug || `san-pham-${p.id}`,
          p.price,
          p.oldPrice ?? p.price,
          p.age || "",
          p.weight || "",
          p.type || "other",
        ],
      );
      await client.query(
        "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES(1,$1,$2,0) ON CONFLICT DO NOTHING",
        [p.id, p.stock],
      );
      if (added.rowCount && p.stock !== 0)
        await client.query(
          "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,reason) VALUES(1,$1,$2,0,'opening','catalog',$3,'Tồn khởi tạo từ danh mục mẫu')",
          [p.id, p.stock, String(p.id)],
        );
      if (p.image)
        await client.query(
          "INSERT INTO product_media(product_id,variant_id,url,media_type,sort_order) SELECT $1,$2,$3,'image',0 WHERE NOT EXISTS(SELECT 1 FROM product_media WHERE variant_id=$2 AND url=$3)",
          [parent.id, p.id, p.image],
        );
      for (const [i, feature] of (p.features || []).entries())
        await client.query(
          "INSERT INTO product_specs(product_id,spec_name,spec_value,sort_order) SELECT $1,'feature',$2,$3 WHERE NOT EXISTS(SELECT 1 FROM product_specs WHERE product_id=$1 AND spec_name='feature' AND spec_value=$2)",
          [parent.id, String(feature), i],
        );
      for (const [code, label, value] of [
        ["age", "Độ tuổi", p.age],
        ["packaging", "Quy cách", p.weight],
      ]) {
        if (!value) continue;
        result = await client.query("SELECT id FROM attributes WHERE code=$1", [
          code,
        ]);
        const attributeId =
          result.rows[0]?.id ??
          (
            await client.query(
              "INSERT INTO attributes(name,code) VALUES($1,$2) RETURNING id",
              [label, code],
            )
          ).rows[0].id;
        result = await client.query(
          "SELECT id FROM attribute_values WHERE attribute_id=$1 AND value=$2",
          [attributeId, value],
        );
        const valueId =
          result.rows[0]?.id ??
          (
            await client.query(
              "INSERT INTO attribute_values(attribute_id,value) VALUES($1,$2) RETURNING id",
              [attributeId, value],
            )
          ).rows[0].id;
        await client.query(
          "INSERT INTO variant_attribute_values(variant_id,attribute_value_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [p.id, valueId],
        );
      }
    }
    await client.query(
      "SELECT setval(pg_get_serial_sequence('products','id'),GREATEST(COALESCE((SELECT MAX(id) FROM products),1),1),true)",
    );
    await client.query(
      "SELECT setval(pg_get_serial_sequence('product_variants','id'),GREATEST(COALESCE((SELECT MAX(id) FROM product_variants),1),1),true)",
    );
    await client.query(
      "SELECT setval(pg_get_serial_sequence('warehouses','id'),GREATEST(COALESCE((SELECT MAX(id) FROM warehouses),1),1),true)",
    );
    for (const offer of [
      {
        code: "MEBE50",
        name: "Giảm 50.000đ từ 500.000đ",
        type: "fixed",
        value: 50000,
        min: 500000,
      },
      {
        code: "FREESHIP",
        name: "Miễn phí giao hàng từ 299.000đ",
        type: "shipping",
        value: 25000,
        min: 299000,
      },
    ]) {
      const result = await client.query(
        "SELECT id FROM coupons WHERE code=$1",
        [offer.code],
      );
      if (!result.rowCount) {
        const promotion = (
          await client.query(
            "INSERT INTO promotions(name,discount_type,discount_value,minimum_order,status,priority,stackable) VALUES($1,$2,$3,$4,'active',10,false) RETURNING id",
            [offer.name, offer.type, offer.value, offer.min],
          )
        ).rows[0];
        await client.query(
          "INSERT INTO coupons(code,promotion_id,status) VALUES($1,$2,'active')",
          [offer.code, promotion.id],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { products: catalog.length };
}
