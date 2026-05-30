export const isEmailOtpEnforcementEnabled = (env = process.env) => {
  if (env.EMAIL_OTP_ENFORCEMENT_ENABLED === 'true') return true;
  if (env.EMAIL_OTP_ENFORCEMENT_ENABLED === 'false') return false;
  if (env.JEST_WORKER_ID) return false;
  return env.NODE_ENV !== 'test';
};
