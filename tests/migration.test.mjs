import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createTestDatabase } from "./support/database.mjs";
import { migrate } from "../db/migrate.mjs";
import { createStore } from "../db/store.mjs";

const product = {
  id: 1,
  slug: "legacy-milk",
  name: "Sữa mẫu hiện tại",
  brand: "Test Brand",
  category: "Sữa cho bé",
  type: "milk",
  image: "/assets/milk-green.svg",
  price: 250000,
  oldPrice: 300000,
  stock: 3,
  age: "1–3 tuổi",
  weight: "800g",
  description: "Dữ liệu thử",
  features: ["Feature"],
};
const customer = {
  name: "Khách thử migration",
  phone: "0912345678",
  address: "123 Đường Thử",
  province: "TP Hồ Chí Minh",
  district: "Quận 1",
  email: "migration@example.com",
};
const request = {
  items: [{ id: 1, quantity: 1 }],
  customer,
  coupon: "",
  payment: "cod",
  note: "Giữ nguyên lịch sử",
};
const fingerprint = createHash("sha256")
  .update(JSON.stringify(request))
  .digest("hex");
const legacyOrder = {
  id: "JL-LEGACY-001",
  token: "legacy-access-token-for-tests-only",
  status: "pending",
  createdAt: "2026-10-20T01:00:00.000Z",
  customer,
  items: [
    {
      id: 1,
      name: "Sữa tên lúc mua",
      image: "/assets/milk-gold.svg",
      price: 200000,
      quantity: 1,
      lineTotal: 200000,
    },
  ],
  subtotal: 200000,
  discount: 0,
  shipping: 25000,
  total: 225000,
  coupon: "",
  payment: "cod",
  note: request.note,
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "jielien-migration-"));
  const database = await createTestDatabase();
  const catalogPath = join(dir, "catalog.json");
  await writeFile(catalogPath, JSON.stringify([product]));
  t.after(async () => {
    await database.cleanup();
    await rm(dir, { recursive: true, force: true });
  });
  return { ...database, dir, catalogPath };
}

test("versioned PostgreSQL migrations are repeatable and enforce actual foreign keys", async (t) => {
  const { pool } = await fixture(t);
  await migrate(pool);
  await migrate(pool);
  const migrations = await pool.query(
    "SELECT count(*)::integer AS count FROM schema_migrations",
  );
  assert.equal(migrations.rows[0].count, 1);
  const foreignKeys = await pool.query(
    "SELECT count(*)::integer AS count FROM information_schema.table_constraints WHERE constraint_schema=current_schema() AND constraint_type='FOREIGN KEY'",
  );
  assert.ok(
    foreignKeys.rows[0].count >= 30,
    "normalized schema must enforce relationships",
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand,reserved) VALUES(1,999999,1,0)",
    ),
    { code: "23503" },
  );
});

test("catalog is a one-time seed: changed JSON does not overwrite prices or warehouse balances", async (t) => {
  const { pool, catalogPath } = await fixture(t);
  let store = await createStore({ pool, catalogPath, legacyPath: null });
  await pool.query("UPDATE product_variants SET price=275000 WHERE id=1");
  await pool.query(
    "UPDATE inventory_balances SET on_hand=2 WHERE variant_id=1 AND warehouse_id=1",
  );
  await writeFile(
    catalogPath,
    JSON.stringify([{ ...product, price: 1, stock: 99 }]),
  );
  store = await createStore({ pool, catalogPath, legacyPath: null });
  const current = (await store.listProducts()).find((p) => p.id === 1);
  assert.equal(current.price, 275000);
  assert.equal(current.stock, 2);
  assert.equal(current.slug, product.slug);
  const relation = await pool.query(
    "SELECT pv.product_id,b.name AS brand,c.name AS category FROM product_variants pv JOIN products p ON p.id=pv.product_id JOIN brands b ON b.id=p.brand_id JOIN product_categories pc ON pc.product_id=p.id JOIN categories c ON c.id=pc.category_id WHERE pv.id=1",
  );
  assert.equal(relation.rows.length, 1);
  assert.equal(relation.rows[0].brand, "Test Brand");
  assert.equal(relation.rows[0].category, "Sữa cho bé");
  await assert.rejects(
    pool.query(
      "UPDATE inventory_balances SET reserved=3 WHERE variant_id=1 AND warehouse_id=1",
    ),
    { code: "23514" },
  );
});

test("legacy SQLite import preserves order snapshots, access, idempotency and available stock without re-decrementing", async (t) => {
  const { pool, catalogPath, dir } = await fixture(t);
  const legacyPath = join(dir, "store.sqlite");
  const sqlite = new DatabaseSync(legacyPath);
  sqlite.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE inventory(product_id INTEGER PRIMARY KEY,stock INTEGER NOT NULL); CREATE TABLE orders(id TEXT PRIMARY KEY,token TEXT NOT NULL,phone TEXT NOT NULL,idempotency_key TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL);",
  );
  sqlite.prepare("INSERT INTO inventory VALUES(1,2)").run();
  sqlite
    .prepare("INSERT INTO orders VALUES(?,?,?,?,?,?)")
    .run(
      legacyOrder.id,
      legacyOrder.token,
      customer.phone,
      "legacy-request-001",
      fingerprint,
      JSON.stringify(legacyOrder),
    );
  sqlite.close();
  let store = await createStore({ pool, catalogPath, legacyPath });
  let found = await store.getOrderByNumber(legacyOrder.id);
  assert.equal(found.token, legacyOrder.token);
  assert.equal(found.items[0].name, "Sữa tên lúc mua");
  assert.equal(found.items[0].price, 200000);
  assert.equal(found.total, 225000);
  assert.equal(new Date(found.createdAt).toISOString(), legacyOrder.createdAt);
  assert.equal((await store.listProducts())[0].stock, 2);
  const balance = (
    await pool.query(
      "SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=1 AND warehouse_id=1",
    )
  ).rows[0];
  assert.deepEqual(balance, { on_hand: 3, reserved: 1 });
  const data = (
    await pool.query(
      "SELECT idempotency_key,fingerprint FROM orders WHERE order_number=$1",
      [legacyOrder.id],
    )
  ).rows[0];
  assert.equal(data.idempotency_key, "legacy-request-001");
  assert.equal(data.fingerprint, fingerprint);
  const retry = await store.createOrder({
    ...request,
    idempotencyKey: "legacy-request-001",
  });
  assert.equal(retry.id, legacyOrder.id);
  assert.equal(retry.total, 225000);
  assert.equal((await store.listProducts())[0].stock, 2);
  store = await createStore({ pool, catalogPath, legacyPath });
  assert.equal(
    (await pool.query("SELECT count(*)::integer AS count FROM orders")).rows[0]
      .count,
    1,
  );
  assert.equal((await store.listProducts())[0].stock, 2);
  await assert.rejects(pool.query("DELETE FROM product_variants WHERE id=1"), {
    code: "23503",
  });
  const original = new DatabaseSync(legacyPath, { readOnly: true });
  assert.equal(
    original.prepare("SELECT stock FROM inventory WHERE product_id=1").get()
      .stock,
    2,
  );
  assert.equal(
    original.prepare("SELECT count(*) AS count FROM orders").get().count,
    1,
  );
  original.close();
  const backupNames = await readdir(join(dir, "backups"));
  assert.ok(
    backupNames.some((name) => name.endsWith(".sqlite")),
    "import must create a consistent backup",
  );
});
