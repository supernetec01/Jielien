import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { databaseUrl } from "../lib/database.mjs";
import { createStore } from "../db/store.mjs";
import { createOrderExpiry } from "../lib/order-expiry.mjs";
import { createStaffNotifications } from "../lib/staff-notifications.mjs";
import { bankTransferPolicy } from "../lib/bank-transfer-policy.mjs";
import { bankSettingsFixture, exampleBank, key } from "./support/bank-settings.mjs";

async function fixture(t, { enabled = true, notify = false, request } = {}) {
  const values = { ORDER_EXPIRY_ENABLED: String(enabled), BANK_TRANSFER_TTL_HOURS: "24", STAFF_NOTIFY_ENABLED: String(notify), PUBLIC_BASE_URL: "https://shop.example.test", TELEGRAM_BOT_TOKEN: key(), TELEGRAM_CHAT_ID: key() };
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  let f;
  t.after(async () => {
    await f?.close();
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });
  f = await bankSettingsFixture({ fallback: { ...exampleBank, enabled: true, bankBin: "970436" }, appOptions: { staffNotificationRequest: request || (async () => new Response('{"ok":false}', { status: 503 })) } });
  const store = await createStore({ pool: f.database.pool });
  async function place(payment = "bank_transfer") {
    const result = await f.request("/api/orders", { method: "POST", body: { ...f.order(), payment }, session: null });
    assert.equal(result.status, 201); return result.body.order;
  }
  async function age(order) {
    await f.database.pool.query("UPDATE orders SET created_at=created_at-interval '25 hours',bank_payment_due_at=CASE WHEN bank_payment_due_at IS NULL THEN NULL ELSE bank_payment_due_at-interval '25 hours' END WHERE order_number=$1", [order.id]);
  }
  return { ...f, store, place, age, expiry: createOrderExpiry(f.database.pool, store) };
}

test("expiry cancels only overdue pending bank orders through the existing cancellation flow and is repeatable", async t => {
  const f = await fixture(t);
  const expired = await f.place(), fresh = await f.place(), paid = await f.place(), cod = await f.place("cod");
  await f.store.recordBankTransfer(paid.id, f.admin.id, { receivedAmount: paid.total });
  await f.age(expired); await f.age(paid); await f.age(cod);
  const before = (await f.database.pool.query("SELECT sum(reserved) AS n FROM inventory_balances")).rows[0].n;
  const dry = await f.expiry.run({ dryRun: true });
  assert.deepEqual(dry.candidates.map(o => o.id), [expired.id]);
  const connection = new URL(databaseUrl());
  connection.searchParams.set("options", `-c search_path=${f.database.schema}`);
  const child = spawn(process.execPath, ["scripts/expire-orders.mjs", "--dry-run"], { cwd: new URL("..", import.meta.url), env: { ...process.env, DATABASE_URL: connection.href }, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", value => { output += value; });
  child.stderr.on("data", () => {});
  assert.equal((await once(child, "exit"))[0], 0);
  assert.deepEqual(JSON.parse(output).candidates.map(o => o.id), [expired.id]);
  for (const value of [expired.customer.name, expired.customer.phone, expired.customer.address, expired.token]) assert.ok(!output.includes(value));
  assert.equal((await f.store.getOrderByNumber(expired.id)).status, "pending");
  const result = await f.expiry.run(); assert.deepEqual(result.expired, [expired.id]); assert.deepEqual(result.failed, []);
  const after = await f.store.getOrderByNumber(expired.id);
  assert.equal(after.status, "cancelled"); assert.equal(after.paymentStatus, "cancelled");
  assert.equal(after.statusHistory.at(-1).note, "Hết hạn thanh toán");
  assert.equal((await f.database.pool.query("SELECT sum(reserved) AS n FROM inventory_balances")).rows[0].n, before - 1);
  assert.deepEqual((await f.expiry.run()).expired, []);
  assert.equal((await f.store.getOrderByNumber(fresh.id)).status, "pending");
  assert.equal((await f.store.getOrderByNumber(paid.id)).paymentStatus, "paid");
  assert.equal((await f.store.getOrderByNumber(cod.id)).status, "pending");
  const blocked = await f.request(`/api/admin/orders/${expired.id}/bank-transfer`, { method: "POST", body: { receivedAmount: expired.total } });
  assert.equal(blocked.status, 409); assert.match(blocked.body.message, /hoàn tiền|tạo lại đơn/);
  assert.equal((await f.database.pool.query("SELECT count(*)::int AS n FROM inventory_movements WHERE reference_id=$1 AND movement_type='release'", [expired.id])).rows[0].n, 1);
  const audit = (await f.database.pool.query("SELECT metadata FROM audit_logs WHERE entity_id=$1 AND action='order.status_changed'", [expired.id])).rows[0].metadata;
  assert.equal(audit.reason, "Hết hạn thanh toán");
});

test("expiry is off by default; advisory lock prevents overlapping runners and one order failure does not block another", async t => {
  assert.equal(bankTransferPolicy({}).enabled, false); assert.equal(bankTransferPolicy({}).hours, 24);
  const f = await fixture(t);
  const a = await f.place(), b = await f.place(); await f.age(a); await f.age(b);
  const off = createOrderExpiry(f.database.pool, f.store, { enabled: false, hours: 24 });
  assert.equal((await off.run()).disabled, true); assert.equal((await off.run({ dryRun: true })).candidates.length, 2);
  const lock = await f.database.pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(hashtextextended(current_schema()||':order-expiry',0))");
    assert.equal((await f.expiry.run()).busy, true);
  } finally { await lock.query("SELECT pg_advisory_unlock(hashtextextended(current_schema()||':order-expiry',0))"); lock.release(); }
  const original = f.store.updateOrderStatus.bind(f.store);
  const failing = createOrderExpiry(f.database.pool, { updateOrderStatus(id, ...args) { if (id === a.id) throw Error("temporary"); return original(id, ...args); } });
  const run = await failing.run(); assert.deepEqual(run.failed, [a.id]); assert.deepEqual(run.expired, [b.id]);
  assert.equal((await f.store.getOrderByNumber(a.id)).status, "pending");
  assert.equal((await f.expiry.run()).expired[0], a.id);
});

test("manual receipt requires amount and permissions, warns on mismatch and records actual amount/reference exactly once", async t => {
  const f = await fixture(t), order = await f.place(), path = `/api/admin/orders/${order.id}/bank-transfer`;
  assert.equal((await f.request(path, { method: "POST", body: {}, session: f.adminSession })).status, 400);
  assert.equal((await f.request(path, { method: "POST", body: { receivedAmount: order.total }, session: f.customer })).status, 403);
  assert.equal((await f.request(path, { method: "POST", body: { receivedAmount: order.total }, session: f.readerSession })).status, 403);
  assert.equal((await f.request(path, { method: "POST", body: { receivedAmount: order.total }, csrf: false })).status, 403);
  const receipt = { receivedAmount: order.total - 1000, bankTransactionRef: key() };
  assert.equal((await f.request(path, { method: "POST", body: receipt })).status, 409);
  assert.equal((await f.store.getOrderByNumber(order.id)).paymentStatus, "pending");
  const results = await Promise.all([1, 2].map(() => f.request(path, { method: "POST", body: { ...receipt, mismatchConfirmed: true } })));
  results.forEach(result => assert.equal(result.status, 200));
  const events = (await f.database.pool.query("SELECT payload FROM payment_events WHERE event_type='bank_transfer.confirmed'")).rows;
  assert.equal(events.length, 1); assert.equal(events[0].payload.receivedAmount, receipt.receivedAmount);
  assert.equal(events[0].payload.expectedAmount, order.total); assert.equal(events[0].payload.bankTransactionRef, receipt.bankTransactionRef);
  const stored = await f.store.getOrderByNumber(order.id);
  assert.equal(stored.paymentStatus, "paid"); assert.equal(stored.payments[0].amount, receipt.receivedAmount);
  assert.equal(stored.total, order.total); assert.equal(stored.transfer.amount, order.total);
  const audit = (await f.database.pool.query("SELECT metadata FROM audit_logs WHERE action='payment.bank_transfer_confirmed'")).rows[0].metadata;
  assert.equal(audit.mismatchConfirmed, true); assert.equal(audit.receivedAmount, receipt.receivedAmount);
  // Overpayment also needs acknowledgement.
  const extra = await f.place();
  assert.equal((await f.request(`/api/admin/orders/${extra.id}/bank-transfer`, { method: "POST", body: { receivedAmount: extra.total + 1 } })).status, 409);
});

test("expired-but-not-yet-cancelled orders cannot be confirmed and paid orders stay idempotent after their deadline", async t => {
  const f = await fixture(t), expired = await f.place(), paid = await f.place();
  await f.store.recordBankTransfer(paid.id, f.admin.id, { receivedAmount: paid.total });
  await f.age(expired); await f.age(paid);
  await assert.rejects(f.store.recordBankTransfer(expired.id, f.admin.id, { receivedAmount: expired.total }), { status: 409 });
  assert.equal((await f.store.recordBankTransfer(paid.id, f.admin.id, { receivedAmount: paid.total })).paymentStatus, "paid");
  const legacy = await f.place();
  await f.database.pool.query("UPDATE orders SET bank_payment_due_at=NULL,created_at=now()-interval '25 hours' WHERE order_number=$1", [legacy.id]);
  assert.ok((await f.expiry.run({ dryRun: true })).candidates.some(o => o.id === legacy.id));
});

test("customer notice requires order access, is throttled in the database and never confirms payment", async t => {
  const f = await fixture(t), order = await f.place(), path = `/api/orders/${order.id}/transfer-notice`;
  assert.equal((await f.request(path, { method: "POST", body: {}, session: null })).status, 404);
  const result = await f.request(path, { method: "POST", body: { token: order.token }, session: null });
  assert.equal(result.status, 200); assert.ok(result.body.nextAllowedAt);
  assert.equal((await f.request(path, { method: "POST", body: { token: order.token }, session: null })).status, 429);
  const stored = await f.store.getOrderByNumber(order.id); assert.equal(stored.paymentStatus, "pending"); assert.ok(stored.transferReportedAt);
  assert.equal((await f.database.pool.query("SELECT count(*)::int AS n FROM payment_events")).rows[0].n, 0);
  await f.store.updateOrderStatus(order.id, "cancelled", f.admin.id, "Kiểm thử hủy");
  assert.equal((await f.request(path, { method: "POST", body: { token: order.token }, session: null })).status, 409);
});

test("Telegram outbox messages contain only order/amount/admin link; delivery failures cannot fail checkout; disabled worker sends nothing", async t => {
  const requests = [];
  let failDelivery = false;
  const f = await fixture(t, { notify: true, request: async (url, options) => { if (failDelivery) throw Error("transport_down"); requests.push(JSON.parse(options.body)); return new Response('{"ok":true}'); } });
  const payload = f.order();
  const result = await f.request("/api/orders", { method: "POST", body: payload, session: null });
  assert.equal(result.status, 201); const order = result.body.order;
  await f.app.flushStaffNotifications();
  await f.request("/api/orders", { method: "POST", body: payload, session: null });
  await f.app.flushStaffNotifications();
  assert.equal(requests.length, 1);
  await f.request(`/api/orders/${order.id}/transfer-notice`, { method: "POST", body: { token: order.token }, session: null });
  await f.app.flushStaffNotifications(); assert.equal(requests.length, 2);
  for (const message of requests) {
    assert.ok(message.text.includes(order.id)); assert.ok(message.text.includes(`/quan-tri?order=${order.id}`));
    for (const value of [order.customer.name, order.customer.phone, order.customer.address, order.token]) assert.ok(!message.text.includes(value));
  }
  assert.equal((await f.store.getOrderByNumber(order.id)).paymentStatus, "pending");
  failDelivery = true;
  const stillCreated = await f.place(); await f.app.flushStaffNotifications();
  assert.equal((await f.store.getOrderByNumber(stillCreated.id)).paymentStatus, "pending");
  const off = createStaffNotifications(f.database.pool, { env: { STAFF_NOTIFY_ENABLED: "false" }, request: async () => { throw Error("must_not_send"); } });
  await off.kick();
  // A new worker with a failing transport persists retry metadata without changing the order.
  await f.database.pool.query("INSERT INTO staff_notifications(event_key,kind,order_id,amount) VALUES($1,'bank_order',$2,$3)", [key(), order.internalId, order.total]);
  const failed = createStaffNotifications(f.database.pool, { env: { ...process.env }, request: async () => { throw Error("transport_down"); } });
  await failed.kick();
  assert.equal((await f.store.getOrderByNumber(order.id)).paymentStatus, "pending");
  assert.ok((await f.database.pool.query("SELECT 1 FROM staff_notifications WHERE status='pending' AND attempts=1")).rowCount);
  const list = await f.request("/api/admin/orders?reconciliation=pending");
  assert.ok(list.body.orders.every(o => o.payment === "bank_transfer" && o.paymentStatus === "pending"));
});
