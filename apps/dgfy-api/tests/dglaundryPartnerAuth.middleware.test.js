import { jest } from '@jest/globals';

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
});
