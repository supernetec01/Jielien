let timer;
export function transferTimingMarkup(order, escape) {
  const due = order.paymentExpiresAt;
  return due ? `<p class="notice">Hạn thanh toán: <b>${escape(new Date(due).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}</b> (giờ Việt Nam). <span data-payment-countdown="${escape(due)}"></span></p>` : '<p class="notice">Cửa hàng chưa bật tự hủy đơn quá hạn. Vui lòng chuyển khoản và liên hệ cửa hàng để được đối soát.</p>';
}
export function stopTransferTimers() { clearInterval(timer); timer = undefined; }
export function startTransferTimers() {
  stopTransferTimers();
  const update = () => {
    document.querySelectorAll("[data-payment-countdown]").forEach(label => {
      const remaining = new Date(label.dataset.paymentCountdown).getTime() - Date.now();
      const minutes = Math.ceil(remaining / 60000);
      label.textContent = remaining > 0 ? `Còn ${minutes >= 60 ? `${Math.floor(minutes/60)} giờ ${minutes%60} phút` : `${minutes} phút`}.` : "Đã hết hạn. Không chuyển thêm tiền; nếu đã chuyển, liên hệ cửa hàng để xử lý hoàn tiền hoặc tạo lại đơn.";
      if (remaining <= 0) {
        const panel = label.closest(".transfer-panel");
        if (panel?.querySelector(".transfer-qr")) panel.querySelector(".transfer-qr").hidden = true;
        panel?.querySelectorAll("[data-copy-transfer], [data-transfer-notice]").forEach(button => { button.disabled = true; button.dataset.expired = "true"; });
      }
    });
    document.querySelectorAll("[data-transfer-notice]").forEach(button => {
      if (button.dataset.expired === "true" || button.dataset.busy === "true") return;
      const wait = new Date(button.dataset.nextAllowed || 0).getTime() - Date.now();
      button.disabled = wait > 0;
      button.textContent = wait > 0 ? `Đã báo nhân viên · chờ ${Math.ceil(wait / 60000)} phút để gửi lại` : "Tôi đã chuyển khoản";
    });
  };
  update();
  if (document.querySelector("[data-payment-countdown], [data-transfer-notice]")) timer = setInterval(update, 1000);
}
window.addEventListener("pagehide", stopTransferTimers);
