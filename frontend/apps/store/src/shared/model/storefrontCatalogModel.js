export const extractStockViolation = (error) => {
  const details = error?.details;
  if (!details) return null;

  if (details?.stock_violation && typeof details.stock_violation === 'object') {
    return details.stock_violation;
  }

  if (Array.isArray(details?.stock_violations) && details.stock_violations.length > 0) {
    return details.stock_violations[0];
  }

  if (Array.isArray(details)) {
    return details.find((entry) => entry && typeof entry === 'object' && Number.isFinite(Number(entry.available_stock)) && Number.isFinite(Number(entry.requested_qty))) || null;
  }

  return null;
};

export const buildStockExceededMessage = (violation = {}) => {
  const itemName = violation.item_name || 'item';
  return `${itemName} is currently unavailable at the selected location.`;
};

export const formatStorefrontAddress = (source = {}) => {
  if (!source || typeof source !== 'object') return '';
  const firstLine = [
    source.barangay,
    source.street_address || source.streetAddress,
    source.subdivision
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
  const secondLine = [
    source.city,
    source.state,
    source.province
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
  const formatted = [firstLine, secondLine].filter(Boolean).join(', ');
  if (formatted) return formatted;
  return String(source.address_line || source.addressLine || '').trim();
};

export const trimAddressCountrySuffix = (value) => String(value || '')
  .replace(/,\s*Philippines\s*$/i, '')
  .trim();

export const isItemAvailable = (item = {}) => {
  if (item?.is_available === true) return true;
  if (item?.is_available === false) return false;
  const status = String(item?.availability_status || '').toLowerCase();
  if (status === 'in_stock' || status === 'bookable') return true;
  return Number(item?.current_stock || 0) > 0;
};

export const isServiceCatalogItem = (item = {}) => String(item?.category || '').trim().toLowerCase() === 'service';
