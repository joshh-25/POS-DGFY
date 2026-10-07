import express from 'express';
import { verifyDglaundryEventSignature } from '../modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';
import { ingestDglaundryEvent } from '../modules/dgfyLaundryOrders/controllers/dgfyLaundryOrderHandlers.js';

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

// DGLaundry -> DGFY. The receiver persists the signed event before applying a
// sanitized projection and treats duplicate, stale, and version-gap deliveries
// as explicit outcomes.
router.post('/api/v1/integrations/dglaundry/events', verifyProviderEvent, ingestDglaundryEvent);

export default router;
