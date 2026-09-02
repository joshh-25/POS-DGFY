import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { dgfyLaundryProviderUseCases } from '../modules/dgfyLaundry/index.js';
import { verifyDglaundryEventSignature } from '../modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';
import {
  cancelDglaundryOrder,
  createDglaundryQuote,
  getDglaundryAvailability,
  getDglaundryCatalog,
  getDglaundryOrder,
  ingestDglaundryEvent,
  submitDglaundryOrder,
  updateDglaundryOrder
} from '../modules/dgfyLaundryOrders/controllers/dgfyLaundryOrderHandlers.js';

const router = express.Router();

const verifyProviderEvent = (req, res, next) => {
  const result = verifyDglaundryEventSignature({
    headers: req.headers,
    method: req.method,
    authority: req.headers.host || '',
    path: req.originalUrl,
    rawBody: req.rawBody || JSON.stringify(req.body || {})
  });
  if (!result.ok) return res.status(401).json({ success: false, message: 'The DGLaundry event signature could not be verified.', error_code: result.code });
  req.dglaundrySignature = result;
  return next();
};

const resolveLaundryCompany = async (req, res, next) => {
  try {
    const companyId = req.query?.company_id || req.body?.companyId || req.body?.company_id;
    const result = await dgfyLaundryProviderUseCases.chooseCompany({ dgfyAccount: req.dgfyAccount, companyId });
    if (!result.company) return res.status(409).json({ success: false, message: 'Select an explicit DGLaundry company before continuing.', data: { selection_required: true, companies: result.companies } });
    req.laundryCompany = result.company;
    return next();
  } catch (error) {
    return next(error);
  }
};

// DGLaundry -> DGFY. The receiver persists the signed event before applying a
// sanitized projection and treats duplicate, stale, and version-gap deliveries
// as explicit outcomes.
router.post('/api/v1/integrations/dglaundry/events', verifyProviderEvent, ingestDglaundryEvent);

// DGFY customer/storefront operations. Company selection is always backed by
// the immutable DGFY membership mapping; no email, slug, or display name is used.
router.get('/api/v1/dgfy/laundry/catalog', authenticateDgfyAccount, resolveLaundryCompany, getDglaundryCatalog);
router.get('/api/v1/dgfy/laundry/availability', authenticateDgfyAccount, resolveLaundryCompany, getDglaundryAvailability);
router.get('/api/v1/dgfy/laundry/orders/:externalOrderReference', authenticateDgfyAccount, resolveLaundryCompany, getDglaundryOrder);
router.post('/api/v1/dgfy/laundry/quotes', authenticateDgfyAccount, resolveLaundryCompany, createDglaundryQuote);
router.post('/api/v1/dgfy/laundry/orders', authenticateDgfyAccount, resolveLaundryCompany, submitDglaundryOrder);
router.patch('/api/v1/dgfy/laundry/orders/:externalOrderReference', authenticateDgfyAccount, resolveLaundryCompany, updateDglaundryOrder);
router.post('/api/v1/dgfy/laundry/orders/:externalOrderReference/cancel', authenticateDgfyAccount, resolveLaundryCompany, cancelDglaundryOrder);

export default router;
