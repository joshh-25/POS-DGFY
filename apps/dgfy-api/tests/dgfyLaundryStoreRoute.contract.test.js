import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storeRoutes = readFileSync(resolve(process.cwd(), 'src/routes/store.js'), 'utf8');
const legacyRoutes = readFileSync(resolve(process.cwd(), 'src/routes/dgfyLaundryOrders.js'), 'utf8');

describe('DGLaundry public storefront route contract', () => {
  it('mounts the tenant-scoped catalog, availability, quote, and per-kilo order routes behind the services capability', () => {
    expect(storeRoutes).toContain("router.get('/laundry/catalog', requireWorkflowCapability('services', 'Services'), catalogReadCacheControl, validateDgfyLaundryStoreScopeQuery, getPublicLaundryCatalog);");
    expect(storeRoutes).toContain("router.get('/laundry/availability', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, validateDgfyLaundryStoreScopeQuery, getPublicLaundryAvailability);");
    expect(storeRoutes).toContain("router.post('/laundry/quotes', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateDgfyLaundryStoreQuote, createPublicLaundryQuote);");
    expect(storeRoutes).toContain("router.post('/laundry/orders', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateDgfyLaundryStoreOrder, submitPublicLaundryOrder);");
  });

  it('keeps order read and cancellation on the Store customer or guest-capability surface', () => {
    expect(storeRoutes).toContain("router.get('/laundry/orders/:externalOrderReference', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, storeTrackingLimiter, optionalStoreCustomer, validateDgfyLaundryStoreOrderParam, validateDgfyLaundryStoreScopeQuery, getPublicLaundryOrder);");
    expect(storeRoutes).toContain("router.post('/laundry/orders/:externalOrderReference/cancel', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, storeTrackingLimiter, optionalStoreCustomer, validateDgfyLaundryStoreOrderParam, validateDgfyLaundryStoreMutation, cancelPublicLaundryOrder);");
    expect(legacyRoutes).not.toContain("'/api/v1/dgfy/laundry/");
    expect(legacyRoutes).toContain("'/api/v1/integrations/dglaundry/events'");
  });
});
