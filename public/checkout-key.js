/**
 * Create a cryptographically random idempotency key for an order.
 *
 * crypto.randomUUID() is exposed only in secure browser contexts. The Web
 * Crypto getRandomValues() method is also supported on HTTP LAN addresses;
 * generate an unpredictable 128-bit key when randomUUID is unavailable.
 *
 * Never use Math.random() for order idempotency.
 */
export function createCheckoutKey(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  if (typeof cryptoSource?.getRandomValues !== "function") {
    throw new Error(
      "Trình duyệt không hỗ trợ tạo mã đơn hàng an toàn. Hãy sử dụng trình duyệt mới hoặc mở website qua HTTPS.",
    );
  }
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
