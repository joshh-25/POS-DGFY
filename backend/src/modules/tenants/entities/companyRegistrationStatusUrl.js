export const resolveCompanyRegistrationStatusUrl = (applicationId, env = process.env) => {
  const origin = String(env.SKUPERVISOR_PUBLIC_ORIGIN || env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${origin}/register-company/status/${encodeURIComponent(String(applicationId))}`;
};
