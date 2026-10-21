import dbStore from '../utils/dbStore.js';
import { getCachedCapabilityEnabled } from '../modules/shared/utils/tenantCapabilitySettingCache.js';

// Existing-order operations remain available after a store stops accepting new activity.
// A new public route is denied by default until explicitly reviewed here.
const EXISTING_ORDER_ROUTES = Object.freeze({
  store: [
    ['GET', /^\/track\/[^/]+$/],
    ['POST', /^\/track\/[^/]+\/push-tokens$/],
    ['DELETE', /^\/track\/[^/]+\/push-tokens$/],
    ['PATCH', /^\/orders\/[^/]+\/cancel$/],
    ['POST', /^\/orders\/[^/]+\/claim$/],
    ['GET', /^\/orders$/],
    ['POST', /^\/auth\/login$/],
    ['GET', /^\/auth\/me$/],
    ['GET', /^\/checkout\/payment-sessions\/[^/]+$/],
    ['POST', /^\/checkout\/payment-sessions\/[^/]+\/(?:cancel|reconcile-test)$/],
    ['GET', /^\/services\/bookings(?:\/[^/]+)?$/],
    ['POST', /^\/services\/bookings\/[^/]+\/claim$/],
    ['GET', /^\/laundry\/orders\/[^/]+$/],
    ['PATCH', /^\/laundry\/orders\/[^/]+$/],
    ['POST', /^\/laundry\/orders\/[^/]+\/cancel$/],
    ['GET', /^\/laundry\/payment-sessions\/[^/]+$/],
    ['POST', /^\/laundry\/payment-sessions\/[^/]+\/cancel$/]
  ],
  hospitality: [
    ['GET', /^\/bookings(?:\/[^/]+)?$/],
    ['POST', /^\/bookings\/[^/]+\/claim$/]
  ]
});

export const isExistingOrderRoute = (surface, method, path) => (
  (EXISTING_ORDER_ROUTES[surface] || []).some(([allowedMethod, pattern]) =>
    method === allowedMethod && pattern.test(String(path || '').replace(/\/+$/, '') || '/')
  )
);

export const requireStorefrontVisible = (surface = 'store') => async (req, res, next) => {
  try {
    if (isExistingOrderRoute(surface, req.method, req.path)) return next();
    const tenantId = req.tenant?.id;
    const SystemSetting = dbStore.getStore?.()?.SystemSetting;
    if (!tenantId || !SystemSetting) {
      return res.status(503).set('Cache-Control', 'no-store').json({ success: false, code: 'STOREFRONT_VISIBILITY_UNAVAILABLE' });
    }
    const visible = await getCachedCapabilityEnabled(tenantId, 'store_is_visible', async () => {
      const row = await SystemSetting.findOne({
        where: { setting_key: 'store_is_visible' }, attributes: ['setting_value']
      });
      // Discovery treats absent and unparseable rows as visible for legacy tenants.
      const value = String(row?.setting_value ?? '').trim().toLowerCase();
      return !['false', '0', 'no', 'off'].includes(value);
    });
    if (!visible) return res.status(404).set('Cache-Control', 'no-store').json({ success: false, code: 'STORE_NOT_VISIBLE' });
    return next();
  } catch (error) {
    return next(error);
  }
};
