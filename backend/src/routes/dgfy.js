import express from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import {
    acceptDgfyInvitation,
    changeDgfyPassword,
    completeDgfyPasswordReset,
    createDgfyHandoff,
    exchangeDgfyHandoff,
    getDgfyLegalTerms,
    getDgfyMe,
    loginDgfyAccount,
    logoutDgfyAccount,
    requestDgfyPasswordReset,
    requestDgfyEmailVerification,
    updateDgfyProfile,
    verifyDgfyEmail,
    registerDgfyAccount
} from '../modules/dgfy/controllers/dgfyAuthHandlers.js';
import {
    cancelDgfyCustomerOrder,
    createDgfyCustomerAddress,
    deleteDgfyCustomerAddress,
    getDgfyCustomerDashboard,
    getDgfyCustomerLoyalty,
    listDgfyCustomerReviewsForModeration,
    listDgfyCustomerAddresses,
    listDgfyCustomerBookings,
    listDgfyCustomerOrders,
    listPublicDgfyCustomerReviews,
    moderateDgfyCustomerReview,
    reorderDgfyCustomerOrder,
    requestDgfyTrackingRecovery,
    submitDgfyCustomerReview,
    trackDgfyCustomerReference,
    updateDgfyCustomerAddress,
    verifyDgfyTrackingRecovery
} from '../modules/dgfy/controllers/dgfyCustomerHandlers.js';

const router = express.Router();

router.get('/legal-terms/current', getDgfyLegalTerms);
router.post('/auth/register', authLimiter, registerDgfyAccount);
router.post('/auth/login', authLimiter, loginDgfyAccount);
router.post('/auth/password-reset/request', authLimiter, requestDgfyPasswordReset);
router.post('/auth/password-reset/complete', authLimiter, completeDgfyPasswordReset);
router.post('/auth/handoff/exchange', authLimiter, exchangeDgfyHandoff);
router.get('/auth/me', authenticateDgfyAccount, getDgfyMe);
router.patch('/auth/me', authenticateDgfyAccount, updateDgfyProfile);
router.post('/auth/logout', authenticateDgfyAccount, logoutDgfyAccount);
router.post('/auth/password/change', authenticateDgfyAccount, changeDgfyPassword);
router.post('/auth/email-verification/request', authLimiter, authenticateDgfyAccount, requestDgfyEmailVerification);
router.post('/auth/email-verification/verify', authLimiter, authenticateDgfyAccount, verifyDgfyEmail);
router.post('/auth/handoff', authenticateDgfyAccount, createDgfyHandoff);
router.post('/invitations/:membership_id/accept', authenticateDgfyAccount, acceptDgfyInvitation);

router.get('/customer/dashboard', authenticateDgfyAccount, getDgfyCustomerDashboard);
router.get('/customer/orders', authenticateDgfyAccount, listDgfyCustomerOrders);
router.get('/customer/bookings', authenticateDgfyAccount, listDgfyCustomerBookings);
router.post('/customer/track', authenticateDgfyAccount, trackDgfyCustomerReference);
router.post('/customer/orders/:reference/cancel', authenticateDgfyAccount, cancelDgfyCustomerOrder);
router.post('/customer/orders/:reference/reorder', authenticateDgfyAccount, reorderDgfyCustomerOrder);
router.get('/customer/addresses', authenticateDgfyAccount, listDgfyCustomerAddresses);
router.post('/customer/addresses', authenticateDgfyAccount, createDgfyCustomerAddress);
router.put('/customer/addresses/:address_id', authenticateDgfyAccount, updateDgfyCustomerAddress);
router.patch('/customer/addresses/:address_id', authenticateDgfyAccount, updateDgfyCustomerAddress);
router.delete('/customer/addresses/:address_id', authenticateDgfyAccount, deleteDgfyCustomerAddress);
router.get('/customer/loyalty', authenticateDgfyAccount, getDgfyCustomerLoyalty);
router.post('/customer/reviews', authenticateDgfyAccount, submitDgfyCustomerReview);
router.get('/customer/reviews/public', listPublicDgfyCustomerReviews);
router.get('/customer/reviews/moderation', authenticateAdmin, listDgfyCustomerReviewsForModeration);
router.post('/customer/reviews/:review_id/moderate', authenticateAdmin, moderateDgfyCustomerReview);
router.post('/customer/tracking-recovery/request', authLimiter, requestDgfyTrackingRecovery);
router.post('/customer/tracking-recovery/verify', authLimiter, verifyDgfyTrackingRecovery);

export default router;
