import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { normalizeBankConfig } from "../lib/vietqr.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Only the simple, single-line values generated here or used for receiving
// instructions are read. No shell evaluates a configuration value.
function readValues(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) continue;
      value = value.slice(1, end);
    } else value = value.split("#", 1)[0].trim();
    values[match[1]] = value;
  }
  return values;
}
function quoted(value) {
  if (/[\r\n\0]/.test(value))
    throw new Error("Cấu hình phải nằm trên một dòng.");
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"') && !value.includes("$")) return `"${value}"`;
  throw new Error("Thông tin ngân hàng không được chứa cả hai loại dấu nháy.");
}
function validateLocal(source) {
  const values = readValues(source);
  let url;
  try {
    url = new URL(values.LOCAL_DATABASE_URL);
  } catch {}
  if (
    !/^[a-f0-9]{64}$/.test(values.POSTGRES_PASSWORD || "") ||
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "db" ||
    url.port !== "5432" ||
    url.username !== "jielien" ||
    url.pathname !== "/jielien" ||
    url.password !== values.POSTGRES_PASSWORD ||
    url.search ||
    url.hash
  )
    throw new Error(
      ".env.local thiếu hoặc sai cấu hình database Docker. File được giữ nguyên; khôi phục đúng cấu hình cũ nếu volume đã có dữ liệu.",
    );
  return values;
}
export async function initializeLocal({
  directory = projectRoot,
  env = process.env,
} = {}) {
  const path = join(directory, ".env.local");
  try {
    validateLocal(await readFile(path, "utf8"));
    return { created: false, path };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let native = {};
  try {
    native = readValues(await readFile(join(directory, ".env"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const receiving = Object.fromEntries(
    ["BANK_BIN", "BANK_NAME", "BANK_ACCOUNT_NUMBER", "BANK_ACCOUNT_NAME"].map(
      (key) => [key, env[key] ?? native[key] ?? ""],
    ),
  );
  const bank = normalizeBankConfig({
    bankBin: receiving.BANK_BIN,
    bankName: receiving.BANK_NAME,
    accountNumber: receiving.BANK_ACCOUNT_NUMBER,
    accountName: receiving.BANK_ACCOUNT_NAME,
  });
  const password = randomBytes(32).toString("hex");
  const content = [
    "# Local Docker configuration. Keep this file private and retain it with the database volume.",
    "# Do not change the database password after the volume has been initialized.",
    `POSTGRES_PASSWORD=${password}`,
    `LOCAL_DATABASE_URL=postgresql://jielien:${password}@db:5432/jielien`,
    "",
    "# Receiving details only; never enter a bank login password or OTP.",
    ...Object.entries(receiving).map(
      ([key, value]) => `${key}=${quoted(bank.enabled ? value.trim() : "")}`,
    ),
    "",
  ].join("\n");
  await mkdir(join(directory, "data"), { recursive: true });
  try {
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    validateLocal(await readFile(path, "utf8"));
    return { created: false, path };
  }
  return { created: true, path, bankEnabled: bank.enabled };
}
function docker(args, { quiet = false, env = process.env } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn("docker", args, {
      cwd: projectRoot,
      env,
      stdio: quiet ? "ignore" : "inherit",
      shell: false,
    });
    child.once("error", () =>
      reject(
        new Error(
          "Không tìm thấy Docker. Cài và mở Docker Desktop rồi chạy lại.",
        ),
      ),
    );
    child.once("exit", (code) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              quiet
                ? "Docker chưa sẵn sàng. Mở Docker Desktop và đợi Engine khởi động rồi chạy lại."
                : "Lệnh Docker chưa thành công; xem thông báo phía trên. Dữ liệu không bị xóa.",
            ),
          ),
    );
  });
}
async function main() {
  const action = process.argv[2] || "start";
  if (!["init", "start", "stop", "status", "logs", "admin"].includes(action))
    throw new Error("Lệnh local không hợp lệ.");
  if (action === "init" || action === "start") {
    const result = await initializeLocal();
    console.log(
      result.created
        ? "Đã tạo .env.local với mật khẩu database ngẫu nhiên. Không đưa file này lên Git."
        : "Giữ nguyên .env.local và mật khẩu database hiện có.",
    );
    if (action === "init") return;
  }
  await docker(["info", "--format", "{{.ServerVersion}}"], { quiet: true });
  const commands = {
    start: ["up", "--build", "-d", "--wait", "--wait-timeout", "120"],
    stop: ["down"],
    status: ["ps"],
    logs: ["logs", "--tail", "100", "-f"],
    admin: ["exec", "app", "npm", "run", "admin:create"],
  };
  const local = validateLocal(
    await readFile(join(projectRoot, ".env.local"), "utf8"),
  );
  await docker(
    [
      "compose",
      "--project-directory",
      projectRoot,
      "--env-file",
      join(projectRoot, ".env.local"),
      "--file",
      join(projectRoot, "compose.yaml"),
      ...commands[action],
    ],
    { env: { ...process.env, ...local } },
  );
  if (action === "start")
    console.log(
      "Website local: http://localhost:3001 — Tài khoản: http://localhost:3001/tai-khoan",
    );
  if (action === "stop")
    console.log(
      "Đã dừng local; database volume, .env.local và thư mục data được giữ nguyên.",
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
