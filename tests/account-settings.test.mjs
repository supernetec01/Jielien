import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./support/database.mjs";
import { migrate } from "../db/migrate.mjs";
import { createAuth } from "../lib/auth.mjs";

const oldPassword = "Account-Settings-Test-2026";
const newPassword = "New-Account-Password-2026";
const signup = (n = 1) => ({
  fullName: `Người thử ${n}`,
  phone: `091234567${n}`,
  email: `settings${n}@example.test`,
  password: oldPassword,
});
const address = (label, isDefault = false) => ({
  recipientName: "Người nhận thử",
  phone: "0912345671",
  province: "TP Hồ Chí Minh",
  district: "Phường mẫu",
  addressDetail: `123 Đường ${label}`,
  isDefault,
});
async function fixture(t) {
  const database = await createTestDatabase();
  t.after(() => database.cleanup());
  await migrate(database.pool);
  return { ...database, auth: createAuth(database.pool) };
}

test("profile edits persist; email changes require the current password and no privileged or phone fields are writable", async (t) => {
  const { auth } = await fixture(t);
  const a = await auth.register(signup(1));
  const b = await auth.register(signup(2));
  const renamed = await auth.updateProfile(a.user.id, {
    fullName: "Mẹ cập nhật",
  });
  assert.equal(renamed.fullName, "Mẹ cập nhật");
  assert.equal((await auth.getProfile(a.user.id)).fullName, "Mẹ cập nhật");
  assert.equal(renamed.password_hash, undefined);
  assert.equal(renamed.token, undefined);
  assert.deepEqual(renamed.roles, ["customer"]);
  await assert.rejects(
    auth.updateProfile(a.user.id, { email: "new@example.test" }),
    { status: 400, error: "invalid_current_password" },
  );
  await assert.rejects(
    auth.updateProfile(a.user.id, {
      email: "new@example.test",
      currentPassword: "Wrong-Password-2026",
    }),
    { status: 400, error: "invalid_current_password" },
  );
  assert.equal((await auth.getProfile(a.user.id)).email, signup(1).email);
  const changed = await auth.updateProfile(a.user.id, {
    email: "NEW@EXAMPLE.TEST",
    currentPassword: oldPassword,
  });
  assert.equal(changed.email, "new@example.test");
  const fromLogin = await auth.login({
    identifier: "new@example.test",
    password: oldPassword,
  });
  assert.equal(fromLogin.user.id, a.user.id);
  await assert.rejects(
    auth.updateProfile(a.user.id, {
      fullName: "Không được lưu",
      email: b.user.email,
      currentPassword: oldPassword,
    }),
    { status: 409, error: "account_exists" },
  );
  assert.equal((await auth.getProfile(a.user.id)).fullName, "Mẹ cập nhật");
  for (const unsafe of [
    { roles: ["admin"] },
    { permissions: ["users.manage"] },
    { status: "inactive" },
    { phone: "0987654321" },
  ]) {
    await assert.rejects(
      auth.updateProfile(a.user.id, { fullName: "Không được lưu", ...unsafe }),
      { status: 400, error: "restricted_account_field" },
    );
  }
  const removed = await auth.updateProfile(a.user.id, {
    email: "",
    currentPassword: oldPassword,
  });
  assert.equal(removed.email, null);
  assert.deepEqual(removed.roles, ["customer"]);
  assert.deepEqual(removed.permissions, []);
});

test("password change rejects wrong/weak/unchanged input and invalidates all existing sessions", async (t) => {
  const { auth, pool } = await fixture(t);
  const registered = await auth.register(signup());
  const second = await auth.login({
    identifier: signup().phone,
    password: oldPassword,
  });
  await assert.rejects(
    auth.changePassword(registered.user.id, {
      currentPassword: "Not-Correct-2026",
      newPassword,
    }),
    { status: 400, error: "invalid_current_password" },
  );
  await assert.rejects(
    auth.changePassword(registered.user.id, {
      currentPassword: oldPassword,
      newPassword: "short",
    }),
    { status: 400, error: "validation_error" },
  );
  await assert.rejects(
    auth.changePassword(registered.user.id, {
      currentPassword: oldPassword,
      newPassword: oldPassword,
    }),
    { status: 400, error: "password_unchanged" },
  );
  assert.ok(await auth.authenticate(registered.token));
  assert.ok(await auth.authenticate(second.token));
  const user = await auth.changePassword(registered.user.id, {
    currentPassword: oldPassword,
    newPassword,
  });
  assert.equal(user.id, registered.user.id);
  assert.equal(user.password_hash, undefined);
  assert.equal(await auth.authenticate(registered.token), null);
  assert.equal(await auth.authenticate(second.token), null);
  await assert.rejects(
    auth.login({ identifier: signup().phone, password: oldPassword }),
    { status: 401, error: "invalid_credentials" },
  );
  const next = await auth.login({
    identifier: signup().phone,
    password: newPassword,
  });
  assert.ok(await auth.authenticate(next.token));
  const audit = await pool.query(
    "SELECT action,metadata FROM audit_logs WHERE actor_id=$1 ORDER BY id",
    [registered.user.id],
  );
  assert.ok(
    audit.rows.some((row) => row.action === "account.password_changed"),
  );
  const encoded = JSON.stringify(audit.rows);
  for (const value of [
    oldPassword,
    newPassword,
    registered.token,
    second.token,
    next.token,
    signup().email,
  ])
    assert.ok(!encoded.includes(value));
});

test("login overlapping a password change cannot retain an old-password session", async (t) => {
  const { auth } = await fixture(t);
  const registered = await auth.register(signup());
  const [login, change] = await Promise.allSettled([
    auth.login({ identifier: signup().phone, password: oldPassword }),
    auth.changePassword(registered.user.id, {
      currentPassword: oldPassword,
      newPassword,
    }),
  ]);
  assert.equal(change.status, "fulfilled");
  if (login.status === "fulfilled")
    assert.equal(await auth.authenticate(login.value.token), null);
  else assert.equal(login.reason.error, "invalid_credentials");
  assert.equal(await auth.authenticate(registered.token), null);
  assert.ok(
    (await auth.login({ identifier: signup().phone, password: newPassword }))
      .user,
  );
});

test("address deletion enforces ownership and promotes a remaining default in the same transaction", async (t) => {
  const { auth, pool } = await fixture(t);
  const a = await auth.register(signup(1));
  const b = await auth.register(signup(2));
  const first = await auth.saveAddress(a.user.id, address("đầu", true));
  const second = await auth.saveAddress(a.user.id, address("sau", false));
  const unrelated = await auth.saveAddress(
    b.user.id,
    address("khách khác", true),
  );
  await assert.rejects(auth.deleteAddress(b.user.id, first.id), {
    status: 404,
    error: "address_not_found",
  });
  assert.equal((await auth.listAddresses(a.user.id)).length, 2);
  const result = await auth.deleteAddress(a.user.id, first.id);
  assert.deepEqual(result, { deleted: true, id: first.id });
  let list = await auth.listAddresses(a.user.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, second.id);
  assert.equal(list[0].isDefault, true);
  assert.equal((await auth.listAddresses(b.user.id))[0].id, unrelated.id);
  await auth.deleteAddress(a.user.id, second.id);
  assert.deepEqual(await auth.listAddresses(a.user.id), []);
  await assert.rejects(auth.deleteAddress(a.user.id, second.id), {
    status: 404,
    error: "address_not_found",
  });
  const logs = await pool.query(
    "SELECT metadata FROM audit_logs WHERE action='account.address_deleted' AND actor_id=$1",
    [a.user.id],
  );
  assert.equal(logs.rowCount, 2);
  assert.ok(logs.rows.every((row) => Object.keys(row.metadata).length === 0));
});

test("profile audit records only changed field names and inactive accounts cannot mutate settings", async (t) => {
  const { auth, pool } = await fixture(t);
  const a = await auth.register(signup());
  await auth.updateProfile(a.user.id, {
    fullName: "Tên mới",
    email: "changed@example.test",
    currentPassword: oldPassword,
  });
  const logs = await pool.query(
    "SELECT action,metadata FROM audit_logs WHERE actor_id=$1",
    [a.user.id],
  );
  assert.equal(logs.rowCount, 1);
  assert.equal(logs.rows[0].action, "account.profile_updated");
  assert.deepEqual(logs.rows[0].metadata, { fields: ["full_name", "email"] });
  const stored = JSON.stringify(logs.rows);
  assert.ok(
    !stored.includes("Tên mới") &&
      !stored.includes("changed@example.test") &&
      !stored.includes(oldPassword),
  );
  await pool.query("UPDATE users SET status='inactive' WHERE id=$1", [
    a.user.id,
  ]);
  await assert.rejects(
    auth.updateProfile(a.user.id, { fullName: "Bị từ chối" }),
    { status: 404 },
  );
  await assert.rejects(
    auth.changePassword(a.user.id, {
      currentPassword: oldPassword,
      newPassword,
    }),
    { status: 404 },
  );
  await assert.rejects(auth.deleteAddress(a.user.id, 1), { status: 404 });
});
