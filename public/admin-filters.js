// Only finite filter values belong in URLs; never serialize customer search text.
export const orderStatusFilters = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
export const inventoryStockFilters = ['alert', 'out', 'low', 'enough'];
export function readAdminFilters(view, search = '') {
  const params = new URLSearchParams(search);
  return {
    status: view === 'orders' && orderStatusFilters.includes(params.get('status')) ? params.get('status') : '',
    bankPending: view === 'orders' && params.get('reconciliation') === 'pending',
    stock: view === 'inventory' && inventoryStockFilters.includes(params.get('stock')) ? params.get('stock') : '',
  };
}
export function adminFilterSearch(view, filters) {
  const params = new URLSearchParams();
  if (view === 'orders') {
    if (orderStatusFilters.includes(filters.status)) params.set('status', filters.status);
    if (filters.bankPending) params.set('reconciliation', 'pending');
  }
  if (view === 'inventory' && inventoryStockFilters.includes(filters.stock)) params.set('stock', filters.stock);
  return params.size ? '?' + params : '';
}
export function isLowStockAlert(row) {
  return row.warehouseType === 'normal' && row.warehouseStatus === 'active' && Number(row.available) <= Number(row.lowStockThreshold ?? 5);
}
