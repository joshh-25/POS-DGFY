import express from 'express';
import { adminLogin } from '../controllers/adminAuthController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { getFilteredFeedback, getFeedbackStats } from '../services/feedbackService.js';

const router = express.Router();

// POST /api/v1/admin/login - Admin authentication
router.post('/login', adminLogin);

// GET /api/v1/admin/feedback - Get all feedback (protected)
router.get('/feedback', authenticateAdmin, async (req, res) => {
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
router.get('/feedback/stats', authenticateAdmin, async (req, res) => {
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
