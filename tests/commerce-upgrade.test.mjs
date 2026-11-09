import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createTestDatabase } from "./support/database.mjs";
import { seedCatalog } from "../db/seed.mjs";
import { migrate } from "../db/migrate.mjs";
const history = {
  "001_core.sql":
    "0c20848b8df5d910fbb3553669106e01bfb2575dfe4d7f2664baf18e35c58851",
  "002_bank_transfers.sql":
    "58c9bbd934721b82e6978cc2b159954b93a4c524c12b13f5100b41178aa49e1b",
  "003_staff_rbac.sql":
    "bdf6465c16ad26a7e0f251a201a002918038b739cda978cec6fac9e3df54032a",
  "004_variant_version.sql":
    "a3638e4d35aa80bc111a4c224b80c640b9f52421d31e0a6f3d8fea2f633fc989",
};
test("published migrations remain immutable and populated LAN schema upgrades without altering legacy commerce data", async () => {
  const db = await createTestDatabase();
  try {
    await db.pool.query(
      "CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    for (const [name, expected] of Object.entries(history)) {
      const source = await readFile(
        new URL("../db/migrations/" + name, import.meta.url),
        "utf8",
      );
      assert.equal(
        createHash("sha256").update(source).digest("hex"),
        expected,
        name,
      );
      await db.pool.query(source);
      await db.pool.query(
        "INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",
        [name, expected],
      );
    }
    await seedCatalog(
      db.pool,
      new URL("../db/fixtures/catalog.json", import.meta.url),
    );
    await db.pool.query(
      "UPDATE product_variants SET price=123456,original_price=150000 WHERE id=1",
    );
    const user = (
      await db.pool.query(
        "INSERT INTO users(full_name,phone,email,password_hash) VALUES('Người dùng giả','0912345678','upgrade@example.test','fixture-hash') RETURNING id",
      )
    ).rows[0];
    const order = (
      await db.pool.query(
        "INSERT INTO orders(order_number,user_id,recipient_name,recipient_phone,address_detail,province,district,subtotal,shipping_fee,grand_total,access_token,idempotency_key,fingerprint) VALUES('JL-UPGRADE',$1,'Khách giả','0912345678','Địa chỉ kiểm thử','Tỉnh test','Quận test',123456,25000,148456,'fixture-access','fixture-idempotency','fixture-fingerprint') RETURNING id",
        [user.id],
      )
    ).rows[0];
    await db.pool.query(
      "INSERT INTO order_items(order_id,variant_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total) SELECT $1,id,sku,name,1,123456,123456 FROM product_variants WHERE id=1",
      [order.id],
    );
    const snapshot = async () => ({
      variants: (
        await db.pool.query(
          "SELECT id,product_id,name,slug,sku,price,row_version FROM product_variants ORDER BY id",
        )
      ).rows,
      orders: (await db.pool.query("SELECT * FROM orders ORDER BY id")).rows,
      items: (await db.pool.query("SELECT * FROM order_items ORDER BY id"))
        .rows,
      stock: (
        await db.pool.query(
          "SELECT * FROM inventory_balances ORDER BY warehouse_id,variant_id",
        )
      ).rows,
      users: (
        await db.pool.query(
          "SELECT id,full_name,phone,email,password_hash,status FROM users ORDER BY id",
        )
      ).rows,
    });
    const before = await snapshot();
    const applied = await migrate(db.pool);
    assert.ok(applied.applied.length >= 7);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await migrate(db.pool)).applied, []);
    await seedCatalog(
      db.pool,
      new URL("../db/fixtures/catalog.json", import.meta.url),
    );
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.cleanup();
  }
});
