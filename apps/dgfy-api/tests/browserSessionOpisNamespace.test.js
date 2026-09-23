import {
  APP_SURFACE_HEADER,
  OPIS_SESSION_COOKIE_NAMES,
  SESSION_COOKIE_NAMES,
  clearAllBrowserSessionCookies,
  clearTenantSessionCookies,
  getCsrfCookie,
  getSubmittedRefreshToken,
  getTenantContextToken,
  getTenantRefreshToken,
  issueCsrfToken,
  resolveSessionNamespace,
  setTenantSessionCookies
} from '../src/utils/browserSessionCookies.js';
import { csrfProtection } from '../src/middleware/csrfProtection.js';

const createResponse = () => {
  const headers = {};
  return {
    getHeader: (name) => headers[name],
    setHeader: (name, value) => {
      headers[name] = value;
    },
    headers
  };
};

const setCookieHeader = (res) => String((res.headers['Set-Cookie'] || []).join('; '));
const opisReq = (headers = {}) => ({ headers: { [APP_SURFACE_HEADER]: 'opis', ...headers } });
const skuReq = (headers = {}) => ({ headers: { ...headers } });

describe('OPIS browser session namespace (issue #2052)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolveSessionNamespace', () => {
    it('selects opis only on x-dgfy-app-surface: opis', () => {
      expect(resolveSessionNamespace(opisReq())).toBe('opis');
      expect(resolveSessionNamespace(opisReq({ [APP_SURFACE_HEADER]: ' Opis ' }))).toBe('opis');
      expect(resolveSessionNamespace(skuReq())).toBe('sku');
      expect(resolveSessionNamespace(skuReq({ [APP_SURFACE_HEADER]: 'pos' }))).toBe('sku');
      expect(resolveSessionNamespace({})).toBe('sku');
    });
  });

  describe('issuance', () => {
    it('issues opis_* cookies for OPIS requests with the same flags as sku_*', () => {
      process.env.NODE_ENV = 'production';
      const res = createResponse();

      setTenantSessionCookies(res, { refreshToken: 'opis-refresh', tenantToken: 'opis-tenant' }, opisReq());

      const header = setCookieHeader(res);
      expect(header).toContain(`${OPIS_SESSION_COOKIE_NAMES.tenantRefresh}=opis-refresh`);
      expect(header).toContain(`${OPIS_SESSION_COOKIE_NAMES.tenantContext}=opis-tenant`);
      expect(header).toContain(OPIS_SESSION_COOKIE_NAMES.csrf);
      expect(header).not.toContain(`${SESSION_COOKIE_NAMES.tenantRefresh}=`);
      expect(header).not.toContain(`${SESSION_COOKIE_NAMES.tenantContext}=`);
      expect(header).not.toContain(`${SESSION_COOKIE_NAMES.csrf}=`);
    });

    it('keeps sku_* issuance when no OPIS surface header is present', () => {
      const res = createResponse();

      setTenantSessionCookies(res, { refreshToken: 'sku-refresh', tenantToken: 'sku-tenant' }, skuReq());

      const header = setCookieHeader(res);
      expect(header).toContain(`${SESSION_COOKIE_NAMES.tenantRefresh}=sku-refresh`);
      expect(header).not.toContain('opis_refresh_token=');
    });

    it('issues the namespaced CSRF cookie on bootstrap', () => {
      const opisRes = createResponse();
      issueCsrfToken(opisRes, {}, opisReq());
      expect(setCookieHeader(opisRes)).toContain(`${OPIS_SESSION_COOKIE_NAMES.csrf}=`);

      const skuRes = createResponse();
      issueCsrfToken(skuRes, {}, skuReq());
      expect(setCookieHeader(skuRes)).toContain(`${SESSION_COOKIE_NAMES.csrf}=`);
    });
  });

  describe('reading', () => {
    it('reads the opis refresh/context/CSRF cookies for OPIS requests', () => {
      const req = opisReq({
        cookie: `${OPIS_SESSION_COOKIE_NAMES.tenantRefresh}=r; ${OPIS_SESSION_COOKIE_NAMES.tenantContext}=t; ${OPIS_SESSION_COOKIE_NAMES.csrf}=c`
      });
      expect(getTenantRefreshToken(req)).toBe('r');
      expect(getTenantContextToken(req)).toBe('t');
      expect(getCsrfCookie(req)).toBe('c');
    });

    it('never consumes the legacy sku_* POS cookie for OPIS requests', () => {
      const req = opisReq({ cookie: `${SESSION_COOKIE_NAMES.tenantRefresh}=pos-refresh` });
      expect(getSubmittedRefreshToken(req)).toBe('');
      expect(getTenantRefreshToken(req)).toBe('');
    });

    it('ignores mobile body refresh tokens for OPIS requests', () => {
      const req = opisReq({ 'x-client-platform': 'mobile' });
      req.body = { refreshToken: 'body-token' };
      expect(getSubmittedRefreshToken(req)).toBe('');
    });

    it('keeps sku cookie-first behavior unchanged for non-OPIS requests', () => {
      const req = skuReq({ cookie: `${SESSION_COOKIE_NAMES.tenantRefresh}=pos-refresh` });
      expect(getSubmittedRefreshToken(req)).toBe('pos-refresh');
    });
  });

  describe('clearing', () => {
    it('OPIS logout clears only the opis_* namespace, never POS cookies', () => {
      const res = createResponse();

      clearTenantSessionCookies(res, opisReq());

      const cookies = res.headers['Set-Cookie'];
      expect(cookies).toHaveLength(3);
      const header = cookies.join('; ');
      expect(header).toContain(OPIS_SESSION_COOKIE_NAMES.tenantRefresh);
      expect(header).toContain(OPIS_SESSION_COOKIE_NAMES.tenantContext);
      expect(header).toContain(OPIS_SESSION_COOKIE_NAMES.csrf);
      expect(header).not.toContain('sku_');
    });

    it('OPIS full logout clears only the opis_* namespace', () => {
      const res = createResponse();

      clearAllBrowserSessionCookies(res, opisReq());

      const header = setCookieHeader(res);
      expect(header).toContain('opis_');
      expect(header).not.toContain('sku_');
    });

    it('default full logout keeps the existing all-sku_* behavior', () => {
      const res = createResponse();

      clearAllBrowserSessionCookies(res, skuReq());

      expect(res.headers['Set-Cookie']).toHaveLength(Object.keys(SESSION_COOKIE_NAMES).length);
    });
  });

  describe('CSRF enforcement with the opis namespace', () => {
    const runMiddleware = (req) => new Promise((resolve) => {
      const res = {
        status: (code) => ({ json: (body) => resolve({ code, body }) })
      };
      csrfProtection(req, res, () => resolve({ code: 'next' }));
    });

    it('accepts a matching opis CSRF pair on unsafe methods', async () => {
      const result = await runMiddleware({
        method: 'POST',
        headers: {
          [APP_SURFACE_HEADER]: 'opis',
          cookie: `${OPIS_SESSION_COOKIE_NAMES.tenantRefresh}=r; ${OPIS_SESSION_COOKIE_NAMES.csrf}=token`,
          'x-csrf-token': 'token'
        }
      });
      expect(result.code).toBe('next');
    });

    it('rejects when the opis CSRF header does not match the cookie', async () => {
      const result = await runMiddleware({
        method: 'POST',
        headers: {
          [APP_SURFACE_HEADER]: 'opis',
          cookie: `${OPIS_SESSION_COOKIE_NAMES.tenantRefresh}=r; ${OPIS_SESSION_COOKIE_NAMES.csrf}=token`,
          'x-csrf-token': 'other'
        }
      });
      expect(result.code).toBe(403);
      expect(result.body.error_code).toBe('CSRF_TOKEN_REQUIRED');
    });

    it('does not mistake a POS sku_* session for an OPIS CSRF bypass', async () => {
      // OPIS request carrying only legacy POS cookies: hasBrowserSessionCookie sees a
      // session cookie, but the opis CSRF cookie is absent -> must still 403.
      const result = await runMiddleware({
        method: 'POST',
        headers: {
          [APP_SURFACE_HEADER]: 'opis',
          cookie: `${SESSION_COOKIE_NAMES.tenantRefresh}=pos-refresh; ${SESSION_COOKIE_NAMES.csrf}=pos-csrf`,
          'x-csrf-token': 'pos-csrf'
        }
      });
      expect(result.code).toBe(403);
    });
  });
});
