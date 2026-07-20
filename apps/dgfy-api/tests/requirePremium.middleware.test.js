import { jest } from '@jest/globals';

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

const loadRequirePremium = async ({ paymentsEnabledFlag }) => {
  jest.resetModules();

  jest.unstable_mockModule('../src/services/authService.js', () => ({
    verifyToken: jest.fn(),
    isTokenBlacklisted: jest.fn()
  }));

  jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
      get: jest.fn()
    }
  }));

  jest.unstable_mockModule('../src/config/paymentsFeature.js', () => ({
    paymentsEnabled: paymentsEnabledFlag
  }));

  const authModule = await import('../src/middleware/auth.js');
  return authModule.requirePremium;
};

describe('requirePremium middleware', () => {
  it('allows premium tenant even with inactive subscription when payments are disabled', async () => {
    const requirePremium = await loadRequirePremium({ paymentsEnabledFlag: false });
    const req = {
      tenant: {
        plan: 'premium',
        subscription_status: 'inactive'
      }
    };
    const res = createRes();
    const next = jest.fn();

    requirePremium(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks premium tenant with inactive subscription when payments are enabled', async () => {
    const requirePremium = await loadRequirePremium({ paymentsEnabledFlag: true });
    const req = {
      tenant: {
        plan: 'premium',
        subscription_status: 'inactive',
        grace_period_end: null
      }
    };
    const res = createRes();
    const next = jest.fn();

    requirePremium(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Your Premium subscription has expired.',
      requiresRenewal: true
    }));
  });

  it('allows premium tenant with active subscription when payments are enabled', async () => {
    const requirePremium = await loadRequirePremium({ paymentsEnabledFlag: true });
    const req = {
      tenant: {
        plan: 'premium',
        subscription_status: 'active',
        grace_period_end: null
      }
    };
    const res = createRes();
    const next = jest.fn();

    requirePremium(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks non-premium plans regardless of payment mode', async () => {
    const requirePremium = await loadRequirePremium({ paymentsEnabledFlag: false });
    const req = {
      tenant: {
        plan: 'standard',
        subscription_status: 'active'
      }
    };
    const res = createRes();
    const next = jest.fn();

    requirePremium(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'This feature requires a Premium subscription.',
      requiresUpgrade: true
    }));
  });
});

