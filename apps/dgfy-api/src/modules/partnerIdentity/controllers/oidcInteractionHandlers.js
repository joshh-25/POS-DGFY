import crypto from 'node:crypto';
import {
  getCookie,
  getCsrfCookie,
  getOidcStorefrontBindingCookieName,
  OIDC_BROWSER_BINDING_COOKIE,
  SESSION_COOKIE_NAMES,
  setBearerSessionCookie,
  setHostOnlySessionCookie
} from '../../../utils/browserSessionCookies.js';
import {
  normalizeConfiguredOrigin,
  resolveOidcIssuerOrigin,
  resolveStorefrontOrigin
} from '../domain/oidcInteractionPolicy.js';

const BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COMPLETION_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const noStore = (res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Referrer-Policy', 'no-referrer');
};

const browserErrorCopy = (error) => {
  if (error?.code === 'invalid_request_uri' || error?.code === 'OIDC_INTERACTION_EXPIRED') {
    return { code: 'request_expired', message: 'This sign-in request expired. Start again from DGLaundry.' };
  }
  if (error?.statusCode === 503) {
    return { code: 'temporarily_unavailable', message: 'DGFY sign-in is temporarily unavailable. Try again from DGLaundry.' };
  }
  return { code: 'sign_in_failed', message: 'DGFY could not continue this sign-in request. Start again from DGLaundry.' };
};

const clientIdFromRequestUri = (requestUri) => {
  const match = /^urn:ietf:params:oauth:request_uri:([A-Za-z0-9_-]+):/.exec(String(requestUri || ''));
  if (!match) return '';
  try { return Buffer.from(match[1], 'base64url').toString('utf8'); } catch { return ''; }
};

const singleQueryValue = (value) => (typeof value === 'string' ? value : '');

const sendFallbackHtml = (res, statusCode, message) => {
  noStore(res);
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  return res.status(statusCode).type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DGFY sign-in</title><body><main><h1>DGFY sign-in</h1><p>${message}</p></main></body></html>`);
};

const requireOriginAndCsrf = (req, expectedOrigin) => {
  const origin = normalizeConfiguredOrigin(String(req.headers.origin || ''), { environment: process.env.NODE_ENV });
  if (!expectedOrigin || origin !== expectedOrigin) {
    const failure = new Error('The browser origin is not allowed for this sign-in request.');
    failure.statusCode = 403;
    failure.code = 'OIDC_ORIGIN_INVALID';
    throw failure;
  }
  const cookie = getCsrfCookie(req);
  const header = String(req.headers['x-csrf-token'] || '').trim();
  if (!cookie || !header || cookie !== header) {
    const failure = new Error('A valid CSRF token is required for this sign-in request.');
    failure.statusCode = 403;
    failure.code = 'OIDC_CSRF_REQUIRED';
    throw failure;
  }
  const fetchSite = String(req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'same-site'].includes(fetchSite)) {
    const failure = new Error('This sign-in request must come from the same origin.');
    failure.statusCode = 403;
    failure.code = 'OIDC_ORIGIN_INVALID';
    throw failure;
  }
};

const interactionBridgeHtml = (nonce) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Completing DGFY sign-in</title></head>
<body><main><h1>Completing sign-in</h1><p id="status" role="status">Please wait while DGFY finishes securely.</p></main>
<script nonce="${nonce}">
(() => {
  const status = document.getElementById('status');
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const ticket = fragment.get('ticket') || '';
  window.history.replaceState(null, '', window.location.pathname);
  const fail = (message) => { status.textContent = message; };
  const readCsrf = () => {
    const entry = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('sku_csrf_token='));
    return entry ? decodeURIComponent(entry.slice('sku_csrf_token='.length)) : '';
  };
  const run = async () => {
    if (!ticket) { fail('This sign-in link is invalid or expired. Start again from DGLaundry.'); return; }
    try {
      let csrf = readCsrf();
      if (!csrf) {
        const bootstrap = await fetch('/api/v1/auth/csrf-token', { credentials: 'same-origin', cache: 'no-store' });
        if (!bootstrap.ok) throw new Error('csrf');
        await bootstrap.json();
        csrf = readCsrf();
      }
      if (!csrf) throw new Error('csrf');
      const response = await fetch('/oidc/complete', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ ticket })
      });
      const result = await response.json().catch(() => null);
      const callback = result && result.data && result.data.redirect_uri;
      if (!response.ok || typeof callback !== 'string') throw new Error('complete');
      window.location.replace(callback);
    } catch {
      fail('DGFY could not finish sign-in. Return to DGLaundry and start again.');
    }
  };
  run();
})();
</script></body></html>`;

export const createOidcInteractionHandlers = ({ interactionUseCases }) => ({
  async bindStorefrontBrowser(req, res, next) {
    noStore(res);
    try {
      const storefrontOrigin = resolveStorefrontOrigin();
      requireOriginAndCsrf(req, storefrontOrigin);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      if (Object.keys(body).some((name) => name !== 'handoff')
        || (body.handoff !== undefined && typeof body.handoff !== 'string')) {
        return res.status(400).json({ success: false, data: null, error_code: 'OIDC_STOREFRONT_BINDING_INVALID', message: 'This browser sign-in session is invalid.' });
      }
      const cookieName = getOidcStorefrontBindingCookieName(req.params.id);
      if (!cookieName) return res.status(410).json({ success: false, data: null, error_code: 'OIDC_INTERACTION_EXPIRED', message: 'This sign-in request expired. Start again from DGLaundry.' });
      const existingBinding = getCookie(req, cookieName);
      const result = await interactionUseCases.bindStorefrontBrowser({
        id: req.params.id,
        handoff: body.handoff || '',
        browserBinding: /^[A-Za-z0-9_-]{43}$/.test(existingBinding) ? existingBinding : ''
      });
      setHostOnlySessionCookie(res, cookieName, result.browser_binding, {
        maxAgeMs: Math.max(1000, Number(result.expires_at) - Date.now()),
        httpOnly: true,
        sameSite: 'Lax',
        secure: storefrontOrigin.startsWith('https://')
      });
      return res.status(200).json({ success: true, data: { expires_at: result.expires_at }, message: 'Browser sign-in session bound.' });
    } catch (error) { return next(error); }
  },

  async authorizeBrowser(req, res) {
    noStore(res);
    const query = req.query || {};
    const allowedNames = new Set(['request_uri', 'client_id']);
    const hasUnexpectedQuery = Object.keys(query).some((name) => !allowedNames.has(name));
    const requestUri = singleQueryValue(query.request_uri);
    const clientId = singleQueryValue(query.client_id);
    if (hasUnexpectedQuery || !requestUri || (query.request_uri !== undefined && typeof query.request_uri !== 'string')
      || (query.client_id !== undefined && typeof query.client_id !== 'string')) {
      try {
        const errorPage = await interactionUseCases.createBrowserError({
          code: 'invalid_request',
          message: 'This browser sign-in request is invalid. Start again from DGLaundry.',
          clientId: clientId || clientIdFromRequestUri(requestUri)
        });
        return res.redirect(302, errorPage.storefront_url);
      } catch {
        return sendFallbackHtml(res, 400, 'This browser sign-in request is invalid. Start again from DGLaundry.');
      }
    }

    const issuer = resolveOidcIssuerOrigin();
    if (!issuer) return sendFallbackHtml(res, 503, 'DGFY sign-in is not configured for this environment.');
    let binding = getCookie(req, OIDC_BROWSER_BINDING_COOKIE);
    if (!BINDING_PATTERN.test(binding)) binding = crypto.randomBytes(32).toString('base64url');

    try {
      const interaction = await interactionUseCases.createInteraction({ requestUri, clientId, browserBinding: binding });
      setHostOnlySessionCookie(res, OIDC_BROWSER_BINDING_COOKIE, binding, {
        maxAgeMs: Math.max(1000, Number(interaction.expires_at) - Date.now()),
        httpOnly: true,
        sameSite: 'Lax',
        secure: issuer.origin.startsWith('https://')
      });
      return res.redirect(302, interaction.storefront_url);
    } catch (error) {
      const copy = browserErrorCopy(error);
      try {
        const errorPage = await interactionUseCases.createBrowserError({
          code: copy.code,
          message: copy.message,
          clientId: clientId || clientIdFromRequestUri(requestUri)
        });
        return res.redirect(302, errorPage.storefront_url);
      } catch {
        return sendFallbackHtml(res, error?.statusCode || 503, copy.message);
      }
    }
  },

  async getInteraction(req, res, next) {
    noStore(res);
    try {
      const data = await interactionUseCases.getInteractionMetadata({
        id: req.params.id,
        account: req.dgfyAccount || null,
        sessionToken: req.dgfySessionToken || '',
        browserBinding: getCookie(req, getOidcStorefrontBindingCookieName(req.params.id))
      });
      return res.status(200).json({ success: true, data, message: 'OIDC interaction loaded.' });
    } catch (error) { return next(error); }
  },

  async completeInteraction(req, res, next) {
    noStore(res);
    try {
      const storefrontOrigin = resolveStorefrontOrigin();
      requireOriginAndCsrf(req, storefrontOrigin);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const allowedNames = new Set(['action', 'company_id']);
      if (Object.keys(body).some((name) => !allowedNames.has(name))) {
        return res.status(400).json({ success: false, data: null, error_code: 'OIDC_ACTION_INVALID', message: 'This sign-in action is invalid.' });
      }
      const result = await interactionUseCases.prepareCompletion({
        id: req.params.id,
        account: req.dgfyAccount,
        sessionToken: req.dgfySessionToken,
        browserBinding: getCookie(req, getOidcStorefrontBindingCookieName(req.params.id)),
        action: body.action,
        companyId: body.company_id
      });
      return res.status(200).json({ success: true, data: result, message: 'OIDC sign-in is ready to complete.' });
    } catch (error) { return next(error); }
  },

  async getInteractionError(req, res, next) {
    noStore(res);
    try {
      const record = await interactionUseCases.getError(req.params.id);
      if (!record) return res.status(404).json({
        success: true,
        data: { code: 'request_expired', message: 'This sign-in request expired. Start again from DGLaundry.', restart_url: null },
        message: 'OIDC error details expired.'
      });
      return res.status(200).json({ success: true, data: record, message: 'OIDC error loaded.' });
    } catch (error) { return next(error); }
  },

  async getCompletionBridge(_req, res) {
    const nonce = crypto.randomBytes(18).toString('base64url');
    noStore(res);
    res.set({
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    return res.status(200).type('html').send(interactionBridgeHtml(nonce));
  },

  async postCompletionBridge(req, res, next) {
    noStore(res);
    try {
      const issuer = resolveOidcIssuerOrigin();
      requireOriginAndCsrf(req, issuer?.origin || null);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      if (Object.keys(body).length !== 1 || typeof body.ticket !== 'string'
        || !COMPLETION_TICKET_PATTERN.test(body.ticket)) {
        return res.status(400).json({ success: false, data: null, error_code: 'OIDC_COMPLETION_TICKET_INVALID', message: 'This sign-in link is invalid or expired.' });
      }
      const binding = getCookie(req, OIDC_BROWSER_BINDING_COOKIE);
      const result = await interactionUseCases.redeemCompletion({ ticket: body.ticket, browserBinding: binding });
      const maxAgeMs = Math.max(1000, Number(result.session_expires_at) - Date.now());
      setBearerSessionCookie(res, SESSION_COOKIE_NAMES.dgfy, result.session_token, { maxAgeMs });
      return res.status(200).json({
        success: true,
        data: { redirect_uri: result.redirect_uri },
        message: 'OIDC sign-in completed.'
      });
    } catch (error) { return next(error); }
  }
});
