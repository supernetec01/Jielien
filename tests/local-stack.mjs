// Optional Docker integration test. Uses its own project, random host port,
// temporary files, fake receiving account and disposable database volume.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { initializeLocal } from "../scripts/local.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "jielien-stack-"));
const project = `jielien-check-${process.pid}-${randomUUID().slice(0, 8)}`;
const env = {
  ...process.env,
  JIELIEN_PORT: "0",
  BUILDX_CONFIG: join(temporary, "buildx"),
  JIELIEN_DATA_DIR: join(temporary, "data"),
};
const compose = [
  "compose",
  "--project-directory",
  root,
  "-f",
  join(root, "compose.yaml"),
  "--env-file",
  join(temporary, ".env.local"),
  "-p",
  project,
];
function docker(args, capture = false) {
  return new Promise((accept, reject) => {
    let output = "";
    const child = spawn("docker", [...compose, ...args], {
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });
    if (capture) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", () => {});
    }
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? accept(output.trim())
        : reject(
            new Error(
              `Isolated Docker command failed (${args[0]}, exit ${code}).`,
            ),
          ),
    );
  });
}
let started = false;
try {
  const certificate =
    process.env.LOCAL_TEST_CA_FILE || process.env.NODE_EXTRA_CA_CERTS;
  if (certificate) {
    const override = join(temporary, "build-ca.yaml");
    await writeFile(
      override,
      `services:\n  app:\n    build:\n      secrets:\n        - npm_ca\nsecrets:\n  npm_ca:\n    file: ${JSON.stringify(certificate)}\n`,
    );
    compose.push("-f", override);
  }
  await initializeLocal({
    directory: temporary,
    env: {
      BANK_BIN: "970407",
      BANK_NAME: "Test Bank",
      BANK_ACCOUNT_NUMBER: "0000000000",
      BANK_ACCOUNT_NAME: "TEST RECEIVER",
    },
  });
  const original = await readFile(join(temporary, ".env.local"), "utf8");
  const config = JSON.parse(await docker(["config", "--format", "json"], true));
  assert.equal(config.services.db.ports, undefined);
  assert.equal(config.services.app.ports[0].host_ip, "127.0.0.1");
  assert.equal(config.services.app.environment.COOKIE_SECURE, "false");
  console.log(
    "PASS: isolated Compose configuration keeps database internal and HTTP session cookies usable.",
  );
  started = true;
  await docker(["up", "--build", "-d", "--wait", "--wait-timeout", "120"]);
  const url = async () =>
    "http://" + (await docker(["port", "app", "3001"], true));
  let base = await url();
  assert.equal(
    (await (await fetch(base + "/api/health")).json()).database,
    "postgresql",
  );
  const methods = await (await fetch(base + "/api/payment-methods")).json();
  assert.equal(
    methods.methods.find((method) => method.id === "bank_transfer").enabled,
    true,
  );
  const register = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Docker Test Buyer",
      phone: "0912345678",
      password: "Test-Only-Docker-Password-2026",
    }),
  });
  assert.equal(register.status, 201);
  const session = await register.json();
  const cookie = register.headers.get("set-cookie").split(";", 1)[0];
  assert.ok(register.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(!register.headers.get("set-cookie").includes("; Secure"));
  const products = (await (await fetch(base + "/api/products")).json())
    .products;
  const product = products.find((item) => item.id === 1);
  const response = await fetch(base + "/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": session.csrfToken,
    },
    body: JSON.stringify({
      items: [{ id: 1, quantity: 1 }],
      coupon: "",
      customer: {
        name: "Docker Test Buyer",
        phone: "0912345678",
        email: "",
        province: "TP Hồ Chí Minh",
        district: "Phường Kiểm Thử",
        address: "123 Đường Kiểm Thử",
      },
      payment: "bank_transfer",
      note: "Isolated Docker test only",
      idempotencyKey: randomUUID(),
    }),
  });
  assert.equal(response.status, 201);
  const { order } = await response.json();
  assert.equal(order.userId, session.user.id);
  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.transfer.accountNumber, "0000000000");
  assert.ok(order.transfer.qrDataUrl.startsWith("data:image/svg+xml;base64,"));
  console.log(
    "PASS: Docker Node24/PostgreSQL17 supports registration, CSRF checkout and locally generated VietQR.",
  );
  await docker(["down"]);
  await docker(["up", "-d", "--wait", "--wait-timeout", "120"]);
  base = await url();
  const saved = await fetch(base + "/api/orders/" + order.id, {
    headers: { Cookie: cookie },
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).order.total, order.total);
  const remaining = (
    await (await fetch(base + "/api/products")).json()
  ).products.find((item) => item.id === 1);
  assert.equal(remaining.stock, product.stock - 1);
  assert.equal(await readFile(join(temporary, ".env.local"), "utf8"), original);
  console.log(
    "PASS: database volume retains session, order, price and one stock reservation across full stack recreation.",
  );
} finally {
  if (started)
    await docker(["down", "--volumes", "--remove-orphans"]).catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}
