import express from 'express';
import * as storeController from '../controllers/storeController.js';
import {
    listPublicCatalog as listPublicServiceCatalog,
    listPublicBookings as listPublicServiceBookings,
    createPublicBooking as createPublicServiceBooking,
    getPublicBooking as getPublicServiceBooking,
    claimPublicBooking as claimPublicServiceBooking,
    createPublicWaitlistEntry as createPublicServiceWaitlistEntry
} from '../modules/services/controllers/serviceHandlers.js';
import {
    createPublicReservation as createPublicFnbReservation
} from '../modules/fnb/controllers/fnbHandlers.js';
import { authenticateStoreCustomer, optionalStoreCustomer } from '../middleware/storeAuth.js';
import { storeAuthLimiter, storeTrackingLimiter, storefrontFollowLimiter, inventoryPushLimiter } from '../middleware/rateLimiter.js';
import { validateInventoryPush } from '../validators/geoSearchValidator.js';
import { enqueueInventoryPush } from '../workers/geoInventoryWorker.js';
import { requireTenantContext } from '../middleware/requireTenantContext.js';
import { setReadCacheControl, setNoStoreCacheControl } from '../middleware/cachePolicy.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import {
    validateStoreRegister,
    validateStoreLogin,
    validateStoreCatalogQuery,
    validateStoreQuote,
    validateStoreCheckout,
    validateStoreCheckoutPaymentSession,
    validateStoreCreateAddress,
    validateStoreUpdateAddress,
    validateStoreAddressIdParam,
    validateStoreTrackingPinParam,
    validateStorePaymentSessionParam,
    validateStoreCancelOrder,
    validateStoreClaimOrder,
    validateStoreOrderHistoryQuery,
    validateStoreQrQuery,
    validateStorefrontFollowBody,
    validateStorefrontFollowQuery
} from '../validators/storeValidator.js';
import {
    validateServiceCatalogQuery,
    validateServiceBookingQuery,
    validateCreateServiceBooking,
    validateServiceBookingReferenceParam,
    validateClaimServiceBooking,
    validateCreateServiceWaitlistEntry
} from '../validators/serviceValidator.js';
import {
    validateCreateFnbReservation
} from '../validators/fnbValidator.js';

const router = express.Router();
router.use(requireTenantContext);
const catalogReadCacheControl = setReadCacheControl({
    maxAgeSeconds: 45,
    sMaxAgeSeconds: 45,
    staleWhileRevalidateSeconds: 90,
    staleIfErrorSeconds: 180,
    scope: 'public',
    varyHeaders: ['X-Store-Slug']
});
const locationsReadCacheControl = setReadCacheControl({
    maxAgeSeconds: 30,
    sMaxAgeSeconds: 30,
    staleWhileRevalidateSeconds: 60,
    staleIfErrorSeconds: 120,
    scope: 'public',
    varyHeaders: ['X-Store-Slug']
});
const trackingReadCacheControl = setReadCacheControl({
    maxAgeSeconds: 5,
    sMaxAgeSeconds: 5,
    staleWhileRevalidateSeconds: 10,
    staleIfErrorSeconds: 20,
    scope: 'private',
    varyHeaders: ['X-Store-Slug']
});

router.get('/catalog', catalogReadCacheControl, validateStoreCatalogQuery, storeController.listStoreCatalog);
router.get('/qr/resolve', catalogReadCacheControl, validateStoreQrQuery, storeController.resolveStoreQr);
router.get('/services/catalog', requireWorkflowCapability('services', 'Services'), catalogReadCacheControl, validateServiceCatalogQuery, listPublicServiceCatalog);
router.get('/locations', locationsReadCacheControl, storeController.listStoreLocations);
router.post('/auth/register', setNoStoreCacheControl, storeAuthLimiter, validateStoreRegister, storeController.registerStoreCustomer);
router.post('/auth/login', setNoStoreCacheControl, storeAuthLimiter, validateStoreLogin, storeController.loginStoreCustomer);
router.get('/auth/me', setNoStoreCacheControl, authenticateStoreCustomer, storeController.getStoreCustomerMe);

router.get('/addresses', setNoStoreCacheControl, authenticateStoreCustomer, storeController.listStoreCustomerAddresses);
router.post('/addresses', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreCreateAddress, storeController.createStoreCustomerAddress);
router.put('/addresses/:id', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreAddressIdParam, validateStoreUpdateAddress, storeController.updateStoreCustomerAddress);
router.patch('/addresses/:id/default', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreAddressIdParam, storeController.setDefaultStoreCustomerAddress);
router.delete('/addresses/:id', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreAddressIdParam, storeController.deleteStoreCustomerAddress);

router.post('/cart/quote', setNoStoreCacheControl, optionalStoreCustomer, validateStoreQuote, storeController.cartQuote);
router.post('/checkout/payment-sessions', setNoStoreCacheControl, optionalStoreCustomer, validateStoreCheckoutPaymentSession, storeController.createCheckoutPaymentSession);
router.get('/checkout/payment-sessions/:payment_session_id', setNoStoreCacheControl, optionalStoreCustomer, validateStorePaymentSessionParam, storeController.getCheckoutPaymentSession);
router.post('/checkout', setNoStoreCacheControl, optionalStoreCustomer, validateStoreCheckout, storeController.checkout);
router.get('/services/bookings', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, authenticateStoreCustomer, validateServiceBookingQuery, listPublicServiceBookings);
router.post('/services/bookings', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateServiceBooking, createPublicServiceBooking);
router.get('/services/bookings/:public_reference', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, storeTrackingLimiter, validateServiceBookingReferenceParam, getPublicServiceBooking);
router.post('/services/bookings/:public_reference/claim', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, authenticateStoreCustomer, validateServiceBookingReferenceParam, validateClaimServiceBooking, claimPublicServiceBooking);
router.post('/services/waitlist', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateServiceWaitlistEntry, createPublicServiceWaitlistEntry);
router.post('/fnb/reservations', requireWorkflowCapability('fnbDining', 'Food & Beverage'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateFnbReservation, createPublicFnbReservation);

router.get('/track/:tracking_pin', storeTrackingLimiter, trackingReadCacheControl, validateStoreTrackingPinParam, storeController.trackOrder);
router.post('/orders/:tracking_pin/claim', setNoStoreCacheControl, storeTrackingLimiter, authenticateStoreCustomer, validateStoreTrackingPinParam, validateStoreClaimOrder, storeController.claimOrder);
router.patch('/orders/:tracking_pin/cancel', setNoStoreCacheControl, storeTrackingLimiter, optionalStoreCustomer, validateStoreTrackingPinParam, validateStoreCancelOrder, storeController.cancelOrder);
router.get('/orders', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreOrderHistoryQuery, storeController.listStoreCustomerOrders);
router.get('/follow/status', setNoStoreCacheControl, storefrontFollowLimiter, optionalStoreCustomer, validateStorefrontFollowQuery, storeController.getStorefrontFollowStatus);
router.post('/follow', setNoStoreCacheControl, storefrontFollowLimiter, optionalStoreCustomer, validateStorefrontFollowBody, storeController.followStorefront);
router.delete('/follow', setNoStoreCacheControl, storefrontFollowLimiter, optionalStoreCustomer, validateStorefrontFollowBody, storeController.unfollowStorefront);

router.post('/inventory/push', setNoStoreCacheControl, inventoryPushLimiter, validateInventoryPush, async (req, res, next) => {
    try {
        const { location_id, items } = req.validatedBody;
        const tenantId = req.tenant?.id;
        await enqueueInventoryPush({ tenant_id: tenantId, location_id: location_id ?? null, items });
        return res.status(202).json({ success: true, data: { queued: items.length }, timestamp: new Date().toISOString() });
    } catch (err) {
        next(err);
    }
});

export default router;
