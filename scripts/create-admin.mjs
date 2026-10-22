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
const pool = createPool();
try {
  await migrate(pool);
  const email = process.env.ADMIN_EMAIL || (await prompt("Email quản trị: "));
  const phone =
    process.env.ADMIN_PHONE || (await prompt("Điện thoại quản trị: "));
  const name = process.env.ADMIN_NAME || "Quản trị Jielien";
  const password =
    process.env.ADMIN_PASSWORD ||
    (await prompt("Mật khẩu (ít nhất 10 ký tự, không hiển thị): ", true));
  const result = await createAuth(pool).ensureAdmin({
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
