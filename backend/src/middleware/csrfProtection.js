import { getCsrfCookie } from '../utils/browserSessionCookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const hasBrowserSessionCookie = (req) => /(^|;\s*)sku_(refresh_token|dgfy_session|store_session|admin_session)=/.test(String(req.headers.cookie || ''));

const sendCsrfError = (res) => res.status(403).json({
  success: false,
  data: null,
  message: 'CSRF token is required for cookie-authenticated requests.',
  error_code: 'CSRF_TOKEN_REQUIRED',
  timestamp: new Date().toISOString()
});

export const csrfProtection = (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (SAFE_METHODS.has(method)) return next();
  if (!hasBrowserSessionCookie(req)) return next();

  const cookieToken = getCsrfCookie(req);
  const headerToken = String(req.headers['x-csrf-token'] || '').trim();
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return sendCsrfError(res);
  }

  return next();
};

export default csrfProtection;
