import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { requireDglaundryPartner } from '../modules/dgfyLaundry/middleware/dglaundryPartnerAuth.js';
import { authenticateDglaundryAccessToken } from '../modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { setNoStoreCacheControl } from '../middleware/cachePolicy.js';
import {
    listLaundryCompanies,
    launchLaundryOperations,
    getLaundrySessionContext,
    getLaundryHealth,
    getLaundryCapabilities,
    getLaundryRuntimeAttestation,
    cancelLaundryQualificationOrder,
    expireLaundryQualificationOrder,
    refundLaundryQualificationOrder,
    confirmLaundryQualificationReceipt,
    getLaundryCompanyById,
    createLaundryRegistrationIntent,
    createLaundryLocationIntent,
    createLaundryStaffInvitationIntent,
    getLaundryRegistrationIntent,
    getLaundryLocationIntent,
    getLaundryStaffInvitationIntent,
    createLaundryMapping
} from '../modules/dgfyLaundry/controllers/dgfyLaundryProviderHandlers.js';
import {
    getDglaundryOrderForPartner,
    registerDglaundryCustomerActivity,
    listDglaundryDeadLetters,
    redriveDglaundryDeadLetter
} from '../modules/dgfyLaundryOrders/controllers/dgfyLaundryOrderHandlers.js';

const router = express.Router();

router.get('/account/companies', authenticateDgfyAccount, listLaundryCompanies);
router.post('/account/launch', authenticateDgfyAccount, launchLaundryOperations);
router.get('/dead-letters', authenticateDgfyAccount, listDglaundryDeadLetters);
router.post('/dead-letters/:id/redrive', authenticateDgfyAccount, redriveDglaundryDeadLetter);
router.get('/session-context', authenticateDglaundryAccessToken, getLaundrySessionContext);

router.get('/health', requireDglaundryPartner, getLaundryHealth);
router.get('/capabilities', requireDglaundryPartner, getLaundryCapabilities);
router.get('/admin/attestation', setNoStoreCacheControl, authenticateAdmin, getLaundryRuntimeAttestation);
router.get('/companies/:companyId', requireDglaundryPartner, getLaundryCompanyById);
router.get('/orders/:externalOrderReference', requireDglaundryPartner, getDglaundryOrderForPartner);
router.post('/orders/:externalOrderReference/cancel', requireDglaundryPartner, cancelLaundryQualificationOrder);
router.post('/orders/:externalOrderReference/expire', requireDglaundryPartner, expireLaundryQualificationOrder);
router.post('/orders/:externalOrderReference/refund', requireDglaundryPartner, refundLaundryQualificationOrder);
router.post('/orders/:externalOrderReference/receipt', requireDglaundryPartner, confirmLaundryQualificationReceipt);
router.post('/customer-activities', requireDglaundryPartner, registerDglaundryCustomerActivity);

router.post('/registration-intents', requireDglaundryPartner, createLaundryRegistrationIntent);
router.get('/registration-intents/:intentId', requireDglaundryPartner, getLaundryRegistrationIntent);
router.post('/location-intents', requireDglaundryPartner, createLaundryLocationIntent);
router.get('/location-intents/:intentId', requireDglaundryPartner, getLaundryLocationIntent);
router.post('/staff-invitation-intents', requireDglaundryPartner, createLaundryStaffInvitationIntent);
router.get('/staff-invitation-intents/:intentId', requireDglaundryPartner, getLaundryStaffInvitationIntent);
router.post('/mappings', requireDglaundryPartner, createLaundryMapping);

export default router;
