import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    getDgfyLegalTerms,
    preflightDgfyAccountRegistration,
    registerDgfyAccount,
    loginDgfyAccount,
    getDgfyMe,
    listDgfyAccountCompanies,
    updateDgfyProfile,
    changeDgfyPassword,
    requestDgfyEmailVerification,
    verifyDgfyEmail,
    requestDgfyPasswordReset,
    completeDgfyPasswordReset,
    logoutDgfyAccount
} from '../controllers/dgfyAuthHandlers.js';
import { authenticateDgfyAccount } from '../../../middleware/dgfyAuth.js';

const authLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_DGFY_AUTH_WINDOW_MS || '', 10) || 15 * 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_DGFY_AUTH_MAX_REQUESTS || '', 10) || 30,
    standardHeaders: true,
    legacyHeaders: false
});

const router = Router();

router.get('/legal-terms/current', getDgfyLegalTerms);

router.post('/auth/register/preflight', authLimiter, preflightDgfyAccountRegistration);
router.post('/auth/email-verification/request', authLimiter, requestDgfyEmailVerification);
router.post('/auth/register', authLimiter, registerDgfyAccount);
router.post('/auth/login', authLimiter, loginDgfyAccount);
router.post('/auth/password-reset/request', authLimiter, requestDgfyPasswordReset);
router.post('/auth/password-reset/complete', authLimiter, completeDgfyPasswordReset);

router.get('/auth/me', authenticateDgfyAccount, getDgfyMe);
router.get('/account/companies', listDgfyAccountCompanies);
router.patch('/auth/me', authenticateDgfyAccount, updateDgfyProfile);
router.post('/auth/logout', authenticateDgfyAccount, logoutDgfyAccount);
router.post('/auth/password/change', authenticateDgfyAccount, changeDgfyPassword);
router.post('/auth/email-verification/verify', authLimiter, authenticateDgfyAccount, verifyDgfyEmail);

export default router;
