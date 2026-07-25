export const PAYOUT_METHOD_TYPES = ['bank', 'gcash', 'maya'];

export const getPayoutMethodTypeLabel = (methodType = '') => {
  const normalized = String(methodType || '').trim().toLowerCase();
  if (normalized === 'bank') return 'Bank Transfer';
  if (normalized === 'gcash') return 'GCash';
  if (normalized === 'maya') return 'Maya';
  return 'Payout Method';
};

const maskTail = (value = '', visibleCount = 4) => {
  const digits = String(value || '').replace(/\s+/g, '');
  if (!digits) return '';
  if (digits.length <= visibleCount) return digits;
  return `•••• ${digits.slice(-visibleCount)}`;
};

export const getPayoutMethodTitle = (method = {}) => {
  const typeLabel = getPayoutMethodTypeLabel(method.method_type);
  if (method.method_type === 'bank') {
    const bankName = String(method.bank_name || '').trim();
    return bankName ? `${bankName} — ${maskTail(method.account_number)}` : typeLabel;
  }
  return `${typeLabel} — ${maskTail(method.mobile_number)}`;
};

export const getPayoutMethodSubtitle = (method = {}) => {
  const label = String(method.label || '').trim();
  if (label) return label;
  if (method.method_type === 'bank') return String(method.account_name || '').trim();
  return '';
};

export const getPayoutMethodActionMeta = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return { action: '', id: '' };
  const separatorIndex = normalized.indexOf(':');
  if (separatorIndex < 0) return { action: normalized, id: '' };
  return { action: normalized.slice(0, separatorIndex), id: normalized.slice(separatorIndex + 1) };
};

export const createPayoutMethodDraft = (method = null) => ({
  method_type: method?.method_type || 'bank',
  label: method?.label || '',
  bank_name: method?.bank_name || '',
  account_name: method?.account_name || '',
  account_number: method?.account_number || '',
  mobile_number: method?.mobile_number || '',
  is_default: method?.is_default === true,
  ...(method?.payout_method_id ? { payout_method_id: method.payout_method_id } : {})
});
