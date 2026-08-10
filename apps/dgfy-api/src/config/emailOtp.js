export const isEmailOtpEnforcementEnabled = (env = process.env) => {
  if (env.EMAIL_OTP_ENFORCEMENT_ENABLED === 'true') return true;
  if (env.EMAIL_OTP_ENFORCEMENT_ENABLED === 'false') return false;
  return env.NODE_ENV !== 'test';
};
