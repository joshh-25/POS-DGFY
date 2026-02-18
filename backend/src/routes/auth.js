import express from 'express';
import * as authController from '../controllers/authController.js';
import { validateRegister, validateLogin, validateRefreshToken, validateEmailLookup, validateAcceptInvite, validateInviteToken } from '../validators/authValidator.js';
import { authenticate } from '../middleware/auth.js';
import { lookupLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', validateRefreshToken, authController.refreshToken);
// Logout - invalidates the token
router.post('/logout', authenticate, authController.logout);

// Email lookup for token-less login (finds which tenant an email belongs to)
router.post('/lookup', lookupLimiter, validateEmailLookup, authController.lookupEmail);

// Validate company token (for registration page to show company name)
router.get('/validate-token/:token', authController.validateToken);

// Invitation acceptance
router.get('/validate-invite/:token', validateInviteToken, authController.validateInviteToken);
router.post('/accept-invite', validateAcceptInvite, authController.acceptInvitation);

export default router;

