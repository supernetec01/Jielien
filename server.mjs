import http from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(projectRoot, "public");
const maxBodyBytes = 32 * 1024;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const routePattern =
  /^\/(?:san-pham(?:\/[^/]+)?|danh-muc(?:\/[^/]+)?|gio-hang|thanh-toan|don-hang(?:\/[^/]+)?|tra-cuu-don-hang|yeu-thich|chinh-sach(?:\/[^/]+)?|bai-viet(?:\/[^/]+)?)\/?$/;

class AppError extends Error {
  constructor(status, error, message) {
    super(message);
    this.status = status;
    this.error = error;
  }
}
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
const cleanText = (value, label, min, max, multiline = false) => {
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
const normalizePhone = (value) => {
  if (typeof value !== "string")
    fail(400, "validation_error", "Số điện thoại không hợp lệ.");
  const phone = value
    .trim()
    .replace(/[ .()-]/g, "")
    .replace(/^\+84/, "0");
  if (!/^0[35789]\d{8}$/.test(phone))
    fail(
      400,
      "validation_error",
      "Vui lòng nhập số điện thoại Việt Nam hợp lệ.",
    );
  return phone;
};
const sameSecret = (given, expected) => {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(given),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    fail(415, "unsupported_media_type", "Yêu cầu định dạng application/json.");
  if (Number(req.headers["content-length"]) > maxBodyBytes)
    fail(413, "body_too_large", "Yêu cầu quá lớn.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) fail(413, "body_too_large", "Yêu cầu quá lớn.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    fail(400, "invalid_json", "Dữ liệu JSON không hợp lệ.");
  }
}

export async function createApp({
  dataDir = resolve(projectRoot, "data"),
  catalogPath = resolve(publicRoot, "catalog.json"),
} = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (
    !Array.isArray(catalog) ||
    !catalog.length ||
    new Set(catalog.map((p) => p.id)).size !== catalog.length
  )
    throw new Error(
      "Catalog must be a nonempty array with unique product IDs.",
    );
  for (const p of catalog)
    if (
      !Number.isInteger(p.id) ||
      p.id <= 0 ||
      !Number.isSafeInteger(p.price) ||
      p.price <= 0 ||
      !Number.isInteger(p.stock) ||
      p.stock < 0 ||
      typeof p.name !== "string"
    )
      throw new Error("Invalid product in catalog.");
  const productById = new Map(catalog.map((p) => [p.id, p]));
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(dataDir, "store.sqlite"));
  db.exec(
    "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS inventory (product_id INTEGER PRIMARY KEY, stock INTEGER NOT NULL CHECK(stock >= 0)); CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, token TEXT NOT NULL, phone TEXT NOT NULL, idempotency_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL);",
  );
  const seedStock = db.prepare(
    "INSERT OR IGNORE INTO inventory(product_id, stock) VALUES (?, ?)",
  );
  for (const p of catalog) seedStock.run(p.id, p.stock);
  const getStock = db.prepare(
    "SELECT stock FROM inventory WHERE product_id = ?",
  );
  const readOrder = db.prepare("SELECT * FROM orders WHERE id = ?");
  const byKey = db.prepare("SELECT * FROM orders WHERE idempotency_key = ?");
  const rates = new Map();
  function rateLimit(req, kind, max) {
    const now = Date.now(),
      key = `${kind}:${req.socket.remoteAddress}`;
    let entry = rates.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      rates.set(key, entry);
    }
    if (++entry.count > max)
      fail(
        429,
        "rate_limited",
        "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.",
      );
    if (rates.size > 1000)
      for (const [k, v] of rates) if (v.until < now) rates.delete(k);
  }
  function parseItems(body) {
    if (
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 50
    )
      fail(400, "invalid_items", "Giỏ hàng phải có từ 1 đến 50 sản phẩm.");
    const seen = new Set();
    const items = body.items.map((item) => {
      if (
        !item ||
        !Number.isInteger(item.id) ||
        !productById.has(item.id) ||
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
    });
    return items.sort((a, b) => a.id - b.id);
  }
  function calculate(items, couponValue, validateStock = true) {
    let coupon = "";
    if (couponValue != null && couponValue !== "")
      coupon = cleanText(couponValue, "Mã ưu đãi", 1, 30).toUpperCase();
    if (coupon && !["MEBE50", "FREESHIP"].includes(coupon))
      fail(400, "invalid_coupon", "Mã ưu đãi không tồn tại.");
    const lines = items.map(({ id, quantity }) => {
      const p = productById.get(id);
      if (validateStock && getStock.get(id).stock < quantity)
        fail(
          409,
          "insufficient_stock",
          `Sản phẩm ${p.name} không đủ số lượng trong kho.`,
        );
      return {
        id,
        name: p.name,
        image: p.image || "",
        price: p.price,
        quantity,
        lineTotal: p.price * quantity,
      };
    });
    const subtotal = lines.reduce((sum, p) => sum + p.lineTotal, 0);
    if (coupon === "MEBE50" && subtotal < 500000)
      fail(400, "coupon_minimum", "MEBE50 áp dụng cho đơn từ 500.000đ.");
    if (coupon === "FREESHIP" && subtotal < 299000)
      fail(400, "coupon_minimum", "FREESHIP áp dụng cho đơn từ 299.000đ.");
    const discount = coupon === "MEBE50" ? 50000 : 0;
    const shipping = subtotal >= 499000 || coupon === "FREESHIP" ? 0 : 25000;
    return {
      items: lines,
      subtotal,
      discount,
      shipping,
      total: subtotal - discount + shipping,
      coupon,
    };
  }
  function customerData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "validation_error", "Vui lòng nhập thông tin nhận hàng.");
    const customer = {
      name: cleanText(value.name, "Họ tên", 2, 100),
      phone: normalizePhone(value.phone),
      address: cleanText(value.address, "Địa chỉ", 5, 250),
      province: cleanText(value.province, "Tỉnh/thành phố", 2, 100),
      district: cleanText(value.district, "Quận/huyện", 2, 100),
    };
    if (value.email != null && value.email !== "") {
      const email = cleanText(value.email, "Email", 5, 200);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, "validation_error", "Email không hợp lệ.");
      customer.email = email;
    }
    return customer;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    try {
      const rawPath = (req.url || "/").split("?")[0];
      let decoded;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        fail(400, "bad_path", "Đường dẫn không hợp lệ.");
      }
      if (
        decoded.includes("\\") ||
        decoded.includes("\0") ||
        decoded.split("/").some((x) => x === ".." || x === ".")
      )
        fail(403, "forbidden", "Không thể truy cập đường dẫn này.");
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      if (path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "GET" && path === "/api/products")
          return json(res, 200, {
            products: catalog.map((p) => ({
              ...p,
              stock: getStock.get(p.id).stock,
            })),
          });
        if (req.method === "POST" && path === "/api/quote") {
          const body = await readBody(req);
          return json(res, 200, calculate(parseItems(body), body.coupon));
        }
        if (req.method === "POST" && path === "/api/orders") {
          rateLimit(req, "orders", 30);
          const body = await readBody(req),
            items = parseItems(body),
            customer = customerData(body.customer);
          if (body.payment !== "cod")
            fail(
              400,
              "invalid_payment",
              "Hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).",
            );
          const note =
            body.note == null || body.note === ""
              ? ""
              : cleanText(
                  typeof body.note === "string"
                    ? body.note.replace(/\r\n?/g, "\n")
                    : body.note,
                  "Ghi chú",
                  0,
                  500,
                  true,
                );
          const idempotencyKey = cleanText(
            body.idempotencyKey,
            "Mã yêu cầu",
            8,
            128,
          );
          const quote = calculate(items, body.coupon, false);
          const fingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                items,
                customer,
                coupon: quote.coupon,
                payment: "cod",
                note,
              }),
            )
            .digest("hex");
          db.exec("BEGIN IMMEDIATE");
          try {
            const existing = byKey.get(idempotencyKey);
            if (existing) {
              if (existing.fingerprint !== fingerprint)
                fail(
                  409,
                  "idempotency_conflict",
                  "Mã yêu cầu đã được dùng cho một đơn khác.",
                );
              db.exec("COMMIT");
              return json(res, 201, { order: JSON.parse(existing.payload) });
            }
            const validated = calculate(items, body.coupon);
            const order = {
              id: `JL${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`,
              token: randomBytes(32).toString("base64url"),
              status: "pending",
              createdAt: new Date().toISOString(),
              customer,
              ...validated,
              payment: "cod",
              note,
            };
            const decrement = db.prepare(
              "UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND stock >= ?",
            );
            for (const { id, quantity } of items)
              if (decrement.run(quantity, id, quantity).changes !== 1)
                fail(
                  409,
                  "insufficient_stock",
                  "Sản phẩm không còn đủ số lượng.",
                );
            db.prepare(
              "INSERT INTO orders(id, token, phone, idempotency_key, fingerprint, payload) VALUES (?, ?, ?, ?, ?, ?)",
            ).run(
              order.id,
              order.token,
              customer.phone,
              idempotencyKey,
              fingerprint,
              JSON.stringify(order),
            );
            db.exec("COMMIT");
            return json(res, 201, { order });
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        }
        if (req.method === "POST" && path === "/api/orders/lookup") {
          rateLimit(req, "lookup", 10);
          const body = await readBody(req);
          const id = cleanText(body.id, "Mã đơn hàng", 1, 80),
            phone = normalizePhone(body.phone);
          const existing = readOrder.get(id);
          if (!existing || !sameSecret(phone, existing.phone))
            fail(
              404,
              "order_not_found",
              "Không tìm thấy đơn hàng với thông tin đã nhập.",
            );
          const order = JSON.parse(existing.payload);
          delete order.token;
          return json(res, 200, { order });
        }
        const orderMatch = path.match(/^\/api\/orders\/([A-Za-z0-9-]{1,80})$/);
        if (req.method === "GET" && orderMatch) {
          rateLimit(req, "lookup", 10);
          const existing = readOrder.get(orderMatch[1]);
          if (
            !existing ||
            !sameSecret(url.searchParams.get("token"), existing.token)
          )
            fail(404, "order_not_found", "Không tìm thấy đơn hàng.");
          return json(res, 200, { order: JSON.parse(existing.payload) });
        }
        fail(404, "not_found", "API không tồn tại.");
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        fail(405, "method_not_allowed", "Phương thức không được hỗ trợ.");
      const spaRoute = decoded === "/" || routePattern.test(decoded);
      const file = resolve(
        publicRoot,
        "." + (spaRoute ? "/index.html" : decoded),
      );
      if (
        !file.startsWith(publicRoot + sep) ||
        !mime[extname(file)] ||
        decoded.split("/").some((part) => part.startsWith("."))
      )
        fail(404, "not_found", "Không tìm thấy trang.");
      let actual;
      try {
        actual = await realpath(file);
      } catch {
        fail(404, "not_found", "Không tìm thấy trang.");
      }
      if (!actual.startsWith(publicRoot + sep))
        fail(403, "forbidden", "Không thể truy cập đường dẫn này.");
      const content = await readFile(actual);
      res.writeHead(200, {
        "Content-Type": mime[extname(actual)],
        "Cache-Control": [".html", ".js", ".css", ".json"].includes(
          extname(actual),
        )
          ? "no-cache"
          : "public, max-age=3600",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (!(error instanceof AppError))
        console.error("Request failed:", error.message);
      json(res, error.status || 500, {
        error: error.error || "internal_error",
        message:
          error instanceof AppError
            ? error.message
            : "Có lỗi xảy ra. Vui lòng thử lại.",
      });
    }
  });
  server.on("close", () => db.close());
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const app = await createApp();
  app.listen(port, "0.0.0.0", () =>
    console.log(`Jielien storefront listening on port ${port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      app.close(() => process.exit(0));
      app.closeIdleConnections();
    });
}
