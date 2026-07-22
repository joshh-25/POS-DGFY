const isGeneratedPinnedAddress = (value = '') => /^Pinned map location\s*\(/i.test(String(value || '').trim());

export const getCustomerAddressLine = (address = {}) => {
  const candidates = [address.address_line, address.fullAddress, address.full_address, address.formatted_address, address.address];
  return candidates.map((value) => String(value || '').trim()).find((value) => value && !isGeneratedPinnedAddress(value)) || '';
};

export const getCustomerAddressTitle = (address = {}) => {
  const addressLine = getCustomerAddressLine(address);
  if (addressLine) {
    const segments = addressLine.split(',').map((segment) => segment.trim()).filter(Boolean);
    return segments.slice(0, 2).join(', ') || addressLine;
  }
  const label = String(address.label || '').trim();
  return label && !isGeneratedPinnedAddress(label) ? label : 'Saved address';
};

export const getCustomerAddressNote = (address = {}) => {
  const label = String(address.label || '').trim();
  if (!label || /^home$/i.test(label) || /^address$/i.test(label) || isGeneratedPinnedAddress(label)) return '';
  return label;
};

export const getCustomerAddressActionMeta = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return { action: '', id: '' };
  const separatorIndex = normalized.indexOf(':');
  if (separatorIndex < 0) return { action: normalized, id: '' };
  return { action: normalized.slice(0, separatorIndex), id: normalized.slice(separatorIndex + 1) };
};

export const createCustomerAddressDraft = (address = {}, { keepDefaultFlag = false } = {}) => ({
  label: getCustomerAddressNote(address),
  address_line: getCustomerAddressLine(address),
  latitude: address?.latitude ?? null,
  longitude: address?.longitude ?? null,
  is_default: keepDefaultFlag ? Boolean(address?.is_default) : false,
  ...(address?.address_id ? { address_id: address.address_id } : {})
});
