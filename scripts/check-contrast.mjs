// WCAG 2 relative luminance, independent of screenshots or monitor settings.
import assert from "node:assert/strict";
const luminance = (hex) => {
  const rgb = hex
    .replace("#", "")
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const pairs = [
  ["CTA navy / green", "#0B1B34", "#86B529"],
  ["Body / surface", "#0B1B34", "#FFFFFF"],
  ["Muted / surface", "#55627A", "#FFFFFF"],
  ["Muted / canvas", "#55627A", "#F6F8FB"],
  ["Green link / surface", "#52730D", "#FFFFFF"],
  ["Danger / surface", "#b91c1c", "#FFFFFF"],
  ["Success / surface", "#166534", "#FFFFFF"],
  ["Warning / surface", "#92400e", "#FFFFFF"],
];
for (const [label, fg, bg] of pairs) {
  const a = luminance(fg),
    b = luminance(bg),
    ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  console.log(`${label}: ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, `${label} must meet AA for normal text`);
}
