import { Router } from 'express';
import sequelize from '../config/db.js';

const router = Router();

router.get('/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        return res.status(200).json({ success: true, data: { status: 'ok' } });
    } catch (error) {
        return res.status(503).json({ success: false, data: { status: 'db_unavailable' } });
    }
});

export default router;
