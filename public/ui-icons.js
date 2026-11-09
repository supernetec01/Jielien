// Shared local SVG paths.
export const paths = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  bag: '<path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  home: '<path d="m3 10 9-8 9 8v11h-7v-7h-4v7H3Z"/>',
  book: '<path d="M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  chart: '<path d="M4 3v17h17M9 16v-5M14 16V6M19 16V9"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 4 3-1 1-3 3-1 2-3-2-2 1-4-3-2-3 1-2-4Z"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  receipt: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3ZM8 7h8M8 11h8M8 15h5"/>',
  cart: '<path d="M2 3h3l3 13h11l3-9H6M9 21h.01M18 21h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  phone: '<path d="m5 3 4 4-2 3a16 16 0 0 0 7 7l3-2 4 4-2 3C10 22 2 14 2 5Z"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9H3l1-6a9 9 0 1 1 17-3ZM8 10h8M8 14h5"/>',
  warehouse: '<path d="m2 8 10-5 10 5v13H2ZM7 21V11h10v10M7 15h10M7 18h10"/>',
  alert: '<path d="m12 3 10 18H2ZM12 9v5M12 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',
  percent:
    '<path d="m5 19 14-14"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
  return: '<path d="m8 3-5 5 5 5M3 8h11a7 7 0 0 1 0 14h-3"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 12l3 3 5-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>',
  news: '<path d="M3 3h18v18H3ZM7 7h4v4H7ZM14 7h3M14 11h3M7 15h10M7 18h10"/>',
  log: '<path d="M4 3h16v18H4ZM8 7h8M8 12h8M8 17h5"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  truck:
    '<path d="M2 4h12v13H2ZM14 9h4l4 5v3h-8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
};
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icon = (name, { size = 20, className = "", label } = {}) =>
  `<svg class="ui-icon ${safe(className)}" width="${Number(size) || 20}" height="${Number(size) || 20}" viewBox="0 0 24 24" fill="${name === "heart-filled" ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${safe(label)}"` : 'aria-hidden="true"'}>${paths[name === "heart-filled" ? "heart" : name] || paths.grid}</svg>`;
