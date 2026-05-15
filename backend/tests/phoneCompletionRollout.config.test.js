import { jest } from '@jest/globals';

const loadConfig = async () => {
  jest.resetModules();
  return import('../src/config/phoneCompletionRollout.js');
};

describe('phone completion rollout config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to observe mode outside tests', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PHONE_COMPLETION_ENFORCEMENT_MODE;

    const { getPhoneCompletionEnforcementMode } = await loadConfig();
    expect(getPhoneCompletionEnforcementMode()).toBe('observe');
  });

  it('uses strict enforcement by default in tests', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.PHONE_COMPLETION_ENFORCEMENT_MODE;

    const { getPhoneCompletionEnforcementMode } = await loadConfig();
    expect(getPhoneCompletionEnforcementMode()).toBe('all');
  });

  it('enforces only allowlisted tenants in tenant_allowlist mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PHONE_COMPLETION_ENFORCEMENT_MODE = 'tenant_allowlist';
    process.env.PHONE_COMPLETION_ENFORCED_TENANTS = 'tenant-1, token-2 ';

    const { isPhoneCompletionEnforcedForTenant } = await loadConfig();
    expect(isPhoneCompletionEnforcedForTenant({ id: 'tenant-1' })).toBe(true);
    expect(isPhoneCompletionEnforcedForTenant({ company_token: 'token-2' })).toBe(true);
    expect(isPhoneCompletionEnforcedForTenant({ id: 'tenant-3', company_token: 'token-3' })).toBe(false);
  });
});
