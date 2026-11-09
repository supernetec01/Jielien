import {
  tx,
  text,
  id,
  integer,
  version,
  reject,
  audit,
  permit,
} from "./commerce-common.mjs";
export function createInventoryDocuments(pool) {
  async function list() {
    const rows = (
      await pool.query(
        "SELECT * FROM inventory_documents ORDER BY id DESC LIMIT 100",
      )
    ).rows;
    for (const r of rows)
      r.items = (
        await pool.query(
          'SELECT variant_id AS "variantId",quantity FROM inventory_document_items WHERE document_id=$1',
          [r.id],
        )
      ).rows;
    return rows;
  }
  async function create(b, actor) {
    return tx(pool, async (c) => {
      if (!["receipt", "issue", "transfer", "stocktake"].includes(b.type))
        reject(400, "validation_error", "Loại phiếu không hợp lệ.");
      const source = b.sourceWarehouseId ? id(b.sourceWarehouseId) : null,
        target = b.targetWarehouseId ? id(b.targetWarehouseId) : null;
      if (
        (b.type !== "receipt" && !source) ||
        (b.type === "receipt" && !target) ||
        (b.type === "transfer" && (!target || source === target))
      )
        reject(400, "validation_error", "Kho nguồn/đích không hợp lệ.");
      if (
        (b.type === "receipt" && source) ||
        (["issue", "stocktake"].includes(b.type) && target)
      )
        reject(
          400,
          "validation_error",
          "Phiếu nhập chỉ dùng kho đích; phiếu xuất/kiểm kê chỉ dùng kho nguồn.",
        );
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100)
        reject(400, "validation_error", "Cần 1–100 dòng hàng.");
      const doc = (
        await c.query(
          "INSERT INTO inventory_documents(type,source_warehouse_id,target_warehouse_id,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [b.type, source, target, text(b.reason, "Lý do", 500, 3), actor],
        )
      ).rows[0];
      for (const item of b.items)
        await c.query("INSERT INTO inventory_document_items VALUES($1,$2,$3)", [
          doc.id,
          id(item.variantId),
          integer(item.quantity, b.type === "stocktake" ? 0 : 1, 1000000),
        ]);
      await audit(
        c,
        actor,
        "inventory.document_created",
        "inventory_document",
        doc.id,
      );
      return doc;
    });
  }
  async function action(docId, action, b, user) {
    return tx(pool, async (c) => {
      const d = (
        await c.query(
          "SELECT * FROM inventory_documents WHERE id=$1 FOR UPDATE",
          [id(docId)],
        )
      ).rows[0];
      if (!d) reject(404, "not_found", "Không tìm thấy phiếu.");
      const required = {
        submit: "inventory.manage",
        approve: "inventory.approve",
        post: "inventory.post",
      }[action];
      if (!required)
        reject(400, "invalid_transition", "Thao tác không hợp lệ.");
      permit(user, required);
      if (action === "post" && d.status === "posted") return d;
      version(d, b.version);
      const transitions = {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        post: ["approved", "posted"],
      };
      const [from, to] = transitions[action];
      if (d.status !== from)
        reject(409, "invalid_transition", "Trạng thái phiếu không phù hợp.");
      if (action === "post") {
        const items = (
          await c.query(
            "SELECT * FROM inventory_document_items WHERE document_id=$1 ORDER BY variant_id",
            [d.id],
          )
        ).rows;
        for (const item of items) {
          if (
            !(
              await c.query(
                "SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND p.deleted_at IS NULL FOR UPDATE OF v",
                [item.variant_id],
              )
            ).rowCount
          )
            reject(
              409,
              "deleted_product",
              "SKU đã xóa. Không thể ghi sổ phiếu.",
            );
          for (const warehouse of [d.source_warehouse_id, d.target_warehouse_id]
            .filter(Boolean)
            .sort((a, b) => a - b))
            await c.query(
              "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES($1,$2,0,0) ON CONFLICT DO NOTHING",
              [warehouse, item.variant_id],
            );
          const balances = (
            await c.query(
              "SELECT ib.*,w.type,w.status FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id WHERE variant_id=$1 AND warehouse_id=ANY($2::bigint[]) ORDER BY warehouse_id FOR UPDATE OF ib",
              [
                item.variant_id,
                [d.source_warehouse_id, d.target_warehouse_id].filter(Boolean),
              ],
            )
          ).rows;
          for (const balance of balances) {
            if (balance.status !== "active")
              reject(409, "inactive_warehouse", "Kho không hoạt động.");
            const delta =
              d.type === "receipt"
                ? item.quantity
                : d.type === "stocktake"
                  ? item.quantity - balance.on_hand
                  : balance.warehouse_id === d.source_warehouse_id
                    ? -item.quantity
                    : item.quantity;
            if (balance.on_hand + delta < balance.reserved)
              reject(
                409,
                "insufficient_stock",
                "Không đủ tồn khả dụng; phiếu không được ghi sổ.",
              );
            await c.query(
              "UPDATE inventory_balances SET on_hand=on_hand+$1,updated_at=now() WHERE warehouse_id=$2 AND variant_id=$3",
              [delta, balance.warehouse_id, item.variant_id],
            );
            await c.query(
              "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,actor_id,reason) VALUES($1,$2,$3,0,'adjustment','inventory_document',$4,$5,$6)",
              [
                balance.warehouse_id,
                item.variant_id,
                delta,
                String(d.id),
                user.id,
                d.reason,
              ],
            );
          }
        }
      }
      const result = (
        await c.query(
          "UPDATE inventory_documents SET status=$2,version=version+1,approved_by=CASE WHEN $2='approved' THEN $3 ELSE approved_by END,posted_by=CASE WHEN $2='posted' THEN $3 ELSE posted_by END,posted_at=CASE WHEN $2='posted' THEN now() ELSE posted_at END WHERE id=$1 RETURNING *",
          [d.id, to, user.id],
        )
      ).rows[0];
      await audit(
        c,
        user.id,
        "inventory.document_" + to,
        "inventory_document",
        d.id,
      );
      return result;
    });
  }
  return { list, create, action };
}
