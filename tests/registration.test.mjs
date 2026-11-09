import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./support/app.mjs";
import { createApp as productionApp } from "../server.mjs";
import { createAuth } from "../lib/auth.mjs";
import {
  createRegistration,
  registrationDelivery,
} from "../lib/registration.mjs";
import { migrate } from "../db/migrate.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const signup = {
  fullName: "Khách có dấu",
  phone: "0912345678",
  email: "Buyer+1@EXAMPLE.test",
  password: "Registration-Test!2026",
};

test("public signup returns identical generic responses, no session until proof, and cannot replace existing credentials", async (t) => {
  const db = await createTestDatabase();
  let app;
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
  });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const request = async (path, body) => {
    const r = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie"),
    };
  };
  const auth = createAuth(db.pool);
  const existing = await auth.register({
    ...signup,
    phone: "0912345679",
    email: "existing@example.test",
  });
  const a = await request("/api/auth/register", {
    ...signup,
    roles: ["admin"],
  });
  const b = await request("/api/auth/register", {
    ...signup,
    phone: "0912345670",
    email: "EXISTING@EXAMPLE.test",
  });
  const c = await request("/api/auth/register", {
    ...signup,
    phone: "0912345679",
    email: "different@example.test",
  });
  for (const r of [a, b, c]) {
    assert.equal(r.status, 202);
    assert.equal(r.cookie, null);
    assert.deepEqual(Object.keys(r.data).sort(), [
      "challengeId",
      "emailVerificationRequired",
      "expiresIn",
      "message",
      "resendAfter",
    ]);
  }
  const common = ({ challengeId, ...rest }) => rest;
  assert.deepEqual(common(a.data), common(b.data));
  assert.deepEqual(common(a.data), common(c.data));
  assert.equal(
    (await db.pool.query("SELECT count(*) AS n FROM users")).rows[0].n,
    1,
  );
  const sealed = (
    await db.pool.query("SELECT payload FROM registration_outbox")
  ).rows;
  assert.ok(
    sealed.every(
      (r) => !r.payload.includes(signup.phone) && !r.payload.includes("signup"),
    ),
  );
  await app.flushRegistrationOutbox();
  const verify = async (id) =>
    request("/api/auth/register/verify", {
      challengeId: id,
      code: app.testRegistrationMessages.get(id).code,
      emailCode: app.testRegistrationMessages.get(id).emailCode,
    });
  const sent = app.testRegistrationMessages.get(a.data.challengeId);
  assert.notEqual(sent.code, sent.emailCode);
  for (const body of [
    { challengeId: sent.id, code: sent.code },
    { challengeId: sent.id, code: sent.code, emailCode: sent.code },
    { challengeId: sent.id, code: sent.emailCode, emailCode: sent.emailCode },
  ]) {
    const r = await request("/api/auth/register/verify", body);
    assert.equal(
      r.status,
      400,
      "both recipients must be independently verified",
    );
    assert.equal(r.cookie, null);
  }
  const first = await verify(a.data.challengeId);
  assert.equal(first.status, 201);
  assert.match(first.cookie, /HttpOnly.*SameSite=Lax/);
  assert.deepEqual(first.data.user.roles, ["customer"]);
  assert.deepEqual(first.data.user.permissions, []);
  assert.equal(first.data.user.email, signup.email.toLowerCase());
  assert.equal(
    (await verify(a.data.challengeId)).status,
    400,
    "OTP cannot be replayed",
  );
  for (const id of [b.data.challengeId, c.data.challengeId]) {
    const r = await verify(id);
    assert.equal(r.status, 400);
    assert.equal(r.cookie, null);
    assert.equal(r.data.error, "invalid_verification");
  }
  assert.equal(
    (
      await auth.login({
        identifier: "existing@example.test",
        password: signup.password,
      })
    ).user.id,
    existing.user.id,
  );
  assert.equal(
    (await db.pool.query("SELECT count(*) AS n FROM users")).rows[0].n,
    2,
  );
  const proof = (
    await db.pool.query("SELECT phone_verified_at FROM users WHERE id=$1", [
      first.data.user.id,
    ])
  ).rows[0];
  assert.ok(proof.phone_verified_at);
  assert.equal(
    (
      await db.pool.query("SELECT phone_verified_at FROM users WHERE id=$1", [
        existing.user.id,
      ])
    ).rows[0].phone_verified_at,
    null,
    "legacy accounts are not falsely verified",
  );
  assert.ok(
    (
      await db.pool.query("SELECT email_verified_at FROM users WHERE id=$1", [
        first.data.user.id,
      ])
    ).rows[0].email_verified_at,
  );
  await auth.updateProfile(first.data.user.id, {
    email: "changed@example.test",
    currentPassword: signup.password,
  });
  assert.equal(
    (
      await db.pool.query("SELECT email_verified_at FROM users WHERE id=$1", [
        first.data.user.id,
      ])
    ).rows[0].email_verified_at,
    null,
    "changing email must not retain proof for the old recipient",
  );
});

test("OTP enforces expiry, attempts, cooldown, recipient binding and atomic single consumption", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.cleanup());
  await migrate(db.pool);
  const auth = createAuth(db.pool),
    messages = new Map();
  let now = 10_000;
  const registration = await createRegistration(db.pool, auth, {
    clock: () => now,
    deliver: async (v) => messages.set(v.id, v),
  });
  const begin = async (body) => {
    const r = await registration.begin(body);
    await registration.flush();
    return {
      challengeId: r.challengeId,
      code: messages.get(r.challengeId).code,
      emailCode: messages.get(r.challengeId).emailCode,
    };
  };
  const a = await begin(signup);
  await assert.rejects(registration.begin(signup), { status: 429 });
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      registration.verify({
        ...a,
        code: a.code === "000000" ? "111111" : "000000",
      }),
      { status: 400 },
    );
  await assert.rejects(registration.verify(a), { status: 400 });
  now += 60_001;
  const b = await begin(signup);
  await assert.rejects(registration.verify(a), { status: 400 });
  now += 60_001;
  const c = await begin(signup);
  await assert.rejects(
    registration.verify(b),
    { status: 400 },
    "resend invalidates the old challenge",
  );
  const other = await begin({
    ...signup,
    phone: "0912345679",
    email: "other@example.test",
  });
  // Select a guaranteed wrong code, avoiding the 1-in-a-million collision.
  await assert.rejects(
    registration.verify({
      ...c,
      code: c.code === "000000" ? "111111" : "000000",
    }),
    { status: 400 },
  );
  const races = await Promise.allSettled([
    registration.verify(c),
    registration.verify(c),
  ]);
  assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
  const winner = races.find((x) => x.status === "fulfilled").value;
  assert.equal(
    (await auth.authenticate(winner.token)).user.phone,
    signup.phone,
  );
  now += 300_000;
  await assert.rejects(registration.verify(other), { status: 400 });
  assert.equal(
    (await db.pool.query("SELECT count(*) AS n FROM user_sessions")).rows[0].n,
    1,
  );
});

test("delivery outbox retries provider failures without duplicate concurrent sends and clears sensitive payload", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.cleanup());
  await migrate(db.pool);
  const auth = createAuth(db.pool);
  let now = 1000,
    calls = 0;
  const deliver = async (payload) => {
    calls++;
    assert.equal(payload.purpose, "signup");
    if (calls === 1) throw Error("sandbox failure");
  };
  const a = await createRegistration(db.pool, auth, {
    clock: () => now,
    deliver,
  });
  const b = await createRegistration(db.pool, auth, {
    clock: () => now,
    deliver,
  });
  await a.begin(signup);
  await a.flush();
  let row = (await db.pool.query("SELECT * FROM registration_outbox")).rows[0];
  assert.equal(row.state, "pending");
  assert.equal(row.attempts, 1);
  now += 2000;
  await Promise.all([a.flush(), b.flush()]);
  row = (await db.pool.query("SELECT * FROM registration_outbox")).rows[0];
  assert.equal(calls, 2);
  assert.equal(row.state, "sent");
  assert.equal(row.payload, "");
  await a.flush();
  assert.equal(calls, 2);
});

test("missing provider disables signup uniformly, and insecure provider configurations are rejected", async (t) => {
  const db = await createTestDatabase();
  let app;
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
  });
  app = await productionApp({
    pool: db.pool,
    legacyPath: null,
    registrationDelivery: null,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  for (const phone of ["0912345678", "0912345679"]) {
    const r = await fetch(
      `http://127.0.0.1:${app.address().port}/api/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signup, phone }),
      },
    );
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("set-cookie"), null);
  }
  assert.equal(
    (await db.pool.query("SELECT count(*) AS n FROM registration_challenges"))
      .rows[0].n,
    0,
  );
  assert.equal(registrationDelivery({}), null);
  assert.throws(() =>
    registrationDelivery({
      AUTH_VERIFICATION_WEBHOOK_URL: "http://example.test",
      AUTH_VERIFICATION_WEBHOOK_TOKEN: "test",
    }),
  );
});
