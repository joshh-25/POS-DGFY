
import { sanitizeSensitiveLogPath } from '../services/observabilityUtils.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Route ${sanitizeSensitiveLogPath(req.originalUrl)} not found`,
    timestamp: new Date().toISOString()
  });
};
