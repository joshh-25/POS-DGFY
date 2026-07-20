import {
  SESSION_COOKIE_NAMES,
  clearTenantSessionCookies,
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
});
