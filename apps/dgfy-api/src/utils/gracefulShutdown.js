const SHUTDOWN_TIMEOUT_MS = 10_000;

export const shutdownHttpServer = async ({ server, closeRedis, tenantConnector, logger, exit }) => {
  let shutdownEnded = false;

  const watchdog = setTimeout(() => {
    if (shutdownEnded) return;

    shutdownEnded = true;
    logger.error('Forced shutdown after timeout');
    exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  const failShutdown = (error) => {
    if (shutdownEnded) return;

    shutdownEnded = true;
    clearTimeout(watchdog);
    logger.error('Error during graceful shutdown:', error);
    exit(1);
  };

  try {
    await new Promise((resolve, reject) => {
      try {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
        server.closeIdleConnections?.();
      } catch (error) {
        reject(error);
      }
    });

    if (shutdownEnded) return;

    await closeRedis();
    if (shutdownEnded) return;

    try {
      await tenantConnector.closeAll();
      if (!shutdownEnded) {
        logger.info('All tenant database connections closed.');
      }
    } catch (error) {
      if (!shutdownEnded) {
        logger.error('Error closing tenant connections during shutdown:', error);
      }
    }

    if (shutdownEnded) return;

    clearTimeout(watchdog);
    logger.info('HTTP server closed.');
    shutdownEnded = true;
    exit(0);
  } catch (error) {
    failShutdown(error);
  }
};
