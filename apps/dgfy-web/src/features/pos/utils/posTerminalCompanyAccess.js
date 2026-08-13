import api from '@/services/api.js';
import {
  POS_TERMINAL_LOGIN_ERROR_CODES,
  createTerminalLoginError,
  normalizeLookupTenantOptions
} from './terminalUnlockDiagnostics.js';

export const normalizeAccessibleCompanies = (payload = {}) => {
  const candidates = [
    ...(Array.isArray(payload?.companies) ? payload.companies : []),
    ...(Array.isArray(payload?.owned_companies) ? payload.owned_companies : []),
    ...(Array.isArray(payload?.invited_companies) ? payload.invited_companies : [])
  ];
  const seenTenantIds = new Set();

  return candidates.filter((company) => {
    const tenantId = String(company?.tenant_id || '').trim();
    if (!tenantId || seenTenantIds.has(tenantId)) return false;
    seenTenantIds.add(tenantId);
    return true;
  });
};

export const lookupCompanyToken = async (email, preferredCompanyToken = '') => {
  const response = await api.post('/auth/lookup', { email }, { skipGlobalErrorToast: true });
  const tenants = normalizeLookupTenantOptions(response?.data?.data);
  const normalizedPreferred = String(preferredCompanyToken || '').trim();
  if (normalizedPreferred && tenants.some((tenant) => tenant?.company_token === normalizedPreferred)) {
    return normalizedPreferred;
  }
  if (tenants.length === 1) {
    return tenants[0]?.company_token || null;
  }
  if (tenants.length > 1) {
    throw createTerminalLoginError(
      'This email belongs to multiple companies. Sign in from SKUpervisor once, then reopen POS for the selected company.',
      POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS
    );
  }
  return null;
};
