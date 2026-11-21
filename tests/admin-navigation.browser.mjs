import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createAuth } from '../lib/auth.mjs';
import { adminNav, adminNavGroups, matchAdminNav, resolveAdminRoute, normalizeAdminSearch, adminBadge } from '../public/admin-nav.js';
import { paths } from '../public/ui-icons.js';
import { bankSettingsFixture, key } from './support/bank-settings.mjs';
import { openAdminView } from './support/admin-navigation.mjs';
const f = await bankSettingsFixture();
let browser, checks = 0;
const pass = message => console.log(`PASS ${++checks}: ${message}`);
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'jielien_session', value: f.adminSession.token, url: f.base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal(adminNav.length, 22); assert.equal(new Set(adminNav.map(i => i.href)).size, 22);
  assert.equal(adminNavGroups.length, 6); assert.equal(new Set(adminNavGroups.map(i => paths[i.icon])).size, 6);
  assert.equal(matchAdminNav('/quan-tri/don-hang/123').id, 'orders');
  assert.equal(matchAdminNav('/quan-tri/don-hang-khac'), null);
  assert.equal(matchAdminNav('/quan-tri/don-hang/123', [...adminNav, { id: 'specific', href: '/quan-tri/don-hang/123' }]).id, 'specific');
  assert.equal(resolveAdminRoute('/quan-tri/bao-cao/123'), null);
  assert.equal(normalizeAdminSearch('ĐƠN HÀNG'), 'don hang');
  assert.equal(adminBadge(0), ''); assert.equal(adminBadge(101), '99+');
  pass('shared config has 22 unique real URLs, six distinct local icons, exact overview/longest prefix matching and badge bounds');

  await page.goto(f.base + '/quan-tri'); await page.locator('.stats-grid').waitFor();
  assert.equal(await page.locator('.navigation-folder[aria-expanded="true"]').count(), 1);
  assert.equal(await page.locator('[data-navigation-group="overview"] .navigation-folder').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.navigation-children svg').count(), 0);
  assert.equal(await page.locator('.nav-badge').isVisible(), false);
  const sales = page.locator('[data-navigation-group="sales"] .navigation-folder');
  await sales.focus(); await page.keyboard.press('Space');
  assert.equal(await sales.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Enter'); assert.equal(await sales.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#nav-children-sales').evaluate(el => el.inert), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-section="orders"]').evaluate(el => el === document.activeElement), false);
  pass('only active group opens initially; Enter/Space toggle folders and closed descendants cannot receive Tab');

  const orderResult = await f.request('/api/orders', { method: 'POST', body: { ...f.order(), payment: 'cod' } });
  assert.equal(orderResult.status, 201, JSON.stringify(orderResult.body));
  const orderId = orderResult.body.order.id;
  await page.locator('#refresh-view').click();
  await page.waitForFunction(() => document.querySelector('.nav-badge')?.textContent === '1');
  const stats = (await f.request('/api/admin/dashboard')).body.stats;
  assert.equal(await page.locator('.stats-grid strong').first().textContent(), String(stats.pendingOrders));
  assert.equal(await page.locator('.nav-badge').textContent(), String(stats.pendingOrders));
  assert.equal(await page.locator('[data-navigation-group="sales"] .nav-parent-badge').isVisible(), true);
  pass('badge and dashboard KPI use the same real pending-order count; a closed parent shows its count');

  await page.keyboard.press('Control+k'); assert.equal(await page.locator('#admin-nav-search').evaluate(el => el === document.activeElement), true);
  await page.locator('#admin-nav-search').fill('don hang');
  assert.equal(await page.locator('#workspace-navigation a[data-section]:visible').count(), 1);
  assert.equal(await sales.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#admin-nav-shortcut').isVisible(), false);
  await page.keyboard.press('Escape');
  assert.equal(await sales.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#admin-nav-search').inputValue(), '');
  await page.keyboard.press('Meta+k');
  assert.equal(await page.locator('#admin-nav-search').evaluate(el => el === document.activeElement), true);
  await page.locator('#admin-nav-search').fill('khong co muc nay');
  assert.equal(await page.locator('#navigation-empty').isVisible(), true);
  await page.locator('#admin-nav-search').fill('don hang'); await page.keyboard.press('Enter');
  await page.waitForURL('**/quan-tri/don-hang'); await page.locator('#order-table-body').waitFor();
  assert.equal(await page.locator('[data-section="dashboard"]').getAttribute('aria-current'), null);
  assert.equal(await page.locator('[data-section="orders"]').getAttribute('aria-current'), 'page');
  await page.locator('#admin-nav-search').fill('');
  assert.equal(await page.locator('[data-navigation-group="overview"] .navigation-folder').getAttribute('aria-expanded'), 'true');
  pass('Ctrl/Meta K, accent-free filtering, Escape, Enter and preserved multi-open state work; overview is not active on child URLs');

  for (const item of adminNav) {
    await openAdminView(page, item.id);
    assert.equal(new URL(page.url()).pathname, item.href);
    await page.locator('#admin-content h1').waitFor();
    assert.equal(await page.locator('#admin-breadcrumb [aria-current="page"]').textContent(), item.label);
    const response = await context.request.get(f.base + item.href);
    assert.equal(response.status(), 200, item.href);
    assert.equal(response.headers()['cache-control'], 'no-store');
    assert.equal(response.headers()['x-robots-tag'], 'noindex, nofollow');
  }
  await page.reload(); await page.locator('#admin-content h1').waitFor();
  assert.equal(await page.locator('[data-section="operations-editor"]').getAttribute('aria-current'), 'page');
  await page.goBack(); await page.locator('#bank-settings-form').waitFor();
  await page.goForward(); await page.locator('#admin-content h1').waitFor();
  pass('all 22 hrefs open their existing renderers, survive server reload and browser back/forward with config-based breadcrumbs');

  await openAdminView(page, 'orders');
  await page.locator(`[data-admin-order="${orderId}"]`).click();
  const detailHref = '/quan-tri/don-hang/' + encodeURIComponent(orderId);
  await page.waitForURL(f.base + detailHref);
  assert.equal(await page.locator('#admin-breadcrumb [aria-current="page"]').textContent(), 'Chi tiết');
  assert.equal(await page.locator('#admin-breadcrumb a').nth(1).getAttribute('href'), '/quan-tri/don-hang');
  await page.reload(); await page.locator('#admin-dialog[open]').waitFor();
  assert.equal(await page.locator('[data-section="orders"]').getAttribute('aria-current'), 'page');
  await page.keyboard.press('Escape'); await page.waitForURL('**/quan-tri/don-hang');
  await page.goto(f.base + '/quan-tri?order=' + encodeURIComponent(orderId));
  await page.locator('#admin-dialog[open]').waitFor();
  assert.equal(new URL(page.url()).pathname, detailHref);
  await page.keyboard.press('Escape');
  pass('order details have reloadable URLs and parent/Chi tiết breadcrumbs; old ?order links still work and Escape restores the list URL');

  await openAdminView(page, 'dashboard');
  assert.equal(await page.locator('.workspace-location, .admin-user, .header-caption').count(), 0);
  assert.equal(await page.locator('.management-logo').isVisible(), false);
  assert.equal(await page.locator('.header-row').evaluate(el => Math.round(el.getBoundingClientRect().height)), 56);
  const activeLink = page.locator('[data-section="dashboard"]');
  await activeLink.hover();
  const colors = await activeLink.evaluate(el => ({ color: getComputedStyle(el).color, accent: getComputedStyle(el).getPropertyValue('--brand-green').trim() }));
  assert.equal(colors.color, 'rgb(134, 181, 41)');
  const website = page.locator('.header-back');
  assert.equal(await website.getAttribute('href'), '/'); assert.equal(await website.getAttribute('target'), '_blank');
  assert.equal(await website.getAttribute('rel'), 'noopener noreferrer');
  await page.locator('#admin-account-toggle').click();
  assert.equal(await page.locator('#admin-account-menu a').getAttribute('href'), '/tai-khoan');
  await page.keyboard.press('ArrowDown'); assert.equal(await page.locator('#admin-logout').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#admin-account-toggle').evaluate(el => el === document.activeElement), true);
  await page.locator('#admin-account-toggle').click(); await page.locator('#admin-content h1').click();
  assert.equal(await page.locator('#admin-account-menu').isVisible(), false);
  pass('compact 56px Topbar replaces the content breadcrumb/footer identity; external website link and accessible account dropdown work');

  const directory = 'docs/screenshots/admin-shell'; await mkdir(directory, { recursive: true });
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(f.base + '/quan-tri'); await page.locator('.stats-grid').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `overflow ${width}`);
    await page.screenshot({ path: `${directory}/dashboard-${width}.png`, fullPage: true });
    if (width < 901) {
      await page.locator('#admin-menu-toggle').click();
      await page.screenshot({ path: `${directory}/menu-${width}.png`, fullPage: true });
      await openAdminView(page, 'orders');
      assert.equal(await page.locator('#admin-menu-toggle').getAttribute('aria-expanded'), 'false');
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.admin-sidebar').evaluate(el => el.style.width = '256px');
  assert.equal(await page.locator('.nav-label').evaluateAll(els => els.every(el => getComputedStyle(el).whiteSpace === 'nowrap')), true);
  await openAdminView(page, 'orders');
  await sales.click(); assert.equal(await page.locator('[data-navigation-group="sales"]').evaluate(el => el.classList.contains('is-active')), true);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await sales.click();
  assert.equal(await page.locator('#nav-children-sales').evaluate(el => getComputedStyle(el).transitionDuration), '0.2s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#nav-children-sales').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  pass('five viewport sizes fit; mobile menu closes on selection, 256px labels truncate and reduced-motion disables accordion animations');

  const auth = createAuth(f.database.pool), password = key() + 'Aa!';
  await auth.createStaff(f.admin.id, { fullName: 'Người xem thử', username: 'shellviewer', phone: '09' + randomInt(10000000,99999999), password, roles: ['viewer'] });
  const viewer = await auth.login({ identifier: 'shellviewer', password });
  const limited = await browser.newContext(); await limited.addCookies([{ name: 'jielien_session', value: viewer.token, url: f.base, httpOnly: true, sameSite: 'Lax' }]);
  const staff = await limited.newPage(); await staff.goto(f.base + '/quan-tri'); await staff.locator('#workspace-navigation').waitFor();
  assert.equal(await staff.locator('[data-section="orders"], [data-section="users"]').count(), 0);
  assert.equal((await f.request('/api/admin/orders', { session: viewer })).status, 403);
  assert.equal((await context.request.get(f.base + '/quan-tri/khong-ton-tai')).status(), 404);
  assert.equal((await context.request.head(f.base + '/quan-tri/bao-cao')).status(), 200);
  const customerRequest = await fetch(f.base + '/quan-tri/don-hang', { headers: { Cookie: `jielien_session=${f.customer.token}` } });
  assert.equal(customerRequest.status, 403);
  const guest = await browser.newPage(); const guestResponse = await guest.goto(f.base + detailHref);
  assert.equal(guestResponse.status(), 401); await guest.locator('.access-panel').waitFor();
  assert.equal(new URL(await guest.locator('.access-panel a').first().getAttribute('href'), f.base).searchParams.get('redirect'), detailHref);
  pass('unknown URLs return 404, guests keep the intended deep URL for login, and existing view/API permissions remain enforced');

  await context.addInitScript(() => { localStorage.setItem('jielien-cart-v2','fixture'); localStorage.setItem('jielien-cart-owner','fixture'); });
  await page.goto(f.base + '/quan-tri'); await page.locator('#admin-account-toggle').click();
  const logoutResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/logout') && r.request().method() === 'POST');
  await page.locator('#admin-logout').click(); assert.equal((await logoutResponse).status(), 204);
  await page.locator('.access-panel').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jielien-cart-v2')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('jielien-cart-owner')), null);
  assert.equal((await context.request.get(f.base + '/api/auth/me')).status(), 401);
  assert.deepEqual(errors, []);
  pass('shared logout revokes the session, clears the same local cart keys and shows the login gate without browser errors');
  console.log(`Admin shell complete: ${checks} checks passed.`);
} finally { await browser?.close(); await f.close(); }
