import { bankSettingsFixture, exampleBank } from './bank-settings.mjs';
export async function adminFilterFixture() {
  const f = await bankSettingsFixture({ fallback: { ...exampleBank, enabled: true, bankBin: '970415' } });
  try {
    const cod = await f.request('/api/orders', { method: 'POST', body: { ...f.order(), payment: 'cod' } });
    const bank = await f.request('/api/orders', { method: 'POST', body: f.order() });
    const confirmed = await f.request('/api/orders', { method: 'POST', body: { ...f.order(), payment: 'cod' } });
    if ([cod, bank, confirmed].some(result => result.status !== 201)) throw Error('Could not create isolated filter fixture');
    const updated = await f.request(`/api/admin/orders/${confirmed.body.order.id}/status`, { method: 'PATCH', body: { status: 'confirmed', reason: 'Kiểm tra bộ lọc bằng dữ liệu thử' } });
    if (updated.status !== 200) throw Error('Could not confirm fixture order');
    await f.database.pool.query('UPDATE product_variants SET low_stock_threshold=5');
    await f.database.pool.query('UPDATE inventory_balances SET on_hand=reserved+50');
    await f.database.pool.query('UPDATE inventory_balances SET on_hand=reserved WHERE warehouse_id=1 AND variant_id=1');
    await f.database.pool.query('UPDATE inventory_balances SET on_hand=reserved+5 WHERE warehouse_id=1 AND variant_id=2');
    await f.database.pool.query("INSERT INTO warehouses(id,name,type,status) VALUES(900,'Kho tắt thử','normal','inactive')");
    await f.database.pool.query('INSERT INTO inventory_balances(variant_id,warehouse_id,on_hand,reserved) VALUES(1,900,0,0),(1,2,0,0) ON CONFLICT(variant_id,warehouse_id) DO UPDATE SET on_hand=inventory_balances.reserved');
    return { ...f, orderIds: { cod: cod.body.order.id, bank: bank.body.order.id, confirmed: confirmed.body.order.id } };
  } catch (error) { await f.close(); throw error; }
}
