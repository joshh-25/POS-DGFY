import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/requireTenantContext.js';
import { consentPartnerAttachment, listMerchantAttachments, updateMerchantAttachment } from '../modules/partnerIdentity/controllers/partnerIdentityHandlers.js';

const router = express.Router();
router.use(requireTenantContext, authenticate);
router.get('/', listMerchantAttachments);
router.post('/', consentPartnerAttachment);
router.patch('/:id/:action(scopes|suspend|reactivate|disconnect)', updateMerchantAttachment);

export default router;
