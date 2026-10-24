import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';

export const STORE_VISIBILITY_POLICY_KEY = 'store_visibility_merchant_editable';
export const STORE_VISIBILITY_KEY = 'store_is_visible';

export const parseStoredBoolean = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

export const storeVisibilityAuthorityError = (key) => new DomainError(
  DomainErrorCode.AUTHORIZATION_FAILED,
  'Storefront visibility editing is controlled by platform admin.',
  { statusCode: 403, details: {
    reason_code: 'STORE_VISIBILITY_EDIT_PLATFORM_CONTROLLED',
    setting_keys: [key]
  } }
);

export const assertStoredVisibilityChangeAllowed = ({ policyValue, currentValue, incomingValue }) => {
  if (!parseStoredBoolean(policyValue, true)
      && parseStoredBoolean(incomingValue, false) !== parseStoredBoolean(currentValue, true)) {
    throw storeVisibilityAuthorityError(STORE_VISIBILITY_KEY);
  }
};
