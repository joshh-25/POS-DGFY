import { Router } from 'express';
import healthRoutes from './health.js';
import dgfyAuthRoutes from '../modules/dgfyAuth/routes/dgfyAuthRoutes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/dgfy', dgfyAuthRoutes);

export default router;
