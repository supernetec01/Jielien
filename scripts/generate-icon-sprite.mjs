import { readFile, writeFile } from "node:fs/promises";
import { paths } from "../public/ui-icons.js";
const file = new URL("../public/index.html", import.meta.url);
const html = await readFile(file, "utf8");
const sprite =
  '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' +
  Object.entries(paths)
    .map(
      ([name, path]) =>
        `<symbol id="i-${name}" viewBox="0 0 24 24">${path}</symbol>`,
    )
    .join("") +
  "</svg>";
if (!html.includes('href="#i-')) {
  console.log('V3 renders SVG paths directly from ui-icons.js; no static sprite is needed.');
  process.exit(0);
}
const replaced = html.replace(
  /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" style="display:none" aria-hidden="true">[\s\S]*?<\/svg>/,
  () => sprite,
);
if (replaced === html && !html.includes(sprite))
  throw new Error("Static icon sprite marker not found");
await writeFile(file, replaced);
