import { describe, expect, it } from 'vitest';
import productionAutoLoginGuard, { getProductionAutoLoginViolations } from './productionAutoLoginGuard.js';

describe('production auto-login build guard', () => {
  it('allows an empty production environment', () => {
    expect(getProductionAutoLoginViolations({})).toEqual([]);
  });

  it('detects enabled flags and any configured auto-login credential', () => {
    expect(getProductionAutoLoginViolations({
      VITE_POS_DEV_AUTO_LOGIN: 'true',
      VITE_DEV_AUTO_LOGIN_PASSWORD: 'build-only-test-secret'
    })).toEqual([
      'VITE_POS_DEV_AUTO_LOGIN',
      'VITE_DEV_AUTO_LOGIN_PASSWORD'
    ]);
  });

  it('fails only for production builds', () => {
    const plugin = productionAutoLoginGuard();
    const context = { error: (message) => { throw new Error(message); } };

    expect(() => plugin.configResolved.call(context, {
      command: 'serve',
      env: { VITE_POS_DEV_PASSWORD: 'build-only-test-secret' }
    })).not.toThrow();

    expect(() => plugin.configResolved.call(context, {
      command: 'build',
      env: { VITE_POS_DEV_PASSWORD: 'build-only-test-secret' }
    })).toThrow(/VITE_POS_DEV_PASSWORD/);
  });
});
