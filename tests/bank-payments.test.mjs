import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase } from "./support/database.mjs";
import { createStore } from "../db/store.mjs";
import {
  buildVietQr,
  crc16CCITT,
  normalizeBankConfig,
  readBankConfig,
} from "../lib/vietqr.mjs";

const bank = {
  enabled: true,
  bankBin: "970436",
  bankName: "Ngân hàng kiểm thử",
  accountNumber: "000000000000",
  accountName: "TAI KHOAN KIEM THU",
};
const customer = {
  name: "Người mua thử",
  phone: "0912345678",
  address: "123 Đường Kiểm Thử",
  province: "TP Hồ Chí Minh",
  district: "Quận 1",
};
const request = (key, extra = {}) => ({
  items: [{ id: 1, quantity: 2 }],
  customer,
  coupon: "MEBE50",
  payment: "bank_transfer",
  note: "Đơn kiểm thử",
  idempotencyKey: key,
  ...extra,
});
async function fixture(t, bankConfig = bank) {
  const database = await createTestDatabase(),
    dir = await mkdtemp(join(tmpdir(), "jielien-bank-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify([
      {
        id: 1,
        name: "Sữa kiểm thử",
        slug: "sua-kiem-thu",
        brand: "Test",
        category: "Sữa cho bé",
        type: "milk",
        image: "/assets/milk-green.svg",
        price: 250000,
        oldPrice: 300000,
        stock: 8,
        age: "1–3 tuổi",
        weight: "800g",
        description: "Test",
        features: [],
      },
    ]),
  );
  const store = await createStore({
    pool: database.pool,
    catalogPath,
    legacyPath: null,
    bankConfig,
  });
  t.after(async () => {
    await database.cleanup();
    await rm(dir, { recursive: true, force: true });
  });
  return { ...database, store, catalogPath };
}
function fields(payload) {
  const bytes = Buffer.from(payload, "utf8");
  const result = {};
  let offset = 0;
  while (offset < bytes.length) {
    const tag = bytes.subarray(offset, offset + 2).toString(),
      length = Number(bytes.subarray(offset + 2, offset + 4).toString());
    assert.ok(Number.isInteger(length) && length >= 0);
    assert.ok(offset + 4 + length <= bytes.length);
    assert.equal(result[tag], undefined, "duplicate tag");
    result[tag] = bytes.subarray(offset + 4, offset + 4 + length).toString();
    offset += 4 + length;
  }
  assert.equal(offset, bytes.length);
  return result;
}

test("local VietQR uses the NAPAS transfer TLV structure, integral amount and CRC-16 standard check vector", () => {
  assert.equal(crc16CCITT("123456789"), "29B1");
  const payload = buildVietQr({
    bankBin: bank.bankBin,
    accountNumber: bank.accountNumber,
    amount: 450000,
    reference: "JLTEST001",
  });
  const tags = fields(payload);
  assert.equal(tags["00"], "01");
  assert.equal(tags["01"], "12");
  assert.equal(tags["53"], "704");
  assert.equal(tags["54"], "450000");
  assert.equal(tags["58"], "VN");
  const merchant = fields(tags["38"]);
  assert.equal(merchant["00"], "A000000727");
  assert.equal(merchant["02"], "QRIBFTTA");
  assert.deepEqual(fields(merchant["01"]), {
    "00": bank.bankBin,
    "01": bank.accountNumber,
  });
  assert.equal(fields(tags["62"])["08"], "JLTEST001");
  assert.equal(tags["63"], crc16CCITT(payload.slice(0, -4)));
  for (const changes of [
    { amount: 0 },
    { amount: 1.5 },
    { amount: 10_000_000_000_000 },
    { bankBin: "bad" },
    { accountNumber: "12" },
    { reference: "nội dung có dấu" },
  ])
    assert.throws(() =>
      buildVietQr({
        bankBin: bank.bankBin,
        accountNumber: bank.accountNumber,
        amount: 450000,
        reference: "JLTEST001",
        ...changes,
      }),
    );
  assert.deepEqual(readBankConfig({}), {
    enabled: false,
    reason: "not_configured",
  });
  assert.equal(
    normalizeBankConfig({ ...bank, accountNumber: "invalid" }).enabled,
    false,
  );
});

test("bank transfers remain disabled without valid receiving configuration and create no order or reservation", async (t) => {
  const { store, pool } = await fixture(t, {});
  assert.equal(
    store.paymentMethods().find((m) => m.id === "bank_transfer").enabled,
    false,
  );
  await assert.rejects(store.createOrder(request("bank-disabled-001")), {
    status: 503,
    error: "payment_unavailable",
  });
  assert.equal(
    (await pool.query("SELECT count(*)::integer AS n FROM orders")).rows[0].n,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT sum(reserved)::integer AS n FROM inventory_balances",
      )
    ).rows[0].n,
    0,
  );
  const cod = await store.createOrder(
    request("cod-still-available", { payment: "cod" }),
  );
  assert.equal(cod.payment, "cod");
  assert.equal(cod.transfer, undefined);
});

test("bank order snapshots receiving details and server-computed totals; retry reuses the same order after configuration changes", async (t) => {
  const { store, pool, catalogPath } = await fixture(t);
  const order = await store.createOrder(
    request("bank-order-001", { total: 1, amount: 1 }),
  );
  assert.equal(order.payment, "bank_transfer");
  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.total, 450000);
  assert.equal(order.transfer.amount, 450000);
  assert.equal(order.transfer.reference, order.id);
  assert.equal(order.transfer.accountNumber, bank.accountNumber);
  assert.equal(fields(order.transfer.qrPayload)["54"], "450000");
  assert.equal((await store.listProducts())[0].stock, 6);
  const changed = await createStore({
    pool,
    catalogPath,
    bankConfig: { ...bank, accountNumber: "111111111111" },
  });
  const found = await changed.getOrderByNumber(order.id);
  assert.equal(found.transfer.accountNumber, bank.accountNumber);
  const disabled = await createStore({
    pool,
    catalogPath,
    bankConfig: { enabled: false },
  });
  const retry = await disabled.createOrder(request("bank-order-001"));
  assert.equal(retry.id, order.id);
  assert.equal(retry.transfer.accountNumber, bank.accountNumber);
  assert.equal((await store.listProducts())[0].stock, 6);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM bank_transfer_details",
      )
    ).rows[0].n,
    1,
  );
  const p = (await pool.query("SELECT method,status,amount FROM payments"))
    .rows[0];
  assert.deepEqual(p, {
    method: "bank_transfer",
    status: "pending",
    amount: 450000,
  });
});

test("authorized service confirmation records one bank receipt and audit event, never auto-pays on creation or buyer-supplied status", async (t) => {
  const { store, pool } = await fixture(t);
  const order = await store.createOrder(
    request("bank-confirm-001", { paymentStatus: "paid", paid: true }),
  );
  assert.equal(order.paymentStatus, "pending");
  const confirmations = await Promise.all([
    store.recordBankTransfer(order.id, null),
    store.recordBankTransfer(order.id, null),
  ]);
  for (const confirmed of confirmations)
    assert.equal(confirmed.paymentStatus, "paid");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM payment_events WHERE event_type='bank_transfer.confirmed'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM audit_logs WHERE action='payment.bank_transfer_confirmed'",
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(store.updateOrderStatus(order.id, "cancelled", null), {
    status: 409,
    error: "refund_required",
  });
  assert.equal((await store.getOrderByNumber(order.id)).status, "pending");
  assert.equal((await store.listProducts())[0].stock, 6);
  const cod = await store.createOrder(
    request("cod-wrong-bank-method", {
      payment: "cod",
      items: [{ id: 1, quantity: 1 }],
      coupon: "",
    }),
  );
  await assert.rejects(store.recordBankTransfer(cod.id, null), {
    status: 409,
    error: "invalid_payment_state",
  });
});

test("cancelling an unpaid transfer releases stock and blocks later bank confirmation", async (t) => {
  const { store, pool } = await fixture(t);
  const order = await store.createOrder(request("bank-cancel-001"));
  assert.equal((await store.listProducts())[0].stock, 6);
  await store.updateOrderStatus(order.id, "confirmed", null);
  await store.updateOrderStatus(order.id, "processing", null);
  await assert.rejects(store.updateOrderStatus(order.id, "shipped", null), {
    status: 409,
    error: "payment_required",
  });
  const cancelled = await store.updateOrderStatus(order.id, "cancelled", null);
  assert.equal(cancelled.paymentStatus, "cancelled");
  assert.equal((await store.listProducts())[0].stock, 8);
  await assert.rejects(store.recordBankTransfer(order.id, null), {
    status: 409,
    error: "invalid_payment_state",
  });
  const count = (
    await pool.query("SELECT count(*)::integer AS n FROM payment_events")
  ).rows[0].n;
  assert.equal(count, 0);
});
