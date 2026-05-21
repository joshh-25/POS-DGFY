import express from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import {
    acceptDgfyInvitation,
    createDgfyHandoff,
    exchangeDgfyHandoff,
    getDgfyMe,
    loginDgfyAccount,
    logoutDgfyAccount,
    requestDgfyEmailVerification,
    verifyDgfyEmail,
    registerDgfyAccount
} from '../modules/dgfy/controllers/dgfyAuthHandlers.js';

const router = express.Router();

router.post('/auth/register', authLimiter, registerDgfyAccount);
router.post('/auth/login', authLimiter, loginDgfyAccount);
router.post('/auth/handoff/exchange', authLimiter, exchangeDgfyHandoff);
router.get('/auth/me', authenticateDgfyAccount, getDgfyMe);
router.post('/auth/logout', authenticateDgfyAccount, logoutDgfyAccount);
router.post('/auth/email-verification/request', authLimiter, authenticateDgfyAccount, requestDgfyEmailVerification);
router.post('/auth/email-verification/verify', authLimiter, authenticateDgfyAccount, verifyDgfyEmail);
router.post('/auth/handoff', authenticateDgfyAccount, createDgfyHandoff);
router.post('/invitations/:membership_id/accept', authenticateDgfyAccount, acceptDgfyInvitation);

export default router;
