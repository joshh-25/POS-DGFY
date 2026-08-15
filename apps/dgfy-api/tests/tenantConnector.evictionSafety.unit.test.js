/**
 * Unit tests for the eviction-safety fix on TenantConnector (issue #474 follow-up)
 * and the close-race fix from its own follow-up, issue #526.
 *
 * Bug (#474/#524): evictConnections()/cleanupIdleConnections() routed into
 * closeConnection(), which called `sequelize.close()` unconditionally -- with no
 * check for whether a request was still mid-query on that instance. Under the
 * ~15-minute reconciler sweep this produced real production errors:
 *   "ConnectionManager.getConnection was called after the connection manager was
 *   closed!" (Sentry DGFY-BACKEND-4).
 *
 * Fix: TenantConnector reads sequelize-pool's own `pool.using` counter (isBusy())
 * before closing a cached connection. A busy entry is never chosen for eviction,
 * and closeConnection() on a busy entry defers the actual close until the
 * connection goes idle (bounded by a short grace period), while still removing
 * it from the cache immediately so no new caller can be handed a connection
 * that's on its way out.
 *
 * Bug (#526, RF-1): that grace-period wait removed the tenant from the cache but
 * never marked it pending, so a concurrent getConnection() call for the *same*
 * tenant during the wait found neither a cached nor a pending entry and minted a
 * second Sequelize pool instead of waiting -- exactly the connection pressure
 * #524 was filed over. Fix: the grace-period wait now claims the tenant's
 * pendingConnections slot, routing a concurrent getConnection() into its
 * existing "wait for pending" branch instead.
 *
 * Bug (#529 review, RF-1): the first cut of that fix released the pending slot
 * right after the grace-period wait exited, but *before* the physical
 * `sequelize.close()` call resolved -- reopening the same race for the
 * duration of the close itself. pr-reviewer reproduced it concretely with a
 * real-timer probe (a second live pool minted while the first was still
 * mid-close). Fix: the pending slot is now held through the whole close --
 * grace-period wait and the physical `sequelize.close()` call both -- and
 * only released in a `finally` once close() has settled.
 *
 * Test inventory
 * ──────────────
 * A  isBusy() reads pool.using; a missing/unintrospectable pool counts as busy
 * B  evictConnections() never closes a busy entry -- picks the next idle LRU one
 * C  evictConnections() closes nothing (and doesn't throw) when everything is busy
 * D  closeConnection() on an idle entry closes immediately (unchanged happy path)
 * E  closeConnection() on a busy entry removes it from the cache up front, then
 *    defers the close until the connection goes idle
 * F  closeConnection() force-closes a still-busy entry once the grace period
 *    fully elapses, and logs a warning
 * G  closeConnection() marks the tenant pending through the full close --
 *    grace-period wait AND the physical sequelize.close() call -- so a
 *    concurrent getConnection() call for the same tenant waits the whole
 *    time instead of minting a duplicate pool during either window
 * H  closeConnection() never leaves a stale pendingConnections entry behind,
 *    on either the idle-immediate or busy-deferred path
 * I  closeConnection() does not clear a pending slot it didn't itself claim
 */

import { jest } from '@jest/globals';

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: loggerMock
}));

// getConnection() constructs `new Sequelize(...)` directly -- only test G
// (the concurrent-getConnection race) needs this; a real DB connection would
// otherwise be required. The mock instance starts idle (pool.using: 0) and
// exposes authenticate()/sync()/close() so getConnection()'s own flow
// (authenticate -> wrap sync -> cache) runs unmodified.
const MockSequelize = jest.fn(function mockSequelizeConstructor(dbName) {
  this.dbName = dbName;
  this.connectionManager = { pool: { using: 0 } };
  this.authenticate = jest.fn().mockResolvedValue(undefined);
  this.sync = jest.fn().mockResolvedValue(undefined);
  this.close = jest.fn().mockResolvedValue(undefined);
});

jest.unstable_mockModule('sequelize', () => ({
  Sequelize: MockSequelize
}));

let tenantConnector;

beforeAll(async () => {
  const mod = await import('../src/utils/TenantConnector.js');
  tenantConnector = mod.default;
});

afterEach(() => {
  tenantConnector.connections.clear();
  tenantConnector.pendingConnections.clear();
  jest.clearAllMocks();
  jest.useRealTimers();
});

// Builds a fake Sequelize instance shaped just enough for isBusy()/close() --
// no real DB connection, no real sequelize-pool.
const makeFakeSequelize = ({ using = 0, poolUnavailable = false } = {}) => {
  const state = { using };
  const sequelize = {
    close: jest.fn().mockResolvedValue(undefined)
  };
  if (!poolUnavailable) {
    sequelize.connectionManager = {
      pool: {
        get using() {
          return state.using;
        }
      }
    };
  }
  return { sequelize, state };
};

const seedEntry = (tenantId, { sequelize, lastUsed = Date.now(), tenantName = `tenant-${tenantId}` }) => {
  tenantConnector.connections.set(tenantId, { sequelize, lastUsed, tenantName });
};

describe('TenantConnector — eviction safety (issue #474 follow-up)', () => {
  test('A: isBusy() reads pool.using and treats a missing pool as busy', () => {
    const { sequelize: busySeq } = makeFakeSequelize({ using: 2 });
    const { sequelize: idleSeq } = makeFakeSequelize({ using: 0 });
    const { sequelize: noPoolSeq } = makeFakeSequelize({ poolUnavailable: true });

    expect(tenantConnector.isBusy(busySeq)).toBe(true);
    expect(tenantConnector.isBusy(idleSeq)).toBe(false);
    expect(tenantConnector.isBusy(noPoolSeq)).toBe(true);
  });

  test('B: evictConnections() never closes a busy entry -- skips it for the next idle LRU candidate', async () => {
    const busy = makeFakeSequelize({ using: 1 });
    const idleOld = makeFakeSequelize({ using: 0 });
    const idleNewer = makeFakeSequelize({ using: 0 });

    seedEntry('busy-tenant', { sequelize: busy.sequelize, lastUsed: 1000 });
    seedEntry('idle-old', { sequelize: idleOld.sequelize, lastUsed: 2000 });
    seedEntry('idle-newer', { sequelize: idleNewer.sequelize, lastUsed: 3000 });

    await tenantConnector.evictConnections(1);

    expect(busy.sequelize.close).not.toHaveBeenCalled();
    expect(idleOld.sequelize.close).toHaveBeenCalledTimes(1);
    expect(idleNewer.sequelize.close).not.toHaveBeenCalled();
    expect(tenantConnector.connections.has('busy-tenant')).toBe(true);
    expect(tenantConnector.connections.has('idle-old')).toBe(false);
  });

  test('C: evictConnections() closes nothing and does not throw when every cached entry is busy', async () => {
    const busyA = makeFakeSequelize({ using: 1 });
    const busyB = makeFakeSequelize({ using: 3 });

    seedEntry('a', { sequelize: busyA.sequelize, lastUsed: 1000 });
    seedEntry('b', { sequelize: busyB.sequelize, lastUsed: 2000 });

    await expect(tenantConnector.evictConnections(2)).resolves.toBeUndefined();

    expect(busyA.sequelize.close).not.toHaveBeenCalled();
    expect(busyB.sequelize.close).not.toHaveBeenCalled();
    expect(tenantConnector.connections.size).toBe(2);
  });

  test('D: closeConnection() on an idle entry closes immediately (unchanged happy path)', async () => {
    const idle = makeFakeSequelize({ using: 0 });
    seedEntry('idle-tenant', { sequelize: idle.sequelize });

    await tenantConnector.closeConnection('idle-tenant');

    expect(idle.sequelize.close).toHaveBeenCalledTimes(1);
    expect(tenantConnector.connections.has('idle-tenant')).toBe(false);
  });

  test('E: closeConnection() on a busy entry removes it from the cache immediately, defers the close until idle', async () => {
    jest.useFakeTimers();
    const busy = makeFakeSequelize({ using: 1 });
    seedEntry('busy-tenant', { sequelize: busy.sequelize });

    const closePromise = tenantConnector.closeConnection('busy-tenant');

    // Removed from the cache synchronously -- no new getConnection() caller
    // can be handed this instance while it's on its way out.
    expect(tenantConnector.connections.has('busy-tenant')).toBe(false);

    // Still busy: poll ticks pass without close() being called.
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);
    expect(busy.sequelize.close).not.toHaveBeenCalled();

    // The in-flight query finishes -- the next poll tick sees it idle and closes.
    busy.state.using = 0;
    await jest.advanceTimersByTimeAsync(100);
    await closePromise;

    expect(busy.sequelize.close).toHaveBeenCalledTimes(1);
  });

  test('F: closeConnection() force-closes a busy entry once the grace period fully elapses', async () => {
    jest.useFakeTimers();
    const stillBusy = makeFakeSequelize({ using: 1 });
    seedEntry('stuck-tenant', { sequelize: stillBusy.sequelize });

    const closePromise = tenantConnector.closeConnection('stuck-tenant');
    await jest.advanceTimersByTimeAsync(3100); // past the grace period; never freed
    await closePromise;

    expect(stillBusy.sequelize.close).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('still busy after'));
  });

  test('G: closeConnection() marks the tenant pending through the full close -- grace-period wait AND the physical sequelize.close() call -- so a concurrent getConnection() call waits the whole time instead of minting a duplicate pool', async () => {
    jest.useFakeTimers();
    const oldConn = makeFakeSequelize({ using: 1 });
    // Hold sequelize.close() open under manual control so the test can
    // observe the gap between "grace-period wait exits" and "close actually
    // resolves" -- the exact window pr-reviewer reproduced a live race in on
    // an earlier version of this fix (a second pool minted while the first
    // was still mid-close, because the pending slot was released too early).
    let resolveClose;
    oldConn.sequelize.close = jest.fn(() => new Promise((resolve) => { resolveClose = resolve; }));
    seedEntry('race-tenant', { sequelize: oldConn.sequelize, tenantName: 'Race Tenant' });

    const closePromise = tenantConnector.closeConnection('race-tenant');

    // The fix under test: pending is claimed for the duration of the wait.
    expect(tenantConnector.pendingConnections.has('race-tenant')).toBe(true);

    let resolvedInstance = null;
    const getConnectionPromise = tenantConnector
      .getConnection({ id: 'race-tenant', name: 'Race Tenant', db_name: 'sku_tenant_race' })
      .then((instance) => { resolvedInstance = instance; });

    // Still busy: the concurrent getConnection() call must not have minted a
    // new pool yet -- it should be blocked on the pending-wait branch.
    await jest.advanceTimersByTimeAsync(100);
    expect(resolvedInstance).toBeNull();
    expect(MockSequelize).not.toHaveBeenCalled();

    // The old connection goes idle -- closeConnection's grace loop exits and
    // calls sequelize.close(), which is still being held open by the test.
    oldConn.state.using = 0;
    await jest.advanceTimersByTimeAsync(100);

    // Grace-period wait is over, but the physical close() hasn't resolved
    // yet -- this is the regression window: the pending slot must still be
    // held here, or a concurrent getConnection() falls through and mints a
    // second live pool while the first is still closing.
    expect(tenantConnector.pendingConnections.has('race-tenant')).toBe(true);
    expect(resolvedInstance).toBeNull();
    expect(MockSequelize).not.toHaveBeenCalled();

    // Now let the physical close settle.
    resolveClose();
    await closePromise;
    expect(oldConn.sequelize.close).toHaveBeenCalledTimes(1);
    expect(tenantConnector.pendingConnections.has('race-tenant')).toBe(false);

    // Only now does the waiting getConnection() call proceed and create a
    // single fresh instance for the tenant -- not a duplicate of the old one.
    await jest.advanceTimersByTimeAsync(100);
    await getConnectionPromise;
    expect(MockSequelize).toHaveBeenCalledTimes(1);
    expect(resolvedInstance).not.toBeNull();
    expect(resolvedInstance).not.toBe(oldConn.sequelize);
  });

  test('H: closeConnection() never leaves a stale pendingConnections entry behind', async () => {
    const idle = makeFakeSequelize({ using: 0 });
    seedEntry('idle-tenant', { sequelize: idle.sequelize });
    await tenantConnector.closeConnection('idle-tenant');
    expect(tenantConnector.pendingConnections.has('idle-tenant')).toBe(false);

    jest.useFakeTimers();
    const busy = makeFakeSequelize({ using: 1 });
    seedEntry('busy-tenant', { sequelize: busy.sequelize });
    const closePromise = tenantConnector.closeConnection('busy-tenant');
    await jest.advanceTimersByTimeAsync(3100); // grace period expires, never freed
    await closePromise;
    expect(tenantConnector.pendingConnections.has('busy-tenant')).toBe(false);
  });

  test('I: closeConnection() does not clear a pending slot it did not itself claim', async () => {
    jest.useFakeTimers();
    const busy = makeFakeSequelize({ using: 1 });
    seedEntry('shared-tenant', { sequelize: busy.sequelize });

    // Simulate the slot already being held by something else (e.g. a
    // concurrent getConnection() creation) before closeConnection runs.
    tenantConnector.pendingConnections.add('shared-tenant');

    const closePromise = tenantConnector.closeConnection('shared-tenant');
    busy.state.using = 0;
    await jest.advanceTimersByTimeAsync(100);
    await closePromise;

    // closeConnection must not have deleted a pending flag it never added.
    expect(tenantConnector.pendingConnections.has('shared-tenant')).toBe(true);
  });
});
