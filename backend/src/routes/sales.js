import express from 'express';
import * as salesController from '../controllers/salesController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/transactions', authenticate, salesController.listSalesTransactions);

export default router;

