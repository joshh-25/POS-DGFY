import express from 'express';
import * as alertController from '../controllers/alertController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', alertController.generateAlerts);
router.post('/generate', alertController.generateAlerts);

export default router;

