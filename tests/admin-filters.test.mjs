import test from 'node:test';
import assert from 'node:assert/strict';
import { readAdminFilters, adminFilterSearch, isLowStockAlert } from '../public/admin-filters.js';
import { createStore } from '../db/store.mjs';
import { adminFilterFixture } from './support/admin-filter-fixture.mjs';
test('admin filter URLs allow only finite status/stock values and never serialize customer searches', () => {
  assert.deepEqual(readAdminFilters('orders', '?status=pending&reconciliation=pending&stock=alert'), { status:'pending', bankPending:true, stock:'' });
  assert.equal(readAdminFilters('inventory', '?stock=alert').stock, 'alert');
  assert.equal(readAdminFilters('orders', '?status=%27+OR+1%3D1').status, '');
  assert.equal(readAdminFilters('inventory', '?stock=<script>').stock, '');
  assert.equal(adminFilterSearch('orders', { status:'confirmed', bankPending:true, query:'private', stock:'low' }), '?status=confirmed&reconciliation=pending');
  assert.equal(adminFilterSearch('inventory', { stock:'alert', name:'private' }), '?stock=alert');
  const row={warehouseType:'normal',warehouseStatus:'active',available:0,lowStockThreshold:5};
  assert.equal(isLowStockAlert(row), true);
  assert.equal(isLowStockAlert({...row,available:5}), true);
  assert.equal(isLowStockAlert({...row,available:6}), false);
  assert.equal(isLowStockAlert({...row,warehouseType:'damaged'}), false);
  assert.equal(isLowStockAlert({...row,warehouseStatus:'inactive'}), false);
});
test('order API filters before LIMIT, combines bank reconciliation, enforces permission and inventory alerts equal the KPI', async () => {
  const f=await adminFilterFixture();
  try {
    const pending=await f.request('/api/admin/orders?status=pending');
    assert.equal(pending.status,200);
    assert.deepEqual(new Set(pending.body.orders.map(o=>o.id)),new Set([f.orderIds.cod,f.orderIds.bank]));
    const store=await createStore({pool:f.database.pool});
    const limited=await store.listOrders({status:'pending',limit:1});
    assert.equal(limited.length,1); assert.equal(limited[0].status,'pending');
    assert.equal(limited[0].id,f.orderIds.bank,'newest unfiltered order is confirmed; WHERE must precede LIMIT');
    const bank=await f.request('/api/admin/orders?status=pending&reconciliation=pending');
    assert.deepEqual(bank.body.orders.map(o=>o.id),[f.orderIds.bank]);
    assert.deepEqual((await f.request('/api/admin/orders?status=cancelled')).body.orders,[]);
    assert.equal((await f.request('/api/admin/orders?status=invalid')).status,400);
    assert.equal((await f.request('/api/admin/orders?status=pending',{session:f.customer})).status,403);
    assert.equal((await f.request('/api/admin/orders?status=pending',{session:null})).status,401);
    assert.ok(pending.body.orders.every(o=>!('token' in o)));
    const rows=(await f.request('/api/admin/inventory')).body.inventory;
    const stats=(await f.request('/api/admin/dashboard')).body.stats;
    const alerts=rows.filter(isLowStockAlert);
    assert.equal(alerts.length,2); assert.equal(alerts.length,stats.lowStock);
    assert.ok(alerts.some(row=>row.available===0));
    assert.ok(alerts.some(row=>row.available===5));
    assert.ok(rows.some(row=>row.warehouseStatus==='inactive'));
  } finally { await f.close(); }
});
