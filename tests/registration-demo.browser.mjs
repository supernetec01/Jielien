import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {createTestDatabase,closeServer} from './support/database.mjs';

const db=await createTestDatabase();let app,browser;
try{
 app=await createApp({pool:db.pool,legacyPath:null,registrationEnvironment:{NODE_ENV:'development',AUTH_VERIFICATION_MODE:'demo'}});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 const base=`http://127.0.0.1:${app.address().port}`,out='docs/screenshots/registration-demo';await mkdir(out,{recursive:true});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 const password='Demo-Browser-Fixture!2026';
 await page.goto(base+'/tai-khoan?mode=register');
 await page.locator('#fullName').fill('Khách thử localhost');await page.locator('#phone').fill('0912345678');await page.locator('#email').fill('demo-browser@example.test');await page.locator('#password').fill(password);await page.locator('#auth-submit').click();
 await page.locator('#demo-verification-codes').waitFor();
 const code=(await page.locator('[data-demo-code="sms"]').textContent()).trim(),emailCode=(await page.locator('[data-demo-code="email"]').textContent()).trim();
 assert.match(code,/^\d{6}$/);assert.match(emailCode,/^\d{6}$/);
 assert.equal((await page.request.get(base+'/api/auth/me')).status(),401);
 assert.equal((await db.pool.query('SELECT count(*) AS n FROM registration_outbox')).rows[0].n,0);
 for(const width of [320,375,768,1440,1920]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`demo width ${width}`);
   await page.screenshot({path:`${out}/verification-${width}.png`,fullPage:true});
 }
 console.log('PASS: localhost signup without a provider displays clearly labelled demo codes at five viewport widths; no messages are queued');
 await page.locator('#verification-code').fill(code);await page.locator('#verification-email-code').fill(emailCode);await page.locator('#verify-submit').click();await page.locator('#profile-form').waitFor();
 await page.locator('.account-banner').filter({hasText:'TÀI KHOẢN DEMO LOCALHOST'}).waitFor();
 console.log('PASS: entering the displayed codes creates a labelled demo customer');
 await page.locator('#logout').click();await page.locator('#identifier').fill('0912345678');await page.locator('#password').fill(password);await page.locator('#auth-submit').click();await page.locator('#profile-form').waitFor();
 console.log('PASS: the demo customer can log out and log back in locally');
 const second=await browser.newContext(),phonePage=await second.newPage();
 await phonePage.goto(base+'/tai-khoan?mode=register');await phonePage.locator('#fullName').fill('Khách không email');await phonePage.locator('#phone').fill('0912345679');await phonePage.locator('#password').fill(password);await phonePage.locator('#auth-submit').click();await phonePage.locator('#demo-verification-codes').waitFor();
 assert.equal(await phonePage.locator('[data-demo-code="email"]').count(),0);
 await phonePage.locator('#verification-code').fill((await phonePage.locator('[data-demo-code="sms"]').textContent()).trim());await phonePage.locator('#verify-submit').click();await phonePage.locator('#profile-form').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: signup without email needs only the displayed SMS demo code; no JavaScript errors');
}finally{await browser?.close();await closeServer(app);await db.cleanup();}
