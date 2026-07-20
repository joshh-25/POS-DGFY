import { jest } from '@jest/globals';
import { csrfProtection } from '../src/middleware/csrfProtection.js';
import { issueBrowserCsrfToken } from '../src/modules/auth/controllers/authHandlers.js';

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

const runMiddleware = (reqOverrides = {}) => {
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/auth/refresh-token',
    headers: {
      cookie: 'sku_refresh_token=stale-refresh-token'
    },
    ...reqOverrides
  };
  const res = createRes();
  const next = jest.fn();
  csrfProtection(req, res, next);
  return { res, next };
};

describe('csrfProtection', () => {
  it('issues a browser-readable CSRF cookie from the safe bootstrap endpoint', async () => {
    const res = createRes();

    await issueBrowserCsrfToken({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const csrfCookie = (res.__setCookie || [])
      .find((cookie) => cookie.startsWith('sku_csrf_token='));
    expect(csrfCookie).toBeTruthy();
    expect(csrfCookie).not.toContain('HttpOnly');
  });

  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/lookup',
    '/api/v1/admin/login',
    '/api/v1/dgfy/auth/login',
    '/api/v1/dgfy/auth/register/preflight',
    '/api/v1/dgfy/auth/handoff/exchange',
    '/api/v1/store/auth/login'
  ])('allows %s to replace a stale browser session without CSRF', (path) => {
    const { res, next } = runMiddleware({ originalUrl: path });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still rejects cookie-backed refresh without a matching CSRF header', () => {
    const { res, next } = runMiddleware();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error_code: 'CSRF_TOKEN_REQUIRED'
    }));
  });

  it('preserves browser session cookies when the readable CSRF cookie is missing', () => {
    const { res, next } = runMiddleware({
      headers: {
        cookie: 'sku_refresh_token=stale-refresh-token; sku_tenant_context=tenant-token'
      }
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.__setCookie || []).toEqual([]);
  });

  it('does not clear cookies when the CSRF cookie exists but the header is wrong', () => {
    const { res, next } = runMiddleware({
      headers: {
        cookie: 'sku_refresh_token=refresh-token; sku_csrf_token=csrf-cookie',
        'x-csrf-token': 'wrong-token'
      }
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.__setCookie || []).toEqual([]);
  });
});
