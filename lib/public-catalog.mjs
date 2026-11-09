import { variantSQL, adaptProduct } from "../db/store.mjs";
import { reject } from "./commerce-common.mjs";
const accents =
  "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
const plain = [...accents]
  .map((c) =>
    c === "đ" ? "d" : c.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  )
  .join("");
const normalize = (v) =>
  String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
const normSQL = (expression) =>
  `translate(lower(${expression}), '${accents}', '${plain}')`;
const active = "v.status='active' AND p.status='active'";
export function createPublicCatalog(pool) {
  async function categories() {
    return (
      await pool.query(
        `SELECT c.id,c.slug,c.name,c.parent_id,c.parent_id AS "parentId",c.sort_order,c.sort_order AS "sortOrder",CASE WHEN m.id IS NOT NULL THEN '/media/'||m.storage_key END AS image_url FROM categories c LEFT JOIN media_assets m ON m.id=c.image_asset_id WHERE c.status='active' ORDER BY c.sort_order,c.id`,
      )
    ).rows;
  }
  async function search(q = {}, { clamp = true } = {}) {
    const params = [],
      clauses = [active],
      bind = (v) => {
        params.push(v);
        return "$" + params.length;
      };
    if (String(q.q || "").length > 120)
      reject(400, "validation_error", "Từ khóa quá dài.");
    for (const token of normalize(q.q || "")
      .split(/\s+/)
      .filter(Boolean))
      clauses.push(
        `position(${bind(token)} in ${normSQL("concat_ws(' ',v.name,v.sku,v.barcode,b.name,(SELECT string_agg(c.name,' ') FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.status='active'))")})>0`,
      );
    if (q.category) {
      const c = bind(String(q.category));
      clauses.push(
        `EXISTS(WITH RECURSIVE tree AS (SELECT id FROM categories WHERE status='active' AND (slug=${c} OR name=${c} OR id::text=${c}) UNION SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id WHERE c.status='active') SELECT 1 FROM product_categories pc JOIN tree t ON t.id=pc.category_id WHERE pc.product_id=p.id)`,
      );
    }
    if (q.brand) clauses.push(`b.name=${bind(String(q.brand))}`);
    if (q.age) clauses.push(`v.age=${bind(String(q.age))}`);
    for (const [key, op] of [
      ["min", ">="],
      ["max", "<="],
    ])
      if (q[key] !== undefined && q[key] !== "") {
        const n = Number(q[key]);
        if (!Number.isFinite(n) || n < 0 || n > 1e12)
          reject(400, "validation_error", "Khoảng giá không hợp lệ.");
        clauses.push(`v.price${op}${bind(n)}`);
      }
    const from =
      " FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id WHERE " +
      clauses.join(" AND ");
    const total = Number(
      (await pool.query("SELECT count(*)" + from, params)).rows[0].count,
    );
    const limit = Math.max(1, Math.min(48, Math.floor(Number(q.limit) || 20))),
      pages = Math.max(1, Math.ceil(total / limit));
    const page = clamp
      ? Math.max(
          1,
          Math.min(
            pages,
            Number.isFinite(Number(q.page))
              ? Math.floor(Number(q.page) || 1)
              : 1,
          ),
        )
      : Math.max(1, Math.min(100000, Math.floor(Number(q.page) || 1)));
    const order =
      {
        "price-asc": "v.price,v.id",
        price_asc: "v.price,v.id",
        "price-desc": "v.price DESC,v.id",
        price_desc: "v.price DESC,v.id",
        name: "v.name,v.id",
        discount:
          "(1-v.price::numeric/NULLIF(v.original_price,0)) DESC NULLS LAST,v.id",
      }[q.sort] || "v.id";
    const items = (
      await pool.query(
        variantSQL +
          " WHERE " +
          clauses.join(" AND ") +
          " ORDER BY " +
          order +
          ` LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`,
        params,
      )
    ).rows.map(adaptProduct);
    const facets = (
      await pool.query(
        `SELECT COALESCE(json_agg(DISTINCT b.name) FILTER(WHERE b.name IS NOT NULL),'[]') AS brands,COALESCE(json_agg(DISTINCT v.age) FILTER(WHERE v.age IS NOT NULL AND v.age<>''),'[]') AS ages FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id WHERE ${active}`,
      )
    ).rows[0];
    return { items, products: items, page, limit, total, pages, facets };
  }
  async function byIds(ids) {
    if (ids.length > 200 || ids.some((n) => !Number.isSafeInteger(n) || n < 1))
      reject(400, "validation_error", "Danh sách SKU không hợp lệ.");
    if (!ids.length) return [];
    return (
      await pool.query(
        variantSQL +
          ` WHERE ${active} AND v.id=ANY($1::bigint[]) ORDER BY v.id`,
        [ids],
      )
    ).rows.map(adaptProduct);
  }
  async function detail(slug) {
    const r = (
      await pool.query(variantSQL + ` WHERE ${active} AND v.slug=$1`, [slug])
    ).rows[0];
    if (!r) reject(404, "not_found", "Không tìm thấy sản phẩm.");
    const variants = (
      await pool.query(
        variantSQL +
          ` WHERE ${active} AND v.product_id=$1 ORDER BY v.id LIMIT 100`,
        [r.product_id],
      )
    ).rows.map(adaptProduct);
    return { product: adaptProduct(r), variants };
  }
  return { categories, search, byIds, detail };
}
