import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../db/store.mjs";
import { bankSettingsFixture, exampleBank, key } from "./support/bank-settings.mjs";

const endpoint = "/api/admin/settings/bank-transfer";
test("bank settings are permission/CSRF protected, support incomplete drafts and never enter public site settings or audit values", async t => {
  const f = await bankSettingsFixture(); t.after(() => f.close());
  assert.equal((await f.request(endpoint, { session: null })).status, 401);
  assert.equal((await f.request(endpoint, { session: f.customer })).status, 403);
  assert.equal((await f.request(endpoint, { session: f.readerSession })).status, 200);
  const body = { ...exampleBank, version: 0 };
  assert.equal((await f.request(endpoint, { method: "PATCH", body, session: f.readerSession })).status, 403);
  assert.equal((await f.request(endpoint, { method: "PATCH", body, csrf: false })).status, 403);
  const before = (await f.request(endpoint)).body;
  assert.equal(before.saved, false); assert.equal(before.version, 0);
  assert.equal(before.settings.accountName, exampleBank.accountName);
  const saved = await f.request(endpoint, { method: "PATCH", body });
  assert.equal(saved.status, 200); assert.equal(saved.body.available, false);
  assert.equal(saved.body.version, 1); assert.equal(saved.body.settings.bankBin, "");
  assert.equal((await f.request(endpoint, { method: "PATCH", body: { ...body, version: 1, enabled: true } })).status, 400);
  for (const patch of [{ bankBin: "demo" }, { accountNumber: "invalid" }, { token: key() }])
    assert.equal((await f.request(endpoint, { method: "PATCH", body: { ...body, ...patch, version: 1 } })).status, 400);
  assert.equal((await f.request(endpoint)).body.version, 1);
  const site = (await f.request("/api/site", { session: null })).body;
  assert.ok(!JSON.stringify(site).includes(exampleBank.accountNumber));
  assert.ok(!JSON.stringify(site).includes("bank_transfer_receiving"));
  const audit = (await f.database.pool.query("SELECT metadata FROM audit_logs WHERE action='settings.bank_transfer_saved'")).rows;
  assert.equal(audit.length, 1); assert.deepEqual(audit[0].metadata, { enabled: false });
  const reload = await createStore({ pool: f.database.pool, bankConfig: { enabled: true, bankBin: "970436", bankName: "Khác", accountName: "KHAC", accountNumber: "1111111111" } });
  assert.equal((await reload.bankSettings.get()).settings.accountName, exampleBank.accountName);
  assert.equal((await reload.paymentMethods()).find(m => m.id === "bank_transfer").enabled, false);
});

test("saved bank changes apply immediately to new orders; old QR/snapshots/retries stay unchanged; disable blocks new transfers", async t => {
  const f = await bankSettingsFixture(); t.after(() => f.close());
  const ready = { ...exampleBank, enabled: true, bankBin: "970436", version: 0 };
  assert.equal((await f.request(endpoint, { method: "PATCH", body: ready })).status, 200);
  assert.equal((await f.request("/api/payment-methods", { session: null })).body.methods.find(m => m.id === "bank_transfer").enabled, true);
  const payload = f.order();
  const original = await f.request("/api/orders", { method: "POST", body: payload, session: null });
  assert.equal(original.status, 201);
  const transfer = original.body.order.transfer;
  assert.equal(transfer.accountNumber, exampleBank.accountNumber);
  const changed = { ...ready, accountNumber: "1111111111", accountName: "CONG TY DEMO MOI", version: 1 };
  assert.equal((await f.request(endpoint, { method: "PATCH", body: changed })).status, 200);
  const next = await f.request("/api/orders", { method: "POST", body: f.order(), session: null });
  assert.equal(next.status, 201); assert.equal(next.body.order.transfer.accountNumber, changed.accountNumber);
  const retry = await f.request("/api/orders", { method: "POST", body: payload, session: null });
  assert.equal(retry.body.order.id, original.body.order.id);
  assert.deepEqual(retry.body.order.transfer, transfer);
  assert.equal((await f.request(endpoint, { method: "PATCH", body: { ...changed, version: 1 } })).status, 409);
  assert.equal((await f.request(endpoint, { method: "PATCH", body: { ...changed, enabled: false, version: 2 } })).status, 200);
  assert.equal((await f.request("/api/orders", { method: "POST", body: f.order(), session: null })).status, 503);
  const methods = (await f.request("/api/payment-methods", { session: null })).body.methods;
  assert.equal(methods.find(m => m.id === "bank_transfer").enabled, false);
  assert.equal(methods.find(m => m.id === "cod").enabled, true);
  const old = await f.request(`/api/orders/${original.body.order.id}?token=${encodeURIComponent(original.body.order.token)}`, { session: null });
  assert.deepEqual(old.body.order.transfer, transfer);
});

test("concurrent first saves cannot overwrite a newer receiving account", async t => {
  const f = await bankSettingsFixture(); t.after(() => f.close());
  const results = await Promise.all(["CONG TY A", "CONG TY B"].map(accountName => f.request(endpoint, { method: "PATCH", body: { ...exampleBank, accountName, version: 0 } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await f.request(endpoint)).body.version, 1);
});
