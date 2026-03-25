/**
 * Utility functions for the application
 */

/**
 * Create a URL for a page route
 * @param {string} pageName - The name of the page
 * @returns {string} The URL path for the page
 */
export function createPageUrl(pageName) {
  const pageMap = {
    'Dashboard': '/',
    'Items': '/items',
    'Suppliers': '/suppliers',
    'PurchaseOrders': '/purchase-orders',
    'JobOrders': '/job-orders',
    'StockMovements': '/stock-movements',
    'DispatchOrders': '/dispatch-orders',
    'POS': '/pos',
    'Reports': '/reports',
    'AiChat': '/ai-chat',
    'Settings': '/settings',
  };

  return pageMap[pageName] || '/';
}

/**
 * Get page name from URL path
 * @param {string} pathname - The current pathname
 * @returns {string} The page name
 */
export function getPageNameFromPath(pathname) {
  const pathMap = {
    '/': 'Dashboard',
    '/items': 'Items',
    '/suppliers': 'Suppliers',
    '/purchase-orders': 'PurchaseOrders',
    '/job-orders': 'JobOrders',
    '/stock-movements': 'StockMovements',
    '/dispatch-orders': 'DispatchOrders',
    '/pos': 'POS',
    '/reports': 'Reports',
    '/ai-chat': 'AiChat',
    '/settings': 'Settings',
  };

  return pathMap[pathname] || 'Dashboard';
}
