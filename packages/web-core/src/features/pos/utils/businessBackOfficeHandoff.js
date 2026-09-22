const DEFAULT_PUBLIC_POS_ORIGIN = 'https://pos.dgfy.ph';

const normalizePath = (path = '/') => {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const resolvePosOrigin = () => {
  const configured = String(import.meta.env?.VITE_POS_TERMINAL_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured, DEFAULT_PUBLIC_POS_ORIGIN).origin;
    } catch {
      // Invalid optional configuration falls through to runtime derivation.
    }
  }

  if (typeof window === 'undefined') return DEFAULT_PUBLIC_POS_ORIGIN;

  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (isLocalHost) {
    const localPort = String(import.meta.env?.VITE_POS_DEV_PORT || '5174').trim() || '5174';
    return `${protocol}//${hostname}:${localPort}`;
  }

  if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'pos.')}`;
  if (hostname.startsWith('pos.')) return `${protocol}//${hostname}`;
  if (hostname.startsWith('skupervisor.')) return `${protocol}//${hostname.replace(/^skupervisor\./, 'pos.')}`;
  return hostname ? `${protocol}//pos.${hostname}` : DEFAULT_PUBLIC_POS_ORIGIN;
};

export const getBusinessBackOfficeOrigin = () => resolvePosOrigin();

export const buildBusinessBackOfficeHandoffUrl = ({ tenantId = '', next = '/backoffice/overview', handoffToken = '' } = {}) => {
  const params = new URLSearchParams();
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedHandoffToken = String(handoffToken || '').trim();
  if (normalizedTenantId) params.set('tenant_id', normalizedTenantId);
  params.set('next', normalizePath(next));
  if (normalizedHandoffToken) params.set('handoff_token', normalizedHandoffToken);

  const target = new URL('/', getBusinessBackOfficeOrigin());
  target.hash = `/dgfy/companies?${params.toString()}`;
  return target.toString();
};
