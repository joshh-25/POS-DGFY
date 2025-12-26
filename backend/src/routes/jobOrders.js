import express from 'express';
import * as jobOrderController from '../controllers/jobOrderController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', jobOrderController.getJobOrders);
router.get('/:jo_id', jobOrderController.getJobOrderById);
router.post('/', jobOrderController.createJobOrder);
router.post('/:jo_id/complete', jobOrderController.completeJobOrder);

export default router;

