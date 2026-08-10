import {
  SESSION_COOKIE_NAMES,
  clearTenantSessionCookies,
  getSubmittedRefreshToken,
  isMobileClientRequest,
  setTenantSessionCookies,
  setAffiliateAttributionCookie,
  getAffiliateAttributionCookie
} from '../src/utils/browserSessionCookies.js';

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

describe('browser session cookies', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sets refresh and tenant context as HttpOnly cookies and CSRF as browser-readable', () => {
    process.env.NODE_ENV = 'production';
    const res = createResponse();

    setTenantSessionCookies(res, {
      refreshToken: 'refresh.jwt',
      tenantToken: 'tenant-token'
    });

    const cookies = res.headers['Set-Cookie'];
    expect(cookies).toEqual(expect.any(Array));
    expect(cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAMES.tenantRefresh}=`))).toContain('HttpOnly');
    expect(cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAMES.tenantRefresh}=`))).toContain('Secure');
    expect(cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAMES.tenantRefresh}=`))).toContain('SameSite=Lax');
    expect(cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAMES.tenantContext}=`))).toContain('HttpOnly');
    expect(cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAMES.csrf}=`))).not.toContain('HttpOnly');
  });

  it('clears tenant browser session cookies', () => {
    const res = createResponse();

    clearTenantSessionCookies(res);

    const cookies = res.headers['Set-Cookie'];
    expect(cookies).toHaveLength(3);
    expect(cookies.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
    expect(cookies.every((cookie) => cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'))).toBe(true);
  });

  describe('isMobileClientRequest', () => {
    it('is true only when the x-client-platform header is exactly mobile (case/whitespace insensitive)', () => {
      expect(isMobileClientRequest({ headers: { 'x-client-platform': 'mobile' } })).toBe(true);
      expect(isMobileClientRequest({ headers: { 'x-client-platform': ' Mobile ' } })).toBe(true);
      expect(isMobileClientRequest({ headers: { 'x-client-platform': 'web' } })).toBe(false);
      expect(isMobileClientRequest({ headers: {} })).toBe(false);
      expect(isMobileClientRequest(null)).toBe(false);
    });
  });

  describe('getSubmittedRefreshToken', () => {
    it('prefers the cookie over the body even for a mobile client (unchanged browser priority)', () => {
      const req = {
        headers: { cookie: `${SESSION_COOKIE_NAMES.tenantRefresh}=cookie-token`, 'x-client-platform': 'mobile' },
        body: { refreshToken: 'body-token' }
      };

      expect(getSubmittedRefreshToken(req)).toBe('cookie-token');
    });

    it('falls back to the body refresh token for a mobile client with no cookie', () => {
      const req = {
        headers: { 'x-client-platform': 'mobile' },
        body: { refreshToken: 'body-token' }
      };

      expect(getSubmittedRefreshToken(req)).toBe('body-token');
    });

    it('ignores a body refresh token for a non-mobile client with no cookie', () => {
      const req = {
        headers: {},
        body: { refreshToken: 'body-token' }
      };

      expect(getSubmittedRefreshToken(req)).toBe('');
    });
  });

  // Decision B3 (Phase 1 affiliate pricing rule engine, see
  // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md): the attribution cookie moved
  // from a 30-day persistent cookie to session-scoped. No test previously existed for this cookie at
  // all - these pin the new behavior directly, since there is no "before" to characterize.
  describe('affiliate attribution cookie (decision B3: session-scoped)', () => {
    const extractCookie = (res, name) => (
      (res.headers['Set-Cookie'] || []).find((cookie) => cookie.startsWith(`${name}=`))
    );

    it('sets the cookie without a Max-Age or Expires attribute, making it session-scoped', () => {
      const req = { cookies: {} };
      const res = createResponse();

      setAffiliateAttributionCookie(req, res, 'tenant-1', 'enrollment-42');

      const cookie = extractCookie(res, SESSION_COOKIE_NAMES.affiliateAttribution);
      expect(cookie).toBeDefined();
      expect(cookie).not.toMatch(/Max-Age=/);
      expect(cookie).not.toMatch(/Expires=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('round-trips: a cookie set for one tenant is readable back for that tenant only', () => {
      const req = { cookies: {} };
      const res = createResponse();
      setAffiliateAttributionCookie(req, res, 'tenant-1', 'enrollment-42');

      const cookieValue = extractCookie(res, SESSION_COOKIE_NAMES.affiliateAttribution).split(';')[0].split('=')[1];
      const nextReq = { cookies: { [SESSION_COOKIE_NAMES.affiliateAttribution]: decodeURIComponent(cookieValue) } };

      expect(getAffiliateAttributionCookie(nextReq, 'tenant-1')).toBe('enrollment-42');
      expect(getAffiliateAttributionCookie(nextReq, 'tenant-2')).toBeNull();
    });

    it('scanning a second affiliate for the same store overwrites only that store\'s entry (last-scan-wins)', () => {
      const req = { cookies: {} };

      // First scan, tenant-1.
      const res1 = createResponse();
      setAffiliateAttributionCookie(req, res1, 'tenant-1', 'enrollment-1');
      const afterFirst = decodeURIComponent(extractCookie(res1, SESSION_COOKIE_NAMES.affiliateAttribution).split(';')[0].split('=')[1]);

      // Second scan, tenant-2, carried on the same visitor cookie jar.
      const reqWithFirst = { cookies: { [SESSION_COOKIE_NAMES.affiliateAttribution]: afterFirst } };
      const res2 = createResponse();
      setAffiliateAttributionCookie(reqWithFirst, res2, 'tenant-2', 'enrollment-2');
      const afterSecond = decodeURIComponent(extractCookie(res2, SESSION_COOKIE_NAMES.affiliateAttribution).split(';')[0].split('=')[1]);

      const finalReq = { cookies: { [SESSION_COOKIE_NAMES.affiliateAttribution]: afterSecond } };
      expect(getAffiliateAttributionCookie(finalReq, 'tenant-1')).toBe('enrollment-1');
      expect(getAffiliateAttributionCookie(finalReq, 'tenant-2')).toBe('enrollment-2');

      // Re-scanning a different affiliate for tenant-1 overwrites only that entry.
      const res3 = createResponse();
      setAffiliateAttributionCookie(finalReq, res3, 'tenant-1', 'enrollment-99');
      const afterThird = decodeURIComponent(extractCookie(res3, SESSION_COOKIE_NAMES.affiliateAttribution).split(';')[0].split('=')[1]);
      const lastReq = { cookies: { [SESSION_COOKIE_NAMES.affiliateAttribution]: afterThird } };
      expect(getAffiliateAttributionCookie(lastReq, 'tenant-1')).toBe('enrollment-99');
      expect(getAffiliateAttributionCookie(lastReq, 'tenant-2')).toBe('enrollment-2');
    });

    it('getAffiliateAttributionCookie returns null for a missing tenantId or an absent cookie', () => {
      expect(getAffiliateAttributionCookie({ cookies: {} }, 'tenant-1')).toBeNull();
      expect(getAffiliateAttributionCookie({ cookies: {} }, '')).toBeNull();
    });

    it('setAffiliateAttributionCookie is a no-op when tenantId or enrollmentId is blank', () => {
      const res = createResponse();
      setAffiliateAttributionCookie({ cookies: {} }, res, '', 'enrollment-1');
      setAffiliateAttributionCookie({ cookies: {} }, res, 'tenant-1', '');
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });
  });
});
