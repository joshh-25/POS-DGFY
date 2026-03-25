import logger from '../config/logger.js';
import { mapDomainErrorToHttp } from '../modules/shared/contracts/domainErrorMapper.js';

export const errorHandler = (err, req, res, _next) => {
  void _next;
  const mappedDomainError = mapDomainErrorToHttp(err);
  const statusCode = mappedDomainError?.statusCode || err.statusCode || 500;
  const message = mappedDomainError?.payload?.message || err.message || 'Internal Server Error';
  const errors = mappedDomainError?.payload?.details || err.errors || null;
  const errorCode = mappedDomainError?.payload?.code || err.code || null;
  const requestId = req.requestId || res.locals.requestId || null;

  // Log error with Winston
  const logData = {
    message: err.message,
    stack: err.stack,
    statusCode,
    method: req.method,
    path: req.path,
    user_id: req.user?.user_id || null,
    ip: req.ip || req.connection.remoteAddress,
    request_id: requestId,
    error_code: errorCode
  };

  // FORCE LOG STACK TRACE TO CONSOLE
  console.error('################# STACK TRACE START #################');
  console.error(err.stack);
  console.error('################# STACK TRACE END #################');

  // Use appropriate log level based on status code
  if (statusCode >= 500) {
    logger.error('Server Error', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client Error', logData);
  } else {
    logger.info('Error Handled', logData);
  }



  // Handle insufficient stock errors with detailed information
  if (err.insufficientIngredients) {
    return res.status(statusCode).json({
      success: false,
      data: null,
      message,
      error_code: errorCode,
      insufficientIngredients: err.insufficientIngredients.map(ing => ({
        item: ing.item_name,
        message: `Required: ${ing.required} ${ing.unit}, Available: ${ing.available} ${ing.unit}, Shortage: ${ing.shortage} ${ing.unit}`
      })),
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error_code: errorCode,
    errors,
    request_id: requestId,
    timestamp: new Date().toISOString()
  });
};
