import express from 'express';
import multer from 'multer';
import { authenticateAdmin } from '../middleware/auth.js';
import { tenantIntakeHandlers } from '../modules/tenantIntake/controllers/tenantIntakeHandlers.js';
import { MAX_INTAKE_BYTES } from '../modules/tenantIntake/services/intakeExtractionService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_INTAKE_BYTES, files: 1, fields: 3, fieldSize: MAX_INTAKE_BYTES } }).single('file');
export const buildTenantIntakeRouter = ({ authenticate = authenticateAdmin, handlers = tenantIntakeHandlers } = {}) => {
    const router = express.Router();
    router.use(authenticate);
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.get('/capabilities', handlers.capabilities);
    router.post('/proposals/extract', (req, res, next) => upload(req, res, (error) => {
        if (error) return res.status(400).json({ success: false, message: 'Submit one file up to 2 MiB with target and reason fields.' });
        next();
    }), handlers.extract);
    router.post('/proposals', handlers.propose);
    router.get('/proposals', handlers.list);
    router.get('/proposals/:id', handlers.get);
    router.patch('/proposals/:id', handlers.edit);
    router.post('/proposals/:id/reject', handlers.reject);
    router.post('/proposals/:id/confirm', handlers.confirm);
    return router;
};
export default buildTenantIntakeRouter();
