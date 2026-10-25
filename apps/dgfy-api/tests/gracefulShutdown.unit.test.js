import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { shutdownHttpServer } from '../src/utils/gracefulShutdown.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const createDependencies = ({ server, closeRedis = jest.fn(), closeAll = jest.fn() } = {}) => ({
  server: server || { close: jest.fn((callback) => callback()) },
  closeRedis,
  tenantConnector: { closeAll },
  logger: { info: jest.fn(), error: jest.fn() },
  exit: jest.fn()
});

describe('shutdownHttpServer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('drains HTTP before closing Redis and tenant connections, then exits after both', async () => {
    const order = [];
    const redisCleanup = deferred();
    const tenantCleanup = deferred();
    let closeCallback;
    const server = {
      close: jest.fn((callback) => {
        order.push('http');
        closeCallback = callback;
      }),
      closeIdleConnections: jest.fn(() => order.push('idle'))
    };
    const dependencies = createDependencies({
      server,
      closeRedis: jest.fn(() => {
        order.push('redis');
        return redisCleanup.promise;
      }),
      closeAll: jest.fn(() => {
        order.push('tenant');
        return tenantCleanup.promise;
      })
    });

    const shutdown = shutdownHttpServer(dependencies);

    expect(order).toEqual(['http', 'idle']);
    expect(dependencies.closeRedis).not.toHaveBeenCalled();
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();
    expect(dependencies.exit).not.toHaveBeenCalled();

    closeCallback();
    await Promise.resolve();

    expect(order).toEqual(['http', 'idle', 'redis']);
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();

    redisCleanup.resolve();
    await Promise.resolve();

    expect(order).toEqual(['http', 'idle', 'redis', 'tenant']);
    expect(dependencies.exit).not.toHaveBeenCalled();

    tenantCleanup.resolve();
    await shutdown;

    expect(dependencies.logger.info).toHaveBeenNthCalledWith(1, 'All tenant database connections closed.');
    expect(dependencies.logger.info).toHaveBeenNthCalledWith(2, 'HTTP server closed.');
    expect(dependencies.exit).toHaveBeenCalledTimes(1);
    expect(dependencies.exit).toHaveBeenCalledWith(0);
    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(10_000);
    expect(dependencies.exit).toHaveBeenCalledTimes(1);
  });

  test('supports servers without closeIdleConnections', async () => {
    const dependencies = createDependencies({
      server: { close: jest.fn((callback) => callback()) }
    });

    await shutdownHttpServer(dependencies);

    expect(dependencies.closeRedis).toHaveBeenCalledTimes(1);
    expect(dependencies.tenantConnector.closeAll).toHaveBeenCalledTimes(1);
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  test('forces exit 1 after a stalled HTTP drain without closing request dependencies', async () => {
    let closeCallback;
    const server = {
      close: jest.fn((callback) => {
        closeCallback = callback;
      }),
      closeIdleConnections: jest.fn()
    };
    const dependencies = createDependencies({ server });
    const shutdown = shutdownHttpServer(dependencies);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(dependencies.logger.error).toHaveBeenCalledWith('Forced shutdown after timeout');
    expect(dependencies.exit).toHaveBeenCalledWith(1);
    expect(dependencies.closeRedis).not.toHaveBeenCalled();
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();

    closeCallback();
    await shutdown;
    expect(dependencies.exit).toHaveBeenCalledTimes(1);
  });

  test('keeps the watchdog active while Redis cleanup is stalled', async () => {
    const redisCleanup = deferred();
    const dependencies = createDependencies({
      closeRedis: jest.fn(() => redisCleanup.promise)
    });
    const shutdown = shutdownHttpServer(dependencies);

    await Promise.resolve();
    expect(dependencies.closeRedis).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(dependencies.exit).toHaveBeenCalledWith(1);
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();

    redisCleanup.resolve();
    await shutdown;
    expect(dependencies.exit).toHaveBeenCalledTimes(1);
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();
  });

  test('keeps the watchdog active while tenant cleanup is stalled', async () => {
    const tenantCleanup = deferred();
    const dependencies = createDependencies({
      closeAll: jest.fn(() => tenantCleanup.promise)
    });
    const shutdown = shutdownHttpServer(dependencies);

    await Promise.resolve();
    await Promise.resolve();
    expect(dependencies.tenantConnector.closeAll).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(dependencies.exit).toHaveBeenCalledWith(1);

    tenantCleanup.resolve();
    await shutdown;
    expect(dependencies.exit).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.info).not.toHaveBeenCalledWith('HTTP server closed.');
  });

  test('logs a tenant cleanup rejection and continues to successful shutdown', async () => {
    const error = new Error('tenant cleanup failed');
    const dependencies = createDependencies({
      closeAll: jest.fn().mockRejectedValue(error)
    });

    await shutdownHttpServer(dependencies);

    expect(dependencies.logger.error).toHaveBeenCalledWith(
      'Error closing tenant connections during shutdown:',
      error
    );
    expect(dependencies.logger.info).toHaveBeenCalledWith('HTTP server closed.');
    expect(dependencies.exit).toHaveBeenCalledWith(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['throws', 'callback error'])('logs and exits 1 when HTTP close %s', async (failureMode) => {
    const error = new Error('HTTP close failed');
    let closeCallback;
    const server = {
      close: jest.fn((callback) => {
        if (failureMode === 'throws') throw error;
        closeCallback = callback;
      }),
      closeIdleConnections: jest.fn()
    };
    const dependencies = createDependencies({ server });
    const shutdown = shutdownHttpServer(dependencies);

    if (failureMode === 'callback error') closeCallback(error);
    await shutdown;

    expect(dependencies.logger.error).toHaveBeenCalledWith('Error during graceful shutdown:', error);
    expect(dependencies.closeRedis).not.toHaveBeenCalled();
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();
    expect(dependencies.exit).toHaveBeenCalledWith(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('logs and exits 1 when Redis cleanup rejects', async () => {
    const error = new Error('Redis cleanup failed');
    const dependencies = createDependencies({
      closeRedis: jest.fn().mockRejectedValue(error)
    });

    await shutdownHttpServer(dependencies);

    expect(dependencies.logger.error).toHaveBeenCalledWith('Error during graceful shutdown:', error);
    expect(dependencies.tenantConnector.closeAll).not.toHaveBeenCalled();
    expect(dependencies.logger.info).not.toHaveBeenCalledWith('HTTP server closed.');
    expect(dependencies.exit).toHaveBeenCalledWith(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
