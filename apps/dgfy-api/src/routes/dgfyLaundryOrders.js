import express from 'express';
import { verifyDglaundryEventSignature } from '../modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';
import { ingestDglaundryEvent } from '../modules/dgfyLaundryOrders/controllers/dgfyLaundryOrderHandlers.js';

const router = express.Router();

const verifyProviderEvent = (req, res, next) => Promise.resolve().then(() => verifyDglaundryEventSignature({
    headers: req.headers,
    method: req.method,
    authority: req.headers.host || '',
    path: req.originalUrl,
    rawBody: req.rawBody || JSON.stringify(req.body || {})
  })).then((result) => {
  if (!result.ok) return res.status(result.code === 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE' ? 503 : 401).json({ success: false, message: 'The DGLaundry event signature could not be verified.', error_code: result.code });
  req.dglaundrySignature = result;
  return next();
}).catch(next);

// DGLaundry -> DGFY. The receiver persists the signed event before applying a
// sanitized projection and treats duplicate, stale, and version-gap deliveries
// as explicit outcomes.
router.post('/api/v1/integrations/dglaundry/events', verifyProviderEvent, ingestDglaundryEvent);

export default router;
