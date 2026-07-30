import express from 'express';
import { adminLogin, adminLogout, adminMe } from '../controllers/adminAuthController.js';
import { authenticateAdmin, requireAdminPermission } from '../middleware/auth.js';
import { adminAuthLimiter } from '../middleware/rateLimiter.js';
import { getFilteredFeedback, getFeedbackStats } from '../services/feedbackService.js';
import { PLATFORM_ADMIN_PERMISSION_KEYS } from '../modules/platformAdmin/constants/permissions.js';
import { changeOwnPlatformAdminPassword } from '../modules/platformAdmin/controllers/platformAdminUserHandlers.js';

const router = express.Router();

// POST /api/v1/admin/login - Admin authentication
router.post('/login', adminAuthLimiter, adminLogin);
router.post('/logout', authenticateAdmin, adminLogout);
router.get('/me', authenticateAdmin, adminMe);
router.post('/change-password', authenticateAdmin, changeOwnPlatformAdminPassword);

// GET /api/v1/admin/feedback - Get all feedback (protected)
router.get('/feedback', authenticateAdmin, requireAdminPermission(PLATFORM_ADMIN_PERMISSION_KEYS.FEEDBACK), async (req, res) => {
    try {
        const filters = {
            type: req.query.type,
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };

        const feedback = await getFilteredFeedback(filters);

        res.json({
            success: true,
            data: feedback,
            count: feedback.length
        });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve feedback'
        });
    }
});

// GET /api/v1/admin/feedback/stats - Get feedback statistics (protected)
router.get('/feedback/stats', authenticateAdmin, requireAdminPermission(PLATFORM_ADMIN_PERMISSION_KEYS.FEEDBACK), async (req, res) => {
    try {
        const stats = await getFeedbackStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching feedback stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve statistics'
        });
    }
});

export default router;
