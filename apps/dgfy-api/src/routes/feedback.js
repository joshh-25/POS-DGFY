import express from 'express';
import { submitFeedback } from '../controllers/feedbackController.js';
import { feedbackSubmissionLimiter } from '../middleware/rateLimiter.js';
import { resolveOptionalFeedbackIdentity } from '../modules/feedback/middleware/resolveOptionalFeedbackIdentity.js';
import { feedbackSubmissionValidator } from '../modules/feedback/middleware/feedbackSubmissionValidator.js';

const router = express.Router();

// POST /api/v1/feedback
router.post('/', feedbackSubmissionLimiter, resolveOptionalFeedbackIdentity, feedbackSubmissionValidator, submitFeedback);

export default router;
