import express from 'express';
import * as posController from '../controllers/posController.js';
import { authenticate, checkPermission, requirePremium } from '../middleware/auth.js';
import { posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validatePosCheckout,
    validatePosCatalogQuery,
    validatePosTransactionsQuery,
    validatePosTransactionIdParam,
    validateZReadingDateParam,
    validateCloseDayBody
} from '../validators/posValidator.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePremium);
router.use(posLimiter);

router.get('/catalog', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogQuery, posController.listCatalog);
router.post('/checkouts', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosCheckout, posController.checkout);
router.get('/transactions', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionsQuery, posController.listTransactions);
router.get('/transactions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionIdParam, posController.getTransactionById);
router.post('/z-reading/close-day', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateCloseDayBody, posController.closeDayZReading);
router.get('/z-reading/:date', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingDateParam, posController.getDailyZReading);

export default router;
