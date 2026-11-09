export function createWarehouseEditor({ root, api, has, escape: e, notify }) {
  let selected = "",
    data = { warehouses: [], variants: [], items: [] },
    editId = "";
  const money = (n) => Number(n).toLocaleString("vi-VN") + " ₫";
  async function render() {
    data = await api(
      "/api/admin/warehouses" + (selected ? "/" + selected : ""),
    );
    if (!selected && data.warehouses.length) {
      selected = String(data.warehouses[0].id);
      return render();
    }
    const warehouse = data.warehouses.find((w) => String(w.id) === selected);
    const productIds = [...new Set(data.variants.map((v) => v.product_id))];
    return `<div class="warehouse-workbench"><div class="page-heading"><div><span class="page-eyebrow">QUẢN LÝ NHIỀU KHO</span><h1>Kho · Sản phẩm · SKU · Giá</h1><p>Mỗi SKU thuộc một sản phẩm. Tồn và giá bán được quản lý riêng tại từng kho.</p></div></div><div class="warehouse-cards">${data.warehouses.map((w) => `<button class="warehouse-card ${String(w.id) === selected ? "active" : ""}" data-warehouse-select="${w.id}" aria-pressed="${String(w.id) === selected}"><b>${e(w.name)}</b><small>${w.type === "damaged" ? "Kho hư hỏng · không bán" : "Kho bán hàng"}</small></button>`).join("")}</div><p id="warehouse-error" class="form-error" role="alert"></p>${has("inventory.manage") ? `<details class="panel"><summary>Thêm kho mới / sửa tên kho đang chọn</summary><form id="warehouse-form" class="editor-form"><label>Tên kho<input name="name" required minlength="2" maxlength="150"></label><label>Loại kho<select name="type"><option value="normal">Kho bán hàng</option><option value="damaged">Kho hư hỏng</option></select></label><div class="form-actions"><button class="primary">Tạo kho mới</button>${warehouse ? `<button type="button" class="secondary" data-warehouse-rename>Sửa tên ${e(warehouse.name)}</button>` : ""}</div></form></details>` : ""}${warehouse ? `<section class="panel"><div class="section-title"><h2>${e(warehouse.name)}</h2><span>${data.items.length} SKU tại kho</span></div>${has("inventory.manage") ? `<details class="warehouse-product-tools"><summary>Xóa toàn bộ một sản phẩm khỏi kho này</summary><div class="warehouse-product-actions"><label>Sản phẩm cần xóa khỏi kho<select id="warehouse-remove-product">${[...new Set(data.items.map((i) => i.product_id))].map((id) => `<option value="${id}">${e(data.items.find((i) => i.product_id === id).product_name)}</option>`).join("")}</select></label><button class="secondary taxonomy-delete" data-warehouse-product-remove="selected" ${!data.items.length ? "disabled" : ""}>Xóa sản phẩm khỏi kho</button></div></details>` : ""}<label class="taxonomy-search">Tìm sản phẩm / SKU trong kho<input data-warehouse-search placeholder="Nhập tên hoặc mã SKU"></label><div class="table-wrap"><table class="data-table"><thead><tr><th>Sản phẩm / SKU</th><th>Giá bán tại kho</th><th>Tồn kho</th><th>Thao tác</th></tr></thead><tbody>${data.items.map((i) => `<tr data-warehouse-row><td><b>${e(i.product_name)}</b><small class="row-description">${e(i.name)} · ${e(i.sku)}</small></td><td data-price-label="Giá bán tại kho">${money(i.price)}<small class="row-description">Trước giảm: ${money(i.original_price)}</small></td><td><div class="warehouse-stock-counts"><span><small>Tồn</small><b>${i.on_hand}</b></span><span><small>Giữ</small><b>${i.reserved}</b></span><span><small>Bán</small><b>${warehouse.type === "damaged" ? "—" : i.on_hand - i.reserved}</b></span></div></td><td>${has("inventory.manage") ? `<div class="table-actions"><button class="secondary" data-warehouse-edit="${i.variant_id}">Sửa tồn / giá</button><button class="secondary taxonomy-delete" data-warehouse-remove="${i.variant_id}">Xóa khỏi kho</button></div>` : "Chỉ xem"}</td></tr>`).join("") || '<tr><td colspan="4">Kho chưa có hàng. Chọn sản phẩm và SKU để thêm bên dưới.</td></tr>'}</tbody></table></div></section>${has("inventory.manage") ? `<section class="panel" id="warehouse-stock-panel"><h2 id="warehouse-stock-title">Thêm SKU vào kho</h2><p class="muted">Chỉ tác động kho đang chọn. Nhập tồn thực tế; không được giảm thấp hơn lượng đang giữ cho đơn.</p><form id="warehouse-stock-form" class="editor-form"><label>Sản phẩm<select name="productId" required><option value="">Chọn sản phẩm</option>${productIds.map((id) => `<option value="${id}">${e(data.variants.find((v) => v.product_id === id).product_name)}</option>`).join("")}</select></label><label>SKU của sản phẩm<select name="variantId" required><option value="">Chọn sản phẩm trước</option></select></label><label>Cách cập nhật tồn<select name="stockMode"><option value="set">Kiểm kê: đặt tồn thực tế mới</option><option value="receive">Nhập thêm: cộng vào tồn hiện tại</option></select></label><label>Số lượng<input name="quantity" type="number" required min="0" max="1000000" value="0"></label><label>Giá bán tại kho (₫)<input name="price" type="number" required min="0"></label><label>Giá trước giảm tại kho (₫)<input name="originalPrice" type="number" required min="0"></label><label>Lý do / chứng từ<input name="reason" required minlength="3" maxlength="500"></label><div class="form-actions"><button class="primary">Lưu vào kho</button><button type="button" class="secondary" data-warehouse-cancel>Hủy / thêm SKU khác</button></div></form></section>` : ""}` : '<p class="panel">Chưa có kho. Tạo kho đầu tiên để quản lý hàng hóa.</p>'}</div>`;
  }
  async function refresh() {
    root.querySelector("#admin-content").innerHTML = await render();
  }
  const error = (err) => {
    const el = root.querySelector("#warehouse-error");
    if (el) {
      el.textContent = err.message;
      el.scrollIntoView({ block: "center" });
    } else notify(err.message);
  };
  function fillSkus(productId) {
    const form = root.querySelector("#warehouse-stock-form");
    form.elements.variantId.innerHTML =
      '<option value="">Chọn SKU</option>' +
      data.variants
        .filter((v) => String(v.product_id) === String(productId))
        .map(
          (v) => `<option value="${v.id}">${e(v.name)} · ${e(v.sku)}</option>`,
        )
        .join("");
  }
  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-warehouse-search]"))
      root
        .querySelectorAll("[data-warehouse-row]")
        .forEach(
          (row) =>
            (row.hidden = !row.textContent
              .toLocaleLowerCase("vi")
              .includes(event.target.value.toLocaleLowerCase("vi"))),
        );
  });
  root.addEventListener("change", (event) => {
    if (!event.target.closest("#warehouse-stock-form")) return;
    const f = event.target.form;
    if (event.target.name === "stockMode") {
      f.elements.quantity.value =
        event.target.value === "receive"
          ? ""
          : (data.items.find((i) => String(i.variant_id) === editId)?.on_hand ??
            0);
      f.elements.quantity.min = event.target.value === "receive" ? "1" : "0";
    }
    if (event.target.name === "productId") fillSkus(event.target.value);
    if (event.target.name === "variantId") {
      const v = data.variants.find((v) => String(v.id) === event.target.value);
      if (v) {
        f.elements.price.value = v.price;
        f.elements.originalPrice.value = v.original_price ?? v.price;
      }
    }
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest(
      "[data-warehouse-select],[data-warehouse-edit],[data-warehouse-remove],[data-warehouse-cancel],[data-warehouse-rename],[data-warehouse-product-remove]",
    );
    if (!button) return;
    try {
      if (button.dataset.warehouseProductRemove) {
        const productId = Number(
            root.querySelector("#warehouse-remove-product").value,
          ),
          items = data.items.filter((i) => i.product_id === productId);
        if (
          !confirm(
            `Xóa sản phẩm này cùng ${items.length} SKU và tồn của chúng khỏi kho đang chọn? Các kho khác được giữ nguyên.`,
          )
        )
          return;
        const reason = prompt("Lý do xóa sản phẩm khỏi kho:");
        if (reason === null) return;
        await api(`/api/admin/warehouses/${selected}/products/${productId}`, {
          method: "DELETE",
          body: {
            reason,
            versions: items.map((i) => ({
              variantId: i.variant_id,
              version: i.row_version,
            })),
          },
        });
        editId = "";
        await refresh();
        return;
      }

      if (button.dataset.warehouseSelect) {
        selected = button.dataset.warehouseSelect;
        editId = "";
        await refresh();
        return;
      }
      if (button.hasAttribute("data-warehouse-cancel")) {
        editId = "";
        await refresh();
        return;
      }
      if (button.hasAttribute("data-warehouse-rename")) {
        const f = root.querySelector("#warehouse-form");
        await api("/api/admin/warehouses/" + selected, {
          method: "PATCH",
          body: {
            name: f.elements.name.value,
            type: data.warehouses.find((w) => String(w.id) === selected).type,
          },
        });
        await refresh();
        return;
      }
      const item = data.items.find(
        (i) =>
          String(i.variant_id) ===
          (button.dataset.warehouseEdit || button.dataset.warehouseRemove),
      );
      if (button.dataset.warehouseEdit) {
        editId = String(item.variant_id);
        const f = root.querySelector("#warehouse-stock-form");
        f.elements.productId.value = item.product_id;
        fillSkus(item.product_id);
        f.elements.variantId.value = item.variant_id;
        f.elements.productId.disabled = f.elements.variantId.disabled = true;
        f.elements.stockMode.value = "set";
        f.elements.quantity.min = "0";
        f.elements.quantity.value = item.on_hand;
        f.elements.price.value = item.price;
        f.elements.originalPrice.value = item.original_price;
        f.elements.reason.value = "";
        root.querySelector("#warehouse-stock-title").textContent =
          "Sửa " + item.sku + " tại kho";
        f.scrollIntoView({ block: "center" });
        return;
      }
      if (
        !confirm(
          `Xóa ${item.sku} khỏi kho này và đưa tồn ${item.on_hand} về 0? Không ảnh hưởng kho khác. Lịch sử được giữ lại.`,
        )
      )
        return;
      const reason = prompt("Lý do xóa khỏi kho (ít nhất 3 ký tự):");
      if (reason === null) return;
      await api(`/api/admin/warehouses/${selected}/skus/${item.variant_id}`, {
        method: "DELETE",
        body: { reason, version: item.row_version },
      });
      editId = "";
      await refresh();
    } catch (err) {
      error(err);
    }
  });
  root.addEventListener("submit", async (event) => {
    const f = event.target;
    if (
      !["warehouse-form", "warehouse-stock-form"].includes(f.getAttribute("id"))
    )
      return;
    event.preventDefault();
    const button = f.querySelector("button.primary");
    button.disabled = true;
    try {
      if (f.id === "warehouse-form") {
        const result = await api("/api/admin/warehouses", {
          method: "POST",
          body: Object.fromEntries(new FormData(f)),
        });
        selected = String(result.warehouse.id);
      } else {
        const v = editId || f.elements.variantId.value;
        const item = data.items.find((i) => String(i.variant_id) === editId);
        await api(`/api/admin/warehouses/${selected}/skus/${v}`, {
          method: editId ? "PUT" : "POST",
          body: {
            quantity: Number(f.elements.quantity.value),
            mode: f.elements.stockMode.value,
            price: Number(f.elements.price.value),
            originalPrice: Number(f.elements.originalPrice.value),
            reason: f.elements.reason.value,
            version: item?.row_version,
          },
        });
      }
      editId = "";
      await refresh();
      notify("Đã lưu kho và hàng hóa.");
    } catch (err) {
      error(err);
    } finally {
      button.disabled = false;
    }
  });
  return { render };
}
