import express from 'express';
import * as storeController from '../controllers/storeController.js';
import { authenticateStoreCustomer, optionalStoreCustomer } from '../middleware/storeAuth.js';
import { storeAuthLimiter, storeTrackingLimiter, storefrontFollowLimiter } from '../middleware/rateLimiter.js';
import { requireTenantContext } from '../middleware/requireTenantContext.js';
import { setReadCacheControl, setNoStoreCacheControl } from '../middleware/cachePolicy.js';
import {
    validateStoreRegister,
    validateStoreLogin,
    validateStoreCatalogQuery,
    validateStoreQuote,
    validateStoreCheckout,
    validateStoreCreateAddress,
    validateStoreUpdateAddress,
    validateStoreAddressIdParam,
    validateStoreTrackingPinParam,
    validateStoreCancelOrder,
    validateStoreOrderHistoryQuery,
    validateStorefrontFollowBody,
    validateStorefrontFollowQuery
} from '../validators/storeValidator.js';

const router = express.Router();
router.use(requireTenantContext);
const catalogReadCacheControl = setReadCacheControl({
    maxAgeSeconds: 45,
    sMaxAgeSeconds: 45,
    staleWhileRevalidateSeconds: 90,
    staleIfErrorSeconds: 180,
    scope: 'public'
});
const locationsReadCacheControl = setReadCacheControl({
    maxAgeSeconds: 30,
    sMaxAgeSeconds: 30,
    staleWhileRevalidateSeconds: 60,
    staleIfErrorSeconds: 120,
    scope: 'public'
});
const trackingReadCacheControl = setReadCacheControl({
    maxAgeSeconds: 5,
    sMaxAgeSeconds: 5,
    staleWhileRevalidateSeconds: 10,
    staleIfErrorSeconds: 20,
    scope: 'private'
});

router.get('/catalog', catalogReadCacheControl, validateStoreCatalogQuery, storeController.listStoreCatalog);
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
router.post('/checkout', setNoStoreCacheControl, optionalStoreCustomer, validateStoreCheckout, storeController.checkout);

router.get('/track/:tracking_pin', storeTrackingLimiter, trackingReadCacheControl, validateStoreTrackingPinParam, storeController.trackOrder);
router.patch('/orders/:tracking_pin/cancel', setNoStoreCacheControl, storeTrackingLimiter, optionalStoreCustomer, validateStoreTrackingPinParam, validateStoreCancelOrder, storeController.cancelOrder);
router.get('/orders', setNoStoreCacheControl, authenticateStoreCustomer, validateStoreOrderHistoryQuery, storeController.listStoreCustomerOrders);
router.get('/follow/status', setNoStoreCacheControl, storefrontFollowLimiter, optionalStoreCustomer, validateStorefrontFollowQuery, storeController.getStorefrontFollowStatus);
router.post('/follow', setNoStoreCacheControl, storefrontFollowLimiter, optionalStoreCustomer, validateStorefrontFollowBody, storeController.followStorefront);
router.delete('/follow', setNoStoreCacheControl, storefrontFollowLimiter, optionalStoreCustomer, validateStorefrontFollowBody, storeController.unfollowStorefront);

export default router;
