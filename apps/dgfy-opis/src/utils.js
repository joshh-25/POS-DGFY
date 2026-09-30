const BACK_OFFICE_PAGE_ROUTES = Object.freeze({
  Dashboard: '/',
  Items: '/catalog',
  Suppliers: '/suppliers',
  PurchaseOrders: '/purchase-orders',
  JobOrders: '/job-orders',
  StockMovements: '/stock-movements',
  DispatchOrders: '/dispatch-orders',
  Services: '/services',
  Fnb: '/fnb',
  Hospitality: '/hospitality',
  Sales: '/sales',
  Reports: '/reports',
  AiChat: '/ai-chat',
  Settings: '/settings'
});

export const createPageUrl = (pageName) => BACK_OFFICE_PAGE_ROUTES[pageName] || '/';

export const getPageNameFromPath = (pathname) => {
  const rawPath = String(pathname || '').replace(/\/+$/, '') || '/';
  const suffix = rawPath.replace(/^\/(?:backoffice|business-admin)(?=\/|$)/, '') || '/';
  const normalizedPath = suffix === '/overview' ? '/' : suffix;
  const match = Object.entries(BACK_OFFICE_PAGE_ROUTES).find(([, route]) => normalizedPath === route);
  return match?.[0] || 'Dashboard';
};
