const DEFAULT_BUSINESS_REGISTRATION_URL = 'https://skupervisor.dgfy.ph/register-company';

const normalizeBusinessRegistrationBaseUrl = () => {
  const configured = String(import.meta.env.VITE_SKUPERVISOR_REGISTRATION_URL || '').trim();
  if (!configured) return DEFAULT_BUSINESS_REGISTRATION_URL;

  try {
    const target = new URL(configured);
    if (!target.pathname || target.pathname === '/') {
      target.pathname = '/register-company';
    }
    return target.toString();
  } catch {
    return DEFAULT_BUSINESS_REGISTRATION_URL;
  }
};

export const buildBusinessRegistrationUrl = (handoffToken = '') => {
  const target = new URL(normalizeBusinessRegistrationBaseUrl());
  target.searchParams.set('source', 'dgfy');
  target.searchParams.set('auth', 'login');
  if (handoffToken) {
    target.searchParams.set('handoff_token', handoffToken);
  }
  target.hash = 'business-registration';
  return target.toString();
};

export const buildBusinessLoginUrl = () => {
  const target = new URL(normalizeBusinessRegistrationBaseUrl());
  target.pathname = '/login';
  target.search = '';
  target.hash = '';
  return target.toString();
};
