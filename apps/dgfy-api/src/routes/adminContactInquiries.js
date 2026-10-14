import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  getPin4msProviderConfig,
  updatePin4msProviderConfig
} from '../modules/contactInquiries/controllers/pin4msProviderConfigHandlers.js';

const router = express.Router();
const apiKeyByRequest = new WeakMap();

router.use((req, _res, next) => {
  if (req.method === 'PUT' && /^\/pin4ms\/config\/?$/.test(req.path)) {
    apiKeyByRequest.set(req, req.body?.api_key);
    if (req.body && typeof req.body === 'object') delete req.body.api_key;
    req.rawBody = undefined;
  }
  return next();
});

router.use(authenticateAdmin);
router.get('/pin4ms/config', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return getPin4msProviderConfig(req, res, next);
});
router.put('/pin4ms/config', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return updatePin4msProviderConfig(req, res, next, apiKeyByRequest.get(req));
});

export default router;
