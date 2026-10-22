// NAPAS VietQR account transfer payload, generated locally (no bank data sent to a QR API).
// EMVCo tags are byte-length-prefixed. The CRC covers the entire payload including 6304.
export function crc16CCITT(value) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function tlv(tag, value) {
  const text = String(value),
    length = Buffer.byteLength(text, "utf8");
  if (!/^\d{2}$/.test(tag) || length > 99)
    throw new Error("Invalid VietQR field.");
  return tag + String(length).padStart(2, "0") + text;
}
export function buildVietQr({ bankBin, accountNumber, amount, reference }) {
  if (!/^\d{6}$/.test(bankBin || "") || !/^\d{6,30}$/.test(accountNumber || ""))
    throw new Error("Invalid VietQR receiving account.");
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 9_999_999_999_999
  )
    throw new Error(
      "VietQR amount must be positive integral VND with at most 13 digits.",
    );
  if (
    typeof reference !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9 -]{0,24}$/.test(reference)
  )
    throw new Error("Invalid VietQR transfer reference.");
  const beneficiary = tlv("00", bankBin) + tlv("01", accountNumber);
  const merchant =
    tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  const payload =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("38", merchant) +
    tlv("53", "704") +
    tlv("54", amount) +
    tlv("58", "VN") +
    tlv("62", tlv("08", reference)) +
    "6304";
  return payload + crc16CCITT(payload);
}
function safeLabel(value, minimum, maximum) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= minimum &&
    text.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(text)
    ? text
    : null;
}
export function normalizeBankConfig(config) {
  if (!config || config.enabled === false)
    return { enabled: false, reason: "not_configured" };
  const bankBin =
    typeof config.bankBin === "string" ? config.bankBin.trim() : "";
  const accountNumber =
    typeof config.accountNumber === "string" ? config.accountNumber.trim() : "";
  const bankName = safeLabel(config.bankName, 2, 100);
  const accountName = safeLabel(config.accountName, 2, 100);
  if (!bankBin && !accountNumber && !bankName && !accountName)
    return { enabled: false, reason: "not_configured" };
  if (
    !/^\d{6}$/.test(bankBin) ||
    !/^\d{6,30}$/.test(accountNumber) ||
    !bankName ||
    !accountName
  )
    return { enabled: false, reason: "invalid_configuration" };
  return { enabled: true, bankBin, bankName, accountNumber, accountName };
}
export function readBankConfig(env = process.env) {
  return normalizeBankConfig({
    bankBin: env.BANK_BIN,
    bankName: env.BANK_NAME,
    accountNumber: env.BANK_ACCOUNT_NUMBER,
    accountName: env.BANK_ACCOUNT_NAME,
  });
}
