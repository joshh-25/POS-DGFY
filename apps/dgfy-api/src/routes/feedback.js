import express from 'express';
import { submitFeedback } from '../controllers/feedbackController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// POST /api/v1/feedback
router.post('/', authenticate, submitFeedback);

export default router;
