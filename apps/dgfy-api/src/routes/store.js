import express from 'express';
import * as storeController from '../controllers/storeController.js';
import {
    listPublicCatalog as listPublicServiceCatalog,
    getPublicAvailability as getPublicServiceAvailability,
    createPublicBookingHold as createPublicServiceBookingHold,
    listPublicBookings as listPublicServiceBookings,
    createPublicBooking as createPublicServiceBooking,
    createPublicBookingBatch as createPublicServiceBookingBatch,
    getPublicBooking as getPublicServiceBooking,
    claimPublicBooking as claimPublicServiceBooking,
    createPublicWaitlistEntry as createPublicServiceWaitlistEntry
} from '../modules/services/controllers/serviceHandlers.js';
import {
    createPublicReservation as createPublicFnbReservation
} from '../modules/fnb/controllers/fnbHandlers.js';
import { authenticateStoreCustomer, optionalStoreCustomer } from '../middleware/storeAuth.js';
import { storeGuestCheckoutOtpRequestLimiter, storeGuestCheckoutOtpVerifyLimiter, storeAuthLimiter, storeTrackingLimiter, storeTrackingReadLimiter, storeLocationsLimiter, storefrontFollowLimiter, inventoryPushLimiter } from '../middleware/rateLimiter.js';
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
    validateStoreGuestCheckoutOtpRequest,
    validateStoreGuestCheckoutOtpVerify,
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
    validateServiceAvailabilityQuery,
    validateServiceBookingQuery,
    validateCreateServiceBooking,
    validateCreateServiceBookingHold,
    validateCreateServiceBookingBatch,
    validateServiceBookingReferenceParam,
    validateClaimServiceBooking,
    validateCreateServiceWaitlistEntry
} from '../validators/serviceValidator.js';
import {
    validateCreateFnbReservation
} from '../validators/fnbValidator.js';
import { getStorefrontDomainContext } from '../modules/storefrontDomains/controllers/storefrontDomainHandlers.js';

const router = express.Router();
router.get('/domain-context', setNoStoreCacheControl, getStorefrontDomainContext);
router.use(requireTenantContext);
// `storefront` is held by every mode, so this changes nothing today; it makes
// the capability real so a Store Profile that can subtract modules has a
// working off-switch for the whole public storefront surface.
router.use(requireWorkflowCapability('storefront', 'Online Store'));
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

// #603: a voucher-coded catalog/QR request resolves a per-buyer display price, same class of
// problem as the affiliate attribution cookie (#671, not fixed here) -- a shared public cache must
// not serve one buyer's voucher-priced response to another. `voucher_code` is a query param (not a
// cookie), so it's simplest to just switch the response to no-store rather than try to add it to
// `Vary`, which most shared caches don't key on query params by convention anyway.
const bypassCacheForVoucherCode = (req, res, next) => {
    if (String(req.query?.voucher_code || '').trim()) {
        return setNoStoreCacheControl(req, res, next);
    }
    return next();
};

router.get('/catalog', catalogReadCacheControl, bypassCacheForVoucherCode, validateStoreCatalogQuery, storeController.listStoreCatalog);
router.get('/qr/resolve', catalogReadCacheControl, bypassCacheForVoucherCode, validateStoreQrQuery, storeController.resolveStoreQr);
router.get('/services/catalog', requireWorkflowCapability('services', 'Services'), catalogReadCacheControl, validateServiceCatalogQuery, listPublicServiceCatalog);
router.get('/locations', storeLocationsLimiter, locationsReadCacheControl, storeController.listStoreLocations);
router.post('/auth/register', setNoStoreCacheControl, storeAuthLimiter, validateStoreRegister, storeController.registerStoreCustomer);
router.post('/auth/login', setNoStoreCacheControl, storeAuthLimiter, validateStoreLogin, storeController.loginStoreCustomer);
router.get('/auth/me', setNoStoreCacheControl, authenticateStoreCustomer, storeController.getStoreCustomerMe);

router.get('/addresses', setNoStoreCacheControl, authenticateStoreCustomer, storeController.listStoreCustomerAddresses);
router.post('/addresses', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreCreateAddress, storeController.createStoreCustomerAddress);
router.put('/addresses/:id', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreAddressIdParam, validateStoreUpdateAddress, storeController.updateStoreCustomerAddress);
router.patch('/addresses/:id/default', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreAddressIdParam, storeController.setDefaultStoreCustomerAddress);
router.delete('/addresses/:id', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreAddressIdParam, storeController.deleteStoreCustomerAddress);

router.post('/cart/quote', setNoStoreCacheControl, optionalStoreCustomer, validateStoreQuote, storeController.cartQuote);
router.post('/checkout/guest-otp/request', setNoStoreCacheControl, storeGuestCheckoutOtpRequestLimiter, validateStoreGuestCheckoutOtpRequest, storeController.requestGuestCheckoutOtp);
router.post('/checkout/guest-otp/verify', setNoStoreCacheControl, storeGuestCheckoutOtpVerifyLimiter, validateStoreGuestCheckoutOtpVerify, storeController.verifyGuestCheckoutOtp);
router.post('/checkout/payment-sessions', setNoStoreCacheControl, optionalStoreCustomer, validateStoreCheckoutPaymentSession, storeController.createCheckoutPaymentSession);
router.get('/checkout/payment-sessions/:payment_session_id', setNoStoreCacheControl, optionalStoreCustomer, validateStorePaymentSessionParam, storeController.getCheckoutPaymentSession);
router.post('/checkout/payment-sessions/:payment_session_id/confirm-test', setNoStoreCacheControl, optionalStoreCustomer, validateStorePaymentSessionParam, storeController.confirmCheckoutSandboxPayment);
router.post('/checkout', setNoStoreCacheControl, optionalStoreCustomer, validateStoreCheckout, storeController.checkout);
router.get('/services/availability', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, validateServiceAvailabilityQuery, getPublicServiceAvailability);
router.get('/services/bookings', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, authenticateStoreCustomer, validateServiceBookingQuery, listPublicServiceBookings);
router.post('/services/bookings', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateServiceBooking, createPublicServiceBooking);
router.post('/services/bookings/batch', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateServiceBookingBatch, createPublicServiceBookingBatch);
router.post('/services/holds', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateServiceBookingHold, createPublicServiceBookingHold);
router.get('/services/bookings/:public_reference', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, storeTrackingLimiter, validateServiceBookingReferenceParam, getPublicServiceBooking);
router.post('/services/bookings/:public_reference/claim', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, authenticateStoreCustomer, validateServiceBookingReferenceParam, validateClaimServiceBooking, claimPublicServiceBooking);
router.post('/services/waitlist', requireWorkflowCapability('services', 'Services'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateServiceWaitlistEntry, createPublicServiceWaitlistEntry);
router.post('/fnb/reservations', requireWorkflowCapability('fnbDining', 'Food & Beverage'), setNoStoreCacheControl, optionalStoreCustomer, validateCreateFnbReservation, createPublicFnbReservation);

router.get('/track/:tracking_pin', storeTrackingReadLimiter, trackingReadCacheControl, validateStoreTrackingPinParam, storeController.trackOrder);
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
