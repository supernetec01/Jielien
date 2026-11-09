import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const password = "Customer-Original!2026",
  nextPassword = "Customer-Replacement!2026";
const signup = (n = 1) => ({
  fullName: `Khách kiểm thử ${n}`,
  phone: `091234567${n}`,
  email: `buyer${n}@example.test`,
  password,
});
const address = {
  recipientName: "Người nhận",
  phone: "0912345671",
  addressDetail: "123 Đường kiểm thử",
  province: "TP Hồ Chí Minh",
  district: "Phường thử nghiệm",
  isDefault: true,
};
const recipient = {
  name: address.recipientName,
  phone: address.phone,
  address: address.addressDetail,
  province: address.province,
  district: address.district,
};
async function fixture(t, options = {}) {
  const db = await createTestDatabase();
  let app;
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
  });
  app = await createApp({ pool: db.pool, legacyPath: null, ...options });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`,
    auth = createAuth(db.pool);
  await auth.ensureAdmin({
    email: "admin@example.test",
    phone: "0987654321",
    password,
  });
  const admin = await auth.login({
    identifier: "admin@example.test",
    password,
  });
  const request = async (
    path,
    body,
    session,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session
          ? {
              Cookie: session.cookie || `jielien_session=${session.token}`,
              "X-CSRF-Token": session.csrfToken,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const txt = await r.text();
    const data = txt ? JSON.parse(txt) : null;
    return {
      status: r.status,
      data,
      cookie: r.headers.get("set-cookie"),
      session: data?.user
        ? {
            cookie: r.headers.get("set-cookie")?.split(";")[0],
            csrfToken: data.csrfToken,
            user: data.user,
          }
        : null,
    };
  };
  const register = async (body = signup()) => {
    const r = await request("/api/auth/register", body);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.session;
  };
  const tokenFromPath = (path) =>
    new URLSearchParams(
      new URL(path, "https://shop.example.test").hash.slice(1),
    ).get("token");
  const emailToken = async () => {
    await app.flushRecoveryOutbox();
    const message = [...app.testRecoveryMessages.values()].at(-1);
    assert.ok(message);
    return tokenFromPath(message.url);
  };
  return { db, app, auth, admin, request, register, tokenFromPath, emailToken };
}

test("public customer signup works immediately without OTP or SMS configuration and cannot self-assign roles", async (t) => {
  const { request, register } = await fixture(t, {
    passwordRecoveryDelivery: null,
  });
  const a = await register({
    ...signup(),
    roles: ["admin"],
    permissions: ["users.manage"],
    is_demo: false,
  });
  assert.deepEqual(a.user.roles, ["customer"]);
  assert.deepEqual(a.user.permissions, []);
  assert.equal((await request("/api/auth/me", undefined, a)).status, 200);
  assert.equal((await request("/api/admin/users", undefined, a)).status, 403);
  assert.equal(
    (
      await request("/api/auth/register/verify", {
        challengeId: "unused",
        code: "123456",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/api/auth/register", {
        ...signup(),
        email: signup().email.toUpperCase(),
        phone: "0912345672",
      })
    ).status,
    409,
  );
  const phoneOnly = await register({ ...signup(3), email: "" });
  assert.equal(phoneOnly.user.email, null);
  assert.equal(
    (await request("/api/auth/register", { ...signup(4), password: "short" }))
      .status,
    400,
  );
});

test("guest checkout requires every receiving field and never links orders by matching phone/email", async (t) => {
  const { request, register, admin } = await fixture(t);
  const a = await register();
  const order = {
    items: [{ id: 1, quantity: 1 }],
    payment: "cod",
    customer: recipient,
    idempotencyKey: "guest-customer-test-001",
  };
  for (const field of ["name", "phone", "address", "province", "district"]) {
    assert.equal(
      (
        await request("/api/orders", {
          ...order,
          customer: { ...recipient, [field]: "" },
        })
      ).status,
      400,
      field,
    );
  }
  const guest = await request("/api/orders", order);
  assert.equal(guest.status, 201);
  assert.equal(guest.data.order.userId, null);
  const owned = await request(
    "/api/orders",
    { ...order, idempotencyKey: "owned-customer-test-002" },
    a,
  );
  assert.equal(owned.status, 201);
  const detail = await request(
    `/api/admin/customers/${a.user.id}`,
    undefined,
    admin,
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.data.orders.length, 1);
  assert.equal(detail.data.orders[0].order_number, owned.data.order.id);
  assert.ok(!JSON.stringify(detail.data).includes(guest.data.order.id));
});

test("forgot response does not reveal accounts, staff or phone-only customers; reset email token is one-time and revokes all sessions", async (t) => {
  const { request, register, app, db, auth, emailToken } = await fixture(t);
  const a = await register();
  await register({ ...signup(2), email: "" });
  const results = [];
  for (const identifier of [
    signup().email,
    "missing@example.test",
    "admin@example.test",
    "0912345672",
  ]) {
    const r = await request("/api/auth/password/forgot", { identifier });
    assert.equal(r.status, 202);
    assert.equal(r.cookie, null);
    results.push(r.data);
  }
  assert.ok(
    results.every((r) => JSON.stringify(r) === JSON.stringify(results[0])),
  );
  const token = await emailToken();
  assert.equal(app.testRecoveryMessages.size, 1);
  assert.ok(
    !JSON.stringify(
      (await db.pool.query("SELECT * FROM customer_password_resets")).rows,
    ).includes(token),
  );
  const second = await auth.login({ identifier: signup().phone, password });
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token: "x".repeat(43),
        newPassword: nextPassword,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/auth/password/reset", { token, newPassword: "short" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token,
        newPassword: nextPassword,
      })
    ).status,
    204,
  );
  assert.equal((await request("/api/auth/me", undefined, a)).status, 401);
  assert.equal(await auth.authenticate(second.token), null);
  assert.equal(
    (await request("/api/auth/login", { identifier: signup().phone, password }))
      .status,
    401,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        identifier: signup().phone,
        password: nextPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token,
        newPassword: password,
      })
    ).status,
    400,
  );
  assert.ok(
    !JSON.stringify(
      (await db.pool.query("SELECT metadata FROM audit_logs")).rows,
    ).includes(token),
  );
});

test("new reset links expire old links; expiry, concurrent consumption, profile/password/role changes invalidate recovery", async (t) => {
  let now = Date.now();
  const { request, register, emailToken, auth, admin } = await fixture(t, {
    recoveryClock: () => now,
  });
  const a = await register();
  await request("/api/auth/password/forgot", { identifier: signup().email });
  const old = await emailToken();
  now += 60_001;
  await request("/api/auth/password/forgot", { identifier: signup().phone });
  const fresh = await emailToken();
  assert.notEqual(old, fresh);
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token: old,
        newPassword: nextPassword,
      })
    ).status,
    400,
  );
  const races = await Promise.all([
    request("/api/auth/password/reset", {
      token: fresh,
      newPassword: nextPassword,
    }),
    request("/api/auth/password/reset", {
      token: fresh,
      newPassword: nextPassword,
    }),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [204, 400]);
  now += 60_001;
  await request("/api/auth/password/forgot", { identifier: signup().email });
  const expired = await emailToken();
  now += 30 * 60_000;
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token: expired,
        newPassword: password,
      })
    ).status,
    400,
  );
  const b = await register(signup(2));
  await request("/api/auth/password/forgot", { identifier: signup(2).email });
  const changed = await emailToken();
  await auth.updateProfile(b.user.id, {
    email: "new@example.test",
    currentPassword: password,
  });
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token: changed,
        newPassword: nextPassword,
      })
    ).status,
    400,
  );
  now += 60_001;
  await request("/api/auth/password/forgot", {
    identifier: "new@example.test",
  });
  const changedPassword = await emailToken();
  await auth.changePassword(b.user.id, {
    currentPassword: password,
    newPassword: nextPassword,
  });
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token: changedPassword,
        newPassword: password,
      })
    ).status,
    400,
  );
  const c = await register(signup(3));
  await request("/api/auth/password/forgot", { identifier: signup(3).email });
  const promoted = await emailToken();
  await auth.manageUser(admin.user.id, c.user.id, {
    status: "active",
    roles: ["customer", "catalog_manager"],
  });
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token: promoted,
        newPassword: nextPassword,
      })
    ).status,
    400,
  );
});

test("admin customer detail is private and support reset requires ownership confirmation, admin reauthentication and CSRF", async (t) => {
  const { request, register, admin, auth, tokenFromPath, db } =
    await fixture(t);
  const a = await register({ ...signup(), email: "" });
  const b = await register(signup(2));
  await auth.saveAddress(a.user.id, address);
  const path = `/api/admin/customers/${a.user.id}`;
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, undefined, b)).status, 403);
  const detail = await request(path, undefined, admin);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.addresses.length, 1);
  assert.ok(detail.data.customer.created_at);
  const serialized = JSON.stringify(detail.data);
  for (const secret of [
    "password_hash",
    "token_hash",
    "csrf_token",
    "access_token",
  ])
    assert.ok(!serialized.includes(secret));
  assert.equal(
    (await request(path + "?page=1.5", undefined, admin)).status,
    400,
  );
  const support = path + "/recovery";
  assert.equal(
    (
      await request(
        support,
        { ownershipConfirmed: false, currentPassword: password },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        support,
        { ownershipConfirmed: true, currentPassword: "wrong" },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        support,
        { ownershipConfirmed: true, currentPassword: password },
        { ...admin, csrfToken: "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        support,
        { ownershipConfirmed: true, currentPassword: password },
        a,
      )
    ).status,
    403,
  );
  const issued = await request(
    support,
    { ownershipConfirmed: true, currentPassword: password },
    admin,
  );
  assert.equal(issued.status, 201);
  const token = tokenFromPath(issued.data.path);
  assert.ok(token);
  assert.equal(
    (
      await request("/api/auth/password/reset", {
        token,
        newPassword: nextPassword,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        identifier: signup().phone,
        password: nextPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*) AS n FROM audit_logs WHERE action='customer.recovery_issued'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await request(
        `/api/admin/customers/${admin.user.id}/recovery`,
        { ownershipConfirmed: true, currentPassword: password },
        admin,
      )
    ).status,
    404,
  );
});
