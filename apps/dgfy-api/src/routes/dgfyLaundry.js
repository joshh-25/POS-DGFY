import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { requireDglaundryPartner } from '../modules/dgfyLaundry/middleware/dglaundryPartnerAuth.js';
import { authenticateDglaundryAccessToken } from '../modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js';
import {
    listLaundryCompanies,
    launchLaundryOperations,
    getLaundrySessionContext,
    createLaundryRegistrationIntent,
    createLaundryLocationIntent,
    createLaundryStaffInvitationIntent,
    getLaundryRegistrationIntent,
    getLaundryLocationIntent,
    getLaundryStaffInvitationIntent,
    createLaundryMapping
} from '../modules/dgfyLaundry/controllers/dgfyLaundryProviderHandlers.js';

const router = express.Router();

router.get('/account/companies', authenticateDgfyAccount, listLaundryCompanies);
router.post('/account/launch', authenticateDgfyAccount, launchLaundryOperations);
router.get('/session-context', authenticateDglaundryAccessToken, getLaundrySessionContext);

router.post('/registration-intents', requireDglaundryPartner, createLaundryRegistrationIntent);
router.get('/registration-intents/:intentId', requireDglaundryPartner, getLaundryRegistrationIntent);
router.post('/location-intents', requireDglaundryPartner, createLaundryLocationIntent);
router.get('/location-intents/:intentId', requireDglaundryPartner, getLaundryLocationIntent);
router.post('/staff-invitation-intents', requireDglaundryPartner, createLaundryStaffInvitationIntent);
router.get('/staff-invitation-intents/:intentId', requireDglaundryPartner, getLaundryStaffInvitationIntent);
router.post('/mappings', requireDglaundryPartner, createLaundryMapping);

export default router;
