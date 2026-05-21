export const PHONE_NUMBER_PATTERN = /^[+0-9().\-\s]{7,40}$/;

export const PHONE_NUMBER_HELP_TEXT = '7-40 characters; digits, spaces, +, -, parentheses, and periods only.';

export const normalizePhoneNumber = (value) => String(value || '').trim();

export const getPhoneNumberError = (value, { label = 'Phone number', required = true } = {}) => {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) {
    return required ? `${label} is required` : '';
  }
  if (!PHONE_NUMBER_PATTERN.test(normalized)) {
    return `${label} must be ${PHONE_NUMBER_HELP_TEXT}`;
  }
  return '';
};
