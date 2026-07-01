import { jest } from '@jest/globals';
import { csrfProtection } from '../src/middleware/csrfProtection.js';

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
  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/lookup',
    '/api/v1/auth/email-otp/request',
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

  it('allows bearer-authenticated requests when an unrelated browser session cookie exists', () => {
    const { res, next } = runMiddleware({
      originalUrl: '/api/v1/dgfy/auth/tenant-session',
      headers: {
        authorization: 'Bearer dgfy-account-token',
        cookie: 'sku_refresh_token=stale-refresh-token'
      }
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not treat non-bearer authorization as a CSRF exemption', () => {
    const { res, next } = runMiddleware({
      headers: {
        authorization: 'Basic credentials',
        cookie: 'sku_refresh_token=stale-refresh-token'
      }
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
