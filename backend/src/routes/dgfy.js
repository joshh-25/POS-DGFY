import express from 'express';
import { authLimiter, dgfyTenantSessionLimiter } from '../middleware/rateLimiter.js';
import { authenticate, authenticateAdmin, checkPermission } from '../middleware/auth.js';
import { authenticateDgfyAccount, authenticateDgfyAccountOrTenantMembership } from '../middleware/dgfyAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    acceptDgfyInvitation,
    changeDgfyPassword,
    completeDgfyLegacyLink,
    completeDgfyPasswordReset,
    createDgfyHandoff,
    createDgfyInvitation,
    exchangeDgfyHandoff,
    getDgfyLegacyLinkStatus,
    getDgfyLegalTerms,
    getDgfyMe,
    leaveDgfyCompany,
    listDgfyAccountCompanies,
    loginDgfyAccount,
    logoutDgfyAccount,
    rejectDgfyInvitation,
    requestDgfyBusinessStepUp,
    requestDgfyLegacyLinkEmailOtp,
    requestDgfyPasswordReset,
    requestDgfyEmailVerification,
    preflightDgfyAccountRegistration,
    searchDgfyBusinessAccounts,
    startDgfyPosSession,
    startDgfyTenantSession,
    startDgfyLegacyRegistrationHandoff,
    switchDgfyCompany,
    transferDgfyCompanyOwnership,
    updateDgfyProfile,
    verifyDgfyEmail,
    registerDgfyAccount
} from '../modules/dgfy/controllers/dgfyAuthHandlers.js';
import {
    getAdminDgfyAccount,
    createAdminProvisionedDgfyAccount,
    deleteAdminDgfyAccount,
    listAdminDgfyAccounts,
    reactivateAdminDgfyAccount,
    suspendAdminDgfyAccount,
    updateAdminDgfyAccountProfile
} from '../modules/dgfy/controllers/dgfyAdminAccountHandlers.js';
import {
    cancelDgfyCustomerOrder,
    createDgfyCustomerAddress,
    deleteDgfyCustomerAddress,
    getDgfyCustomerDashboard,
    getDgfyCustomerLoyalty,
    listDgfyCustomerReviewsForModeration,
    listDgfyCustomerAddresses,
    listDgfyCustomerActivities,
    listDgfyCustomerBookings,
    listDgfyCustomerNotifications,
    listDgfyCustomerOrders,
    listPublicDgfyCustomerReviews,
    moderateDgfyCustomerReview,
    reorderDgfyCustomerOrder,
    requestDgfyTrackingRecovery,
    setDefaultDgfyCustomerAddress,
    markAllDgfyCustomerNotificationsRead,
    markDgfyCustomerNotificationRead,
    submitDgfyGuestReviewInvite,
    submitDgfyCustomerReview,
    streamDgfyCustomerEvents,
    trackDgfyCustomerReference,
    updateDgfyCustomerAddress,
    validateDgfyReviewInvite,
    verifyDgfyTrackingRecovery
} from '../modules/dgfy/controllers/dgfyCustomerHandlers.js';

const router = express.Router();

router.get('/legal-terms/current', getDgfyLegalTerms);
router.post('/auth/register/preflight', authLimiter, preflightDgfyAccountRegistration);
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
router.post('/auth/tenant-session', authenticateDgfyAccount, dgfyTenantSessionLimiter, startDgfyTenantSession);
router.get('/account/companies', authenticateDgfyAccountOrTenantMembership, listDgfyAccountCompanies);
router.post('/account/business-step-up/request', authLimiter, authenticateDgfyAccountOrTenantMembership, requestDgfyBusinessStepUp);
router.post('/account/companies/:tenant_id/switch', authLimiter, authenticateDgfyAccountOrTenantMembership, switchDgfyCompany);
router.post('/account/companies/:tenant_id/leave', authenticateDgfyAccountOrTenantMembership, leaveDgfyCompany);
router.post('/account/companies/:tenant_id/transfer-ownership', authLimiter, authenticateDgfyAccountOrTenantMembership, transferDgfyCompanyOwnership);
router.post('/account/companies/:tenant_id/pos-session', authLimiter, authenticateDgfyAccount, startDgfyPosSession);
router.get('/legacy-link/status', authenticate, getDgfyLegacyLinkStatus);
router.post('/legacy-link/request-email-otp', authLimiter, authenticate, requestDgfyLegacyLinkEmailOtp);
router.post('/legacy-link/complete', authLimiter, authenticate, completeDgfyLegacyLink);
router.post('/legacy-link/start-registration-handoff', authLimiter, authenticate, startDgfyLegacyRegistrationHandoff);
router.get('/accounts/search', authLimiter, authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), searchDgfyBusinessAccounts);
router.post('/invitations', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), createDgfyInvitation);
router.post('/invitations/:membership_id/accept', authenticateDgfyAccountOrTenantMembership, acceptDgfyInvitation);
router.post('/invitations/:membership_id/reject', authenticateDgfyAccountOrTenantMembership, rejectDgfyInvitation);

router.get('/admin/accounts', authenticateAdmin, listAdminDgfyAccounts);
router.post('/admin/accounts', authenticateAdmin, createAdminProvisionedDgfyAccount);
router.get('/admin/accounts/:account_id', authenticateAdmin, getAdminDgfyAccount);
router.patch('/admin/accounts/:account_id/profile', authenticateAdmin, updateAdminDgfyAccountProfile);
router.post('/admin/accounts/:account_id/suspend', authenticateAdmin, suspendAdminDgfyAccount);
router.post('/admin/accounts/:account_id/reactivate', authenticateAdmin, reactivateAdminDgfyAccount);
router.delete('/admin/accounts/:account_id', authenticateAdmin, deleteAdminDgfyAccount);

router.get('/customer/dashboard', authenticateDgfyAccount, getDgfyCustomerDashboard);
router.get('/customer/activities', authenticateDgfyAccount, listDgfyCustomerActivities);
router.get('/customer/orders', authenticateDgfyAccount, listDgfyCustomerOrders);
router.get('/customer/bookings', authenticateDgfyAccount, listDgfyCustomerBookings);
router.get('/customer/notifications', authenticateDgfyAccount, listDgfyCustomerNotifications);
router.patch('/customer/notifications/read-all', authenticateDgfyAccount, markAllDgfyCustomerNotificationsRead);
router.patch('/customer/notifications/:notification_id/read', authenticateDgfyAccount, markDgfyCustomerNotificationRead);
router.get('/customer/events', authenticateDgfyAccount, streamDgfyCustomerEvents);
router.post('/customer/track', authenticateDgfyAccount, trackDgfyCustomerReference);
router.post('/customer/orders/:reference/cancel', authenticateDgfyAccount, cancelDgfyCustomerOrder);
router.post('/customer/orders/:reference/reorder', authenticateDgfyAccount, reorderDgfyCustomerOrder);
router.get('/customer/addresses', authenticateDgfyAccount, listDgfyCustomerAddresses);
router.post('/customer/addresses', authenticateDgfyAccount, createDgfyCustomerAddress);
router.put('/customer/addresses/:address_id', authenticateDgfyAccount, updateDgfyCustomerAddress);
router.patch('/customer/addresses/:address_id/default', authenticateDgfyAccount, setDefaultDgfyCustomerAddress);
router.patch('/customer/addresses/:address_id', authenticateDgfyAccount, updateDgfyCustomerAddress);
router.delete('/customer/addresses/:address_id', authenticateDgfyAccount, deleteDgfyCustomerAddress);
router.get('/customer/loyalty', authenticateDgfyAccount, getDgfyCustomerLoyalty);
router.post('/customer/reviews', authenticateDgfyAccount, submitDgfyCustomerReview);
router.get('/customer/reviews/public', listPublicDgfyCustomerReviews);
router.get('/customer/review-invites/:token', validateDgfyReviewInvite);
router.post('/customer/review-invites/:token/submit', submitDgfyGuestReviewInvite);
router.get('/customer/reviews/moderation', authenticateAdmin, listDgfyCustomerReviewsForModeration);
router.post('/customer/reviews/:review_id/moderate', authenticateAdmin, moderateDgfyCustomerReview);
router.post('/customer/tracking-recovery/request', authLimiter, requestDgfyTrackingRecovery);
router.post('/customer/tracking-recovery/verify', authLimiter, verifyDgfyTrackingRecovery);

export default router;
