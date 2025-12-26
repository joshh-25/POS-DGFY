import express from 'express';
import * as forecastController from '../controllers/forecastController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/stock-levels', forecastController.getStockForecast);

export default router;

