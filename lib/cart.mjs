export class CartError extends Error {
  constructor(status, error, message) {
    super(message);
    this.name = "CartError";
    this.status = status;
    this.error = error;
    this.expose = true;
  }
}

function fail(status, code, message) {
  throw new CartError(status, code, message);
}

function ownerId(value) {
  const id =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(id) || id < 1) {
    fail(400, "invalid_user", "Mã người dùng không hợp lệ.");
  }
  return id;
}

function parseItems(items) {
  if (!Array.isArray(items) || items.length > 50) {
    fail(400, "invalid_items", "Giỏ hàng chỉ được chứa tối đa 50 sản phẩm.");
  }
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
      ) {
        fail(
          400,
          "invalid_items",
          "Mã sản phẩm hoặc số lượng không hợp lệ; mỗi mã chỉ xuất hiện một lần.",
        );
      }
      seen.add(item.id);
      return { id: item.id, quantity: item.quantity };
    })
    .sort((a, b) => a.id - b.id);
}

/** Authenticated carts contain selections only; stock is reserved by checkout. */
export function createCartService(pool) {
  async function getCart(userId) {
    const { rows } = await pool.query(
      `SELECT ci.variant_id, ci.quantity FROM carts c
       JOIN users u ON u.id = c.user_id
       JOIN cart_items ci ON ci.cart_id = c.id
       WHERE c.user_id = $1 AND c.status = 'active' AND u.status = 'active'
       ORDER BY ci.variant_id`,
      [ownerId(userId)],
    );
    return rows.map((row) => ({
      id: Number(row.variant_id),
      quantity: row.quantity,
    }));
  }

  async function saveCart(userId, items) {
    const user = ownerId(userId);
    const normalized = parseItems(items);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // All saves for this account serialize, including the first INSERT. The
      // database's partial unique index also forbids two active carts per user.
      const account = await client.query(
        "SELECT status FROM users WHERE id = $1 FOR UPDATE",
        [user],
      );
      if (account.rows[0]?.status !== "active") {
        fail(404, "user_not_found", "Không tìm thấy tài khoản đang hoạt động.");
      }
      if (normalized.length) {
        const ids = normalized.map((item) => item.id);
        const products = await client.query(
          `SELECT v.id, v.status, p.status AS product_status,
             COALESCE((SELECT SUM(b.on_hand - b.reserved)
               FROM inventory_balances b
               JOIN warehouses w ON w.id = b.warehouse_id
               WHERE b.variant_id = v.id AND w.type = 'normal' AND w.status = 'active'), 0) AS available
           FROM product_variants v JOIN products p ON p.id = v.product_id
           WHERE v.id = ANY($1::bigint[])`,
          [ids],
        );
        const byId = new Map(products.rows.map((row) => [Number(row.id), row]));
        for (const item of normalized) {
          const product = byId.get(item.id);
          if (!product)
            fail(400, "invalid_items", "Sản phẩm trong giỏ không tồn tại.");
          if (
            product.status !== "active" ||
            product.product_status !== "active"
          ) {
            fail(
              409,
              "variant_unavailable",
              "Sản phẩm trong giỏ đã ngừng bán.",
            );
          }
          if (Number(product.available) < item.quantity) {
            fail(
              409,
              "insufficient_stock",
              "Sản phẩm trong giỏ không còn đủ số lượng.",
            );
          }
        }
      }
      const { rows } = await client.query(
        `INSERT INTO carts(user_id, status) VALUES ($1, 'active')
         ON CONFLICT (user_id) WHERE status = 'active' AND user_id IS NOT NULL
         DO UPDATE SET updated_at = now() RETURNING id`,
        [user],
      );
      const cartId = rows[0].id;
      // Replace selections without changing the active cart ID or item IDs for
      // products that remain selected. Converted carts keep their history.
      await client.query(
        "DELETE FROM cart_items WHERE cart_id = $1 AND NOT (variant_id = ANY($2::bigint[]))",
        [cartId, normalized.map((item) => item.id)],
      );
      for (const item of normalized) {
        await client.query(
          `INSERT INTO cart_items(cart_id, variant_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
          [cartId, item.id, item.quantity],
        );
      }
      await client.query("COMMIT");
      return normalized;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { getCart, saveCart };
}
