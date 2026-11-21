export function bankTransferPolicy(env = process.env) {
  const hours = Number(env.BANK_TRANSFER_TTL_HOURS || 24);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) throw new Error("BANK_TRANSFER_TTL_HOURS không hợp lệ.");
  return { enabled: env.ORDER_EXPIRY_ENABLED === "true", hours };
}
export function paymentDeadline(order, policy = bankTransferPolicy()) {
  if (!policy.enabled || order.payment_method !== "bank_transfer") return null;
  return new Date(order.bank_payment_due_at || new Date(order.created_at).getTime() + policy.hours * 3600000);
}
