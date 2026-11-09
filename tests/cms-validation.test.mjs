import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from './support/app.mjs';
import {createAuth} from '../lib/auth.mjs';
import {createTestDatabase,closeServer} from './support/database.mjs';

test('CMS rejects malformed collections atomically and accepts valid references', async t => {
  const db=await createTestDatabase(); let app;
  t.after(async()=>{await closeServer(app);await db.cleanup();});
  app=await createApp({pool:db.pool,legacyPath:null});
  app.listen(0,'127.0.0.1'); await once(app,'listening');
  const auth=createAuth(db.pool),password='CmsValidation!2026';
  await auth.ensureAdmin({email:'cms@example.test',phone:'0987654321',password});
  const session=await auth.login({identifier:'cms@example.test',password});
  const url=`http://127.0.0.1:${app.address().port}/api/admin/cms/articles`;
  const body={title:'Bài kiểm thử',slug:'bai-kiem-thu'};
  const request=async(data,csrf=session.csrfToken)=>{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`jielien_session=${session.token}`,'X-CSRF-Token':csrf},body:JSON.stringify(data)});
    return {status:r.status,data:await r.json()};
  };
  const counts=async()=> (await db.pool.query(`SELECT
    (SELECT count(*) FROM articles) AS articles,
    (SELECT count(*) FROM article_revisions) AS revisions,
    (SELECT count(*) FROM article_tag_links) AS tags,
    (SELECT count(*) FROM article_product_links) AS products,
    (SELECT count(*) FROM audit_logs) AS audit`)).rows[0];
  const before=await counts();
  for(const field of ['tagIds','relatedProductIds']){
    for(const value of ['bad',{},1,true,null,Array(21).fill(1),[0],[-1],[1.5],['bad'],[true],[{}],[null]]){
      const r=await request({...body,[field]:value});
      assert.equal(r.status,400,`${field}=${JSON.stringify(value)}: ${JSON.stringify(r.data)}`);
    }
    assert.equal((await request({...body,[field]:[999999]})).status,400);
  }
  for(const value of [null,false,{},'bad']) assert.equal((await request({...body,contentBlocks:value})).status,400);
  assert.deepEqual(await counts(),before,'invalid requests must not leave partial records');
  assert.equal((await request({...body,tagIds:'bad'},'wrong')).status,403);
  const tag=(await db.pool.query("INSERT INTO article_tags(name,slug) VALUES('Thẻ QA','the-qa') RETURNING id")).rows[0].id;
  const product=(await db.pool.query('SELECT id FROM products ORDER BY id LIMIT 1')).rows[0].id;
  let r=await request({...body,tagIds:[tag,tag],relatedProductIds:[product]});
  assert.equal(r.status,201,JSON.stringify(r.data));
  assert.deepEqual(r.data.article.snapshot.tagIds,[tag]);
  assert.deepEqual(r.data.article.snapshot.relatedProductIds,[product]);
  r=await request({...body,slug:'bai-mac-dinh'});
  assert.equal(r.status,201);
  assert.deepEqual(r.data.article.snapshot.tagIds,[]);
  assert.deepEqual(r.data.article.snapshot.contentBlocks,[]);
});
