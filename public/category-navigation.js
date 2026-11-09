// Shared mouse, touch and keyboard behavior for SPA and server-rendered pages.
export function setupCategoryNavigation() {
  const trigger = document.getElementById("category-menu"),
    menu = document.getElementById("category-dropdown"),
    backdrop = document.getElementById("menu-backdrop");
  const buttons = [trigger, document.getElementById("mobile-menu")].filter(
    Boolean,
  );
  let timer,
    openedByHover = false;
  const desktop = () =>
    matchMedia("(hover: hover) and (pointer: fine) and (min-width: 901px)")
      .matches;
  function close() {
    openedByHover = false;
    clearTimeout(timer);
    menu.hidden = backdrop.hidden = true;
    buttons.forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  function open(focus = false, hover = false) {
    openedByHover = hover;
    clearTimeout(timer);
    const rect = trigger.getBoundingClientRect();
    const top = desktop()
      ? document.querySelector(".nav").getBoundingClientRect().bottom
      : document.querySelector(".site-header").getBoundingClientRect().bottom;
    menu.style.top = backdrop.style.top = `${top}px`;
    menu.style.left = desktop()
      ? `${Math.max(12, Math.min(rect.left, innerWidth - 300))}px`
      : "";
    menu.hidden = backdrop.hidden = false;
    buttons.forEach((b) => b.setAttribute("aria-expanded", "true"));
    if (focus) menu.querySelector("a")?.focus();
  }
  const toggle = () => (menu.hidden || openedByHover ? open(true) : close());
  buttons.forEach((b) => b.addEventListener("click", toggle));
  for (const el of [trigger, menu]) {
    el.addEventListener("pointerenter", (event) => {
      if (desktop() && event.pointerType !== "touch") open(false, true);
    });
    el.addEventListener("pointerleave", () => {
      if (desktop())
        timer = setTimeout(() => {
          if (
            !menu.contains(document.activeElement) &&
            document.activeElement !== trigger
          )
            close();
        }, 180);
    });
  }
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && buttons.includes(event.target)) {
      event.preventDefault();
      open(true);
    }
    if (event.key === "Escape" && !menu.hidden) {
      close();
      (desktop() ? trigger : buttons.at(-1)).focus();
    }
  });
  document.addEventListener("focusin", (event) => {
    if (!menu.contains(event.target) && !buttons.includes(event.target))
      close();
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  window.addEventListener("resize", close);
  window.addEventListener(
    "scroll",
    (event) => {
      if (event.target === document && desktop()) close();
    },
    { passive: true },
  );
  return { close, toggle };
}
