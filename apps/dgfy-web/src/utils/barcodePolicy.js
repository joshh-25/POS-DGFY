const SUPPORTED_GTIN_LENGTHS = new Set([8, 12, 13, 14]);
const INTERNAL_BARCODE_PATTERN = /^[A-Z0-9._:/-]+$/;

export const normalizeGtin = (value) => String(value || '').replace(/\D/g, '');

export const normalizeBarcodeEntry = (value) => String(value || '')
  .split('')
  .filter((character) => {
    const characterCode = character.charCodeAt(0);
    return characterCode >= 32 && characterCode !== 127;
  })
  .join('')
  .trim()
  .toUpperCase()
  .slice(0, 128);

export const getInternalBarcodeValidationMessage = (value) => {
  const code = normalizeBarcodeEntry(value);
  if (code.length < 4) return 'Internal barcode must be at least 4 characters.';
  if (!INTERNAL_BARCODE_PATTERN.test(code)) {
    return 'Internal barcode contains unsupported characters.';
  }
  return '';
};

export const hasValidGtinCheckDigit = (value) => {
  const code = normalizeGtin(value);
  if (!SUPPORTED_GTIN_LENGTHS.has(code.length)) return false;

  const digits = code.split('').map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);

  return (10 - (sum % 10)) % 10 === checkDigit;
};

export const getGtinValidationMessage = (value) => {
  const rawCode = normalizeBarcodeEntry(value);
  if (!/^\d+$/.test(rawCode)) {
    return 'Enter a numeric GTIN-8, UPC-A, EAN-13, or GTIN-14 barcode.';
  }
  const code = normalizeGtin(rawCode);
  if (!SUPPORTED_GTIN_LENGTHS.has(code.length)) {
    return 'Enter a GTIN-8, UPC-A, EAN-13, or GTIN-14 barcode.';
  }

  if (!hasValidGtinCheckDigit(code)) {
    return 'Invalid GTIN check digit. Scan a real package barcode or enter item details manually.';
  }

  return '';
};

const INVALID_PRODUCT_QR_MESSAGE = 'This QR code does not contain a supported product GTIN.';
const GS1_GROUP_SEPARATOR = String.fromCharCode(29);

const validateQrGtinCandidate = (candidate) => {
  const code = String(candidate || '').trim();
  if (!/^\d+$/.test(code)) {
    return { code: '', error: INVALID_PRODUCT_QR_MESSAGE };
  }

  const validationMessage = getGtinValidationMessage(code);
  return validationMessage
    ? { code: '', error: validationMessage }
    : { code, error: '' };
};

export const parseProductQrPayload = (payload) => {
  const value = String(payload || '').trim().replace(/^\]Q3/, '');
  if (!value) return { code: '', error: INVALID_PRODUCT_QR_MESSAGE };

  if (/^\d+$/.test(value)) {
    return validateQrGtinCandidate(value);
  }

  const gs1ElementMatch = value.match(/^\(01\)(\d{14})(?=\(|$)/);
  if (gs1ElementMatch) {
    return validateQrGtinCandidate(gs1ElementMatch[1]);
  }

  if (value.startsWith('01')) {
    const candidate = value.slice(2, 16);
    const remainingPayload = value.slice(16);
    const hasSupportedBoundary = !remainingPayload
      || remainingPayload.startsWith(GS1_GROUP_SEPARATOR)
      || ['10', '17', '21'].some((identifier) => remainingPayload.startsWith(identifier));
    if (/^\d{14}$/.test(candidate) && hasSupportedBoundary) {
      return validateQrGtinCandidate(candidate);
    }
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      return { code: '', error: INVALID_PRODUCT_QR_MESSAGE };
    }

    const pathSegments = url.pathname.split('/').filter(Boolean);
    const primaryKeyIndex = pathSegments.findIndex((segment) => segment === '01');
    if (primaryKeyIndex >= 0 && /^\d{14}$/.test(pathSegments[primaryKeyIndex + 1] || '')) {
      return validateQrGtinCandidate(pathSegments[primaryKeyIndex + 1]);
    }
  } catch {
    // Non-URL payloads are rejected unless they match a supported GS1 representation.
  }

  return { code: '', error: INVALID_PRODUCT_QR_MESSAGE };
};
