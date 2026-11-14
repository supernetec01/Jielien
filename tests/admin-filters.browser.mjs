import { randomInt } from "node:crypto";
import { createAuth } from "../lib/auth.mjs";
import { key } from "./support/bank-settings.mjs";
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { adminFilterFixture } from './support/admin-filter-fixture.mjs';
const f=await adminFilterFixture();
let browser,checks=0;
const pass=message=>console.log(`PASS ${++checks}: ${message}`);
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addCookies([{name:'jielien_session',value:f.adminSession.token,url:f.base,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[],mutations=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/')&&request.method()!=='GET')mutations.push(request.method());});
  const loaded=async()=>{await page.locator('#admin-content[aria-busy="true"]').waitFor({state:'hidden'});};
  const orderIds=()=>page.locator('[data-admin-order]').evaluateAll(nodes=>nodes.map(n=>n.dataset.adminOrder));
  await page.goto(f.base+'/quan-tri'); await page.locator('.stat-card').first().click();
  await page.waitForURL('**/quan-tri/don-hang?status=pending'); await loaded();
  assert.equal(await page.locator('#order-status').inputValue(),'pending');
  assert.deepEqual(new Set(await orderIds()),new Set([f.orderIds.cod,f.orderIds.bank]));
  await page.reload(); await page.locator('#order-status').waitFor(); assert.equal(await page.locator('#order-status').inputValue(),'pending');
  await page.locator('#refresh-view').click(); await loaded(); assert.equal((await orderIds()).length,2);
  await page.locator('#order-status').selectOption('confirmed'); await loaded();
  assert.equal(new URL(page.url()).searchParams.get('status'),'confirmed');
  assert.deepEqual(await orderIds(),[f.orderIds.confirmed]);
  await page.goBack(); await loaded(); assert.equal(await page.locator('#order-status').inputValue(),'pending');
  await page.goForward(); await loaded(); assert.equal(await page.locator('#order-status').inputValue(),'confirmed');
  await page.locator('#order-status').selectOption(''); await loaded(); assert.equal(new URL(page.url()).search,''); assert.equal((await orderIds()).length,3);
  pass('pending KPI, reload, refresh, dropdown, Back/Forward and clearing filters all use real filtered orders');

  await page.goto(f.base+'/quan-tri/don-hang?status=pending&reconciliation=pending'); await page.locator('#order-bank-filter').waitFor();
  assert.equal(await page.locator('#order-bank-filter').inputValue(),'pending');
  assert.deepEqual(await orderIds(),[f.orderIds.bank]);
  await page.locator(`[data-admin-order="${f.orderIds.bank}"]`).click();
  assert.equal(new URL(page.url()).searchParams.get('status'),'pending');
  await page.reload(); await page.locator('#admin-dialog[open]').waitFor(); await page.keyboard.press('Escape');
  await page.waitForURL('**/quan-tri/don-hang?status=pending&reconciliation=pending');
  assert.equal(await page.locator('#order-status').inputValue(),'pending');
  await page.locator('#order-bank-filter').selectOption(''); await loaded(); assert.equal((await orderIds()).length,2);
  pass('status combines with manual reconciliation; order detail reload and closing preserve the list filters');

  await page.goto(f.base+'/quan-tri'); await page.locator('.stat-card').nth(3).click();
  await page.waitForURL('**/quan-tri/ton-kho?stock=alert'); await loaded();
  const stats=(await f.request('/api/admin/dashboard')).body.stats;
  assert.equal(await page.locator('#inventory-stock').inputValue(),'alert');
  assert.equal(await page.locator('#inventory-table-body tr').count(),stats.lowStock);
  assert.equal(await page.locator('#inventory-table-body').getByText('Hết hàng',{exact:true}).count(),1);
  assert.equal(await page.locator('#inventory-table-body').getByText('Sắp hết',{exact:true}).count(),1);
  assert.equal(await page.locator('#inventory-table-body').getByText('Kho tắt thử',{exact:true}).count(),0);
  await page.reload(); await page.locator('#inventory-stock').waitFor(); assert.equal(await page.locator('#inventory-stock').inputValue(),'alert');
  await page.locator('#inventory-stock').selectOption('low'); assert.equal(new URL(page.url()).searchParams.get('stock'),'low');
  assert.equal(await page.locator('#inventory-table-body tr').count(),1);
  await page.locator('#inventory-stock').selectOption('out'); await page.goBack(); await loaded(); assert.equal(await page.locator('#inventory-stock').inputValue(),'low');
  await page.goBack(); await loaded(); assert.equal(await page.locator('#inventory-stock').inputValue(),'alert');
  await page.locator('#inventory-stock').selectOption(''); assert.equal(new URL(page.url()).search,'');
  pass('alert KPI includes empty and threshold stock, excludes damaged/inactive warehouses and matches KPI; old low/out filters remain distinct');

  await page.goto(f.base+'/quan-tri/don-hang?status=unknown'); await page.locator('#order-status').waitFor(); assert.equal(await page.locator('#order-status').inputValue(),'');
  await page.goto(f.base+'/quan-tri/ton-kho?stock=unknown'); await page.locator('#inventory-stock').waitFor(); assert.equal(await page.locator('#inventory-stock').inputValue(),'');
  await page.locator('#inventory-search').fill('Không đưa tên người mua vào URL'); assert.equal(new URL(page.url()).searchParams.has('query'),false);
  pass('unknown query values fall back safely and customer/product search text is never serialized in filter URLs');

  const directory='docs/screenshots/admin-url-filters'; await mkdir(directory,{recursive:true});
  for(const width of [320,375,768,1440,1920]) {
    await page.setViewportSize({width,height:900});
    for(const [name,href] of [['orders','/quan-tri/don-hang?status=pending'],['stock','/quan-tri/ton-kho?stock=alert']]) {
      await page.goto(f.base+href); await loaded(); await page.locator(name==='orders'?'#order-status':'#inventory-stock').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name} overflow ${width}`);
      await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:true});
    }
  }
  const guest=await browser.newPage(); await guest.goto(f.base+'/quan-tri/don-hang?status=pending'); await guest.locator('.access-panel').waitFor();
  const target=new URL(await guest.locator('.access-panel a').getAttribute('href'),f.base).searchParams.get('redirect');
  assert.equal(target,'/quan-tri/don-hang?status=pending');
  const password=key()+'Aa!';
  await createAuth(f.database.pool).createStaff(f.admin.id,{fullName:'Nhân viên thử URL',username:'filterlogin',phone:'09'+randomInt(10000000,99999999),password,roles:['sales']});
  await guest.locator('.access-panel a').click(); await guest.locator('#identifier').fill('filterlogin');
  await guest.locator('#password').fill(password); await guest.locator('#auth-submit').click();
  await guest.waitForURL(f.base+'/quan-tri/don-hang?status=pending'); await guest.locator('#order-status').waitFor();
  assert.equal(await guest.locator('#order-status').inputValue(),'pending');
  assert.deepEqual(errors,[]); assert.deepEqual(mutations,[]);
  pass('five viewports, guest filter redirect, existing permission gates and no-write navigation pass without script errors');
  console.log(`Admin URL filters complete: ${checks} checks passed.`);
} finally {await browser?.close(); await f.close();}
