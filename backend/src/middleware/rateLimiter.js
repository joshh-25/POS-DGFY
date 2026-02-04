import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';

// Get rate limit configuration from environment variables
// In development, use more lenient limits to account for React StrictMode double renders
const isDevelopment = process.env.NODE_ENV === 'development';
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (isDevelopment ? 1000 : 100); // 1000 in dev, 100 in prod
const authWindowMs = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const authMaxRequests = parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS) || (isDevelopment ? 50 : 5); // 50 in dev, 5 in prod

// Standard error response format
const createRateLimitError = (message) => ({
  success: false,
  data: null,
  message,
  timestamp: new Date().toISOString(),
});

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: createRateLimitError('Too many requests from this IP, please try again later.'),
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Disable validation warnings when running behind reverse proxy
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip || req.connection.remoteAddress,
      path: req.path,
      method: req.method,
    });
    res.status(429).json(createRateLimitError('Too many requests from this IP, please try again later.'));
  },
  skip: (req) => {
    // Skip rate limiting for health check endpoint
    if (req.path === '/health') return true;
    // Skip in test environment
    if (process.env.NODE_ENV === 'test') return true;
    // Skip rate limiting entirely in development if explicitly disabled
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = (req, res, next) => next();
// export const authLimiter = rateLimit({
//   windowMs: authWindowMs,
//   max: authMaxRequests,
//   message: createRateLimitError('Too many authentication attempts, please try again later.'),
//   standardHeaders: true,
//   legacyHeaders: false,
//   // Disable validation warnings when running behind reverse proxy
//   validate: { trustProxy: false, xForwardedForHeader: false },
//   handler: (req, res) => {
//     logger.warn('Auth rate limit exceeded', {
//       ip: req.ip || req.connection.remoteAddress,
//       path: req.path,
//       method: req.method,
//     });
//     res.status(429).json(createRateLimitError('Too many authentication attempts, please try again later.'));
//   },
//   skip: (req) => {
//     if (process.env.NODE_ENV === 'test') return true;
//     return false;
//   },
// });

export default {
  general: generalLimiter,
  auth: authLimiter,
};

