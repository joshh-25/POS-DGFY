import { describe, expect, it } from 'vitest';
import { buildOfflinePosScopeKey, isOfflinePosScopeReady, normalizeOfflinePosScope, toOfflinePosScopeFields } from '../services/offlinePosScope.js';
import { getManualPosSyncPolicy } from '../services/manualPosSyncPolicyStore.js';

// Regression for a production crash: SkupervisorPOSCheckoutTerminal.jsx's
// `offlineSnapshotScope` prop defaulted to `null` (PosPageShell.jsx never
// supplies one), and `getManualPosSyncPolicy(null)` was called synchronously
// in a `useState` initializer - before any effect could run. `scope = {}`
// default parameters only cover `undefined`, not `null`, so `scope.tenantId`
// threw `Cannot read properties of null (reading 'tenantId')` on every /pos
// render. These lock in that `null` (not just `undefined`/an empty object)
// is handled everywhere this scope flows.
describe('offline POS scope helpers tolerate a null scope', () => {
  it('normalizeOfflinePosScope treats null the same as an empty scope', () => {
    expect(normalizeOfflinePosScope(null)).toEqual({
      tenantId: '',
      terminalId: '',
      locationId: '',
      userId: ''
    });
  });

  it('isOfflinePosScopeReady reports not-ready for a null scope instead of throwing', () => {
    expect(isOfflinePosScopeReady(null)).toBe(false);
  });

  it('buildOfflinePosScopeKey returns an empty key for a null scope instead of throwing', () => {
    expect(buildOfflinePosScopeKey(null)).toBe('');
  });

  it('toOfflinePosScopeFields returns all-null fields for a null scope instead of throwing', () => {
    expect(toOfflinePosScopeFields(null)).toEqual({
      tenant_id: null,
      terminal_id: null,
      location_id: null,
      user_id: null,
      scope_key: null
    });
  });

  it('getManualPosSyncPolicy(null) - the exact call that crashed - returns a not-ready policy instead of throwing', () => {
    const policy = getManualPosSyncPolicy(null);
    expect(policy.scopeReady).toBe(false);
    expect(policy.remaining).toBe(0);
  });

  it('still normalizes a real scope correctly (unchanged behavior)', () => {
    expect(normalizeOfflinePosScope({
      tenantId: 'tenant-1',
      terminalId: 'counter-01',
      locationId: 'loc-1',
      userId: 'user-1'
    })).toEqual({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      locationId: 'loc-1',
      userId: 'user-1'
    });
  });
});
