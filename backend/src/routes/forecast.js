import express from 'express';
import * as forecastController from '../controllers/forecastController.js';
import { authenticate, requirePremium } from '../middleware/auth.js';
import { tenantHandler } from '../middleware/tenantHandler.js';

const router = express.Router();
router.use(authenticate);
router.use(tenantHandler);
router.use(requirePremium);

router.get('/stock-levels', forecastController.getStockForecast);

export default router;

