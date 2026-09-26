const MODULE_ROUTE_KEYS = Object.freeze({
  catalog: 'catalog',
  suppliers: 'suppliers',
  'purchase-orders': 'purchase-orders',
  'job-orders': 'job-orders',
  'stock-movements': 'stock-movements',
  'dispatch-orders': 'dispatch-orders',
  services: 'services',
  fnb: 'fnb',
  hospitality: 'hospitality',
  sales: 'sales',
  'ai-chat': 'ai-chat'
});

export const buildMerchantBackOfficePath = (section = 'overview', query = '') => {
  const normalizedSection = String(section || 'overview').trim().toLowerCase();
  const pathSection = MODULE_ROUTE_KEYS[normalizedSection] || (normalizedSection === 'overview' ? 'overview' : 'overview');
  const rawQuery = String(query || '').trim();
  const normalizedQuery = rawQuery ? (rawQuery.startsWith('?') ? rawQuery : `?${rawQuery}`) : '';
  return `/backoffice/${pathSection}${normalizedQuery}`;
};

export const merchantBackOfficeModuleKeys = Object.freeze(Object.keys(MODULE_ROUTE_KEYS));
