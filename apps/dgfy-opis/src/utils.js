const BACK_OFFICE_PAGE_ROUTES = Object.freeze({
  Dashboard: '/',
  Items: '/backoffice/catalog',
  Suppliers: '/backoffice/suppliers',
  PurchaseOrders: '/backoffice/purchase-orders',
  JobOrders: '/backoffice/job-orders',
  StockMovements: '/backoffice/stock-movements',
  DispatchOrders: '/backoffice/dispatch-orders',
  Services: '/backoffice/services',
  Fnb: '/backoffice/fnb',
  Hospitality: '/backoffice/hospitality',
  Sales: '/backoffice/sales',
  Reports: '/backoffice/reports',
  AiChat: '/backoffice/ai-chat',
  Settings: '/backoffice/settings'
});

export const createPageUrl = (pageName) => BACK_OFFICE_PAGE_ROUTES[pageName] || '/';

export const getPageNameFromPath = (pathname) => {
  const normalizedPath = String(pathname || '').replace(/\/+$/, '') || '/';
  const match = Object.entries(BACK_OFFICE_PAGE_ROUTES).find(([, route]) => normalizedPath === route);
  return match?.[0] || 'Dashboard';
};
