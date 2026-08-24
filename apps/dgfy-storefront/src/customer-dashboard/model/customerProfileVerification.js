const APPROVED_ID_STATUSES = new Set(['approved', 'verified', 'complete', 'completed', 'valid']);

// The customer API does not expose phone verification yet. Keep this assumption
// in one model constant so it can be replaced when the backend contract exists.
export const FRONTEND_PROFILE_VERIFICATION_ASSUMPTIONS = Object.freeze({
  phoneVerified: true
});

export const CUSTOMER_PROFILE_VERIFICATION_TOTAL = 3;

const PROFILE_VERIFICATION_REQUIREMENTS = Object.freeze([
  { key: 'emailVerified', label: 'Email' },
  { key: 'phoneVerified', label: 'Phone' },
  { key: 'idVerified', label: 'Valid ID' }
]);

const isTruthyVerificationFlag = (value) => (
  value === true
  || value === 1
  || String(value || '').trim().toLowerCase() === 'true'
);

const hasVerificationTimestamp = (value) => Boolean(String(value || '').trim());

const getIdentityVerificationStatus = (account) => {
  const nestedVerification = account?.profile_verification
    || account?.profileVerification
    || account?.verification
    || {};

  return [
    account?.identity_verification_status,
    account?.id_verification_status,
    account?.valid_id_status,
    account?.valid_id?.status,
    account?.validId?.status,
    account?.identity_document?.status,
    account?.identityDocument?.status,
    nestedVerification?.identity?.status,
    nestedVerification?.id?.status,
    nestedVerification?.valid_id?.status
  ].map((value) => String(value || '').trim().toLowerCase()).find(Boolean) || '';
};

const isApprovedIdentityVerification = (account) => (
  isTruthyVerificationFlag(account?.is_identity_verified)
  || isTruthyVerificationFlag(account?.is_id_verified)
  || isTruthyVerificationFlag(account?.valid_id_verified)
  || isTruthyVerificationFlag(account?.valid_id?.verified)
  || isTruthyVerificationFlag(account?.valid_id?.is_verified)
  || isTruthyVerificationFlag(account?.identity_document?.verified)
  || hasVerificationTimestamp(account?.identity_verified_at)
  || hasVerificationTimestamp(account?.id_verified_at)
  || APPROVED_ID_STATUSES.has(getIdentityVerificationStatus(account))
);

export const getCustomerProfileVerification = (accountPanel) => {
  const account = accountPanel?.me || {};
  const emailVerified = isTruthyVerificationFlag(account.is_email_verified)
    || hasVerificationTimestamp(account.email_verified_at);
  const phoneVerified = FRONTEND_PROFILE_VERIFICATION_ASSUMPTIONS.phoneVerified;
  const idVerified = isApprovedIdentityVerification(account);
  const checks = [emailVerified, phoneVerified, idVerified];
  const completed = checks.filter(Boolean).length;

  return {
    emailVerified,
    phoneVerified,
    idVerified,
    completed,
    total: CUSTOMER_PROFILE_VERIFICATION_TOTAL,
    percentage: Math.round((completed / CUSTOMER_PROFILE_VERIFICATION_TOTAL) * 100),
    isFullyVerified: completed === CUSTOMER_PROFILE_VERIFICATION_TOTAL
  };
};

export const getCustomerProfileVerificationRemainingRequirements = (accountPanel) => {
  const verification = getCustomerProfileVerification(accountPanel);
  return PROFILE_VERIFICATION_REQUIREMENTS
    .filter(({ key }) => verification[key] !== true)
    .map(({ label }) => label);
};

export const getCustomerProfileVerificationReminder = (accountPanel) => {
  const remainingRequirements = getCustomerProfileVerificationRemainingRequirements(accountPanel);
  if (remainingRequirements.length === 0) return null;

  return {
    title: 'Complete your profile verification',
    description: `Remaining requirements: ${remainingRequirements.join(', ')}.`,
    remainingRequirements
  };
};
