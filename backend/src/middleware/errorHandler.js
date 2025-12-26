import logger from '../config/logger.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const errors = err.errors || null;

  // Log error with Winston
  const logData = {
    message: err.message,
    stack: err.stack,
    statusCode,
    method: req.method,
    path: req.path,
    user_id: req.user?.user_id || null,
    ip: req.ip || req.connection.remoteAddress,
  };

  // Use appropriate log level based on status code
  if (statusCode >= 500) {
    logger.error('Server Error', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client Error', logData);
  } else {
    logger.info('Error Handled', logData);
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors,
    timestamp: new Date().toISOString()
  });
};

