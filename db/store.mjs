import { randomBytes, createHash } from "node:crypto";
import { migrate } from "./migrate.mjs";
import { seedCatalog } from "./seed.mjs";
import { importLegacy } from "./import-legacy.mjs";

export class StoreError extends Error {
  constructor(status, error, message) {
    super(message);
    this.status = status;
    this.error = error;
  }
}
const fail = (status, error, message) => {
  throw new StoreError(status, error, message);
};
const number = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Database number exceeds safe integer range.");
  return n;
};
const iso = (value) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const statuses = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
const clean = (value, label, min, max, multiline = false) => {
  if (typeof value !== "string")
    fail(400, "validation_error", `${label} không hợp lệ.`);
  const text = value.trim();
  if (
    text.length < min ||
    text.length > max ||
    (multiline
      ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
      : /[\u0000-\u001f\u007f]/u
    ).test(text)
  )
    fail(400, "validation_error", `${label} không hợp lệ.`);
  return text;
};
function normalizeCustomer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "validation_error", "Vui lòng nhập thông tin nhận hàng.");
  if (typeof value.phone !== "string")
    fail(400, "validation_error", "Số điện thoại không hợp lệ.");
  const phone = value.phone
    .trim()
    .replace(/[ .()-]/g, "")
    .replace(/^\+84/, "0");
  if (!/^0[35789]\d{8}$/.test(phone))
    fail(
      400,
      "validation_error",
      "Vui lòng nhập số điện thoại Việt Nam hợp lệ.",
    );
  const customer = {
    name: clean(value.name, "Họ tên", 2, 100),
    phone,
    address: clean(value.address, "Địa chỉ", 5, 250),
    province: clean(value.province, "Tỉnh/thành phố", 2, 100),
    district: clean(value.district, "Quận/huyện", 2, 100),
  };
  if (value.email != null && value.email !== "") {
    const email = clean(value.email, "Email", 5, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "validation_error", "Email không hợp lệ.");
    customer.email = email;
  }
  return customer;
}
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50)
    fail(400, "invalid_items", "Giỏ hàng phải có từ 1 đến 50 sản phẩm.");
  const seen = new Set();
  return items
    .map((item) => {
      if (
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id < 1 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99 ||
        seen.has(item.id)
      )
        fail(
          400,
          "invalid_items",
          "Sản phẩm hoặc số lượng không hợp lệ; không gửi mã sản phẩm trùng.",
        );
      seen.add(item.id);
      return { id: item.id, quantity: item.quantity };
    })
    .sort((a, b) => a.id - b.id);
}
async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function audit(
  client,
  actorId,
  action,
  entityType,
  entityId,
  metadata = {},
) {
  await client.query(
    "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
    [
      actorId || null,
      action,
      entityType,
      String(entityId),
      JSON.stringify(metadata),
    ],
  );
}
const variantSQL = `SELECT v.*,p.description,p.name AS product_name,b.name AS brand,
 COALESCE((SELECT c.name FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.status='active' ORDER BY c.sort_order,c.id LIMIT 1),'Sản phẩm') AS category,
 COALESCE((SELECT m.url FROM product_media m WHERE m.product_id=p.id AND (m.variant_id=v.id OR m.variant_id IS NULL) ORDER BY m.variant_id NULLS LAST,m.sort_order,m.id LIMIT 1),'') AS image,
 COALESCE((SELECT json_agg(s.spec_value ORDER BY s.sort_order,s.id) FROM product_specs s WHERE s.product_id=p.id AND s.spec_name='feature'),'[]') AS features,
 COALESCE((SELECT SUM(ib.on_hand-ib.reserved) FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id WHERE ib.variant_id=v.id AND w.type='normal' AND w.status='active'),0) AS available
 FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id`;
function adaptProduct(p) {
  return {
    id: number(p.id),
    productId: number(p.product_id),
    slug: p.slug,
    name: p.name,
    productName: p.product_name,
    sku: p.sku,
    barcode: p.barcode,
    brand: p.brand || "Jielien",
    category: p.category,
    type: p.type,
    image: p.image,
    price: number(p.price),
    oldPrice: number(p.original_price ?? p.price),
    stock: number(p.available),
    age: p.age,
    weight: p.weight,
    description: p.description,
    features: p.features || [],
    status: p.status,
  };
}
async function productsFrom(client, includeInactive = false) {
  const result = await client.query(
    variantSQL +
      (includeInactive
        ? ""
        : " WHERE v.status='active' AND p.status='active'") +
      " ORDER BY v.id",
  );
  return result.rows.map(adaptProduct);
}
async function couponFor(client, code, subtotal, lock = false) {
  if (!code) return null;
  const result = await client.query(
    `SELECT c.*,p.discount_type,p.discount_value,p.minimum_order,p.maximum_discount,p.start_at,p.end_at,p.status AS promotion_status FROM coupons c JOIN promotions p ON p.id=c.promotion_id WHERE c.code=$1${lock ? " FOR UPDATE OF c" : ""}`,
    [code],
  );
  const c = result.rows[0];
  const now = Date.now();
  if (
    !c ||
    c.status !== "active" ||
    c.promotion_status !== "active" ||
    (c.expires_at && new Date(c.expires_at).getTime() <= now) ||
    (c.start_at && new Date(c.start_at).getTime() > now) ||
    (c.end_at && new Date(c.end_at).getTime() <= now) ||
    (c.usage_limit != null && number(c.used_count) >= number(c.usage_limit))
  )
    fail(
      400,
      "invalid_coupon",
      "Mã ưu đãi không tồn tại, đã hết hạn hoặc hết lượt sử dụng.",
    );
  if (subtotal < number(c.minimum_order))
    fail(
      400,
      "coupon_minimum",
      `${code} áp dụng cho đơn từ ${number(c.minimum_order).toLocaleString("vi-VN")}đ.`,
    );
  return c;
}
async function calculate(client, items, couponValue, lockCoupon = false) {
  let coupon = "";
  if (couponValue != null && couponValue !== "")
    coupon = clean(couponValue, "Mã ưu đãi", 1, 30).toUpperCase();
  const all = await productsFrom(client);
  const byId = new Map(all.map((p) => [p.id, p]));
  const lines = items.map(({ id, quantity }) => {
    const p = byId.get(id);
    if (!p)
      fail(400, "invalid_items", "Sản phẩm không tồn tại hoặc đã ngừng bán.");
    if (p.stock < quantity)
      fail(
        409,
        "insufficient_stock",
        `Sản phẩm ${p.name} không đủ số lượng trong kho.`,
      );
    return {
      id,
      name: p.name,
      image: p.image,
      price: p.price,
      quantity,
      lineTotal: p.price * quantity,
      sku: p.sku,
    };
  });
  const subtotal = lines.reduce((sum, p) => sum + p.lineTotal, 0);
  if (!Number.isSafeInteger(subtotal))
    fail(400, "invalid_total", "Tổng tiền vượt giới hạn.");
  const offer = await couponFor(client, coupon, subtotal, lockCoupon);
  let discount = 0;
  let shipping = subtotal >= 499000 ? 0 : 25000;
  if (offer) {
    const amount = number(offer.discount_value);
    if (offer.discount_type === "fixed") discount = Math.min(amount, subtotal);
    if (offer.discount_type === "percentage")
      discount = Math.floor((subtotal * amount) / 100);
    if (offer.maximum_discount != null)
      discount = Math.min(discount, number(offer.maximum_discount));
    if (offer.discount_type === "shipping") shipping = 0;
  }
  return {
    items: lines.map(({ sku, ...line }) => line),
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
    coupon,
    offer,
    skus: new Map(lines.map((line) => [line.id, line.sku])),
  };
}
function publicQuote(q) {
  const { offer, skus, ...result } = q;
  return result;
}
async function readOrder(client, numberValue) {
  const result = await client.query(
    "SELECT * FROM orders WHERE order_number=$1",
    [numberValue],
  );
  if (!result.rowCount) return null;
  const o = result.rows[0];
  const lines = await client.query(
    "SELECT * FROM order_items WHERE order_id=$1 ORDER BY id",
    [o.id],
  );
  const history = await client.query(
    "SELECT old_status,new_status,created_at,note FROM order_status_history WHERE order_id=$1 ORDER BY id",
    [o.id],
  );
  const payment = await client.query(
    "SELECT id,method,amount,status,paid_at FROM payments WHERE order_id=$1 ORDER BY id",
    [o.id],
  );
  return {
    id: o.order_number,
    internalId: number(o.id),
    userId: o.user_id == null ? null : number(o.user_id),
    token: o.access_token,
    status: o.status,
    createdAt: iso(o.created_at),
    customer: {
      name: o.recipient_name,
      phone: o.recipient_phone,
      address: o.address_detail,
      province: o.province,
      district: o.district,
      ...(o.recipient_email ? { email: o.recipient_email } : {}),
    },
    items: lines.rows.map((i) => ({
      id: number(i.variant_id),
      sku: i.sku_snapshot,
      name: i.name_snapshot,
      image: i.image_snapshot,
      price: number(i.unit_price),
      quantity: number(i.quantity),
      lineTotal: number(i.line_total),
    })),
    subtotal: number(o.subtotal),
    discount: number(o.discount_total),
    shipping: number(o.shipping_fee),
    total: number(o.grand_total),
    coupon: o.coupon_code,
    payment: o.payment_method,
    paymentStatus: payment.rows.at(-1)?.status || "pending",
    note: o.note,
    statusHistory: history.rows.map((h) => ({
      oldStatus: h.old_status,
      newStatus: h.new_status,
      createdAt: iso(h.created_at),
      note: h.note,
    })),
    payments: payment.rows.map((p) => ({
      id: number(p.id),
      method: p.method,
      amount: number(p.amount),
      status: p.status,
      paidAt: p.paid_at ? iso(p.paid_at) : null,
    })),
  };
}

export async function createStore({ pool, catalogPath, legacyPath } = {}) {
  if (!pool) throw new Error("PostgreSQL pool is required.");
  await migrate(pool);
  const seeded = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM product_variants) AS present",
  );
  if (catalogPath && !seeded.rows[0].present)
    await seedCatalog(pool, catalogPath);
  const importResult = legacyPath
    ? await importLegacy({ pool, legacyPath })
    : { imported: false, reason: "not_requested" };
  return {
    pool,
    importResult,
    async listProducts(options = {}) {
      const list = await productsFrom(pool, options.includeInactive === true);
      return list.map((p) => ({
        ...p,
        variants: list
          .filter((v) => v.productId === p.productId)
          .map((v) => ({
            id: v.id,
            slug: v.slug,
            name: v.name,
            weight: v.weight,
            price: v.price,
            stock: v.stock,
          })),
      }));
    },
    async quote({ items, coupon }) {
      return publicQuote(await calculate(pool, normalizeItems(items), coupon));
    },
    async createOrder(input) {
      const items = normalizeItems(input.items),
        customer = normalizeCustomer(input.customer);
      if (input.payment !== "cod")
        fail(
          400,
          "invalid_payment",
          "Hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).",
        );
      const note =
        input.note == null || input.note === ""
          ? ""
          : clean(
              typeof input.note === "string"
                ? input.note.replace(/\r\n?/g, "\n")
                : input.note,
              "Ghi chú",
              0,
              500,
              true,
            );
      const idempotencyKey = clean(input.idempotencyKey, "Mã yêu cầu", 8, 128);
      const coupon =
        input.coupon == null || input.coupon === ""
          ? ""
          : clean(input.coupon, "Mã ưu đãi", 1, 30).toUpperCase();
      const userId = input.userId ?? null;
      if (userId != null && (!Number.isSafeInteger(userId) || userId < 1))
        fail(400, "validation_error", "Tài khoản không hợp lệ.");
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({ items, customer, coupon, payment: "cod", note }),
        )
        .digest("hex");
      return transaction(pool, async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':order:' || $1))",
          [idempotencyKey],
        );
        const existing = (
          await client.query(
            "SELECT order_number,fingerprint,user_id FROM orders WHERE idempotency_key=$1",
            [idempotencyKey],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.fingerprint !== fingerprint ||
            (existing.user_id != null && number(existing.user_id) !== userId)
          )
            fail(
              409,
              "idempotency_conflict",
              "Mã yêu cầu đã được dùng cho một đơn khác.",
            );
          return readOrder(client, existing.order_number);
        }
        if (userId) {
          const account = await client.query(
            "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
            [userId],
          );
          if (!account.rowCount)
            fail(403, "account_inactive", "Tài khoản không hoạt động.");
        }
        const ids = items.map((i) => i.id);
        await client.query(
          "SELECT id FROM product_variants WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE",
          [ids],
        );
        const balances = (
          await client.query(
            "SELECT ib.* FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id WHERE ib.variant_id=ANY($1::bigint[]) AND w.type='normal' AND w.status='active' ORDER BY ib.variant_id,ib.warehouse_id FOR UPDATE OF ib",
            [ids],
          )
        ).rows;
        const q = await calculate(client, items, coupon, true);
        const orderNumber = `JL${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`,
          token = randomBytes(32).toString("base64url");
        const order = (
          await client.query(
            "INSERT INTO orders(order_number,user_id,status,recipient_name,recipient_phone,recipient_email,address_detail,province,district,subtotal,discount_total,shipping_fee,grand_total,coupon_code,payment_method,note,access_token,idempotency_key,fingerprint) VALUES($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'cod',$14,$15,$16,$17) RETURNING id",
            [
              orderNumber,
              userId,
              customer.name,
              customer.phone,
              customer.email || null,
              customer.address,
              customer.province,
              customer.district,
              q.subtotal,
              q.discount,
              q.shipping,
              q.total,
              q.coupon,
              note,
              token,
              idempotencyKey,
              fingerprint,
            ],
          )
        ).rows[0];
        for (const line of q.items) {
          await client.query(
            "INSERT INTO order_items(order_id,variant_id,sku_snapshot,name_snapshot,image_snapshot,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              order.id,
              line.id,
              q.skus.get(line.id),
              line.name,
              line.image,
              line.quantity,
              line.price,
              line.lineTotal,
            ],
          );
          let remaining = line.quantity;
          for (const balance of balances.filter(
            (b) => number(b.variant_id) === line.id,
          )) {
            const allocation = Math.min(
              remaining,
              number(balance.on_hand) - number(balance.reserved),
            );
            if (allocation <= 0) continue;
            await client.query(
              "UPDATE inventory_balances SET reserved=reserved+$1,updated_at=NOW() WHERE warehouse_id=$2 AND variant_id=$3",
              [allocation, balance.warehouse_id, line.id],
            );
            await client.query(
              "INSERT INTO inventory_reservations(order_id,variant_id,warehouse_id,quantity,status) VALUES($1,$2,$3,$4,'active')",
              [order.id, line.id, balance.warehouse_id, allocation],
            );
            await client.query(
              "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,actor_id,reason) VALUES($1,$2,0,$3,'reserve','order',$4,$5,'Giữ tồn cho đơn hàng')",
              [balance.warehouse_id, line.id, allocation, orderNumber, userId],
            );
            remaining -= allocation;
            if (!remaining) break;
          }
          if (remaining)
            fail(409, "insufficient_stock", "Sản phẩm không còn đủ số lượng.");
        }
        await client.query(
          "INSERT INTO order_status_history(order_id,new_status,changed_by,note) VALUES($1,'pending',$2,'Đơn hàng được tạo')",
          [order.id, userId],
        );
        await client.query(
          "INSERT INTO payments(order_id,provider,method,amount,status) VALUES($1,'manual','cod',$2,'pending')",
          [order.id, q.total],
        );
        await client.query(
          "INSERT INTO shipments(order_id,status) VALUES($1,'pending')",
          [order.id],
        );
        if (q.offer) {
          await client.query(
            "UPDATE coupons SET used_count=used_count+1 WHERE id=$1",
            [q.offer.id],
          );
          await client.query(
            "INSERT INTO coupon_redemptions(coupon_id,user_id,order_id) VALUES($1,$2,$3)",
            [q.offer.id, userId, order.id],
          );
        }
        if (userId)
          await client.query(
            "UPDATE carts SET status='converted',updated_at=NOW() WHERE user_id=$1 AND status='active'",
            [userId],
          );
        await audit(client, userId, "order.created", "order", orderNumber, {
          total: q.total,
          items: items.length,
        });
        return readOrder(client, orderNumber);
      });
    },
    async getOrderByNumber(numberValue) {
      return readOrder(pool, numberValue);
    },
    async listOrders({ userId, limit = 100 } = {}) {
      const cap = Math.min(200, Math.max(1, Number(limit) || 100));
      const rows = await pool.query(
        "SELECT order_number FROM orders" +
          (userId != null ? " WHERE user_id=$1" : "") +
          " ORDER BY created_at DESC,id DESC LIMIT " +
          cap,
        userId != null ? [userId] : [],
      );
      const list = [];
      for (const row of rows.rows) {
        const order = await readOrder(pool, row.order_number);
        delete order.token;
        list.push(order);
      }
      return list;
    },
    async updateOrderStatus(orderNumber, status, actorId, reason = "") {
      const statusNote = reason
        ? clean(reason, "Ghi chú xử lý", 0, 500, true)
        : "";
      return transaction(pool, async (client) => {
        const o = (
          await client.query(
            "SELECT * FROM orders WHERE order_number=$1 FOR UPDATE",
            [orderNumber],
          )
        ).rows[0];
        if (!o) fail(404, "order_not_found", "Không tìm thấy đơn hàng.");
        if (status === o.status) return readOrder(client, orderNumber);
        if (!statuses[o.status]?.includes(status))
          fail(
            409,
            "invalid_transition",
            "Không thể chuyển trạng thái đơn hàng theo trình tự này.",
          );
        if (["shipped", "cancelled"].includes(status)) {
          const reservations = (
            await client.query(
              "SELECT r.*,ib.on_hand,ib.reserved FROM inventory_reservations r JOIN inventory_balances ib ON ib.warehouse_id=r.warehouse_id AND ib.variant_id=r.variant_id WHERE r.order_id=$1 AND r.status='active' ORDER BY r.variant_id,r.warehouse_id FOR UPDATE OF r,ib",
              [o.id],
            )
          ).rows;
          for (const r of reservations) {
            const quantity = number(r.quantity);
            await client.query(
              "UPDATE inventory_balances SET on_hand=on_hand-$1,reserved=reserved-$2,updated_at=NOW() WHERE warehouse_id=$3 AND variant_id=$4",
              [
                status === "shipped" ? quantity : 0,
                quantity,
                r.warehouse_id,
                r.variant_id,
              ],
            );
            await client.query(
              "UPDATE inventory_reservations SET status=$1,updated_at=NOW() WHERE id=$2",
              [status === "shipped" ? "consumed" : "released", r.id],
            );
            await client.query(
              "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,'order',$6,$7,$8)",
              [
                r.warehouse_id,
                r.variant_id,
                status === "shipped" ? -quantity : 0,
                -quantity,
                status === "shipped" ? "sale" : "release",
                orderNumber,
                actorId || null,
                status === "shipped"
                  ? "Xuất kho giao hàng"
                  : "Hủy đơn và trả tồn khả dụng",
              ],
            );
          }
        }
        await client.query(
          "UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2",
          [status, o.id],
        );
        await client.query(
          "INSERT INTO order_status_history(order_id,old_status,new_status,changed_by,note) VALUES($1,$2,$3,$4,$5)",
          [o.id, o.status, status, actorId || null, statusNote],
        );
        const shipmentStatus = {
          confirmed: "ready",
          processing: "processing",
          shipped: "shipped",
          delivered: "delivered",
          cancelled: "cancelled",
        }[status];
        await client.query(
          "UPDATE shipments SET status=$1,updated_at=NOW() WHERE order_id=$2",
          [shipmentStatus, o.id],
        );
        if (status === "cancelled")
          await client.query(
            "UPDATE payments SET status='cancelled' WHERE order_id=$1 AND status='pending'",
            [o.id],
          );
        await audit(
          client,
          actorId,
          "order.status_changed",
          "order",
          orderNumber,
          { from: o.status, to: status },
        );
        return readOrder(client, orderNumber);
      });
    },
    async recordPayment(orderNumber, actorId) {
      return transaction(pool, async (client) => {
        const o = (
          await client.query(
            "SELECT * FROM orders WHERE order_number=$1 FOR UPDATE",
            [orderNumber],
          )
        ).rows[0];
        if (!o) fail(404, "order_not_found", "Không tìm thấy đơn hàng.");
        if (o.status !== "delivered")
          fail(
            409,
            "invalid_payment_state",
            "Chỉ ghi nhận COD sau khi giao hàng.",
          );
        const p = (
          await client.query(
            "SELECT * FROM payments WHERE order_id=$1 AND method='cod' ORDER BY id LIMIT 1 FOR UPDATE",
            [o.id],
          )
        ).rows[0];
        if (!p) fail(409, "payment_missing", "Không có giao dịch COD.");
        if (p.status !== "paid") {
          await client.query(
            "UPDATE payments SET status='paid',paid_at=NOW() WHERE id=$1",
            [p.id],
          );
          await client.query(
            "INSERT INTO payment_events(payment_id,provider_event_id,event_type,payload) VALUES($1,$2,'cod.collected',$3::jsonb)",
            [p.id, `cod-${o.id}`, JSON.stringify({ actorId })],
          );
          await audit(
            client,
            actorId,
            "payment.collected",
            "order",
            orderNumber,
            { amount: number(p.amount) },
          );
        }
        return readOrder(client, orderNumber);
      });
    },
    async adjustInventory({
      variantId,
      quantityChange,
      warehouseId = 1,
      reason,
      actorId,
    }) {
      if (
        !Number.isSafeInteger(variantId) ||
        variantId < 1 ||
        !Number.isInteger(quantityChange) ||
        !quantityChange ||
        Math.abs(quantityChange) > 1000000 ||
        !Number.isSafeInteger(warehouseId) ||
        warehouseId < 1
      )
        fail(400, "invalid_inventory", "Số lượng điều chỉnh không hợp lệ.");
      const note = clean(reason, "Lý do điều chỉnh", 3, 500, true);
      return transaction(pool, async (client) => {
        const warehouse = (
          await client.query(
            "SELECT id FROM warehouses WHERE id=$1 AND status='active'",
            [warehouseId],
          )
        ).rows[0];
        const variant = (
          await client.query("SELECT id FROM product_variants WHERE id=$1", [
            variantId,
          ])
        ).rows[0];
        if (!warehouse || !variant)
          fail(404, "inventory_not_found", "Không tìm thấy kho hoặc SKU.");
        await client.query(
          "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES($1,$2,0,0) ON CONFLICT DO NOTHING",
          [warehouseId, variantId],
        );
        const balance = (
          await client.query(
            "SELECT * FROM inventory_balances WHERE warehouse_id=$1 AND variant_id=$2 FOR UPDATE",
            [warehouseId, variantId],
          )
        ).rows[0];
        const next = number(balance.on_hand) + quantityChange;
        if (next < number(balance.reserved) || next < 0)
          fail(
            409,
            "insufficient_stock",
            "Không thể giảm tồn xuống dưới số lượng đã giữ cho đơn hàng.",
          );
        await client.query(
          "UPDATE inventory_balances SET on_hand=$1,updated_at=NOW() WHERE warehouse_id=$2 AND variant_id=$3",
          [next, warehouseId, variantId],
        );
        await client.query(
          "INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,actor_id,reason) VALUES($1,$2,$3,0,'adjustment',$4,$5)",
          [warehouseId, variantId, quantityChange, actorId || null, note],
        );
        await audit(
          client,
          actorId,
          "inventory.adjusted",
          "variant",
          variantId,
          { warehouseId, quantityChange, reason: note },
        );
        return {
          warehouseId,
          variantId,
          onHand: next,
          reserved: number(balance.reserved),
          available: next - number(balance.reserved),
        };
      });
    },
    async updateVariant(id, changes, actorId) {
      if (!Number.isSafeInteger(id) || id < 1)
        fail(400, "invalid_variant", "SKU không hợp lệ.");
      const allowed = {
        price: "price",
        originalPrice: "original_price",
        oldPrice: "original_price",
        name: "name",
        status: "status",
        age: "age",
        weight: "weight",
      };
      const entries = Object.entries(changes || {}).filter(
        ([key]) => allowed[key],
      );
      if (!entries.length)
        fail(400, "validation_error", "Không có trường cập nhật hợp lệ.");
      for (const [key, value] of entries) {
        if (["price", "oldPrice", "originalPrice"].includes(key)) {
          if (!Number.isSafeInteger(value) || value < 0)
            fail(400, "validation_error", "Giá sản phẩm không hợp lệ.");
        } else if (key === "status") {
          if (!["active", "inactive", "draft"].includes(value))
            fail(400, "validation_error", "Trạng thái SKU không hợp lệ.");
        } else clean(value, key, key === "name" ? 2 : 0, 255);
      }
      await transaction(pool, async (client) => {
        const old = (
          await client.query(
            "SELECT * FROM product_variants WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!old) fail(404, "variant_not_found", "Không tìm thấy SKU.");
        const values = entries.map(([, value]) =>
          typeof value === "string" ? value.trim() : value,
        );
        await client.query(
          "UPDATE product_variants SET " +
            entries.map(([key], i) => `${allowed[key]}=$${i + 1}`).join(",") +
            ",updated_at=NOW() WHERE id=$" +
            (values.length + 1),
          [...values, id],
        );
        for (const [code, key] of [
          ["age", "age"],
          ["packaging", "weight"],
        ]) {
          if (!Object.hasOwn(changes, key)) continue;
          const attribute = (
            await client.query("SELECT id FROM attributes WHERE code=$1", [
              code,
            ])
          ).rows[0];
          if (!attribute) continue;
          await client.query(
            "DELETE FROM variant_attribute_values WHERE variant_id=$1 AND attribute_value_id IN(SELECT id FROM attribute_values WHERE attribute_id=$2)",
            [id, attribute.id],
          );
          const value = changes[key].trim();
          if (value) {
            const valueRow = (
              await client.query(
                "INSERT INTO attribute_values(attribute_id,value) VALUES($1,$2) ON CONFLICT(attribute_id,value) DO UPDATE SET value=EXCLUDED.value RETURNING id",
                [attribute.id, value],
              )
            ).rows[0];
            await client.query(
              "INSERT INTO variant_attribute_values(variant_id,attribute_value_id) VALUES($1,$2)",
              [id, valueRow.id],
            );
          }
        }
        await audit(client, actorId, "variant.updated", "variant", id, {
          changes: Object.fromEntries(entries),
        });
      });
      return (await productsFrom(pool, true)).find((p) => p.id === id);
    },
    async inventoryList() {
      const result = await pool.query(
        "SELECT ib.*,w.name AS warehouse_name,w.type AS warehouse_type,v.name,v.sku FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id JOIN product_variants v ON v.id=ib.variant_id ORDER BY ib.variant_id,ib.warehouse_id",
      );
      return result.rows.map((row) => ({
        warehouseId: number(row.warehouse_id),
        warehouseName: row.warehouse_name,
        warehouseType: row.warehouse_type,
        variantId: number(row.variant_id),
        sku: row.sku,
        name: row.name,
        onHand: number(row.on_hand),
        reserved: number(row.reserved),
        available: number(row.on_hand) - number(row.reserved),
      }));
    },
    async dashboard() {
      const result = await pool.query(
        "SELECT (SELECT count(*) FROM products) AS products,(SELECT count(*) FROM product_variants) AS variants,(SELECT count(*) FROM users) AS customers,(SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM orders WHERE status='pending') AS pending_orders,(SELECT COALESCE(sum(amount),0) FROM payments WHERE status='paid') AS revenue,(SELECT count(*) FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id WHERE w.type='normal' AND ib.on_hand-ib.reserved<10) AS low_stock",
      );
      const r = result.rows[0];
      return {
        products: number(r.products),
        variants: number(r.variants),
        customers: number(r.customers),
        orders: number(r.orders),
        pendingOrders: number(r.pending_orders),
        revenue: number(r.revenue),
        lowStock: number(r.low_stock),
      };
    },
    async auditList(limit = 100) {
      return this.auditLogs(limit);
    },
    async auditLogs(limit = 100) {
      const result = await pool.query(
        "SELECT a.*,u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT $1",
        [Math.min(200, Math.max(1, Number(limit) || 100))],
      );
      return result.rows.map((r) => ({
        id: number(r.id),
        actorId: r.actor_id ? number(r.actor_id) : null,
        actorName: r.actor_name,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metadata: r.metadata,
        createdAt: iso(r.created_at),
      }));
    },
  };
}
