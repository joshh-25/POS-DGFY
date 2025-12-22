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
    'Reports': '/reports',
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
    '/reports': 'Reports',
    '/settings': 'Settings',
  };
  
  return pathMap[pathname] || 'Dashboard';
}

