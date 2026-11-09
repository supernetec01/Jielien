// SSR pages retain their rendered article and SEO metadata; only navigation is enhanced.
const menu = document.querySelector("#category-dropdown"),
  button = document.querySelector("#mobile-menu");
button?.addEventListener("click", () => {
  const open = menu.hidden;
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector("a")?.focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu && !menu.hidden) {
    menu.hidden = true;
    button?.focus();
  }
});
try {
  const cart = JSON.parse(localStorage.getItem("jielien-cart-v2") || "{}");
  const badge = document.querySelector("#cart-count");
  if (badge)
    badge.textContent = Object.values(cart)
      .filter(Number.isInteger)
      .reduce((a, b) => a + b, 0);
} catch {
  /* Rendering and navigation do not require local storage. */
}
