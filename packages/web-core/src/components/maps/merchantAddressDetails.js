/**
 * #2595: a store location's address is stored twice on purpose. `address_line` is the full
 * display address every reader already uses (Storefront, discovery, receipts), `<details>,
 * <location>`; `address_details` is the merchant's own street number, unit, floor or building,
 * kept apart so the store-location editors can show the geocoded location and the details as
 * two fields again.
 */

export const MERCHANT_ADDRESS_DETAILS_MAX_LENGTH = 255;

const cleanDetails = (value) => String(value || '').trim().replace(/[\s,]+$/, '');
const cleanLocation = (value) => String(value || '').trim().replace(/^[\s,]+/, '');

/** The full display address saved as `address_line`. */
export function composeMerchantAddress(details = '', location = '') {
  const detailsPart = cleanDetails(details);
  const locationPart = cleanLocation(location);
  if (!detailsPart) return locationPart;
  if (!locationPart) return detailsPart;
  if (locationPart.toLowerCase().startsWith(`${detailsPart.toLowerCase()},`)) return locationPart;
  return `${detailsPart}, ${locationPart}`;
}

/**
 * The location part of a saved `address_line`: the line minus its `<details>, ` prefix. A line
 * saved before details existed, or edited elsewhere so it no longer starts with them, is
 * returned whole rather than guessed at.
 */
export function splitMerchantAddressLocation(addressLine = '', details = '') {
  const line = String(addressLine || '').trim();
  const detailsPart = cleanDetails(details);
  if (!detailsPart) return line;
  const prefix = `${detailsPart.toLowerCase()},`;
  if (!line.toLowerCase().startsWith(prefix)) return line;
  return cleanLocation(line.slice(prefix.length));
}

/** Editor state for a saved location: `{ address_details, address_line: <location part> }`. */
export function readMerchantAddressParts(location = {}) {
  const details = String(location?.address_details || '').trim();
  return {
    address_details: details,
    address_line: splitMerchantAddressLocation(location?.address_line, details)
  };
}

/** The two address fields a save request sends. */
export function buildMerchantAddressPayload({ details = '', location = '' } = {}) {
  const detailsPart = cleanDetails(details).slice(0, MERCHANT_ADDRESS_DETAILS_MAX_LENGTH);
  return {
    address_line: composeMerchantAddress(detailsPart, location),
    address_details: detailsPart || null
  };
}

export const hasMerchantAddressDetails = (value) => cleanDetails(value).length > 0;
