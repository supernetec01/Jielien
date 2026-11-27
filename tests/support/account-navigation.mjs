export async function clickAccountNav(page, selector) {
  const menu = page.locator("#account-menu");
  await menu.waitFor({ state: "attached" });
  if (await menu.isVisible() && await menu.getAttribute("aria-expanded") === "false")
    await menu.click();
  await page.locator(selector).click();
}
