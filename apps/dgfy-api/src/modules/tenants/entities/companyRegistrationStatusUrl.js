export const resolveCompanyRegistrationStatusUrl = (applicationId, env = process.env) => {
  const origin = String(env.SKUPERVISOR_PUBLIC_ORIGIN || env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${origin}/register-company/status/${encodeURIComponent(String(applicationId))}`;
};

export const resolvePosOnboardingUrl = (tenantId, env = process.env) => {
  const configuredOrigin = String(
    env.POS_APP_URL
    || (env.NODE_ENV === 'production' ? 'https://pos.dgfy.ph' : 'http://localhost:5174')
  ).trim();
  const url = new URL(configuredOrigin);
  url.pathname = '/';
  url.search = '';
  url.hash = `/terminal?${new URLSearchParams({
    setup_flow: 'tenant_onboarding',
    setup_step: 'profile',
    view: 'items',
    tenant_id: String(tenantId),
  }).toString()}`;
  return url.toString();
};
