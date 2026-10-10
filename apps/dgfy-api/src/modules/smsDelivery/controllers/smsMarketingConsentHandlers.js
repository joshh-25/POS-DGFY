import {
  recordSmsMarketingConsentUseCase,
  revokeSmsMarketingConsentUseCase
} from '../usecases/smsMarketingConsentUseCases.js';

const requireMerchantOwner = (req, res) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (req.user?.is_master_admin === true || role === 'admin') return true;
  res.status(403).json({ success: false, message: 'Tenant owner or admin authority is required.', error_code: 'TENANT_OWNER_REQUIRED' });
  return false;
};

const respond = (handler) => async (req, res, next) => {
  try { return await handler(req, res); } catch (error) { return next(error); }
};

export const recordSmsMarketingConsent = respond(async (req, res) => {
  if (!requireMerchantOwner(req, res)) return;
  const result = await recordSmsMarketingConsentUseCase({
    tenantId: req.tenant.id,
    phone: req.validatedSmsConsentBody.phone,
    consentTextVersion: req.validatedSmsConsentBody.consentTextVersion,
    source: 'manual_api',
    actorType: 'user',
    actorId: req.user?.id || req.user?.user_id || null
  });
  return res.status(201).json({ success: true, data: { status: result.status } });
});

export const revokeSmsMarketingConsent = respond(async (req, res) => {
  if (!requireMerchantOwner(req, res)) return;
  const result = await revokeSmsMarketingConsentUseCase({
    tenantId: req.tenant.id,
    phone: req.validatedSmsConsentBody.phone,
    source: 'manual_api',
    actorType: 'user',
    actorId: req.user?.id || req.user?.user_id || null
  });
  return res.status(200).json({ success: true, data: { status: result.status } });
});
