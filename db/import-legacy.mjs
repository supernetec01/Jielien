import { access, mkdir, chmod } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

const number = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Invalid numeric value in legacy database.");
  return n;
};
const pending = new Set(["pending", "confirmed", "processing"]);
const statuses = new Set([
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

// Only explicit legacyPath triggers import. SQLite backup includes the current WAL
// consistently; all further reads use that immutable snapshot, not a live writer.
export async function importLegacy({ pool, legacyPath } = {}) {
  if (!legacyPath) return { imported: false, reason: "not_requested" };
  const path = resolve(legacyPath),
    sourceKey = "sqlite:" + path;
  if (
    (
      await pool.query("SELECT 1 FROM legacy_imports WHERE source_key=$1", [
        sourceKey,
      ])
    ).rowCount
  )
    return { imported: false, reason: "already_imported" };
  try {
    await access(path);
  } catch (error) {
    if (error.code === "ENOENT")
      return { imported: false, reason: "source_missing" };
    throw error;
  }
  const backupDir = join(dirname(path), "backups");
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = join(
    backupDir,
    `legacy-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}.sqlite`,
  );
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    await backup(source, backupPath);
  } finally {
    source.close();
  }
  await chmod(backupPath, 0o600);
  const snapshot = new DatabaseSync(backupPath, { readOnly: true });
  let inventory, orders;
  try {
    const integrity = snapshot.prepare("PRAGMA integrity_check").get();
    if (Object.values(integrity)[0] !== "ok")
      throw new Error("Legacy SQLite integrity check failed.");
    inventory = snapshot
      .prepare("SELECT product_id,stock FROM inventory")
      .all();
    orders = snapshot
      .prepare(
        "SELECT id,token,phone,idempotency_key,fingerprint,payload FROM orders ORDER BY rowid",
      )
      .all()
      .map((row) => ({ ...row, data: JSON.parse(row.payload) }));
  } finally {
    snapshot.close();
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':legacy-import'))",
    );
    if (
      (
        await client.query("SELECT 1 FROM legacy_imports WHERE source_key=$1", [
          sourceKey,
        ])
      ).rowCount
    ) {
      await client.query("COMMIT");
      return { imported: false, reason: "already_imported", backupPath };
    }
    if ((await client.query("SELECT 1 FROM orders LIMIT 1")).rowCount)
      throw new Error(
        "Legacy import requires an empty target orders table; refusing to overwrite live PostgreSQL data.",
      );
    const existingStock = await client.query(
      "SELECT variant_id,on_hand,reserved FROM inventory_balances WHERE warehouse_id=1",
    );
    const before = new Map(
      existingStock.rows.map((row) => [
        number(row.variant_id),
        { onHand: number(row.on_hand), reserved: number(row.reserved) },
      ]),
    );
    const legacyStocks = new Map(
      inventory.map((row) => [number(row.product_id), number(row.stock)]),
    );
    const variants = new Set(
      (await client.query("SELECT id FROM product_variants")).rows.map((row) =>
        number(row.id),
      ),
    );
    const snapshots = new Map();
    for (const row of orders)
      for (const item of row.data.items || [])
        if (!snapshots.has(number(item.id)))
          snapshots.set(number(item.id), item);
    const required = new Set([...legacyStocks.keys(), ...snapshots.keys()]);
    for (const id of required) {
      if (variants.has(id)) continue;
      const item = snapshots.get(id) || {};
      const name =
        typeof item.name === "string" ? item.name : `Sản phẩm lưu trữ #${id}`;
      const product = (
        await client.query(
          "INSERT INTO products(name,slug,description,status) VALUES($1,$2,'SKU lưu trữ được bảo toàn khi chuyển từ SQLite','inactive') RETURNING id",
          [name, `legacy-product-${id}`],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO product_variants(id,product_id,name,slug,sku,price,original_price,status) VALUES($1,$2,$3,$4,$5,$6,$6,'inactive')",
        [
          id,
          product.id,
          name,
          `legacy-sku-${id}`,
          `LEGACY-${id}`,
          number(item.price || 0),
        ],
      );
      if (item.image)
        await client.query(
          "INSERT INTO product_media(product_id,variant_id,url,media_type,sort_order) VALUES($1,$2,$3,'image',0)",
          [product.id, id, item.image],
        );
      await client.query(
        "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES(1,$1,0,0) ON CONFLICT DO NOTHING",
        [id],
      );
      variants.add(id);
    }
    const held = new Map();
    let itemCount = 0;
    for (const row of orders) {
      const o = row.data,
        status = o.status || "pending";
      if (!statuses.has(status))
        throw new Error(
          "Legacy order has an unsupported status; import was rolled back.",
        );
      const c = o.customer;
      if (!c || !Array.isArray(o.items) || !o.items.length)
        throw new Error(
          "Legacy order snapshot is incomplete; import was rolled back.",
        );
      const inserted = (
        await client.query(
          "INSERT INTO orders(order_number,status,recipient_name,recipient_phone,recipient_email,address_detail,province,district,subtotal,discount_total,shipping_fee,grand_total,coupon_code,payment_method,note,access_token,idempotency_key,fingerprint,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'cod',$14,$15,$16,$17,$18,$18) RETURNING id",
          [
            row.id,
            status,
            c.name,
            row.phone,
            c.email || null,
            c.address,
            c.province,
            c.district,
            number(o.subtotal),
            number(o.discount),
            number(o.shipping),
            number(o.total),
            o.coupon || "",
            o.note || "",
            row.token,
            row.idempotency_key,
            row.fingerprint,
            o.createdAt || new Date().toISOString(),
          ],
        )
      ).rows[0];
      for (const item of o.items) {
        const id = number(item.id),
          quantity = number(item.quantity);
        if (quantity < 1)
          throw new Error("Legacy order item quantity is invalid.");
        const variant = (
          await client.query("SELECT sku FROM product_variants WHERE id=$1", [
            id,
          ])
        ).rows[0];
        await client.query(
          "INSERT INTO order_items(order_id,variant_id,sku_snapshot,name_snapshot,image_snapshot,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            inserted.id,
            id,
            item.sku || variant.sku,
            item.name,
            item.image || "",
            quantity,
            number(item.price),
            number(item.lineTotal),
          ],
        );
        itemCount++;
        if (pending.has(status)) {
          held.set(id, (held.get(id) || 0) + quantity);
          await client.query(
            "INSERT INTO inventory_reservations(order_id,variant_id,warehouse_id,quantity,status,created_at) VALUES($1,$2,1,$3,'active',$4)",
            [
              inserted.id,
              id,
              quantity,
              o.createdAt || new Date().toISOString(),
            ],
          );
        } else if (["shipped", "delivered"].includes(status))
          await client.query(
            "INSERT INTO inventory_reservations(order_id,variant_id,warehouse_id,quantity,status,created_at) VALUES($1,$2,1,$3,'consumed',$4)",
            [
              inserted.id,
              id,
              quantity,
              o.createdAt || new Date().toISOString(),
            ],
          );
      }
      await client.query(
        "INSERT INTO order_status_history(order_id,new_status,note,created_at) VALUES($1,$2,$3,$4)",
        [
          inserted.id,
          status,
          "Nhập lịch sử đơn từ SQLite",
          o.createdAt || new Date().toISOString(),
        ],
      );
      await client.query(
        "INSERT INTO payments(order_id,provider,method,amount,status,created_at) VALUES($1,'manual','cod',$2,$3,$4)",
        [
          inserted.id,
          number(o.total),
          status === "cancelled" ? "cancelled" : "pending",
          o.createdAt || new Date().toISOString(),
        ],
      );
      const shipmentStatus = {
        pending: "pending",
        confirmed: "ready",
        processing: "processing",
        shipped: "shipped",
        delivered: "delivered",
        cancelled: "cancelled",
      }[status];
      await client.query(
        "INSERT INTO shipments(order_id,status,created_at) VALUES($1,$2,$3)",
        [inserted.id, shipmentStatus, o.createdAt || new Date().toISOString()],
      );
      if (o.coupon) {
        const coupon = (
          await client.query("SELECT id FROM coupons WHERE code=$1", [o.coupon])
        ).rows[0];
        if (coupon) {
          await client.query(
            "INSERT INTO coupon_redemptions(coupon_id,order_id,used_at) VALUES($1,$2,$3)",
            [coupon.id, inserted.id, o.createdAt || new Date().toISOString()],
          );
          await client.query(
            "UPDATE coupons SET used_count=used_count+1 WHERE id=$1",
            [coupon.id],
          );
        }
      }
    }
    for (const id of required) {
      const old = before.get(id) || { onHand: 0, reserved: 0 };
      const available = legacyStocks.get(id) ?? 0;
      const reserved = held.get(id) || 0;
      const onHand = available + reserved;
      await client.query(
        "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES(1,$1,$2,$3) ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET on_hand=EXCLUDED.on_hand,reserved=EXCLUDED.reserved,updated_at=NOW()",
        [id, onHand, reserved],
      );
      const physicalDelta = onHand - old.onHand,
        reservedDelta = reserved - old.reserved;
      if (physicalDelta || reservedDelta)
        await client.query(
          "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,reason) VALUES(1,$1,$2,$3,'legacy_import','migration',$4,'Bảo toàn tồn khả dụng và giữ tồn của đơn SQLite')",
          [id, physicalDelta, reservedDelta, sourceKey],
        );
    }
    await client.query(
      "SELECT setval(pg_get_serial_sequence('product_variants','id'),GREATEST(COALESCE((SELECT MAX(id) FROM product_variants),1),1),true)",
    );
    const summary = {
      orders: orders.length,
      orderItems: itemCount,
      inventory: inventory.length,
      reservations: [...held.values()].reduce((sum, n) => sum + n, 0),
      stockPolicy:
        "on_hand = legacy_available + active_order_reserved; available unchanged",
      backupPath,
    };
    await client.query(
      "INSERT INTO legacy_imports(source_key,summary) VALUES($1,$2::jsonb)",
      [sourceKey, JSON.stringify(summary)],
    );
    await client.query(
      "INSERT INTO audit_logs(action,entity_type,entity_id,metadata) VALUES('database.legacy_import','migration',$1,$2::jsonb)",
      [
        sourceKey,
        JSON.stringify({
          orders: orders.length,
          orderItems: itemCount,
          inventory: inventory.length,
        }),
      ],
    );
    await client.query("COMMIT");
    return { imported: true, ...summary };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
