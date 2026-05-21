import express from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import {
    acceptDgfyInvitation,
    getDgfyMe,
    loginDgfyAccount,
    registerDgfyAccount
} from '../modules/dgfy/controllers/dgfyAuthHandlers.js';

const router = express.Router();

router.post('/auth/register', authLimiter, registerDgfyAccount);
router.post('/auth/login', authLimiter, loginDgfyAccount);
router.get('/auth/me', authenticateDgfyAccount, getDgfyMe);
router.post('/invitations/:membership_id/accept', authenticateDgfyAccount, acceptDgfyInvitation);

export default router;
