/**
 * Unit tests for the eviction-safety fix on TenantConnector (issue #474 follow-up).
 *
 * Bug: evictConnections()/cleanupIdleConnections() routed into closeConnection(),
 * which called `sequelize.close()` unconditionally -- with no check for whether a
 * request was still mid-query on that instance. Under the ~15-minute reconciler
 * sweep this produced real production errors:
 *   "ConnectionManager.getConnection was called after the connection manager was
 *   closed!" (Sentry DGFY-BACKEND-4).
 *
 * Fix: TenantConnector now reads sequelize-pool's own `pool.using` counter
 * (isBusy()) before closing a cached connection. A busy entry is never chosen
 * for eviction, and closeConnection() on a busy entry defers the actual close
 * until the connection goes idle (bounded by a short grace period), while
 * still removing it from the cache immediately so no new caller can be handed
 * a connection that's on its way out.
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

let tenantConnector;

beforeAll(async () => {
  const mod = await import('../src/utils/TenantConnector.js');
  tenantConnector = mod.default;
});

afterEach(() => {
  tenantConnector.connections.clear();
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
});
