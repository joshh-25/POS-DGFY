import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import { emailOtpLimiter } from '../middleware/rateLimiter.js';
import { EMAIL_OTP_PURPOSES } from '../services/emailOtpService.js';
import {
  getPin4msProviderConfig,
  updatePin4msProviderConfig
} from '../modules/contactInquiries/controllers/pin4msProviderConfigHandlers.js';
import {
  getAdminStorefrontSupportContact,
  requestAdminStorefrontSupportEmailVerification,
  saveAdminStorefrontSupportContact,
  verifyAdminStorefrontSupportEmail
} from '../modules/contactInquiries/controllers/storefrontSupportContactHandlers.js';

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
router.get('/support-email', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return getAdminStorefrontSupportContact(req, res, next);
});
router.put('/support-email', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return saveAdminStorefrontSupportContact(req, res, next);
});

const applySupportEmailOtpPurpose = (req, _res, next) => {
  req.body = req.body && typeof req.body === 'object' ? req.body : {};
  req.body.purpose = EMAIL_OTP_PURPOSES.PLATFORM_SUPPORT_CONTACT;
  return next();
};

router.post('/support-email/verification/request', applySupportEmailOtpPurpose, emailOtpLimiter, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return requestAdminStorefrontSupportEmailVerification(req, res, next);
});
router.post('/support-email/verification/confirm', applySupportEmailOtpPurpose, emailOtpLimiter, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return verifyAdminStorefrontSupportEmail(req, res, next);
});

router.get('/pin4ms/config', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return getPin4msProviderConfig(req, res, next);
});
router.put('/pin4ms/config', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return updatePin4msProviderConfig(req, res, next, apiKeyByRequest.get(req));
});

export default router;
