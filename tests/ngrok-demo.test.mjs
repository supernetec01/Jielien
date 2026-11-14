import { request as httpRequest } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  demoTunnelConfig,
  checkDemoServer,
  startDemoTunnel,
  redactTunnelError,
} from "../scripts/ngrok-demo.mjs";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";

function hostRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: options.method, headers: options.headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers,
            }),
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
test("demo tunnel selects only loopback ports and preserves ngrok HTTPS/Host defaults", () => {
  assert.equal(demoTunnelConfig({}).upstream, "http://127.0.0.1:3001");
  assert.equal(
    demoTunnelConfig({ JIELIEN_PORT: "3210" }).options.addr,
    "127.0.0.1:3210",
  );
  const config = demoTunnelConfig({
    NGROK_LOCAL_PORT: "4321",
    NGROK_DOMAIN: "fixture.ngrok-free.app",
    NGROK_BASIC_AUTH: "fixture:private-test-only",
  });
  assert.equal(config.options.domain, "fixture.ngrok-free.app");
  assert.deepEqual(config.options.schemes, ["https"]);
  assert.ok(!("request_header_add" in config.options));
  for (const port of ["0", "65536", "3001;whoami", "https://example.test"])
    assert.throws(() => demoTunnelConfig({ NGROK_LOCAL_PORT: port }));
  for (const domain of [
    "https://fixture.ngrok-free.app",
    "fixture.ngrok-free.app/path",
    "user:pass@example.test",
  ])
    assert.throws(() => demoTunnelConfig({ NGROK_DOMAIN: domain }));
});
test("health and token failures prevent tunnel creation; secrets are redacted", async () => {
  await assert.rejects(
    checkDemoServer("http://127.0.0.1:3001", async () => {
      throw Error("offline");
    }),
    /local:start/,
  );
  await assert.rejects(
    checkDemoServer("http://127.0.0.1:3001", async () => ({
      ok: true,
      json: async () => ({ status: "ok", database: "other" }),
    })),
    /PostgreSQL/,
  );
  let loaded = false;
  await assert.rejects(
    startDemoTunnel({
      env: {},
      request: async () => ({
        ok: true,
        json: async () => ({ status: "ok", time: new Date().toISOString(), version: "3.0.0" }),
      }),
      load: async () => {
        loaded = true;
      },
    }),
    /NGROK_AUTHTOKEN/,
  );
  assert.equal(loaded, false);
  assert.equal(
    redactTunnelError(Error("bad test-token user:secret"), {
      NGROK_AUTHTOKEN: "test-token",
      NGROK_BASIC_AUTH: "user:secret",
    }),
    "bad [REDACTED] [REDACTED]",
  );
});
test("successful ngrok adapter exposes only HTTPS and closes listeners", async () => {
  let closed = 0;
  const run = await startDemoTunnel({
    env: { NGROK_AUTHTOKEN: "fixture-token" },
    request: async () => ({
      ok: true,
      json: async () => ({ status: "ok", time: new Date().toISOString(), version: "3.0.0" }),
    }),
    load: async () => ({
      forward: async (options) => {
        assert.deepEqual(options.schemes, ["https"]);
        return {
          url: () => "https://fixture.ngrok-free.app",
          close: async () => {
            closed++;
          },
        };
      },
    }),
    log: () => {},
  });
  assert.equal(run.url, "https://fixture.ngrok-free.app");
  await run.close();
  assert.equal(closed, 1);
  await assert.rejects(
    startDemoTunnel({
      env: { NGROK_AUTHTOKEN: "fixture-token" },
      request: async () => ({
        ok: true,
        json: async () => ({ status: "ok", time: new Date().toISOString(), version: "3.0.0" }),
      }),
      load: async () => ({
        forward: async () => ({
          url: () => "http://fixture.invalid",
          close: async () => {
            closed++;
          },
        }),
      }),
      log: () => {},
    }),
    /HTTPS/,
  );
  assert.equal(closed, 2);
});
test("public Host and HTTPS Origin work for login and CSRF without rewriting Host or exposing insecure cookies", async (t) => {
  const db = await createTestDatabase();
  let app;
  const old = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = "true";
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
    if (old === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = old;
  });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  await createAuth(db.pool).ensureAdmin({
    name: "Ngrok fixture",
    email: "ngrok@example.test",
    phone: "0987654321",
    password: "Ngrok-Fixture-Only-2026!",
  });
  const base = `http://127.0.0.1:${app.address().port}`,
    host = "fixture.ngrok-free.app";
  const response = await hostRequest(base + "/api/auth/login", {
    method: "POST",
    headers: {
      Host: host,
      Origin: "https://" + host,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: "ngrok@example.test",
      password: "Ngrok-Fixture-Only-2026!",
    }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /HttpOnly/);
  const auth = await response.json();
  const saved = await hostRequest(base + "/api/admin/warehouses", {
    method: "POST",
    headers: {
      Host: host,
      Origin: "https://" + host,
      Cookie: cookie.split(";")[0],
      "X-CSRF-Token": auth.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Kho ngrok fixture" }),
  });
  assert.equal(saved.status, 201);
  const denied = await hostRequest(base + "/api/admin/warehouses", {
    method: "POST",
    headers: {
      Host: host,
      Origin: "https://other.example.test",
      Cookie: cookie.split(";")[0],
      "X-CSRF-Token": auth.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Không được phép" }),
  });
  assert.equal(denied.status, 403);
});
