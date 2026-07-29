import { buildPlatformInvoiceUseCases } from '../usecases/platformInvoiceUseCases.js';
import { platformInvoiceRepository } from '../repositories/platformInvoiceRepository.js';
import { platformInvoiceArtifactStore } from '../services/platformInvoiceArtifactStore.js';
import { renderPlatformInvoicePdf } from '../services/platformInvoicePdf.js';
import * as emailService from '../../../services/emailService.js';

const useCases = buildPlatformInvoiceUseCases({ repository: platformInvoiceRepository, artifactStore: platformInvoiceArtifactStore, emailService, pdfRenderer: renderPlatformInvoicePdf });
const send = async (res, action) => {
  try { const result = await action(); return res.status(result.status || (result.success ? 200 : 400)).json(result); }
  catch { return res.status(500).json({ success: false, message: 'Platform invoice operation failed.' }); }
};
export const listPlatformInvoices = (_req, res) => send(res, () => useCases.list());
export const listEligiblePlatformInvoiceApplications = (_req, res) => send(res, () => useCases.listEligibleApplications());
export const createPlatformInvoiceDraft = (req, res) => send(res, () => useCases.createDraft({ body: req.body, actor: req.admin }));
export const createPlatformInvoiceReplacementDraft = (req, res) => send(res, () => useCases.createReplacementDraft({ invoiceId: req.params.invoiceId, body: req.body, actor: req.admin }));
export const updatePlatformInvoiceDraft = (req, res) => send(res, () => useCases.updateDraft({ invoiceId: req.params.invoiceId, body: req.body, actor: req.admin }));
export const discardPlatformInvoiceDraft = (req, res) => send(res, () => useCases.discardDraft({ invoiceId: req.params.invoiceId, actor: req.admin }));
export const issuePlatformInvoice = (req, res) => send(res, () => useCases.issue({ invoiceId: req.params.invoiceId, body: req.body, actor: req.admin }));
export const recordPlatformInvoiceCashPayment = (req, res) => send(res, () => useCases.recordCashPayment({ invoiceId: req.params.invoiceId, body: req.body, actor: req.admin }));
export const creditPlatformInvoice = (req, res) => send(res, () => useCases.creditInvoice({ invoiceId: req.params.invoiceId, body: req.body, actor: req.admin }));
export const deliverPlatformInvoiceEmail = async (req, res) => {
  try {
    const result = await useCases.deliverEmail({ invoiceId: req.params.invoiceId, actor: req.admin });
    if (result.status === 429 && result.retry_after) {
      const seconds = Math.max(1, Math.ceil((new Date(result.retry_after).getTime() - Date.now()) / 1000));
      res.set('Retry-After', String(seconds));
    }
    return res.status(result.status || (result.success ? 200 : 400)).json(result);
  } catch {
    return res.status(500).json({ success: false, message: 'Platform invoice email delivery failed.' });
  }
};
export const downloadPlatformInvoiceArtifact = async (req, res) => {
  try {
    const result = await useCases.getArtifact({ invoiceId: req.params.invoiceId });
    if (!result.success) return res.status(result.status || 400).json(result);
    const { artifact, buffer } = result.data;
    res.set({ 'Content-Type': artifact.content_type, 'Content-Length': String(buffer.length), 'Content-Disposition': `attachment; filename="${artifact.filename}"`, 'Cache-Control': 'private, no-store' });
    return res.status(200).send(buffer);
  } catch {
    return res.status(500).json({ success: false, message: 'Platform invoice artifact could not be read.' });
  }
};
