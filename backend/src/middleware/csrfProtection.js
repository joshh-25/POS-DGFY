import { getCsrfCookie } from '../utils/browserSessionCookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_ESTABLISHMENT_ROUTES = [
  /^\/api\/v1\/auth\/(login|register|lookup|accept-invite|email-otp\/request)\b/i,
  /^\/api\/v1\/admin\/login\b/i,
  /^\/api\/v1\/dgfy\/auth\/(login|register|password-reset\/complete|handoff\/exchange)\b/i,
  /^\/api\/v1\/store\/auth\/(login|register)\b/i
];

const hasBrowserSessionCookie = (req) => /(^|;\s*)sku_(refresh_token|dgfy_session|store_session|admin_session)=/.test(String(req.headers.cookie || ''));
const hasBearerAuthorization = (req) => /^Bearer\s+\S+/i.test(String(req.headers.authorization || '').trim());
const isSessionEstablishmentRoute = (req) => SESSION_ESTABLISHMENT_ROUTES.some((pattern) => (
  pattern.test(String(req.originalUrl || req.url || ''))
));

const sendCsrfError = (req, res, reason) => {
  req.csrfFailureReason = reason;
  res.locals = res.locals || {};
  res.locals.errorCode = 'CSRF_TOKEN_REQUIRED';
  return res.status(403).json({
    success: false,
    data: null,
    message: 'CSRF token is required for cookie-authenticated requests.',
    error_code: 'CSRF_TOKEN_REQUIRED',
    timestamp: new Date().toISOString()
  });
};

export const csrfProtection = (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (SAFE_METHODS.has(method)) return next();
  if (isSessionEstablishmentRoute(req)) return next();
  if (hasBearerAuthorization(req)) return next();
  if (!hasBrowserSessionCookie(req)) return next();

  const cookieToken = getCsrfCookie(req);
  const headerToken = String(req.headers['x-csrf-token'] || '').trim();
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    const reason = !cookieToken
      ? 'missing_cookie'
      : !headerToken
        ? 'missing_header'
        : 'token_mismatch';
    return sendCsrfError(req, res, reason);
  }

  return next();
};

export default csrfProtection;
