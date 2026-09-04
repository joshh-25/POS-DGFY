const isGeneratedPinnedAddress = (value = '') => /^Pinned map location\s*\(/i.test(String(value || '').trim());
const isGenericCustomerAddressLabel = (value = '') => /^(address|saved address|saved location)$/i.test(String(value || '').trim());

export const isCustomerAddressDefault = (address = {}) => {
  const value = address?.is_default;
  return value === true || value === 1 || value === '1' || /^true$/i.test(String(value || '').trim());
};

export const getCustomerAddressLine = (address = {}) => {
  const candidates = [address.address_line, address.fullAddress, address.full_address, address.formatted_address, address.address];
  return candidates.map((value) => String(value || '').trim()).find((value) => value && !isGeneratedPinnedAddress(value)) || '';
};

export const getCustomerAddressTitle = (address = {}) => {
  const label = String(address.label || '').trim();
  if (label && !isGeneratedPinnedAddress(label) && !isGenericCustomerAddressLabel(label)) return label;

  const addressLine = getCustomerAddressLine(address);
  if (addressLine) {
    const segments = addressLine.split(',').map((segment) => segment.trim()).filter(Boolean);
    return segments.slice(0, 2).join(', ') || addressLine;
  }
  return label && !isGeneratedPinnedAddress(label) ? label : 'Saved address';
};

export const getCustomerAddressNote = (address = {}) => {
  const label = String(address.label || '').trim();
  return label && !isGeneratedPinnedAddress(label) && !isGenericCustomerAddressLabel(label) ? label : '';
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
  is_default: keepDefaultFlag ? isCustomerAddressDefault(address) : false,
  ...(address?.address_id ? { address_id: address.address_id } : {})
});
