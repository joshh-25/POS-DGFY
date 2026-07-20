const VALID_MODES = new Set(['observe', 'tenant_allowlist', 'all']);

const parseTenantAllowlist = (rawValue) =>
  String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export const getPhoneCompletionEnforcementMode = () => {
  const configured = String(process.env.PHONE_COMPLETION_ENFORCEMENT_MODE || '')
    .trim()
    .toLowerCase();

  if (VALID_MODES.has(configured)) {
    return configured;
  }

  // Tests should exercise the strict path by default; non-test environments
  // stay in observe mode until operators intentionally enable enforcement.
  return process.env.NODE_ENV === 'test' ? 'all' : 'observe';
};

export const getPhoneCompletionEnforcedTenants = () =>
  parseTenantAllowlist(process.env.PHONE_COMPLETION_ENFORCED_TENANTS);

export const isPhoneCompletionEnforcedForTenant = (tenant = {}) => {
  const mode = getPhoneCompletionEnforcementMode();
  if (mode === 'all') return true;
  if (mode === 'observe') return false;

  const tenantId = String(tenant?.id || '').trim();
  const companyToken = String(tenant?.company_token || '').trim();
  const allowlist = new Set(getPhoneCompletionEnforcedTenants());
  return [tenantId, companyToken].filter(Boolean).some((value) => allowlist.has(value));
};
