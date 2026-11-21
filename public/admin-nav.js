// Shared by the server route gate, sidebar, search and breadcrumb.
export const adminNavGroups = [
  { id: 'overview', label: 'Tổng quan & Báo cáo', icon: 'grid' },
  { id: 'sales', label: 'Đơn hàng & Vận chuyển', icon: 'bag' },
  { id: 'catalog', label: 'Sản phẩm & Danh mục', icon: 'box' },
  { id: 'stock', label: 'Quản lý kho hàng', icon: 'warehouse' },
  { id: 'content', label: 'Tiếp thị & Nội dung web', icon: 'megaphone' },
  { id: 'system', label: 'Cấu hình hệ thống', icon: 'settings' },
];
// Set group: null on any entry to make it a top-level link.
export const adminNav = [
  { id: 'dashboard', label: 'Tổng quan', href: '/quan-tri', group: 'overview', permission: 'dashboard.read' },
  { id: 'reports-editor', label: 'Báo cáo phân tích', href: '/quan-tri/bao-cao', group: 'overview', permission: 'reports.read' },
  { id: 'orders', label: 'Danh sách đơn hàng', href: '/quan-tri/don-hang', group: 'sales', permission: 'orders.read', badgeKey: 'pendingOrders', detail: true },
  { id: 'returns-editor', label: 'Xử lý đổi trả hàng', href: '/quan-tri/doi-tra', group: 'sales', permission: 'returns.manage' },
  { id: 'catalog-editor', label: 'Sản phẩm cha & SKU', href: '/quan-tri/san-pham', group: 'catalog', permission: 'catalog.read' },
  { id: 'taxonomy-editor', label: 'Danh mục & Thuộc tính', href: '/quan-tri/danh-muc', group: 'catalog', permission: 'catalog.read' },
  { id: 'products', label: 'Giá mặc định & trạng thái', href: '/quan-tri/gia-sku', group: 'catalog', permission: 'catalog.read' },
  { id: 'import-editor', label: 'Nhập / xuất CSV', href: '/quan-tri/csv-san-pham', group: 'catalog', permission: 'catalog.read' },
  { id: 'inventory', label: 'Tồn kho hiện tại', href: '/quan-tri/ton-kho', group: 'stock', permission: 'inventory.read' },
  { id: 'documents-editor', label: 'Phiếu nhập / xuất kho', href: '/quan-tri/phieu-kho', group: 'stock', permission: 'inventory.read' },
  { id: 'warehouse-editor', label: 'Thiết lập nhiều kho', href: '/quan-tri/kho-hang', group: 'stock', permission: 'inventory.read' },
  { id: 'coupons-editor', label: 'Mã giảm giá', href: '/quan-tri/ma-giam-gia', group: 'content', permission: 'promotions.manage' },
  { id: 'banners-editor', label: 'Banner & Poster Studio', href: '/quan-tri/banner', group: 'content', permission: 'banners.read' },
  { id: 'cms-editor', label: 'Tin tức & bài viết SEO', href: '/quan-tri/bai-viet', group: 'content', permission: 'content.read' },
  { id: 'media-editor', label: 'Thư viện media', href: '/quan-tri/media', group: 'content', permission: 'media.read' },
  { id: 'redirects-editor', label: 'Chuyển hướng SEO', href: '/quan-tri/chuyen-huong', group: 'content', permission: 'seo.manage' },
  { id: 'settings-editor', label: 'Thông tin công ty', href: '/quan-tri/cong-ty', group: 'system', permission: 'settings.read' },
  { id: 'users', label: 'Tài khoản & phân quyền', href: '/quan-tri/tai-khoan', group: 'system', permission: 'users.manage' },
  { id: 'audit', label: 'Nhật ký thao tác', href: '/quan-tri/nhat-ky', group: 'system', permission: 'audit.read' },
  { id: 'audit-tools', label: 'Lọc & xuất nhật ký', href: '/quan-tri/tra-cuu-nhat-ky', group: 'system', permission: 'audit.read' },
  { id: 'bank-settings-editor', label: 'Tài khoản nhận tiền', href: '/quan-tri/tai-khoan-ngan-hang', group: 'system', permission: 'settings.read' },
  { id: 'operations-editor', label: 'Trạng thái vận hành', href: '/quan-tri/van-hanh', group: 'system', permission: 'settings.read' },
];
export function matchAdminNav(pathname, items = adminNav) {
  return items.filter(item => pathname === item.href || (item.href !== '/quan-tri' && pathname.startsWith(item.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0] || null;
}
export function resolveAdminRoute(pathname) {
  const item = matchAdminNav(pathname);
  if (!item) return null;
  if (pathname === item.href) return { item, detailId: null };
  const suffix = pathname.slice(item.href.length + 1);
  if (!item.detail || !suffix || suffix.includes('/')) return null;
  try { return { item, detailId: decodeURIComponent(suffix) }; } catch { return null; }
}
export const normalizeAdminSearch = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi');
export function adminBadge(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? (count > 99 ? '99+' : String(Math.floor(count))) : '';
}
