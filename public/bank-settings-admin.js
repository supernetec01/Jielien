import { icon } from "/ui-icons.js";

export function createBankSettingsEditor({ root, api, has, escape: e, notify }) {
  let current;
  const endpoint = "/api/admin/settings/bank-transfer";
  async function render() {
    current = await api(endpoint);
    const { settings, available, saved } = current;
    const writable = has("settings.write");
    const field = (label, name, extra = "") => `<label>${label}<input name="${name}" value="${e(settings[name] || "")}" maxlength="${name === "accountNumber" ? 30 : 100}" ${settings.enabled ? "required" : ""} ${writable ? "" : "disabled"} ${extra}></label>`;
    return `<div class="view-heading"><div><h1>Tài khoản nhận tiền</h1><p>Cập nhật tài khoản nhận chuyển khoản cho các đơn hàng mới.</p></div></div>
      <div class="company-layout bank-settings-layout"><section class="panel"><h2>Thông tin ngân hàng</h2>
      <p class="information-note" role="status">${available ? "Đang bật thanh toán chuyển khoản." : "Đang tắt thanh toán chuyển khoản. Bạn có thể lưu thông tin chưa hoàn chỉnh để bổ sung sau."}</p>
      <form id="bank-settings-form" class="editor-form bank-settings-form">
        ${field("Tên ngân hàng", "bankName", 'autocomplete="off" placeholder="Tên ngân hàng nhận tiền"')}
        ${field("Mã ngân hàng VietQR (6 chữ số)", "bankBin", 'inputmode="numeric" pattern="[0-9]{6}" placeholder="Chưa có — bổ sung sau" aria-describedby="bank-bin-help"')}
        ${field("Số tài khoản", "accountNumber", 'inputmode="numeric" pattern="[0-9]{6,30}" autocomplete="off"')}
        ${field("Tên chủ tài khoản", "accountName", 'autocomplete="off" placeholder="Tên chủ tài khoản tại ngân hàng"')}
        <p id="bank-bin-help" class="editor-note">Mã ngân hàng VietQR khác mã chi nhánh và số tài khoản. Nếu chưa xác nhận được mã này, để trống và giữ chuyển khoản ở trạng thái tắt.</p>
        <label class="bank-toggle"><input type="checkbox" name="enabled" ${settings.enabled ? "checked" : ""} ${writable ? "" : "disabled"}><span>Bật thanh toán chuyển khoản cho đơn mới</span></label>
        <div class="form-actions">${writable ? '<button type="submit" class="primary">Lưu tài khoản nhận tiền</button><button type="button" class="secondary" data-bank-reload>Hủy chỉnh sửa</button>' : '<p>Bạn có quyền xem. Cần quyền quản lý cấu hình để chỉnh sửa.</p>'}</div>
        <p id="bank-settings-error" class="form-error" role="alert"></p>
      </form></section>
      <aside class="panel company-guide">${icon("shield")}<h2>Thông tin đã lưu</h2>
        <p>${saved ? "Đang dùng cấu hình đã lưu trong Admin." : "Chưa lưu cấu hình trong Admin; đang đọc cấu hình ban đầu của máy chủ."}</p>
        <dl class="summary-list">${[["Ngân hàng", settings.bankName], ["Số tài khoản", settings.accountNumber], ["Chủ tài khoản", settings.accountName], ["Mã ngân hàng", settings.bankBin]].map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value || "Chưa bổ sung")}</dd></div>`).join("")}</dl>
        <p>Thay đổi chỉ áp dụng cho đơn tạo sau khi lưu. Thông tin và mã QR của đơn cũ được giữ nguyên.</p>
        <p>Chỉ bật khi đã kiểm tra đúng tài khoản nhận tiền. Không nhập mật khẩu ngân hàng hoặc khóa API ở màn hình này.</p>
      </aside></div>`;
  }
  root.addEventListener("change", event => {
    if (!event.target.matches('#bank-settings-form [name="enabled"]')) return;
    for (const input of root.querySelectorAll('#bank-settings-form input:not([type="checkbox"])')) input.required = event.target.checked;
  });
  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-bank-reload]");
    if (!button || button.disabled) return;
    const form = root.querySelector("#bank-settings-form");
    button.disabled = true;
    try {
      const html = await render();
      if (form.isConnected) root.querySelector("#admin-content").innerHTML = html;
    } catch {
      if (form.isConnected) form.querySelector("#bank-settings-error").textContent = "Chưa tải lại được thông tin. Vui lòng thử lại.";
    } finally { if (button.isConnected) button.disabled = false; }
  });
  root.addEventListener("submit", async event => {
    const form = event.target;
    if (form.getAttribute("id") !== "bank-settings-form") return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (!has("settings.write") || button.disabled || !form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    button.disabled = true;
    const cancel = form.querySelector("[data-bank-reload]");
    cancel.disabled = true;
    form.querySelector("#bank-settings-error").textContent = "";
    try {
      const result = await api(endpoint, { method: "PATCH", body: { ...data, enabled: data.enabled === "on", version: current.version } });
      current = result;
      if (form.isConnected) {
        const html = await render();
        if (form.isConnected) root.querySelector("#admin-content").innerHTML = html;
      }
      notify(result.available ? "Đã lưu và bật thanh toán chuyển khoản cho đơn mới." : "Đã lưu thông tin. Thanh toán chuyển khoản đang tắt.");
    } catch (error) {
      if (form.isConnected) form.querySelector("#bank-settings-error").textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
      if (cancel.isConnected) cancel.disabled = false;
    }
  });
  return { render };
}
