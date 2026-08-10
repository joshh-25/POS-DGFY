import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import { createPlatformInvoiceDraft, createPlatformInvoiceReplacementDraft, creditPlatformInvoice, deliverPlatformInvoiceEmail, discardPlatformInvoiceDraft, downloadPlatformInvoiceArtifact, issuePlatformInvoice, listEligiblePlatformInvoiceApplications, listPlatformInvoices, recordPlatformInvoiceCashPayment, updatePlatformInvoiceDraft } from '../modules/platformInvoicing/controllers/platformInvoiceHandlers.js';

const router = express.Router();
router.use(authenticateAdmin);
router.get('/', listPlatformInvoices);
router.get('/eligible-applications', listEligiblePlatformInvoiceApplications);
router.post('/drafts', createPlatformInvoiceDraft);
router.post('/:invoiceId/replacement-drafts', createPlatformInvoiceReplacementDraft);
router.patch('/:invoiceId/draft', updatePlatformInvoiceDraft);
router.delete('/:invoiceId/draft', discardPlatformInvoiceDraft);
router.post('/:invoiceId/issue', issuePlatformInvoice);
router.post('/:invoiceId/payments/cash', recordPlatformInvoiceCashPayment);
router.post('/:invoiceId/credits/full', creditPlatformInvoice);
router.get('/:invoiceId/artifact', downloadPlatformInvoiceArtifact);
router.post('/:invoiceId/deliveries/email', deliverPlatformInvoiceEmail);
export default router;
