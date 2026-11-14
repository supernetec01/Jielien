// Use the real accordion controls before following the existing view link.
export async function openAdminView(page, id) {
  const nav = page.locator('#workspace-navigation');
  const link = nav.locator(`[data-section="${id}"]`);
  await link.waitFor({ state: 'attached' });
  const menu = page.locator('#admin-menu-toggle');
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
  await page.locator('#admin-nav-search').fill('');
  const folder = link.locator('xpath=ancestor::section[contains(@class,"navigation-group")]').locator('.navigation-folder');
  if (await folder.count() && await folder.getAttribute('aria-expanded') !== 'true') await folder.click();
  await link.click();
  await page.locator('#admin-content[aria-busy="true"]').waitFor({ state: 'hidden' });
}
