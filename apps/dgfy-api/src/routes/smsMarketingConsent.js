import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/requireTenantContext.js';
import {
  recordSmsMarketingConsent,
  revokeSmsMarketingConsent
} from '../modules/smsDelivery/controllers/smsMarketingConsentHandlers.js';
import {
  validateSmsMarketingConsentGrant,
  validateSmsMarketingConsentRevoke
} from '../validators/smsMarketingConsentValidator.js';

const router = express.Router();
router.use(requireTenantContext, authenticate);
router.post('/marketing-consents', validateSmsMarketingConsentGrant, recordSmsMarketingConsent);
router.post('/marketing-consents/revoke', validateSmsMarketingConsentRevoke, revokeSmsMarketingConsent);

export default router;
