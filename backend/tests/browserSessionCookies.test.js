import {
  SESSION_COOKIE_NAMES,
  clearTenantSessionCookies,
  getSubmittedRefreshToken,
  isMobileClientRequest,
  setTenantSessionCookies
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
});
