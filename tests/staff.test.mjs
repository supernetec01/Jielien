import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createTestDatabase,closeServer} from './support/database.mjs';
import {createApp} from '../server.mjs';
import {createAuth} from '../lib/auth.mjs';
test('staff API enforces role matrix, CSRF, last admin and session revocation',async()=>{
 const db=await createTestDatabase(); let app;
 try {
 app=await createApp({pool:db.pool,legacyPath:null}); app.listen(0,'127.0.0.1'); await once(app,'listening');
 const auth=createAuth(db.pool), password='Staff-Test-Password-2026';
 const admin=await auth.ensureAdmin({email:'admin@example.test',phone:'0987654321',name:'Admin test',password});
 const login=await auth.login({identifier:'admin@example.test',password});
 const employee=await auth.register({fullName:'Staff test',phone:'0912345678',password,roles:['admin']});
 const base=`http://127.0.0.1:${app.address().port}`;
 const call=async(path,session=login,method='GET',body,csrf=true)=>fetch(base+'/api/admin/'+path,{method,headers:{cookie:`jielien_session=${session.token}`,...(csrf?{'X-CSRF-Token':session.csrfToken}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('users',employee)).status,403);
 assert.equal((await call('users/'+employee.user.id,login,'PATCH',{roles:['sales'],status:'active'},false)).status,403);
 assert.equal((await call('users/'+admin.id,login,'PATCH',{roles:['customer'],status:'active'})).status,409);
 const matrix={viewer:['products'],sales:['dashboard','products','orders'],warehouse:['orders','inventory'],content:['dashboard','products'],boss:['dashboard','products','orders','inventory','audit']};
 for(const [role,allowed] of Object.entries(matrix)) {
 assert.equal((await call('users/'+employee.user.id,login,'PATCH',{roles:[role],status:'active'})).status,200);
 for(const route of ['dashboard','products','orders','inventory','audit','users']) assert.equal((await call(route,employee)).status,allowed.includes(route)?200:403,`${role}/${route}`);
 if(role!=='content') assert.equal((await call('variants/1',employee,'PATCH',{price:1})).status,403);
 }
 const listed=await (await call('users')).json(); assert.ok(!JSON.stringify(listed).includes('password_hash'));
 assert.equal((await call('users/'+employee.user.id,login,'PATCH',{roles:['customer'],status:'inactive'})).status,200);
 assert.equal(await auth.authenticate(employee.token),null);
 assert.ok(Number((await db.pool.query("SELECT count(*) FROM audit_logs WHERE action='staff.permissions_updated'")).rows[0].count)>=6);
 } finally {await closeServer(app);await db.cleanup();}
});
