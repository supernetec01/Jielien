// SSR articles retain their complete HTML. This module only enhances the public chrome.
import { icon } from "./ui-icons.js";
import { hydratePublicShell } from "./v3-storefront.js";
document
  .querySelectorAll("[data-v3-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.v3Icon)));
const menu = document.getElementById("category-dropdown"),
  backdrop = document.getElementById("menu-backdrop");
function close() {
  menu.hidden = true;
  backdrop.hidden = true;
  document
    .querySelectorAll('[aria-controls="category-dropdown"]')
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
}
for (const id of ["category-menu", "mobile-menu"])
  document.getElementById(id)?.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    backdrop.hidden = !open;
    document
      .querySelectorAll('[aria-controls="category-dropdown"]')
      .forEach((b) => b.setAttribute("aria-expanded", String(open)));
  });
backdrop?.addEventListener("click", close);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") close();
});
const search = document.getElementById("search-form");
search.action = "/san-pham";
search.method = "GET";
document.getElementById("search").name = "q";
try {
  const [categories, site] = await Promise.all([
    fetch("/api/categories").then((r) => r.json()),
    fetch("/api/site").then((r) => r.json()),
  ]);
  hydratePublicShell(categories.categories || [], site);
} catch {
  /* Server-rendered content and navigation remain readable. */
}
try {
  const cart = JSON.parse(localStorage.getItem("jielien-cart-v2") || "{}");
  document.getElementById("cart-count").textContent = Object.values(cart)
    .filter(Number.isInteger)
    .reduce((n, q) => n + q, 0);
} catch {}
