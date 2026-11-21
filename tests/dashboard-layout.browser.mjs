import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { bankSettingsFixture } from './support/bank-settings.mjs';
import { adminNav } from '../public/admin-nav.js';
const f = await bankSettingsFixture();
let browser, checks = 0;
const pass = message => console.log(`PASS ${++checks}: ${message}`);
const directory = 'docs/screenshots/dashboard-layout', measurements = [];
try {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 911 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'jielien_session', value: f.adminSession.token, url: f.base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }); });
  async function overview() { await page.goto(f.base + '/quan-tri'); await page.locator('.dashboard-analysis').waitFor(); }
  async function screenshot(name) { await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); }); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true }); }
  await overview();
  assert.equal(await page.locator('.stat-card').count(), 4);
  assert.equal(await page.locator('.stat-card a, .stat-card button, .stat-card input').count(), 0);
  assert.equal(await page.locator('.stat-card.has-pending').count(), 0);
  assert.equal(await page.locator('.dashboard-intro, .dashboard-shortcuts, .workspace-actions').count(), 0);
  assert.equal(await page.getByText('Công việc thường ngày', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Chưa có đơn hàng trong kỳ', { exact: true }).count(), 1);
  assert.equal(await page.locator('.dashboard-status-card li').textContent(), 'Chưa có đơn hàng trong kỳ.');
  assert.equal(await page.getByText('Chưa có sản phẩm bán trong kỳ.', { exact: true }).count(), 1);
  await screenshot('empty-1920');
  pass('four full-card links replace banner/shortcuts; zero pending has no olive highlight and all existing empty messages remain');

  const variants = (await f.database.pool.query('SELECT v.id FROM product_variants v JOIN inventory_balances b ON b.variant_id=v.id WHERE b.on_hand-b.reserved > 10 ORDER BY v.id LIMIT 5')).rows;
  assert.equal(variants.length, 5);
  const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  for (const [index, status] of statuses.entries()) {
    const created = await f.request('/api/orders', { method: 'POST', body: { ...f.order(), payment: 'cod', items: [{ id: variants[index % 5].id, quantity: 1 }] } });
    assert.equal(created.status, 201);
    const id = encodeURIComponent(created.body.order.id);
    const steps = status === 'cancelled' ? ['cancelled'] : ['confirmed', 'processing', 'shipped', 'delivered'].slice(0, Math.max(0, statuses.indexOf(status)));
    for (const next of steps) assert.equal((await f.request(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: { status: next, reason: 'Kiểm tra bố cục bằng dữ liệu thử' } })).status, 200);
    if (status === 'delivered') assert.equal((await f.request(`/api/admin/orders/${id}/payment`, { method: 'POST', body: {} })).status, 200);
  }
  await overview();
  const stats = (await f.request('/api/admin/dashboard')).body.stats;
  const report = (await f.request('/api/admin/reports/summary')).body.report;
  assert.deepEqual(await page.locator('.stat-card strong').allTextContents(), [Number(stats.pendingOrders).toLocaleString('vi-VN'), Number(stats.revenue).toLocaleString('vi-VN') + 'đ', String(stats.products), String(stats.lowStock)]);
  assert.equal(await page.locator('.stat-card.has-pending').count(), 1);
  assert.equal(await page.locator('.dashboard-status-card li').count(), report.byStatus.length);
  assert.equal(await page.locator('.dashboard-products-card li').count(), report.topSkus.length);
  assert.equal(await page.locator('.report-chart rect').count(), report.series.length);
  assert.equal(await page.locator('.stat-icon svg[aria-hidden="true"]').count(), 4);
  await page.locator('.dashboard-chart-card summary').click();
  assert.equal(await page.locator('.dashboard-chart-card tbody tr').count(), report.series.length);
  assert.deepEqual(await page.locator('.dashboard-chart-card tbody tr td:first-child').allTextContents(), report.series.map(p => p.day));
  await page.locator('.dashboard-chart-card summary').click();
  pass('populated KPI formatting, six order statuses, five top products, SVG bars and accessible table match real fixture APIs');

  const targets = ['orders', 'reports-editor', 'catalog-editor', 'inventory'].map(id => adminNav.find(item => item.id === id).href + (id === 'orders' ? '?status=pending' : id === 'inventory' ? '?stock=alert' : ''));
  assert.deepEqual(await page.locator('.stat-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), targets);
  for (const [index, href] of targets.entries()) {
    await overview();
    await page.locator('.stat-card').nth(index).focus();
    assert.equal(await page.locator('.stat-card').nth(index).evaluate(el => el === document.activeElement), true);
    const focus = await page.locator('.stat-card').nth(index).evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    assert.notEqual(focus.style, 'none'); assert.ok(focus.width >= 2);
    await page.keyboard.press('Enter'); await page.waitForURL(f.base + href);
    await page.locator('#admin-content h1').waitFor();
  }
  await page.goto(f.base + '/quan-tri/don-hang?status=pending'); await page.locator('#order-status').waitFor();
  assert.equal(await page.locator('#order-status').inputValue(), 'pending');
  await page.goto(f.base + '/quan-tri/ton-kho?stock=low'); await page.locator('#inventory-stock').waitFor();
  assert.equal(await page.locator('#inventory-stock').inputValue(), 'low');
  pass('all four cards are keyboard-focusable links to existing config URLs; orders and stock now restore their supported URL filters');

  for (const [width, height] of [[1920,911],[1366,768],[1440,900],[768,1024],[375,812],[320,700]]) {
    await page.setViewportSize({ width, height }); await overview();
    const box = await page.evaluate(() => {
      const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right }; };
      return { viewport:{width:innerWidth,height:innerHeight}, overflow:document.documentElement.scrollWidth>innerWidth+1, header:rect('.dashboard-page>.content-header'), heading:rect('.dashboard-page>.content-header>div'), refresh:rect('#refresh-view'), kpi:[...document.querySelectorAll('.stat-card')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height,bottom:r.bottom};}), chart:rect('.dashboard-chart-card'), plot:rect('.report-chart'), side:rect('.dashboard-side-cards'), status:rect('.dashboard-status-card'), products:rect('.dashboard-products-card') };
    });
    assert.equal(box.overflow, false, `overflow ${width}`);
    assert.ok(box.refresh.y < box.header.bottom && box.refresh.bottom <= box.header.bottom + 1);
    assert.ok(box.refresh.y < box.heading.bottom, `refresh wrapped to a second row ${width}`);
    if (width >= 1280) {
      assert.equal(new Set(box.kpi.map(r => Math.round(r.y))).size, 1);
      assert.ok(box.kpi.every(r => r.bottom < height));
      assert.ok(box.chart.y < height && box.plot.y < height);
      if (width === 1366 || width === 1920) assert.ok(box.chart.bottom <= height, `chart below fold ${width}: ${JSON.stringify(box.chart)}`);
      assert.ok(Math.abs(box.chart.height-box.side.height)<2);
      assert.ok(box.chart.width > box.side.width*1.9);
      assert.ok(box.kpi.every(r => r.height<=126), `KPI too tall ${width}: ${JSON.stringify(box.kpi)}`);
      if (width === 1920) { assert.ok(box.status.y < height - 40); assert.ok(box.products.y < height - 40); }
    } else {
      assert.equal(new Set(box.kpi.map(r => Math.round(r.y))).size, 2);
      assert.ok(box.status.y>=box.chart.bottom-1);
      assert.ok(box.products.y>=box.status.bottom);
      assert.ok(Math.abs(box.chart.x-box.status.x)<2);
    }
    assert.ok(box.plot.right <= box.chart.right + 1);
    measurements.push(box); await screenshot(`dashboard-${width}x${height}`);
    if (width === 1366) {
      const list = page.locator('.dashboard-status-card .dashboard-list');
      await list.focus(); await page.keyboard.press('End');
      await page.waitForFunction(() => document.querySelector('.dashboard-status-card .dashboard-list').scrollTop > 0);
      assert.equal(await list.locator('li').count(), report.byStatus.length);
    }
  }
  await writeFile(`${directory}/measurements.json`, JSON.stringify(measurements,null,2));
  pass('1920×911 and 1366×768 expose KPI/chart above fold; cards stretch 2:1; tablet/mobile order and overflow pass six viewports');

  await page.setViewportSize({ width: 1920, height: 911 }); await overview();
  await page.locator('#refresh-view').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.locator('.stat-card').first().evaluate(el=>el===document.activeElement), true);
  await page.emulateMedia({ reducedMotion:'no-preference' }); await page.locator('.stat-card').first().hover();
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.stat-card').first().evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42<0));
  await page.emulateMedia({ reducedMotion:'reduce' });
  const before=requests.filter(r=>r.path==='/api/admin/dashboard').length;
  await page.locator('#refresh-view').click(); await page.locator('.dashboard-analysis').waitFor();
  assert.ok(requests.filter(r=>r.path==='/api/admin/dashboard').length>before);
  assert.deepEqual(requests.filter(r=>r.method!=='GET'), []);
  await page.goto(f.base + '/quan-tri/bao-cao'); await page.locator('.report-chart').waitFor();
  assert.equal(await page.locator('.dashboard-analysis').count(), 0);
  assert.equal(await page.locator('.insight-grid .panel').count(), 2);
  pass('Tab order, hover, original refresh action and report-page layout work without UI mutations or new data requests');

  await page.route('**/api/admin/reports/summary', route=>route.fulfill({ status:503, contentType:'application/json',body:JSON.stringify({message:'Báo cáo tạm thời chưa sẵn sàng.'}) }));
  await page.goto(f.base+'/quan-tri'); await page.locator('#dashboard-insights .form-error').waitFor();
  assert.equal(await page.locator('.stat-card').count(),4);
  await page.unroute('**/api/admin/reports/summary'); await page.locator('#refresh-view').click(); await page.locator('.dashboard-analysis').waitFor();
  assert.deepEqual(errors, []);
  pass('existing report failure message and refresh recovery preserve KPI; no browser JavaScript errors');
  console.log(`Dashboard layout complete: ${checks} checks passed.`);
} finally { await browser?.close(); await f.close(); }
