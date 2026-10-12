import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { getSmsProviderMode, resolveSmsAdapter } from '../src/modules/smsDelivery/adapters/index.js';

const original = { provider: process.env.SMS_PROVIDER, nodeEnv: process.env.NODE_ENV };
afterEach(() => {
  if (original.provider === undefined) delete process.env.SMS_PROVIDER; else process.env.SMS_PROVIDER = original.provider;
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
});

describe('SMS provider mode', () => {
  it('defaults unknown or missing providers to unconfigured', () => {
    delete process.env.SMS_PROVIDER;
    expect(getSmsProviderMode()).toBe('unconfigured');
    process.env.SMS_PROVIDER = 'future-provider';
    expect(getSmsProviderMode()).toBe('unconfigured');
  });

  it('selects fake explicitly outside production and blocks it in production', () => {
    process.env.SMS_PROVIDER = 'fake';
    process.env.NODE_ENV = 'test';
    expect(getSmsProviderMode()).toBe('fake');
    expect(resolveSmsAdapter().mode).toBe('fake');
    process.env.NODE_ENV = 'production';
    expect(getSmsProviderMode()).toBe('unconfigured');
    const blocked = jest.fn();
    expect(resolveSmsAdapter({ onProductionFakeBlocked: blocked }).mode).toBe('unconfigured');
    expect(blocked).toHaveBeenCalledTimes(1);
  });
});
