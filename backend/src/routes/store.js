import express from 'express';
import * as storeController from '../controllers/storeController.js';
import { authenticateStoreCustomer, optionalStoreCustomer } from '../middleware/storeAuth.js';
import { storeAuthLimiter, storeTrackingLimiter } from '../middleware/rateLimiter.js';
import { requireTenantContext } from '../middleware/requireTenantContext.js';
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
    validateStoreOrderHistoryQuery
} from '../validators/storeValidator.js';

const router = express.Router();
router.use(requireTenantContext);

router.get('/catalog', validateStoreCatalogQuery, storeController.listStoreCatalog);
router.get('/locations', storeController.listStoreLocations);
router.post('/auth/register', storeAuthLimiter, validateStoreRegister, storeController.registerStoreCustomer);
router.post('/auth/login', storeAuthLimiter, validateStoreLogin, storeController.loginStoreCustomer);
router.get('/auth/me', authenticateStoreCustomer, storeController.getStoreCustomerMe);

router.get('/addresses', authenticateStoreCustomer, storeController.listStoreCustomerAddresses);
router.post('/addresses', authenticateStoreCustomer, validateStoreCreateAddress, storeController.createStoreCustomerAddress);
router.put('/addresses/:id', authenticateStoreCustomer, validateStoreAddressIdParam, validateStoreUpdateAddress, storeController.updateStoreCustomerAddress);
router.patch('/addresses/:id/default', authenticateStoreCustomer, validateStoreAddressIdParam, storeController.setDefaultStoreCustomerAddress);
router.delete('/addresses/:id', authenticateStoreCustomer, validateStoreAddressIdParam, storeController.deleteStoreCustomerAddress);

router.post('/cart/quote', optionalStoreCustomer, validateStoreQuote, storeController.cartQuote);
router.post('/checkout', optionalStoreCustomer, validateStoreCheckout, storeController.checkout);

router.get('/track/:tracking_pin', storeTrackingLimiter, validateStoreTrackingPinParam, storeController.trackOrder);
router.patch('/orders/:tracking_pin/cancel', storeTrackingLimiter, optionalStoreCustomer, validateStoreTrackingPinParam, validateStoreCancelOrder, storeController.cancelOrder);
router.get('/orders', authenticateStoreCustomer, validateStoreOrderHistoryQuery, storeController.listStoreCustomerOrders);

export default router;
