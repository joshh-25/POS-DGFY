import logger from '../config/logger.js';
import { mapDomainErrorToHttp } from '../modules/shared/contracts/domainErrorMapper.js';

export const shouldLogStackToConsole = () => {
  const configured = String(process.env.ERROR_LOG_STACKS || '').trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(configured)) return true;
  if (['0', 'false', 'no', 'off'].includes(configured)) return false;

  return process.env.NODE_ENV === 'development';
};

const mapUploadErrorToHttp = (err) => {
  const code = err?.code || null;
  if (code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: 413,
      payload: {
        message: 'Uploaded file is too large for this upload type.',
        code
      }
    };
  }

  if (code === 'LIMIT_FILE_COUNT') {
    return {
      statusCode: 400,
      payload: {
        message: 'Too many files were uploaded for this request.',
        code
      }
    };
  }

  if (code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      statusCode: 400,
      payload: {
        message: 'The uploaded file field is not accepted for this request.',
        code
      }
    };
  }

  return null;
};

export const errorHandler = (err, req, res, _next) => {
  void _next;
  const stackLoggingEnabled = shouldLogStackToConsole();
  const mappedUploadError = mapUploadErrorToHttp(err);
  const mappedDomainError = mappedUploadError ? null : mapDomainErrorToHttp(err);
  const statusCode = mappedUploadError?.statusCode || mappedDomainError?.statusCode || err.statusCode || 500;
  const message = mappedUploadError?.payload?.message || mappedDomainError?.payload?.message || err.message || 'Internal Server Error';
  const errors = mappedDomainError?.payload?.details || err.errors || null;
  const errorCode = mappedUploadError?.payload?.code || mappedDomainError?.payload?.code || err.code || null;
  const requestId = req.requestId || res.locals.requestId || null;
  const traceId = req.traceId || res.locals.traceId || requestId;
  res.locals.errorCode = errorCode;

  // Log error with Winston
  const logData = {
    message: err.message,
    stack: statusCode >= 500 && stackLoggingEnabled ? err.stack : undefined,
    statusCode,
    method: req.method,
    path: req.path,
    user_id: req.user?.user_id || null,
    ip: req.ip || req.connection.remoteAddress,
    request_id: requestId,
    trace_id: traceId,
    error_code: errorCode
  };

  const emitConsoleStack = statusCode >= 500 && stackLoggingEnabled;
  if (emitConsoleStack) {
    console.error('################# STACK TRACE START #################');
    console.error(err.stack);
    console.error('################# STACK TRACE END #################');
  }

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
      trace_id: traceId,
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
    trace_id: traceId,
    timestamp: new Date().toISOString()
  });
};
