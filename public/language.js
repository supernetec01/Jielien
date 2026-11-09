import { zh } from "./locale-zh.js";
const key = "jielien-language";
let language = "vi";
try {
  if (localStorage.getItem(key) === "zh-CN") language = "zh-CN";
} catch {}
const originals = new WeakMap();
const attributes = new WeakMap();
const excluded =
  "script,style,noscript,input,textarea,code,pre,[contenteditable],[data-no-translate],.product-info h3,.product-brand,.sku-note,.article-body";
function translated(value) {
  const trimmed = value.trim();
  return language === "zh-CN" && zh[trimmed]
    ? value.replace(trimmed, zh[trimmed])
    : value;
}
function apply() {
  observer.disconnect();
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement || node.parentElement.closest(excluded)) continue;
    const previous = originals.get(node);
    // A renderer may reuse a node for a different message. Preserve that new source.
    const source =
      previous && node.data === previous.rendered ? previous.source : node.data;
    const rendered = translated(source);
    if (rendered !== node.data) node.data = rendered;
    originals.set(node, { source, rendered });
  }
  document
    .querySelectorAll("[placeholder],[aria-label],[title]")
    .forEach((el) => {
      if (el.closest("[data-no-translate]")) return;
      const previous = attributes.get(el) || {};
      for (const name of ["placeholder", "aria-label", "title"]) {
        if (!el.hasAttribute(name)) continue;
        const current = el.getAttribute(name),
          old = previous[name];
        const source = old && old.rendered === current ? old.source : current;
        const rendered = translated(source);
        if (current !== rendered) el.setAttribute(name, rendered);
        previous[name] = { source, rendered };
      }
      attributes.set(el, previous);
    });
  document
    .querySelectorAll("[data-language-select]")
    .forEach((el) => (el.value = language));
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "aria-label", "title"],
  });
}
let queued = false;
const observer = new MutationObserver(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    apply();
  });
});
const control = document.createElement("label");
control.className = "language-switch";
control.setAttribute("data-no-translate", "");
control.innerHTML =
  '<span aria-hidden="true">文 / A</span><select data-language-select aria-label="Ngôn ngữ / 语言"><option value="vi">Tiếng Việt</option><option value="zh-CN">简体中文</option></select>';
(
  document.querySelector(".topline-content") ||
  document.querySelector(".header-row")
).append(control);
control.querySelector("select").addEventListener("change", (event) => {
  language = event.target.value;
  try {
    localStorage.setItem(key, language);
  } catch {}
  apply();
});
window.addEventListener("storage", (event) => {
  if (event.key === key) {
    language = event.newValue === "zh-CN" ? "zh-CN" : "vi";
    apply();
  }
});
apply();
