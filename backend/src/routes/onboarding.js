import express from 'express';
import * as onboardingController from '../controllers/onboardingController.js';
import { authenticate, requireMasterAdmin } from '../middleware/auth.js';
import { onboardingEventsLimiter } from '../middleware/rateLimiter.js';
import {
  validateOnboardingStepPayload,
  validateOnboardingEventPayload
} from '../validators/onboardingValidator.js';

const router = express.Router();

router.get('/status', authenticate, requireMasterAdmin, onboardingController.getOnboardingStatus);
router.put('/step', authenticate, requireMasterAdmin, validateOnboardingStepPayload, onboardingController.saveOnboardingStep);
router.post('/complete', authenticate, requireMasterAdmin, onboardingController.completeOnboarding);
router.post('/events', authenticate, requireMasterAdmin, onboardingEventsLimiter, validateOnboardingEventPayload, onboardingController.trackOnboardingEvent);

export default router;
