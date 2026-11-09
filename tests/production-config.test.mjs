import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionConfig } from "../scripts/check-production.mjs";
const valid = {
  SITE_DOMAIN: "shop.example.org",
  ACME_EMAIL: "operator@example.org",
  POSTGRES_PASSWORD: "a".repeat(32),
  AUTH_VERIFICATION_WEBHOOK_URL: 'https://verification.example.org/send',
  AUTH_VERIFICATION_WEBHOOK_TOKEN: 'fixture-only-not-a-real-secret',
};
test("public deployment configuration rejects unsafe or incomplete prerequisites without exposing credentials", () => {
  assert.deepEqual(validateProductionConfig(valid), []);
  for (const patch of [
    { SITE_DOMAIN: "http://localhost:3001" },
    { AUTH_VERIFICATION_WEBHOOK_URL: '' },
    { AUTH_VERIFICATION_WEBHOOK_TOKEN: '' },
    { AUTH_VERIFICATION_WEBHOOK_URL: 'http://verification.example.org/send' },
    { SITE_DOMAIN: "shop.example.test" },
    { SITE_DOMAIN: "example.org/path" },
    { POSTGRES_PASSWORD: "short" },
    { POSTGRES_PASSWORD: "secret:with@url.syntax" },
    { JIELIEN_DEMO_DATA: "true" },
    { COOKIE_SECURE: "false" },
    { BANK_BIN: "970436" },
    {
      BANK_BIN: "970436",
      BANK_NAME: "Test bank",
      BANK_ACCOUNT_NUMBER: "bad",
      BANK_ACCOUNT_NAME: "Test recipient",
    },
  ])
    assert.ok(validateProductionConfig({ ...valid, ...patch }).length);
  const secret = "secret-must-not-appear";
  assert.ok(
    !JSON.stringify(
      validateProductionConfig({ ...valid, POSTGRES_PASSWORD: secret }),
    ).includes(secret),
  );
});
