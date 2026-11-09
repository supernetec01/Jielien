import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutKey } from "../public/checkout-key.js";

test("secure context may use native randomUUID", () => {
  assert.equal(createCheckoutKey({ randomUUID: () => "native-uuid" }), "native-uuid");
});

test("HTTP LAN without randomUUID uses 128-bit getRandomValues", () => {
  const cryptoSource = {
    getRandomValues(bytes) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = i;
      return bytes;
    },
  };
  assert.equal(createCheckoutKey(cryptoSource), "000102030405060708090a0b0c0d0e0f");
});

test("fallback keys are unique and valid server idempotency keys", () => {
  const provider = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const keys = new Set(Array.from({ length: 200 }, () => createCheckoutKey(provider)));
  assert.equal(keys.size, 200);
  for (const key of keys) assert.match(key, /^[a-f0-9]{32}$/);
});

test("no insecure Math.random fallback for order ids", () => {
  assert.throws(() => createCheckoutKey({}), /không hỗ trợ tạo mã đơn hàng an toàn/);
});
