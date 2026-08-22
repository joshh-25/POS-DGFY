import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getAdminAccounts } from '../src/config/adminAuthConfig.js';

describe('admin auth credential configuration', () => {
  const keys = [
    'NODE_ENV',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD_HASH',
    'ADMIN_ACCOUNTS_JSON',
    'ADMIN_FINANCIAL_ROLE'
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    keys.forEach((key) => delete process.env[key]);
  });

  afterEach(() => {
    keys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  });

  it('keeps the bootstrap account available outside production', () => {
    process.env.NODE_ENV = 'test';

    expect(getAdminAccounts()[0].username).toBe('skupervisor');
  });

  it('fails closed in production when explicit credentials are missing', () => {
    process.env.NODE_ENV = 'production';

    expect(() => getAdminAccounts()).toThrow(
      'Production requires ADMIN_USERNAME and ADMIN_PASSWORD_HASH or ADMIN_ACCOUNTS_JSON'
    );
  });

  it('fails closed in production when the documented default hash is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_USERNAME = 'platform-admin';
    process.env.ADMIN_PASSWORD_HASH = '$2a$12$8cIJyb0nC8.ZyZbmXRb5FO3R8T.n5V4s2EbMiA.mCCi.l/47tmKzK';

    expect(() => getAdminAccounts()).toThrow('must not use the documented default password hash');
  });

  it('accepts an explicit production roster with non-default bcrypt hashes', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_ACCOUNTS_JSON = JSON.stringify([
      {
        username: 'platform-admin',
        password_hash: `$2b$12$${'a'.repeat(53)}`,
        financial_role: 'platform_admin'
      }
    ]);

    expect(getAdminAccounts()).toEqual([
      {
        username: 'platform-admin',
        passwordHash: `$2b$12$${'a'.repeat(53)}`,
        financialRole: 'platform_admin'
      }
    ]);
  });
});
