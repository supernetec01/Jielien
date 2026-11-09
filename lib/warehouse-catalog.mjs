import {
  tx,
  text,
  id,
  integer,
  reject,
  audit,
  version,
} from "./commerce-common.mjs";
export function createWarehouseCatalog(pool) {
  async function list(warehouseId) {
    const warehouses = (
      await pool.query("SELECT * FROM warehouses ORDER BY id")
    ).rows;
    const variants = (
      await pool.query(
        "SELECT v.id,v.product_id,p.name AS product_name,v.name,v.sku,v.price,v.original_price FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.deleted_at IS NULL ORDER BY p.name,v.id",
      )
    ).rows;
    const items = warehouseId
      ? (
          await pool.query(
            "SELECT b.*,v.name,v.sku,v.price AS base_price,p.id AS product_id,p.name AS product_name FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id JOIN products p ON p.id=v.product_id WHERE b.warehouse_id=$1 AND p.deleted_at IS NULL ORDER BY p.name,v.id",
            [id(warehouseId)],
          )
        ).rows
      : [];
    return { warehouses, variants, items };
  }
  async function saveWarehouse(target, b, actor) {
    return tx(pool, async (c) => {
      const name = text(b.name, "Tên kho", 150, 2),
        type = b.type || "normal";
      if (!["normal", "damaged"].includes(type))
        reject(400, "validation_error", "Loại kho không hợp lệ.");
      let row;
      if (target) {
        const old = (
          await c.query("SELECT * FROM warehouses WHERE id=$1 FOR UPDATE", [
            id(target),
          ])
        ).rows[0];
        if (!old) reject(404, "not_found", "Không tìm thấy kho.");
        // Warehouse type changes must never silently change sellable availability.
        if (type !== old.type)
          reject(
            409,
            "warehouse_type",
            "Không đổi loại kho đã tạo. Hãy tạo kho khác và chuyển hàng bằng phiếu kho.",
          );
        row = (
          await c.query(
            "UPDATE warehouses SET name=$2 WHERE id=$1 RETURNING *",
            [old.id, name],
          )
        ).rows[0];
      } else
        row = (
          await c.query(
            "INSERT INTO warehouses(name,type) VALUES($1,$2) RETURNING *",
            [name, type],
          )
        ).rows[0];
      await audit(c, actor, "warehouse.saved", "warehouse", row.id, { name });
      return row;
    });
  }
  async function stock(warehouseId, variantId, b, actor, method) {
    return tx(pool, async (c) => {
      const variant = (
        await c.query(
          "SELECT v.id,v.price,v.original_price FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND p.deleted_at IS NULL FOR UPDATE OF v",
          [id(variantId)],
        )
      ).rows[0];
      if (!variant) reject(404, "not_found", "SKU đã xóa hoặc không tồn tại.");
      const warehouse = (
        await c.query(
          "SELECT id FROM warehouses WHERE id=$1 AND status='active' FOR SHARE",
          [id(warehouseId)],
        )
      ).rows[0];
      if (!warehouse)
        reject(404, "not_found", "Kho không tồn tại hoặc đã ngừng hoạt động.");
      const old = (
        await c.query(
          "SELECT * FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2 FOR UPDATE",
          [warehouse.id, variant.id],
        )
      ).rows[0];
      const reason = text(b.reason, "Lý do / chứng từ", 500, 3);
      if (method === "POST" && old)
        reject(
          409,
          "already_in_warehouse",
          "SKU đã có tại kho. Hãy chỉnh tồn tại dòng tương ứng.",
        );
      if (method !== "POST" && !old)
        reject(404, "not_found", "SKU không có tại kho.");
      if (old) version({ version: old.row_version }, b.version);
      if (b.mode && !["set", "receive"].includes(b.mode))
        reject(400, "validation_error", "Cách nhập tồn không hợp lệ.");
      const entered =
        method === "DELETE"
          ? 0
          : integer(b.quantity, b.mode === "receive" ? 1 : 0, 1000000);
      const quantity =
        method === "DELETE"
          ? 0
          : integer(
              b.mode === "receive" ? (old?.on_hand || 0) + entered : entered,
              0,
              1000000,
            );
      if (
        (old?.reserved || 0) > quantity ||
        (method === "DELETE" && old.reserved > 0)
      )
        reject(
          409,
          "reserved_stock",
          "SKU đang giữ hàng cho đơn. Hãy xử lý đơn trước khi xóa hoặc giảm tồn.",
        );
      const price = integer(b.price ?? old?.price ?? variant.price),
        originalPrice = integer(
          b.originalPrice ??
            old?.original_price ??
            variant.original_price ??
            price,
        );
      if (originalPrice < price)
        reject(
          400,
          "validation_error",
          "Giá trước giảm không được nhỏ hơn giá bán.",
        );
      const delta = quantity - (old?.on_hand || 0);
      if (method === "DELETE")
        await c.query(
          "DELETE FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2",
          [warehouse.id, variant.id],
        );
      else if (old)
        await c.query(
          "UPDATE inventory_balances SET on_hand=$3,price=$4,original_price=$5,price_override=true,updated_at=now() WHERE warehouse_id=$1 AND variant_id=$2",
          [warehouse.id, variant.id, quantity, price, originalPrice],
        );
      else
        await c.query(
          "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,price,original_price,price_override) VALUES($1,$2,$3,$4,$5,true)",
          [warehouse.id, variant.id, quantity, price, originalPrice],
        );
      if (delta)
        await c.query(
          "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,movement_type,reference_type,actor_id,reason) VALUES($1,$2,$3,'adjustment','warehouse_catalog',$4,$5)",
          [warehouse.id, variant.id, delta, actor, reason],
        );
      await audit(
        c,
        actor,
        method === "DELETE" ? "warehouse.sku_removed" : "warehouse.stock_saved",
        "variant",
        variant.id,
        { warehouseId: warehouse.id, delta, reason, price, originalPrice },
      );
      return { warehouseId: warehouse.id, variantId: variant.id, quantity };
    });
  }
  async function removeProduct(warehouseId, productId, b, actor) {
    return tx(pool, async (c) => {
      const variants = (
        await c.query(
          "SELECT id FROM product_variants WHERE product_id=$1 ORDER BY id FOR UPDATE",
          [id(productId)],
        )
      ).rows.map((v) => v.id);
      const rows = (
        await c.query(
          "SELECT * FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=ANY($2::bigint[]) ORDER BY variant_id FOR UPDATE",
          [id(warehouseId), variants],
        )
      ).rows;
      if (!rows.length)
        reject(404, "not_found", "Sản phẩm không có trong kho.");
      const expected = b.versions;
      if (
        !Array.isArray(expected) ||
        expected.length !== rows.length ||
        rows.some(
          (row) =>
            !expected.some(
              (v) =>
                v.variantId === row.variant_id && v.version === row.row_version,
            ),
        )
      )
        reject(
          409,
          "version_conflict",
          "Tồn đã thay đổi. Tải lại kho trước khi xóa sản phẩm.",
        );
      const warehouse = createWarehouseCatalog(c);
      for (const row of rows)
        await warehouse.stock(
          warehouseId,
          row.variant_id,
          { version: row.row_version, reason: b.reason },
          actor,
          "DELETE",
        );
      return {
        productId: Number(productId),
        warehouseId: Number(warehouseId),
        removed: rows.length,
      };
    });
  }
  return { list, saveWarehouse, stock, removeProduct };
}
