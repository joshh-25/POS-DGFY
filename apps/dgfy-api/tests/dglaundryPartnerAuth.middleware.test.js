import { afterEach, describe, expect, it, jest } from '@jest/globals';

const loadMiddleware = async () => {
  jest.resetModules();
  const validateDglaundryMachineToken = jest.fn();
  jest.unstable_mockModule('../src/modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js', () => ({
    validateDglaundryMachineToken
  }));
  const module = await import('../src/modules/dgfyLaundry/middleware/dglaundryPartnerAuth.js');
  return { requireDglaundryPartner: module.requireDglaundryPartner, validateDglaundryMachineToken };
};

describe('DGLaundry partner authentication middleware', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('propagates machine-token validation failures to Express error handling', async () => {
    process.env.NODE_ENV = 'production';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    const failure = new Error('redis unavailable');
    validateDglaundryMachineToken.mockRejectedValue(failure);
    const req = { headers: { authorization: 'Bearer machine-token' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects production requests without a machine bearer even when the legacy secret matches', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_TOKEN = 'legacy-test-secret';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    const req = { headers: { 'x-dglaundry-partner-token': 'legacy-test-secret' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(validateDglaundryMachineToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'DGLAUNDRY_MACHINE_AUTHENTICATION_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts only the registered machine client, inbound scope, and application ID', async () => {
    process.env.NODE_ENV = 'test';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue({ client_id: 'dglaundry-machine', scope: 'dglaundry' });
    const req = { headers: { authorization: 'Bearer machine-token', 'x-dgfy-app-id': 'dglaundry' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.partnerIdentity).toBe('dglaundry-machine');
    expect(req.partnerScope).toBe('dglaundry');
  });

  it.each([
    ['unexpected client identity', { client_id: 'another-client', scope: 'dglaundry' }, 'dglaundry'],
    ['unexpected scope', { client_id: 'dglaundry-machine', scope: 'dglaundry:orders:read' }, 'dglaundry'],
    ['unexpected app identity', { client_id: 'dglaundry-machine', scope: 'dglaundry' }, 'another-app']
  ])('rejects a machine grant with %s', async (_name, grant, appId) => {
    process.env.NODE_ENV = 'test';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue(grant);
    const req = { headers: { authorization: 'Bearer machine-token', 'x-dgfy-app-id': appId } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
