const BACK_OFFICE_PAGE_ROUTES = Object.freeze({
  Dashboard: '/business-admin/overview',
  Items: '/business-admin/catalog',
  Suppliers: '/business-admin/suppliers',
  PurchaseOrders: '/business-admin/purchase-orders',
  JobOrders: '/business-admin/job-orders',
  StockMovements: '/business-admin/stock-movements',
  DispatchOrders: '/business-admin/dispatch-orders',
  Services: '/business-admin/services',
  Fnb: '/business-admin/fnb',
  Hospitality: '/business-admin/hospitality',
  Sales: '/business-admin/sales',
  Reports: '/business-admin/reports',
  AiChat: '/business-admin/ai-chat',
  Settings: '/business-admin/settings'
});

export const createPageUrl = (pageName) => BACK_OFFICE_PAGE_ROUTES[pageName] || '/business-admin/overview';

export const getPageNameFromPath = (pathname) => {
  const normalizedPath = String(pathname || '').replace(/\/+$/, '') || '/';
  const match = Object.entries(BACK_OFFICE_PAGE_ROUTES).find(([, route]) => normalizedPath === route);
  return match?.[0] || 'Dashboard';
};
