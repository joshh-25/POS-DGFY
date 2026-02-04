import fs from 'fs';
import path from 'path';
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
      insufficientIngredients: err.insufficientIngredients.map(ing => ({
        item: ing.item_name,
        message: `Required: ${ing.required} ${ing.unit}, Available: ${ing.available} ${ing.unit}, Shortage: ${ing.shortage} ${ing.unit}`
      })),
      timestamp: new Date().toISOString()
    });
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors,
    timestamp: new Date().toISOString()
  });
};
