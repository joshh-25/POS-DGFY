import logger from '../config/logger.js';

/**
 * Request logging middleware using Winston
 * Logs all HTTP requests with method, path, status, response time, and user info
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Skip health check endpoint to reduce log noise
  if (req.path === '/health') {
    return next();
  }

  // Log request start
  logger.http('Incoming Request', {
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    user_id: req.user?.user_id || null,
  });

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      user_id: req.user?.user_id || null,
    };

    // Use appropriate log level based on status code
    if (res.statusCode >= 500) {
      logger.error('Request Error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request Warning', logData);
    } else {
      logger.http('Request Completed', logData);
    }
  });

  next();
};

export default requestLogger;

