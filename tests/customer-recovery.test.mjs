import test from "node:test";
import assert from "node:assert/strict";
import {
  createPasswordRecovery,
  recoveryDelivery,
} from "../lib/password-recovery.mjs";
import { createAuth } from "../lib/auth.mjs";
import { migrate } from "../db/migrate.mjs";
import { createTestDatabase } from "./support/database.mjs";
const password = "Recovery-Fixture!2026";
const token = (path) =>
  new URLSearchParams(
    new URL(path, "https://shop.example.test").hash.slice(1),
  ).get("token");

test("email delivery configuration rejects incomplete and untrusted origins without sending messages", () => {
  assert.equal(recoveryDelivery({}), null);
  for (const env of [
    { RESEND_API_KEY: "fixture" },
    {
      RESEND_API_KEY: "fixture",
      PASSWORD_RESET_FROM_EMAIL: "shop@example.test",
      PUBLIC_BASE_URL: "http://shop.example.test",
    },
    {
      RESEND_API_KEY: "fixture",
      PASSWORD_RESET_FROM_EMAIL: "shop@example.test",
      PUBLIC_BASE_URL: "https://user:password@shop.example.test",
    },
    {
      RESEND_API_KEY: "fixture",
      PASSWORD_RESET_FROM_EMAIL: "shop@example.test\nBCC: hidden@example.test",
      PUBLIC_BASE_URL: "https://shop.example.test",
    },
  ])
    assert.throws(() => recoveryDelivery(env));
  const configured = recoveryDelivery({
    RESEND_API_KEY: "fixture",
    PASSWORD_RESET_FROM_EMAIL: "Jielien <shop@example.test>",
    PUBLIC_BASE_URL: "https://shop.example.test",
  });
  assert.equal(configured.origin, "https://shop.example.test");
  assert.equal(typeof configured.send, "function");
});

test("recovery outbox retries failures, uses shared leases and clears payload after successful delivery", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.cleanup());
  await migrate(db.pool);
  const auth = createAuth(db.pool);
  await auth.register({
    fullName: "Khách test",
    phone: "0912345678",
    email: "buyer@example.test",
    password,
  });
  let now = Date.now(),
    calls = 0;
  const messages = [];
  const delivery = {
    origin: "https://shop.example.test",
    send: async (m) => {
      calls++;
      if (calls === 1) throw Error("sandbox provider failure");
      messages.push(m);
    },
  };
  const a = await createPasswordRecovery(db.pool, auth, {
      clock: () => now,
      delivery,
    }),
    b = await createPasswordRecovery(db.pool, auth, {
      clock: () => now,
      delivery,
    });
  await a.forgot({ identifier: "buyer@example.test" });
  await a.flush();
  let row = (await db.pool.query("SELECT * FROM customer_recovery_outbox"))
    .rows[0];
  assert.equal(row.state, "pending");
  assert.equal(row.attempts, 1);
  now += 2000;
  await Promise.all([a.flush(), b.flush()]);
  row = (await db.pool.query("SELECT * FROM customer_recovery_outbox")).rows[0];
  assert.equal(row.state, "sent");
  assert.equal(row.payload, "");
  assert.equal(calls, 2);
  assert.equal(messages.length, 1);
  assert.ok(token(messages[0].url));
  await a.flush();
  assert.equal(calls, 2);
});

test("phone-only and legacy demo support is explicit and never grants privileged reset", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.cleanup());
  await migrate(db.pool);
  const auth = createAuth(db.pool);
  await auth.ensureAdmin({
    email: "admin@example.test",
    phone: "0987654321",
    password,
  });
  const admin = await auth.login({
    identifier: "admin@example.test",
    password,
  });
  const buyer = await auth.register({
    fullName: "Khách demo cũ",
    phone: "0912345678",
    password,
  });
  await db.pool.query("UPDATE users SET is_demo=true WHERE id=$1", [
    buyer.user.id,
  ]);
  assert.equal(await auth.authenticate(buyer.token), null);
  const recovery = await createPasswordRecovery(db.pool, auth);
  const publicResult = await recovery.forgot({ identifier: "0912345678" });
  assert.ok(publicResult.message);
  assert.equal(
    (await db.pool.query("SELECT count(*) AS n FROM customer_password_resets"))
      .rows[0].n,
    0,
  );
  await assert.rejects(
    recovery.support(admin.user.id, buyer.user.id, {
      currentPassword: password,
    }),
    { status: 400 },
  );
  const link = await recovery.support(admin.user.id, buyer.user.id, {
    currentPassword: password,
    ownershipConfirmed: true,
  });
  await recovery.reset({
    token: token(link.path),
    newPassword: "Recovered-Legacy!2026",
  });
  assert.equal(
    (
      await auth.login({
        identifier: "0912345678",
        password: "Recovered-Legacy!2026",
      })
    ).user.roles[0],
    "customer",
  );
  const row = (
    await db.pool.query(
      "SELECT is_demo,phone_verified_at,email_verified_at FROM users WHERE id=$1",
      [buyer.user.id],
    )
  ).rows[0];
  assert.deepEqual(row, {
    is_demo: false,
    phone_verified_at: null,
    email_verified_at: null,
  });
  await assert.rejects(
    recovery.support(admin.user.id, admin.user.id, {
      currentPassword: password,
      ownershipConfirmed: true,
    }),
    { status: 404 },
  );
});
