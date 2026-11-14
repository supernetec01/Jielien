import { icon } from "/ui-icons.js";
const money = (n) => Number(n).toLocaleString("vi-VN") + " ₫";
export function reportVisuals(report, escape, { dashboard = false } = {}) {
  const points = report.series || [],
    max = Math.max(1, ...points.map((p) => Number(p.gmv)));
  const previous = Number(report.previous?.gmv || 0),
    current = Number(report.gmv || 0);
  const comparison = previous
    ? `${current >= previous ? "Tăng" : "Giảm"} ${Math.abs(((current - previous) / previous) * 100).toFixed(1)}% so với kỳ trước`
    : "Chưa có giá trị đơn kỳ trước để so sánh";
  const chart =
    Number(report.orders) > 0 && points.length
      ? `<svg class="report-chart" viewBox="0 0 640 240" role="img" aria-labelledby="report-chart-title"><title id="report-chart-title">Giá trị đơn hàng theo ngày. Đọc bảng dữ liệu bên dưới để biết số chính xác.</title><path d="M40 20v180h580" fill="none" stroke="#dce4ec"/>${points
          .map((p, i) => {
            const width = 540 / points.length,
              x = 50 + i * width,
              h = (Number(p.gmv) / max) * 160;
            return `<rect x="${x}" y="${200 - h}" width="${Math.max(0.5, width - 4)}" height="${h}" rx="3" fill="#52730d" tabindex="0"><title>${escape(p.day)}: ${money(p.gmv)}, ${Number(p.orders)} đơn</title></rect>`;
          })
          .join(
            "",
          )}<text x="40" y="225" font-size="12" fill="#526479">${escape(points[0].day)}</text><text x="620" y="225" text-anchor="end" font-size="12" fill="#526479">${escape(points.at(-1).day)}</text><text x="40" y="14" font-size="12" fill="#526479">Tối đa ${money(max)}</text></svg>`
      : `<div class="workspace-empty">${icon("chart")}<h3>Chưa có đơn hàng trong kỳ</h3><p>Chọn khoảng ngày khác hoặc quay lại khi có đơn mới.</p></div>`;
  const chartCard = `<section class="panel${dashboard ? " dashboard-chart-card" : ""}"><div class="section-title"><div><h2>Giá trị đơn hàng theo ngày</h2><p>${comparison}</p></div>${icon("chart")}</div>${dashboard ? `<div class="dashboard-chart-plot">${chart}</div>` : chart}<p class="support-text">Loại trừ đơn hủy. Ngày theo giờ Việt Nam; không phải tiền đã thu hay lợi nhuận.</p>${points.length ? `<details><summary>Xem dữ liệu biểu đồ</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Ngày</th><th>Số đơn</th><th>Giá trị đơn</th></tr></thead><tbody>${points.map((p) => `<tr><td>${escape(p.day)}</td><td class="numeric">${Number(p.orders)}</td><td class="numeric">${money(p.gmv)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}</section>`;
  const topCard = `<section class="panel${dashboard ? " dashboard-products-card" : ""}"><h2>Sản phẩm bán nhiều</h2>${report.topSkus?.length ? `<ol class="dashboard-list"${dashboard ? ' tabindex="0" aria-label="Sản phẩm bán nhiều, cuộn để xem thêm"' : ""}>${report.topSkus.map((p) => `<li><div><b>${escape(p.name)}</b><small>${escape(p.sku)}</small></div><div>${Number(p.quantity)} sản phẩm<small>${money(p.revenue)}</small></div></li>`).join("")}</ol>` : '<p class="muted">Chưa có sản phẩm bán trong kỳ.</p>'}<p class="support-text">Giá trị dòng hàng trước ưu đãi cấp đơn, chưa gồm phí giao hàng.</p></section>`;
  const statusCard = `<section class="panel${dashboard ? " dashboard-status-card" : ""}"><h2>Trạng thái đơn hàng</h2><ul class="dashboard-list"${dashboard ? ' tabindex="0" aria-label="Trạng thái đơn hàng, cuộn để xem thêm"' : ""}>${(report.byStatus || []).map((s) => `<li><span>${escape({ pending: "Chờ xác nhận", confirmed: "Đã xác nhận", processing: "Đang chuẩn bị", shipped: "Đang giao", delivered: "Đã giao", cancelled: "Đã hủy" }[s.status] || s.status)}</span><b>${Number(s.count)}</b></li>`).join("") || "<li>Chưa có đơn hàng trong kỳ.</li>"}</ul><p class="support-text">Tỷ lệ hủy: ${Number(report.orders) ? ((Number(report.byStatus?.find((s) => s.status === "cancelled")?.count || 0) / Number(report.orders)) * 100).toFixed(1) : "0"}%.</p></section>`;
  if (!dashboard) return `${chartCard}<div class="insight-grid">${topCard}${statusCard}</div>`;
  return `<div class="dashboard-analysis">${chartCard}<div class="dashboard-side-cards">${statusCard}${topCard}</div></div>`;
}
