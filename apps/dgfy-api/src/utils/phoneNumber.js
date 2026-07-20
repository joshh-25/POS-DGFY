export const PHONE_NUMBER_PATTERN = /^[+0-9().\-\s]{7,40}$/;

export const normalizePhoneNumber = (value) => String(value || '').trim();

export const isValidPhoneNumber = (value) => {
  const normalized = normalizePhoneNumber(value);
  return PHONE_NUMBER_PATTERN.test(normalized);
};

export const PHONE_NUMBER_VALIDATION_MESSAGE = 'Phone number must be 7-40 characters and may only contain digits, spaces, +, -, parentheses, and periods';
