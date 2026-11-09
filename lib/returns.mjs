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
export function createReturns(pool) {
  async function list() {
    const rows = (
      await pool.query(
        "SELECT r.*,o.order_number FROM return_requests r JOIN orders o ON o.id=r.order_id ORDER BY r.id DESC LIMIT 100",
      )
    ).rows;
    for (const r of rows)
      r.items = (
        await pool.query(
          "SELECT ri.order_item_id,ri.quantity,ri.condition,oi.variant_id,oi.name_snapshot FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1",
          [r.id],
        )
      ).rows;
    return rows;
  }
  async function create(b, user) {
    permit(user, "returns.manage");
    return tx(pool, async (c) => {
      const order = (
        await c.query(
          "SELECT id,status FROM orders WHERE order_number=$1 FOR UPDATE",
          [text(b.orderNumber, "Mã đơn", 80, 1)],
        )
      ).rows[0];
      if (!order || order.status !== "delivered")
        reject(409, "invalid_return", "Chỉ nhận yêu cầu hoàn từ đơn đã giao.");
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50)
        reject(400, "validation_error", "Cần 1–50 dòng hoàn.");
      const result = (
        await c.query(
          "INSERT INTO return_requests(order_id,reason,created_by) VALUES($1,$2,$3) RETURNING *",
          [order.id, text(b.reason, "Lý do", 500, 3), user.id],
        )
      ).rows[0];
      const seen = new Set();
      for (const item of b.items) {
        const variantId = id(item.variantId);
        if (seen.has(variantId))
          reject(
            400,
            "invalid_return",
            "Mỗi SKU chỉ nhập một dòng số lượng hoàn.",
          );
        seen.add(variantId);
        if (!["sealed", "opened", "damaged"].includes(item.condition))
          reject(400, "validation_error", "Tình trạng hàng không hợp lệ.");
        let requested = integer(item.quantity, 1, 1000000);
        const lines = (
          await c.query(
            "SELECT id,quantity FROM order_items WHERE order_id=$1 AND variant_id=$2 ORDER BY id FOR UPDATE",
            [order.id, variantId],
          )
        ).rows;
        if (!lines.length)
          reject(400, "invalid_return", "SKU không thuộc đơn.");
        for (const line of lines) {
          const used = Number(
            (
              await c.query(
                "SELECT COALESCE(sum(ri.quantity),0) AS quantity FROM return_items ri JOIN return_requests r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status<>'rejected'",
                [line.id],
              )
            ).rows[0].quantity,
          );
          const quantity = Math.min(requested, line.quantity - used);
          if (quantity > 0) {
            await c.query("INSERT INTO return_items VALUES($1,$2,$3,$4)", [
              result.id,
              line.id,
              quantity,
              item.condition,
            ]);
            requested -= quantity;
          }
          if (!requested) break;
        }
        if (requested)
          reject(
            409,
            "return_quantity",
            "Số lượng hoàn vượt số lượng đã mua còn được phép hoàn.",
          );
      }
      await audit(c, user.id, "return.requested", "return", result.id);
      return result;
    });
  }
  async function action(returnId, action, b, user) {
    return tx(pool, async (c) => {
      const r = (
        await c.query("SELECT * FROM return_requests WHERE id=$1 FOR UPDATE", [
          id(returnId),
        ])
      ).rows[0];
      if (!r) reject(404, "not_found", "Không tìm thấy yêu cầu.");
      permit(
        user,
        ["approve", "complete", "reject"].includes(action)
          ? "inventory.approve"
          : "returns.manage",
      );
      if (action === "complete" && r.status === "completed") return r;
      version(r, b.version);
      const transitions = {
        authorize: ["requested", "authorized"],
        receive: ["authorized", "received"],
        inspect: ["received", "inspected"],
        approve: ["inspected", "approved"],
        complete: ["approved", "completed"],
      };
      if (action === "reject") {
        if (["completed", "rejected"].includes(r.status))
          reject(409, "invalid_transition", "Yêu cầu đã kết thúc.");
      } else if (!transitions[action] || r.status !== transitions[action][0])
        reject(409, "invalid_transition", "Trạng thái hoàn hàng không hợp lệ.");
      if (action === "inspect" && b.items) {
        if (!Array.isArray(b.items))
          reject(400, "validation_error", "Kiểm định không hợp lệ.");
        for (const i of b.items) {
          if (!["sealed", "opened", "damaged"].includes(i.condition))
            reject(400, "validation_error", "Tình trạng hàng không hợp lệ.");
          const update = await c.query(
            "UPDATE return_items SET condition=$3 WHERE return_id=$1 AND order_item_id=$2",
            [r.id, id(i.orderItemId), i.condition],
          );
          if (!update.rowCount)
            reject(400, "invalid_return", "Dòng hoàn không thuộc yêu cầu.");
        }
      }
      if (action === "complete") {
        const items = (
          await c.query(
            "SELECT ri.*,oi.variant_id FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1 ORDER BY oi.variant_id",
            [r.id],
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
              "Sản phẩm đã xóa. Cần xử lý mặt hàng hoàn với quản lý trước khi nhập lại kho.",
            );
          const type = item.condition === "sealed" ? "normal" : "damaged";
          const warehouse = (
            await c.query(
              "SELECT id FROM warehouses WHERE type=$1 AND status='active' ORDER BY id LIMIT 1",
              [type],
            )
          ).rows[0];
          if (!warehouse)
            reject(409, "missing_warehouse", "Cần kho thường/hư đang active.");
          await c.query(
            "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES($1,$2,0,0) ON CONFLICT DO NOTHING",
            [warehouse.id, item.variant_id],
          );
          await c.query(
            "SELECT 1 FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2 FOR UPDATE",
            [warehouse.id, item.variant_id],
          );
          await c.query(
            "UPDATE inventory_balances SET on_hand=on_hand+$3,updated_at=now() WHERE warehouse_id=$1 AND variant_id=$2",
            [warehouse.id, item.variant_id, item.quantity],
          );
          await c.query(
            "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,actor_id,reason) VALUES($1,$2,$3,0,'adjustment','return',$4,$5,$6)",
            [
              warehouse.id,
              item.variant_id,
              item.quantity,
              String(r.id),
              user.id,
              r.reason,
            ],
          );
        }
      }
      const next = action === "reject" ? "rejected" : transitions[action][1];
      const updated = (
        await c.query(
          "UPDATE return_requests SET status=$2,version=version+1,approved_by=CASE WHEN $2='approved' THEN $3 ELSE approved_by END,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END WHERE id=$1 RETURNING *",
          [r.id, next, user.id],
        )
      ).rows[0];
      await audit(c, user.id, "return." + next, "return", r.id);
      return updated;
    });
  }
  return { list, create, action };
}
