import express from 'express';
import * as salesController from '../controllers/salesController.js';
import { authenticate } from '../middleware/auth.js';
import { validateSalesTransactionsQuery } from '../validators/salesValidator.js';

const router = express.Router();

router.get('/transactions', authenticate, validateSalesTransactionsQuery, salesController.listSalesTransactions);

export default router;
