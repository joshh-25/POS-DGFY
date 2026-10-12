const validateBody = (requireTextVersion) => (req, res, next) => {
  const body = req.body || {};
  const validPhone = typeof body.phone === 'string' && body.phone.trim().length > 0 && body.phone.length <= 80;
  const validTextVersion = !requireTextVersion || (
    typeof body.consent_text_version === 'string'
    && body.consent_text_version.trim().length > 0
    && body.consent_text_version.trim().length <= 40
  );
  if (!validPhone || !validTextVersion) {
    return res.status(400).json({
      success: false,
      message: 'A phone number and required consent details are invalid.',
      error_code: 'INVALID_SMS_CONSENT_REQUEST'
    });
  }
  req.validatedSmsConsentBody = {
    phone: body.phone.trim(),
    ...(requireTextVersion ? { consentTextVersion: body.consent_text_version.trim() } : {})
  };
  return next();
};

export const validateSmsMarketingConsentGrant = validateBody(true);
export const validateSmsMarketingConsentRevoke = validateBody(false);
