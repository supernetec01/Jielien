import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createPool } from "../lib/database.mjs";
import { migrate } from "../db/migrate.mjs";
import { createAuth } from "../lib/auth.mjs";
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
let terminal;
async function prompt(label, secret = false) {
  if (!process.stdin.isTTY)
    throw new Error(
      "Provide ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD through secure environment variables, or run this command in an interactive terminal.",
    );
  terminal ??= createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  process.stdout.write(label);
  muted = secret;
  try {
    return await terminal.question("");
  } finally {
    muted = false;
    if (secret) process.stdout.write("\n");
  }
}
async function valueFor(
  key,
  label,
  valid,
  message,
  { secret = false, fallback } = {},
) {
  if (process.env[key]) {
    if (!valid(process.env[key]))
      throw Object.assign(new Error(message), { status: 400 });
    return process.env[key];
  }
  if (!process.stdin.isTTY && fallback) return fallback;
  for (;;) {
    const value = (await prompt(label, secret)) || fallback || "";
    if (valid(value)) return value;
    console.error(message);
  }
}
const pool = createPool();
try {
  await migrate(pool);
  const username = await valueFor(
    "ADMIN_USERNAME",
    "Tên đăng nhập quản trị (Enter: admin): ",
    (v) => /^[a-z][a-z0-9._-]{2,39}$/i.test(v),
    "Tên đăng nhập cần 3–40 ký tự, bắt đầu bằng chữ.",
    { fallback: "admin" },
  );
  const email = await valueFor(
    "ADMIN_EMAIL",
    "Email quản trị: ",
    (v) => v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Email không hợp lệ. Nhập email đầy đủ, ví dụ ten@congty.vn.",
  );
  const phone = await valueFor(
    "ADMIN_PHONE",
    "Điện thoại quản trị: ",
    (v) =>
      /^0[35789]\d{8}$/.test(
        v
          .trim()
          .replace(/[ .()-]/g, "")
          .replace(/^\+84/, "0"),
      ),
    "Số điện thoại Việt Nam cần 10 chữ số, ví dụ 09xxxxxxxx.",
  );
  const name = process.env.ADMIN_NAME || "Quản trị Jielien";
  const password = await valueFor(
    "ADMIN_PASSWORD",
    "Mật khẩu (ít nhất 10 ký tự, không hiển thị): ",
    (v) =>
      [...v].length >= 10 &&
      Buffer.byteLength(v, "utf8") <= 72 &&
      !v.includes("\0"),
    "Mật khẩu cần ít nhất 10 ký tự và tối đa 72 byte UTF-8.",
    { secret: true },
  );
  const result = await createAuth(pool).ensureAdmin({
    username,
    email,
    phone,
    name,
    password,
  });
  console.log(
    "Tài khoản quản trị đã sẵn sàng. ID:",
    result.user?.id ?? result.id,
  );
} catch (error) {
  console.error(
    error.status
      ? error.message
      : "Không thể khởi tạo quản trị. Kiểm tra kết nối PostgreSQL và cấu hình.",
  );
  process.exitCode = 1;
} finally {
  terminal?.close();
  await pool.end();
}
