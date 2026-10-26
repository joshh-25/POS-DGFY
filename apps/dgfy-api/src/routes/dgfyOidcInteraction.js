import express from 'express';
import { authenticateDgfyAccount, authenticateDgfyAccountOptional } from '../middleware/dgfyAuth.js';
import { oidcLimiter } from '../middleware/rateLimiter.js';
import { createOidcInteractionHandlers } from '../modules/partnerIdentity/controllers/oidcInteractionHandlers.js';
import { oidcInteractionUseCases } from '../modules/partnerIdentity/oidcInteractionRuntime.js';

const router = express.Router();
const handlers = createOidcInteractionHandlers({ interactionUseCases: oidcInteractionUseCases });

router.use(oidcLimiter);
router.post('/interactions/:id/bind', handlers.bindStorefrontBrowser);
router.get('/interactions/:id', authenticateDgfyAccountOptional, handlers.getInteraction);
router.post('/interactions/:id/complete', authenticateDgfyAccount, handlers.completeInteraction);
router.get('/errors/:id', handlers.getInteractionError);

export default router;
