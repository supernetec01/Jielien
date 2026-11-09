import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLoginLimiter} from '../lib/login-limiter.mjs';
import {createAuth} from '../lib/auth.mjs';
import {createApp} from './support/app.mjs';
import {migrate} from '../db/migrate.mjs';
import {createTestDatabase,closeServer} from './support/database.mjs';

test('shared login quota reserves concurrent failures, releases successes and expires exactly',async t=>{
  const db=await createTestDatabase();t.after(()=>db.cleanup());await migrate(db.pool);
  let now=1000;const opts={clock:()=>now,windowMs:1000,burstMax:100,failureMax:2};
  const a=await createLoginLimiter(db.pool,opts),b=await createLoginLimiter(db.pool,opts);
  for(let i=0;i<16;i++)await a.success(await a.reserve('ip',' USER@example.test '));
  await b.reserve('ip','user@example.test');
  await a.reserve('ip','USER@EXAMPLE.TEST');
  await assert.rejects(b.reserve('ip','user@example.test'),{status:429,retryAfter:1});
  await a.success(await a.reserve('ip','other@example.test'));
  await assert.rejects(a.reserve('ip','user@example.test'),{status:429});
  now=2000;
  const old=await a.reserve('ip','0912345678');
  await b.reserve('ip','+84 912 345 678');
  await assert.rejects(a.reserve('ip','(0912)345678'),{status:429});
  now=3000;
  await a.reserve('ip','0912345678');await b.reserve('ip','0912345678');
  await a.success(old); // An old window's completion cannot release a new window.
  await assert.rejects(a.reserve('ip','0912345678'),{status:429});
  now=4000;
  const races=await Promise.allSettled(Array.from({length:10},()=>a.reserve('ip','race')));
  assert.equal(races.filter(r=>r.status==='fulfilled').length,2);
  const data=JSON.stringify((await db.pool.query('SELECT * FROM auth_rate_limits')).rows);
  assert.ok(!data.includes('example.test')&&!data.includes('0912345678'));
});

test('IP burst budget still applies to successful logins',async t=>{
  const db=await createTestDatabase();t.after(()=>db.cleanup());await migrate(db.pool);
  const limiter=await createLoginLimiter(db.pool,{burstMax:2});
  await limiter.success(await limiter.reserve('ip','a'));
  await limiter.success(await limiter.reserve('ip','b'));
  await assert.rejects(limiter.reserve('ip','c'),{status:429});
});

test('16 valid HTTP logins succeed while wrong credentials are throttled with Retry-After',async t=>{
  const db=await createTestDatabase();let app;t.after(async()=>{await closeServer(app);await db.cleanup();});
  app=await createApp({pool:db.pool,legacyPath:null});app.listen(0,'127.0.0.1');await once(app,'listening');
  const auth=createAuth(db.pool),password='RateLimit-Test!2026';
  await auth.register({fullName:'Khách QA',phone:'0912345678',password});
  const login=async(identifier,password,headers={})=>fetch(`http://127.0.0.1:${app.address().port}/api/auth/login`,{
    method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({identifier,password}),
  });
  for(let i=0;i<16;i++)assert.equal((await login('0912345678',password)).status,200);
  for(let i=0;i<15;i++)assert.equal((await login('0912345678','wrong')).status,401);
  const blocked=await login('0912345678','wrong',{'X-Forwarded-For':'192.0.2.25'});
  assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);
  assert.equal((await login('different@example.test','wrong')).status,401);
});
