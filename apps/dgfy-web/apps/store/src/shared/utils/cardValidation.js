export const CARD_NUMBER_MIN_LENGTH = 13;
export const CARD_NUMBER_MAX_LENGTH = 19;

export const stripCardNumberFormatting = (value) => String(value || '').replace(/\D/g, '');

export const normalizeCardNumber = (value) => (
  stripCardNumberFormatting(value).slice(0, CARD_NUMBER_MAX_LENGTH)
);

export const formatCardNumber = (value) => (
  normalizeCardNumber(value).replace(/(.{4})/g, '$1 ').trim()
);

export const passesCardNumberChecksum = (value) => {
  const digits = stripCardNumberFormatting(value);
  if (!/^\d+$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

export const validateCardNumber = (value) => {
  const digits = stripCardNumberFormatting(value);
  if (!/^\d+$/.test(digits) || digits.length < CARD_NUMBER_MIN_LENGTH || digits.length > CARD_NUMBER_MAX_LENGTH) {
    return 'Enter a valid card number (13–19 digits).';
  }
  if (!passesCardNumberChecksum(digits)) {
    return 'Enter a valid card number.';
  }
  return '';
};

export const getCardFieldErrors = (cardDetails = {}, currentDate = new Date()) => {
  const errors = {};
  const cardNumber = stripCardNumberFormatting(cardDetails.cardNumber);
  const expirationParts = String(cardDetails.expiration || '').trim().split('/').map((part) => part.trim());
  const expMonth = Number(cardDetails.expMonth || expirationParts[0]);
  const rawYear = String(cardDetails.expYear || expirationParts[1] || '').replace(/\D/g, '');
  const expYear = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
  const cvc = String(cardDetails.cvc || '').replace(/\D/g, '');
  const cardholder = String(cardDetails.cardholder || '').trim();

  const cardNumberError = validateCardNumber(cardNumber);
  if (cardNumberError) errors.cardNumber = cardNumberError;
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
    errors.expiration = 'Enter a valid card expiry month.';
  } else if (!Number.isInteger(expYear) || expYear < currentDate.getFullYear() || expYear > currentDate.getFullYear() + 30) {
    errors.expiration = 'Enter a valid card expiry year.';
  }
  if (!/^\d{3,4}$/.test(cvc)) errors.cvc = 'Enter a valid card security code.';
  if (!cardholder) errors.cardholder = 'Enter the cardholder name.';

  return errors;
};
