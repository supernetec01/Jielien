import http from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { createPool } from "./lib/database.mjs";
import { createStore } from "./db/store.mjs";
import { createAuth } from "./lib/auth.mjs";
import { createCartService } from "./lib/cart.mjs";
import QRCode from "qrcode";

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
function parseItems(body) {
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 50
  )
    fail(400, "invalid_items", "Giỏ hàng phải có từ 1 đến 50 sản phẩm.");
  const seen = new Set();
  return body.items
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
        fail(400, "invalid_items", "Mã sản phẩm hoặc số lượng không hợp lệ.");
      seen.add(item.id);
      return { id: item.id, quantity: item.quantity };
    })
    .sort((a, b) => a.id - b.id);
}
function cookieToken(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("jielien_session="));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice("jielien_session=".length));
  } catch {
    return null;
  }
}
function sessionCookie(req, token, clear = false) {
  const secure =
    req.socket.encrypted ||
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production";
  return `jielien_session=${clear ? "" : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${secure ? "; Secure" : ""}`;
}
function stripToken(order) {
  if (!order) return order;
  const { token, ...safe } = order;
  return safe;
}
async function withTransferQr(order) {
  if (
    !order?.transfer?.qrPayload ||
    order.status === "cancelled" ||
    order.paymentStatus === "paid"
  )
    return order;
  const svg = await QRCode.toString(order.transfer.qrPayload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
  return {
    ...order,
    transfer: {
      ...order.transfer,
      qrDataUrl:
        "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
    },
  };
}
function sameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site")
    fail(403, "origin_denied", "Yêu cầu phải gửi từ website này.");
  if (req.headers.origin) {
    let origin;
    try {
      origin = new URL(req.headers.origin);
    } catch {
      fail(403, "origin_denied", "Nguồn yêu cầu không hợp lệ.");
    }
    if (
      origin.host !== req.headers.host ||
      !["http:", "https:"].includes(origin.protocol)
    )
      fail(403, "origin_denied", "Nguồn yêu cầu không hợp lệ.");
  }
}
function requireUser(session) {
  if (!session?.user)
    fail(401, "authentication_required", "Vui lòng đăng nhập để tiếp tục.");
  return session.user;
}
function requirePermission(session, permission) {
  const user = requireUser(session);
  if (!user.permissions.includes(permission))
    fail(
      403,
      "permission_denied",
      "Tài khoản không có quyền thực hiện thao tác này.",
    );
  return user;
}
function requireCsrf(req, session) {
  requireUser(session);
  sameOrigin(req);
  if (!sameSecret(req.headers["x-csrf-token"], session.csrfToken))
    fail(
      403,
      "csrf_invalid",
      "Phiên xác thực thay đổi. Vui lòng tải lại trang và thử lại.",
    );
}

export async function createApp({
  pool: externalPool,
  catalogPath = resolve(publicRoot, "catalog.json"),
  legacyPath = externalPool ? null : resolve(projectRoot, "data/store.sqlite"),
  bankConfig,
} = {}) {
  const pool = externalPool || createPool();
  let store;
  try {
    store = await createStore({ pool, catalogPath, legacyPath, bankConfig });
  } catch (error) {
    if (!externalPool) await pool.end();
    throw error;
  }
  const auth = createAuth(pool),
    carts = createCartService(pool),
    rates = new Map();
  function rateLimit(req, kind, max) {
    const now = Date.now(),
      key = kind + ":" + req.socket.remoteAddress;
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
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
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
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      if (path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
        const rawToken = cookieToken(req),
          session = rawToken ? await auth.authenticate(rawToken) : null;
        if (req.method === "GET" && path === "/api/health") {
          await pool.query("SELECT 1");
          return json(res, 200, { status: "ok", database: "postgresql" });
        }
        if (req.method === "GET" && path === "/api/products")
          return json(res, 200, { products: await store.listProducts() });
        if (req.method === "GET" && path === "/api/payment-methods")
          return json(res, 200, { methods: store.paymentMethods() });
        if (req.method === "GET" && path === "/api/categories") {
          const { rows } = await pool.query(
            'SELECT id,parent_id AS "parentId",name,slug,sort_order AS "sortOrder" FROM categories WHERE status=\'active\' ORDER BY sort_order,id',
          );
          return json(res, 200, { categories: rows });
        }
        if (req.method === "GET" && path === "/api/brands") {
          const { rows } = await pool.query(
            'SELECT id,name,logo_url AS "logoUrl",description FROM brands ORDER BY name',
          );
          return json(res, 200, { brands: rows });
        }
        if (req.method === "GET" && path === "/api/auth/me") {
          const user = requireUser(session);
          return json(res, 200, { user, csrfToken: session.csrfToken });
        }
        if (
          req.method === "POST" &&
          (path === "/api/auth/register" || path === "/api/auth/login")
        ) {
          sameOrigin(req);
          rateLimit(
            req,
            path.endsWith("register") ? "register" : "login",
            path.endsWith("register") ? 5 : 15,
          );
          const body = await readBody(req);
          const result = path.endsWith("register")
            ? await auth.register(body)
            : await auth.login(body);
          res.setHeader("Set-Cookie", sessionCookie(req, result.token));
          return json(res, path.endsWith("register") ? 201 : 200, {
            user: result.user,
            csrfToken: result.csrfToken,
            expiresAt: result.expiresAt,
          });
        }
        if (req.method === "POST" && path === "/api/auth/logout") {
          requireCsrf(req, session);
          await auth.logout(rawToken);
          res.setHeader("Set-Cookie", sessionCookie(req, "", true));
          res.writeHead(204);
          return res.end();
        }
        if (req.method === "PATCH" && path === "/api/account/profile") {
          const user = requireUser(session);
          requireCsrf(req, session);
          rateLimit(req, "profile-update", 10);
          return json(res, 200, {
            user: await auth.updateProfile(user.id, await readBody(req)),
          });
        }
        if (req.method === "POST" && path === "/api/account/password") {
          const user = requireUser(session);
          requireCsrf(req, session);
          rateLimit(req, "password-change", 5);
          await auth.changePassword(user.id, await readBody(req));
          res.setHeader("Set-Cookie", sessionCookie(req, "", true));
          res.writeHead(204);
          return res.end();
        }
        const addressMatch = path.match(/^\/api\/account\/addresses\/(\d+)$/);
        if (req.method === "DELETE" && addressMatch) {
          const user = requireUser(session);
          requireCsrf(req, session);
          await auth.deleteAddress(user.id, Number(addressMatch[1]));
          res.writeHead(204);
          return res.end();
        }
        if (path === "/api/account/addresses") {
          const user = requireUser(session);
          if (req.method === "GET")
            return json(res, 200, {
              addresses: await auth.listAddresses(user.id),
            });
          if (req.method === "POST") {
            requireCsrf(req, session);
            return json(res, 201, {
              address: await auth.saveAddress(user.id, await readBody(req)),
            });
          }
        }
        if (req.method === "GET" && path === "/api/account/orders") {
          const user = requireUser(session);
          return json(res, 200, {
            orders: (
              await store.listOrders({ userId: user.id, limit: 100 })
            ).map(stripToken),
          });
        }
        if (path === "/api/cart") {
          const user = requireUser(session);
          if (req.method === "GET")
            return json(res, 200, { items: await carts.getCart(user.id) });
          if (req.method === "PUT") {
            requireCsrf(req, session);
            const body = await readBody(req);
            if (!Array.isArray(body.items))
              fail(400, "invalid_items", "Giỏ hàng không hợp lệ.");
            const items = body.items.length ? parseItems(body) : [];
            return json(res, 200, {
              items: await carts.saveCart(user.id, items),
            });
          }
        }
        if (req.method === "POST" && path === "/api/quote") {
          const body = await readBody(req);
          return json(
            res,
            200,
            await store.quote({ items: parseItems(body), coupon: body.coupon }),
          );
        }
        if (req.method === "POST" && path === "/api/orders") {
          rateLimit(req, "orders", 30);
          sameOrigin(req);
          if (session) requireCsrf(req, session);
          const body = await readBody(req),
            items = parseItems(body),
            customer = customerData(body.customer);
          if (!["cod", "bank_transfer"].includes(body.payment))
            fail(
              400,
              "invalid_payment",
              "Phương thức thanh toán không hợp lệ.",
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
          const order = await store.createOrder({
            items,
            coupon: body.coupon,
            customer,
            payment: body.payment,
            note,
            idempotencyKey,
            userId: session?.user.id || null,
          });
          return json(res, 201, { order: await withTransferQr(order) });
        }
        if (req.method === "POST" && path === "/api/orders/lookup") {
          rateLimit(req, "lookup", 10);
          const body = await readBody(req),
            id = cleanText(body.id, "Mã đơn hàng", 1, 80),
            phone = normalizePhone(body.phone);
          const order = await store.getOrderByNumber(id);
          if (!order || !sameSecret(phone, order.customer.phone))
            fail(
              404,
              "order_not_found",
              "Không tìm thấy đơn hàng với thông tin đã nhập.",
            );
          return json(res, 200, {
            order: await withTransferQr(stripToken(order)),
          });
        }
        const orderMatch = path.match(/^\/api\/orders\/([A-Za-z0-9-]{1,80})$/);
        if (req.method === "GET" && orderMatch) {
          rateLimit(req, "lookup", 10);
          const order = await store.getOrderByNumber(orderMatch[1]);
          const owner =
            order &&
            session &&
            Number(order.userId) === Number(session.user.id);
          const byToken =
            order && sameSecret(url.searchParams.get("token"), order.token);
          if (!owner && !byToken)
            fail(404, "order_not_found", "Không tìm thấy đơn hàng.");
          return json(res, 200, {
            order: await withTransferQr(byToken ? order : stripToken(order)),
          });
        }
        if (path.startsWith("/api/admin/")) {
          const user = requireUser(session);
          if (!["GET", "HEAD"].includes(req.method)) requireCsrf(req, session);
          if (req.method === "GET" && path === "/api/admin/dashboard") {
            if (
              !user.permissions.some((p) =>
                [
                  "catalog.manage",
                  "orders.manage",
                  "inventory.manage",
                  "audit.read",
                ].includes(p),
              )
            )
              fail(
                403,
                "permission_denied",
                "Bạn không có quyền truy cập quản trị.",
              );
            return json(res, 200, { stats: await store.dashboard() });
          }
          if (req.method === "GET" && path === "/api/admin/products") {
            requirePermission(session, "catalog.manage");
            return json(res, 200, {
              products: await store.listProducts({ includeInactive: true }),
            });
          }
          if (req.method === "GET" && path === "/api/admin/orders") {
            requirePermission(session, "orders.manage");
            return json(res, 200, {
              orders: (await store.listOrders({ limit: 200 })).map(stripToken),
            });
          }
          if (req.method === "GET" && path === "/api/admin/inventory") {
            requirePermission(session, "inventory.manage");
            return json(res, 200, { inventory: await store.inventoryList() });
          }
          if (req.method === "GET" && path === "/api/admin/audit") {
            requirePermission(session, "audit.read");
            return json(res, 200, { logs: await store.auditList(100) });
          }
          const variantMatch = path.match(/^\/api\/admin\/variants\/(\d+)$/);
          if (req.method === "PATCH" && variantMatch) {
            requirePermission(session, "catalog.manage");
            const body = await readBody(req);
            const changes = {};
            for (const key of ["price", "originalPrice", "status"])
              if (Object.hasOwn(body, key)) changes[key] = body[key];
            return json(res, 200, {
              product: await store.updateVariant(
                Number(variantMatch[1]),
                changes,
                user.id,
              ),
            });
          }
          const statusMatch = path.match(
            /^\/api\/admin\/orders\/([A-Za-z0-9-]{1,80})\/status$/,
          );
          if (req.method === "PATCH" && statusMatch) {
            requirePermission(session, "orders.manage");
            const body = await readBody(req);
            return json(res, 200, {
              order: stripToken(
                await store.updateOrderStatus(
                  statusMatch[1],
                  body.status,
                  user.id,
                  body.reason,
                ),
              ),
            });
          }
          const paidMatch = path.match(
            /^\/api\/admin\/orders\/([A-Za-z0-9-]{1,80})\/payment$/,
          );
          const bankPaidMatch = path.match(
            /^\/api\/admin\/orders\/([A-Za-z0-9-]{1,80})\/bank-transfer$/,
          );
          if (req.method === "POST" && bankPaidMatch) {
            requirePermission(session, "orders.manage");
            await readBody(req);
            return json(res, 200, {
              order: stripToken(
                await store.recordBankTransfer(bankPaidMatch[1], user.id),
              ),
            });
          }
          if (req.method === "POST" && paidMatch) {
            requirePermission(session, "orders.manage");
            await readBody(req);
            return json(res, 200, {
              order: stripToken(
                await store.recordPayment(paidMatch[1], user.id),
              ),
            });
          }
          if (req.method === "POST" && path === "/api/admin/inventory/adjust") {
            requirePermission(session, "inventory.manage");
            const body = await readBody(req);
            await store.adjustInventory({
              variantId: body.variantId,
              warehouseId: body.warehouseId,
              quantityChange: body.quantityChange,
              reason: body.reason,
              actorId: user.id,
            });
            return json(res, 200, { inventory: await store.inventoryList() });
          }
        }
        fail(404, "not_found", "API không tồn tại.");
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        fail(405, "method_not_allowed", "Phương thức không được hỗ trợ.");
      const special =
        decoded === "/tai-khoan"
          ? "/account.html"
          : decoded === "/quan-tri"
            ? "/admin.html"
            : null;
      const spa = decoded === "/" || routePattern.test(decoded);
      const file = resolve(
        publicRoot,
        "." + (special || (spa ? "/index.html" : decoded)),
      );
      if (
        !file.startsWith(publicRoot + sep) ||
        !mime[extname(file)] ||
        decoded.split("/").some((p) => p.startsWith("."))
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
      const exposed =
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status <= 599;
      if (!exposed)
        console.error("Request failed:", error.code || error.name || "unknown");
      json(res, exposed ? error.status : 500, {
        error: exposed ? error.error || "request_error" : "internal_error",
        message: exposed ? error.message : "Có lỗi xảy ra. Vui lòng thử lại.",
      });
    }
  });
  if (!externalPool)
    server.on("close", () => {
      pool.end().catch(() => {});
    });
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
    console.log(`Jielien PostgreSQL storefront listening on port ${port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      app.close(() => process.exit(0));
      app.closeIdleConnections();
    });
}
