import { randomBytes, randomInt } from "node:crypto";
import { once } from "node:events";
import { createApp } from "./app.mjs";
import { createTestDatabase, closeServer } from "./database.mjs";
import { createAuth } from "../../lib/auth.mjs";

export const exampleBank = { enabled: false, bankName: "Ngân hàng demo", bankBin: "", accountNumber: "0000000000", accountName: "CONG TY DEMO" };
export const key = () => randomBytes(16).toString("hex");
const phone = () => "09" + String(randomInt(10000000, 99999999));
export async function bankSettingsFixture({ fallback = exampleBank, appOptions = {} } = {}) {
  const database = await createTestDatabase();
  const app = await createApp({ pool: database.pool, legacyPath: null, bankConfig: fallback, ...appOptions });
  app.listen(0, "127.0.0.1"); await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const auth = createAuth(database.pool), password = key() + "Aa!";
  const admin = await auth.ensureAdmin({ name: "Quản trị demo", username: "admin", email: "admin@example.test", phone: phone(), password });
  const adminSession = await auth.login({ identifier: "admin", password });
  const customer = await auth.register({ fullName: "Khách demo", phone: phone(), password });
  const reader = await auth.createStaff(admin.id, { fullName: "Người xem demo", username: "reader", phone: phone(), password, roles: ["boss"] });
  const readerSession = await auth.login({ identifier: "reader", password });
  async function request(path, { method = "GET", body, session = adminSession, csrf = true } = {}) {
    const response = await fetch(base + path, {
      method, headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Cookie: `jielien_session=${session.token}`, ...(csrf ? { "X-CSRF-Token": session.csrfToken } : {}) } : {}),
      }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  const customerData = { name: "Người mua demo", phone: phone(), province: "Tỉnh thử", district: "Khu vực thử", address: "Địa chỉ kiểm thử riêng" };
  const order = () => ({ items: [{ id: 1, quantity: 1 }], customer: customerData, payment: "bank_transfer", idempotencyKey: key() });
  return { database, base, app, admin, adminSession, customer, reader, readerSession, request, order,
    async close() { await closeServer(app); await database.cleanup(); } };
}
