import { jest } from '@jest/globals';

const findByPk = jest.fn();
const findById = jest.fn();
const verifyStoreToken = jest.fn();
const verifyToken = jest.fn();
const isTokenBlacklisted = jest.fn();
const authenticate = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: { get: () => ({ findByPk }) } }));
jest.unstable_mockModule('../src/modules/store/utils/storeJwtToken.js', () => ({
  verifyStoreToken, normalizeTenantIdentifier: (value) => value || null
}));
jest.unstable_mockModule('../src/services/authService.js', () => ({ verifyToken, isTokenBlacklisted }));
jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({ dgfyAccountRepository: { findById } }));
jest.unstable_mockModule('../src/middleware/auth.js', () => ({ authenticate }));

let resolveOptionalFeedbackIdentity;
beforeAll(async () => ({ resolveOptionalFeedbackIdentity } = await import('../src/modules/feedback/middleware/resolveOptionalFeedbackIdentity.js')));

const run = async (headers = {}, tenant = null) => {
  const req = { headers, tenant };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await resolveOptionalFeedbackIdentity(req, res, next);
  return { req, res, next };
};

beforeEach(() => {
  jest.clearAllMocks();
  verifyStoreToken.mockImplementation(() => { throw new Error('wrong scope'); });
  verifyToken.mockImplementation(() => { throw new Error('wrong scope'); });
  isTokenBlacklisted.mockResolvedValue(false);
});

describe('optional feedback identity', () => {
  it('allows a true guest', async () => {
    const { req, next } = await run();
    expect(req.feedbackIdentity).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it('resolves a store customer read-only and enforces tenant match', async () => {
    verifyStoreToken.mockReturnValue({ type: 'store_customer', tenant_id: 'tenant', customer_id: 4 });
    findByPk.mockResolvedValue({ customer_id: 4, name: 'Store', email: 'store@example.com', is_active: true });
    const valid = await run({ authorization: 'Bearer store' }, { id: 'tenant' });
    expect(valid.req.feedbackIdentity).toEqual(expect.objectContaining({ kind: 'store_customer', id: 4 }));
    expect(findByPk).toHaveBeenCalledWith(4);
    const mismatch = await run({ authorization: 'Bearer store' }, { id: 'other' });
    expect(mismatch.res.status).toHaveBeenCalledWith(403);
  });

  it('resolves a DGFY account and rejects revoked or inactive sessions', async () => {
    verifyToken.mockReturnValue({ token_scope: 'dgfy', dgfy_account_id: 'uuid' });
    findById.mockResolvedValue({ id: 'uuid', first_name: 'D', last_name: 'G', email: 'd@example.com', is_active: true, email_verified_at: new Date() });
    const valid = await run({ authorization: 'Bearer dgfy' });
    expect(valid.req.feedbackIdentity).toEqual(expect.objectContaining({ kind: 'dgfy_account', id: 'uuid', verified: true }));
    isTokenBlacklisted.mockResolvedValue(true);
    const revoked = await run({ authorization: 'Bearer dgfy' });
    expect(revoked.res.status).toHaveBeenCalledWith(401);
    isTokenBlacklisted.mockResolvedValue(false);
    findById.mockResolvedValue({ is_active: false });
    const inactive = await run({ authorization: 'Bearer dgfy' });
    expect(inactive.res.status).toHaveBeenCalledWith(401);
  });

  it('delegates staff auth and never treats a bad token as guest', async () => {
    authenticate.mockImplementation((req, _res, next) => { req.user = { user_id: 7, username: 'Staff', email: 's@example.com' }; next(); });
    const staff = await run({ authorization: 'Bearer staff' });
    expect(staff.req.feedbackIdentity).toEqual(expect.objectContaining({ kind: 'tenant_user', id: 7 }));
    authenticate.mockImplementation((_req, res) => res.status(401).json({ message: 'Invalid token' }));
    const bad = await run({ authorization: 'Bearer garbage' });
    expect(bad.res.status).toHaveBeenCalledWith(401);
    expect(bad.next).not.toHaveBeenCalled();
  });
});
