// Optional Docker integration test. Uses its own project, random host port,
// temporary files, fake receiving account and disposable database volume.
import {
  saveBackupBundle,
  checksum,
  exportMediaScript,
} from "../scripts/backup.mjs";
import sharp from "sharp";
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
// This stack uses an isolated project and directory. Demo data is explicitly test-only.
const fixtureOverride = join(temporary, "fixture-data.yaml");
await writeFile(
  fixtureOverride,
  'services:\n  app:\n    environment:\n      JIELIEN_DEMO_DATA: "true"\n',
);
compose.push("-f", fixtureOverride);
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
  env.JIELIEN_BIND_IP = "0.0.0.0";
  const lan = JSON.parse(await docker(["config", "--format", "json"], true));
  assert.equal(lan.services.app.ports[0].host_ip, "0.0.0.0");
  assert.equal(lan.services.db.ports, undefined);
  delete env.JIELIEN_BIND_IP;
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
  assert.equal(register.status, 503, 'signup requires a configured verification provider');
  assert.equal(register.headers.get('set-cookie'),null);
  await docker(['exec','-T','app','node','--input-type=module','-e',
    `import {createPool} from './lib/database.mjs';import {createAuth} from './lib/auth.mjs';const p=createPool();try{await createAuth(p).register({fullName:'Docker Test Buyer',phone:'0912345678',password:'Test-Only-Docker-Password-2026'});}finally{await p.end();}`]);
  const buyerLogin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'0912345678',password:'Test-Only-Docker-Password-2026'})});
  assert.equal(buyerLogin.status,200);
  const session = await buyerLogin.json();
  const cookie = buyerLogin.headers.get("set-cookie").split(";", 1)[0];
  assert.ok(buyerLogin.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(!buyerLogin.headers.get("set-cookie").includes("; Secure"));
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
    "PASS: Docker Node24/PostgreSQL17 requires verification for signup and supports fixture login, CSRF checkout and locally generated VietQR.",
  );
  await docker([
    "exec",
    "-T",
    "app",
    "node",
    "--input-type=module",
    "-e",
    `import {createPool} from './lib/database.mjs';import {createAuth} from './lib/auth.mjs';const p=createPool();try{await createAuth(p).ensureAdmin({username:'admin',name:'Docker Test Admin',email:'admin@example.test',phone:'0987654321',password:'Docker-Test-Admin-Pass-2026'});}finally{await p.end();}`,
  ]);
  const adminLogin = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "admin",
      password: "Docker-Test-Admin-Pass-2026",
    }),
  });
  assert.equal(adminLogin.status, 200);
  const adminSession = await adminLogin.json(),
    adminCookie = adminLogin.headers.get("set-cookie").split(";", 1)[0];
  const adminHeaders = {
    Cookie: adminCookie,
    "X-CSRF-Token": adminSession.csrfToken,
  };
  const pixels = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#86b529" },
  })
    .png()
    .toBuffer();
  const uploaded = await fetch(base + "/api/admin/media/uploads", {
    method: "POST",
    headers: {
      ...adminHeaders,
      "Content-Type": "image/png",
      "X-Image-Alt": "Docker verified image",
    },
    body: pixels,
  });
  assert.equal(uploaded.status, 201);
  const asset = (await uploaded.json()).asset;
  const parent = (
    await (
      await fetch(base + "/api/admin/catalog/products/1", {
        headers: adminHeaders,
      })
    ).json()
  ).product;
  const attached = await fetch(base + "/api/admin/catalog/products/1/media", {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: parent.version,
      media: [
        ...parent.media.map((m) => ({ existingMediaId: m.id })),
        { assetId: asset.id },
      ],
    }),
  });
  assert.equal(attached.status, 200);
  assert.equal((await fetch(base + asset.url)).status, 200);
  console.log(
    "PASS: Docker decodes uploaded image, keeps legacy gallery and stores media on host bind mount.",
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
  assert.equal((await fetch(base + asset.url)).status, 200);
  const bundle = await saveBackupBundle({
    command: "docker",
    args: [
      ...compose,
      "exec",
      "-T",
      "db",
      "pg_dump",
      "-U",
      "jielien",
      "-d",
      "jielien",
      "-Fc",
    ],
    directory: join(temporary, "backups"),
    mediaCommand: "docker",
    mediaArgs: [
      ...compose,
      "exec",
      "-T",
      "app",
      "node",
      "--input-type=module",
      "-e",
      exportMediaScript,
    ],
  });
  const dump = join(bundle.directory, "database.dump");
  assert.equal(await checksum(dump), bundle.database.sha256);
  assert.equal(bundle.media.length, 1);
  assert.equal(
    await checksum(join(bundle.directory, "media", asset.storage_key)),
    bundle.media[0].sha256,
  );
  const container = await docker(["ps", "-q", "db"], true);
  await new Promise((ok, fail) => {
    const p = spawn("docker", ["cp", dump, container + ":/tmp/check.dump"], {
      stdio: "inherit",
      env,
    });
    p.on("error", fail);
    p.on("exit", (c) => (c === 0 ? ok() : fail(Error("copy failed"))));
  });
  await docker(
    ["exec", "-T", "db", "pg_restore", "--list", "/tmp/check.dump"],
    true,
  );
  await docker([
    "exec",
    "-T",
    "db",
    "createdb",
    "-U",
    "jielien",
    "jielien_drill",
  ]);
  await docker([
    "exec",
    "-T",
    "db",
    "pg_restore",
    "--exit-on-error",
    "--no-owner",
    "-U",
    "jielien",
    "-d",
    "jielien_drill",
    "/tmp/check.dump",
  ]);
  const restored = await docker(
    [
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "jielien",
      "-d",
      "jielien_drill",
      "-tAc",
      "SELECT count(*) FROM orders",
    ],
    true,
  );
  assert.equal(restored, "1");
  const restoredAssets = await docker(
    [
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "jielien",
      "-d",
      "jielien_drill",
      "-tAc",
      "SELECT count(*) FROM media_assets",
    ],
    true,
  );
  assert.equal(restoredAssets, "1");
  console.log(
    "PASS: binary backup restored into independent drill database with order/media metadata retained; media SHA-256 verified.",
  );
} finally {
  if (started) {
    // Only this test's temporary bind mount, after backup validation. Never live media.
    await docker([
      "exec",
      "-T",
      "app",
      "node",
      "-e",
      "require('fs').rmSync('/app/data/media',{recursive:true,force:true})",
    ]).catch(() => {});
    await docker(["down", "--remove-orphans"]).catch(() => {});
  }
  await rm(temporary, { recursive: true, force: true });
}
