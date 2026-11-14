import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
import { sanitizeEvent } from "../public/sentry-privacy.js";
import { frontendMonitoring, browserSdkUrl } from "../lib/sentry-config.mjs";
import { version, currentRelease } from "../lib/runtime.mjs";
import { setErrorReporter } from "../lib/monitoring.mjs";

const marker = () => randomBytes(20).toString("hex");
const dsn = (origin) => `${origin.replace("://", `://${marker()}@`)}/1`;

test("privacy allowlist removes personal data from errors, requests, breadcrumbs and traces", () => {
  const privateValue = marker();
  const event = {
    event_id: marker().slice(0, 32), timestamp: Date.now() / 1000, level: "error",
    user: { name: privateValue, email: privateValue, ip_address: privateValue },
    request: { url: `/api/orders/${privateValue}?token=${privateValue}`, cookies: privateValue,
      headers: { Authorization: privateValue, Cookie: privateValue },
      data: { phone: privateValue, email: privateValue, address: privateValue, name: privateValue, token: privateValue } },
    breadcrumbs: [{ message: privateValue, data: { url: privateValue } }],
    extra: { recipientName: privateValue }, tags: { phone: privateValue },
    contexts: { custom: { address: privateValue } },
    exception: { values: [{ type: privateValue, value: privateValue,
      stacktrace: { frames: [{ filename: `https://example.test/app.js?token=${privateValue}`, lineno: 10,
        function: privateValue, vars: { value: privateValue }, pre_context: [privateValue] }] } }] },
  };
  for (const path of ["/api/orders", "/api/auth/login", "/api/auth/register", "/api/account/profile"]) {
    event.request.url = path;
    const safe = sanitizeEvent(event);
    assert.ok(!JSON.stringify(safe).includes(privateValue));
    assert.equal(safe.exception.values[0].stacktrace.frames[0].filename, "app.js");
    assert.equal(safe.exception.values[0].stacktrace.frames[0].lineno, 10);
    assert.equal(safe.request, undefined);
  }
  const transaction = sanitizeEvent({ ...event, type: "transaction", transaction: privateValue,
    spans: [{ description: privateValue, data: { query: privateValue } }] });
  assert.ok(!JSON.stringify(transaction).includes(privateValue));
  assert.deepEqual(transaction.spans, []);
});

test("frontend config exposes only its own DSN; empty or unsafe DSNs disable it", () => {
  assert.equal(frontendMonitoring({}), null);
  assert.equal(frontendMonitoring({ SENTRY_DSN_FRONTEND: "not-a-url" }), null);
  const backend = marker();
  const config = frontendMonitoring({ SENTRY_DSN_BACKEND: backend,
    SENTRY_DSN_FRONTEND: dsn("https://sentry.example.test"), SENTRY_ENVIRONMENT: "test" });
  assert.ok(config.dsn.startsWith("https://"));
  assert.ok(!JSON.stringify(config).includes(backend));
  assert.equal(config.release, currentRelease({}));
});

test("server preloads instrumentation without a DSN and performs no SDK initialization", async () => {
  for (const configured of ["", marker()]) {
  const child = spawn(process.execPath, ["--import", "./instrument.mjs", "--input-type=module", "-e",
    'const Sentry = await import("@sentry/node"); if (Sentry.getClient()) process.exit(1); await import("./server.mjs");'],
    { cwd: new URL("..", import.meta.url), env: { ...process.env, SENTRY_DSN_BACKEND: configured, SENTRY_DSN_FRONTEND: "" }, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  assert.equal((await once(child, "exit"))[0], 0);
  if (configured) assert.ok(!output.includes(configured));
  }
});

test("backend SDK transport receives sanitized caught errors and no private request data", async (t) => {
  const envelopes = [];
  const receiver = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    envelopes.push(Buffer.concat(chunks).toString());
    res.writeHead(200); res.end("{}");
  });
  receiver.listen(0, "127.0.0.1"); await once(receiver, "listening");
  t.after(() => closeServer(receiver));
  const privateValue = marker();
  const child = spawn(process.execPath, ["--import", "./instrument.mjs", "--input-type=module", "-e", `
    import { reportError } from './lib/monitoring.mjs';
    import * as Sentry from '@sentry/node';
    import http from 'node:http';
    if (Sentry.getClient().getOptions().tracesSampleRate!==0.05) process.exit(1);
    Sentry.setUser({name:process.env.PRIVATE_TEST_VALUE,email:process.env.PRIVATE_TEST_VALUE});
    Sentry.setExtra('customer',process.env.PRIVATE_TEST_VALUE);
    const server=http.createServer(async(req,res)=>{
      for await (const chunk of req) {}
      reportError(new Error(process.env.PRIVATE_TEST_VALUE));
      res.writeHead(500);res.end('{}');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    for (const path of ['/api/orders','/api/auth/login']) {
      const response=await fetch('http://127.0.0.1:'+server.address().port+path+'?token='+process.env.PRIVATE_TEST_VALUE,{
        method:'POST',headers:{'Content-Type':'application/json',Cookie:process.env.PRIVATE_TEST_VALUE,
          Authorization:process.env.PRIVATE_TEST_VALUE,'sentry-trace':process.env.TEST_TRACE_HEADER},
        body:JSON.stringify({name:process.env.PRIVATE_TEST_VALUE,phone:process.env.PRIVATE_TEST_VALUE,
          email:process.env.PRIVATE_TEST_VALUE,address:process.env.PRIVATE_TEST_VALUE,token:process.env.PRIVATE_TEST_VALUE})
      });await response.text();
    }
    server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));
    if (!await Sentry.flush(5000)) process.exitCode=1;
    await Sentry.close(1000);
  `], { cwd: new URL("..", import.meta.url), env: { ...process.env,
    SENTRY_DSN_BACKEND: dsn(`http://127.0.0.1:${receiver.address().port}`), SENTRY_ENVIRONMENT: "test",
    TEST_TRACE_HEADER: `${randomBytes(16).toString("hex")}-${randomBytes(8).toString("hex")}-1`,
    PRIVATE_TEST_VALUE: privateValue }, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  assert.equal((await once(child, "exit"))[0], 0);
  assert.ok(envelopes.length > 0);
  assert.ok(!envelopes.join("").includes(privateValue));
  assert.ok(!output.includes(privateValue));
  assert.ok(envelopes.some(value => value.includes("Lỗi ứng dụng")));
  assert.ok(envelopes.some(value => value.includes('"type":"transaction"')));
  for (const code of [
    'setImmediate(()=>{throw new Error(process.env.PRIVATE_TEST_VALUE)})',
    'Promise.reject(new Error(process.env.PRIVATE_TEST_VALUE))',
  ]) {
    const count = envelopes.length;
    const fatalChild = spawn(process.execPath, ["--import", "./instrument.mjs", "--input-type=module", "-e", code], {
      cwd: new URL("..", import.meta.url), env: { ...process.env,
        SENTRY_DSN_BACKEND: dsn(`http://127.0.0.1:${receiver.address().port}`),
        PRIVATE_TEST_VALUE: privateValue }, stdio: "pipe",
    });
    let fatalOutput = "";
    fatalChild.stdout.on("data", chunk => { fatalOutput += chunk; });
    fatalChild.stderr.on("data", chunk => { fatalOutput += chunk; });
    assert.equal((await once(fatalChild, "exit"))[0], 1);
    assert.ok(envelopes.length > count);
    assert.ok(!fatalOutput.includes(privateValue));
    assert.ok(!envelopes.join("").includes(privateValue));
  }
});

test("public health checks PostgreSQL without authentication; browser stays optional", async (t) => {
  const database = await createTestDatabase();
  const captured = [];
  setErrorReporter(error => captured.push(error));
  let failHealth = false;
  const originalQuery = database.pool.query.bind(database.pool);
  database.pool.query = (...args) => {
    if (failHealth && (args[0]?.text || args[0]) === "SELECT 1") return Promise.reject(new Error(marker()));
    return originalQuery(...args);
  };
  const previous = process.env.SENTRY_DSN_FRONTEND;
  delete process.env.SENTRY_DSN_FRONTEND;
  const app = await createApp({ pool: database.pool, legacyPath: null });
  t.after(async () => {
    setErrorReporter(undefined);
    if (previous === undefined) delete process.env.SENTRY_DSN_FRONTEND;
    else process.env.SENTRY_DSN_FRONTEND = previous;
    await closeServer(app); await database.cleanup();
  });
  app.listen(0, "127.0.0.1"); await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const response = await fetch(base + "/api/health", { headers: { Cookie: `jielien_session=${marker()}` } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["status", "time", "version"]);
  assert.equal(body.status, "ok"); assert.equal(body.version, version);
  assert.ok(Number.isFinite(Date.parse(body.time)));
  failHealth = true;
  const unavailable = await fetch(base + "/api/health");
  assert.equal(unavailable.status, 503);
  assert.equal(captured.length, 1);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(await unavailable.json()).sort(), ["status", "time", "version"]);
  failHealth = false;
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal((await (await fetch(base + "/api/site")).json()).monitoring, null);
  assert.ok(!(await fetch(base)).headers.get("content-security-policy").includes("sentry-cdn"));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const sdkRequests = [];
  page.on("request", req => { if (req.url() === browserSdkUrl) sdkRequests.push(req.url()); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector("#main")?.dataset.hydrated === "true");
  await page.waitForFunction(() => performance.getEntriesByType("resource").some(entry => entry.name.endsWith("/sentry-browser.js")));
  assert.equal(await page.evaluate(() => typeof window.Sentry), "undefined");
  assert.equal(sdkRequests.length, 0);

  process.env.SENTRY_DSN_FRONTEND = dsn("https://sentry.example.test");
  // Test the browser initializer deterministically without calling the external service.
  const sdk = process.env.SENTRY_TEST_BROWSER_SDK
    ? await readFile(process.env.SENTRY_TEST_BROWSER_SDK, "utf8")
    : null;
  const sdkBody = sdk ? sdk + '\n;const realInit=window.Sentry.init;window.Sentry.init=options=>{window.__sentryOptions=options;return realInit(options)};'
    : 'window.Sentry={globalHandlersIntegration:()=>({name:"GlobalHandlers"}),init:options=>{window.__sentryOptions=options}};';
  await page.route(browserSdkUrl, route => route.fulfill({ contentType: "application/javascript", body: sdkBody }));
  const browserEnvelopes = [];
  await page.route("https://sentry.example.test/api/**", async route => {
    browserEnvelopes.push(route.request().postData() || "");
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });
  // The API now enables monitoring; a fresh server also updates its CSP allowlist.
  const enabled = await createApp({ pool: database.pool, legacyPath: null });
  enabled.listen(0, "127.0.0.1"); await once(enabled, "listening");
  t.after(() => closeServer(enabled));
  const enabledBase = `http://127.0.0.1:${enabled.address().port}`;
  const csp = (await fetch(enabledBase)).headers.get("content-security-policy");
  assert.ok(csp.includes("https://sentry.example.test"));
  assert.ok(csp.includes("https://browser.sentry-cdn.com"));
  for (const path of ["/", "/tai-khoan", "/quan-tri", "/tin-tuc"]) {
    await page.goto(enabledBase + path);
    await page.waitForFunction(() => !!window.__sentryOptions);
    const options = await page.evaluate(() => ({ replay: window.__sentryOptions.replaysSessionSampleRate,
      session: window.__sentryOptions.autoSessionTracking, defaults: window.__sentryOptions.defaultIntegrations,
      integrations: window.__sentryOptions.integrations.map(i => i.name),
      safe: window.__sentryOptions.beforeSend({ message: "private", user: { email: "private" } }) }));
    assert.equal(options.replay, undefined); assert.equal(options.session, false);
    assert.equal(options.defaults, false); assert.deepEqual(options.integrations, ["GlobalHandlers"]);
    assert.equal(options.safe.user, undefined); assert.equal(options.safe.message, undefined);
    if (sdk) {
      const privateValue = marker();
      const count = browserEnvelopes.length;
      await page.evaluate(async value => {
        window.Sentry.setUser({ name: value, email: value });
        window.Sentry.setExtra("customer", value);
        window.Sentry.captureException(new Error(value));
        await window.Sentry.flush(3000);
      }, privateValue);
      assert.ok(browserEnvelopes.length > count);
      assert.ok(!browserEnvelopes.join("").includes(privateValue));
    }
  }
  assert.equal(sdkRequests.length, 4);
  await page.route(browserSdkUrl, route => route.abort());
  await page.goto(enabledBase);
  await page.waitForFunction(() => document.querySelector("#main")?.dataset.hydrated === "true");
  assert.ok(await page.locator(".product-card").count() > 0);
});
