import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {createApp} from '../server.mjs';
import {createAuth} from '../lib/auth.mjs';
import {registrationDemoEnabled} from '../lib/registration-demo.mjs';
import {createTestDatabase,closeServer} from './support/database.mjs';

const env={NODE_ENV:'development',AUTH_VERIFICATION_MODE:'demo',AUTH_DEMO_LOCAL_BIND:'127.0.0.1'};
const signup={fullName:'Khách demo',phone:'0912345678',email:'demo@example.test',password:'Demo-Only-Password!2026'};

test('demo registration is explicit and rejects production, LAN, public URLs and real provider mixing',()=>{
  assert.equal(registrationDemoEnabled({}),false);
  assert.equal(registrationDemoEnabled(env),true);
  for(const patch of [
    {NODE_ENV:'production'},{NODE_ENV:'test'},{NODE_ENV:''},
    {AUTH_DEMO_LOCAL_BIND:'0.0.0.0'},{AUTH_DEMO_LOCAL_BIND:'192.168.1.12'},
    {PUBLIC_BASE_URL:'https://shop.example.org'},{SEO_INDEXING_ENABLED:'true'},
    {AUTH_VERIFICATION_WEBHOOK_URL:'https://provider.example.org'},
    {AUTH_VERIFICATION_WEBHOOK_TOKEN:'fixture'},
    {AUTH_VERIFICATION_MODE:'unknown'},
  ])assert.throws(()=>registrationDemoEnabled({...env,...patch}));
});

test('localhost demo registers without sending messages; demo sessions and accounts cannot cross into provider mode',async t=>{
  const db=await createTestDatabase();const apps=[];
  t.after(async()=>{for(const app of apps)await closeServer(app);await db.cleanup();});
  const app=await createApp({pool:db.pool,legacyPath:null,registrationEnvironment:env});apps.push(app);
  app.listen(0,'127.0.0.1');await once(app,'listening');
  const base=`http://127.0.0.1:${app.address().port}`;
  const request=async(path,body,headers={})=>{
    const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
  };
  const hostDenied=await new Promise((resolve,reject)=>{
    const req=httpRequest(base+'/api/auth/register',{method:'POST',headers:{Host:'evil.example.test','Content-Type':'application/json'}},res=>{
      res.resume();res.on('end',()=>resolve(res.statusCode));
    });
    req.on('error',reject);req.end(JSON.stringify(signup));
  });
  assert.equal(hostDenied,403);
  assert.equal((await request('/api/auth/register',signup,{Origin:'https://other.example.test'})).status,403);
  const first=await request('/api/auth/register',signup);
  assert.equal(first.status,202);assert.equal(first.cookie,null);
  assert.match(first.data.demoCodes.code,/^\d{6}$/);
  assert.match(first.data.demoCodes.emailCode,/^\d{6}$/);
  assert.equal((await db.pool.query('SELECT count(*) AS n FROM registration_outbox')).rows[0].n,0);
  assert.equal((await db.pool.query('SELECT count(*) AS n FROM users')).rows[0].n,0);
  const verify={challengeId:first.data.challengeId,...first.data.demoCodes};
  const provider=await createApp({pool:db.pool,legacyPath:null,registrationEnvironment:{},registrationDelivery:null});apps.push(provider);
  provider.listen(0,'127.0.0.1');await once(provider,'listening');
  const other=`http://127.0.0.1:${provider.address().port}`;
  let r=await fetch(other+'/api/auth/register/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(verify)});
  assert.equal(r.status,400,'a demo challenge must not activate through the real provider endpoint');
  const verified=await request('/api/auth/register/verify',verify);
  assert.equal(verified.status,201);assert.equal(verified.data.user.isDemo,true);
  assert.deepEqual(verified.data.user.roles,['customer']);
  assert.equal((await request('/api/auth/register/verify',verify)).status,400);
  const row=(await db.pool.query('SELECT is_demo,phone_verified_at,email_verified_at FROM users WHERE id=$1',[verified.data.user.id])).rows[0];
  assert.deepEqual(row,{is_demo:true,phone_verified_at:null,email_verified_at:null});
  assert.equal((await request('/api/auth/login',{identifier:signup.phone,password:signup.password})).status,200);
  const cookie=verified.cookie.split(';')[0];
  assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await fetch(other+'/api/auth/me',{headers:{Cookie:cookie}})).status,401);
  await assert.rejects(createAuth(db.pool).login({identifier:signup.email,password:signup.password}),{status:401});
  const authDemo=createAuth(db.pool,{allowDemoAccounts:true});
  assert.equal((await authDemo.login({identifier:signup.email,password:signup.password})).user.isDemo,true);
});
