// Load environment variables FIRST - before any other imports
// This ensures JWT_SECRET and other env vars are available when authService.js loads
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the backend directory (parent of src)
dotenv.config({ path: join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { testConnection } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import logger from './config/logger.js';
import { generalLimiter, authLimiter } from './middleware/rateLimiter.js';
import { initializeRedis, closeRedis, isRedisConnected } from './config/redis.js';
import './models/index.js'; // Initialize model associations

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - required when running behind nginx/apache reverse proxy
// This allows Express to correctly read X-Forwarded-For headers
app.set('trust proxy', true);

// CORS configuration - must be applied before helmet
const corsOptions = {
  // Allow requests from localhost and any network IP on port 5173 (development)
  // For production, set CORS_ORIGIN env var to a comma-separated list of allowed origins
  origin: process.env.CORS_ORIGIN ? (origin, callback) => {
    const allowed = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
    if (allowed.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  } : (origin, callback) => {
    // In development, allow localhost and any IP on port 5173
    if (!origin ||
      origin.startsWith('http://localhost:5173') ||
      origin.startsWith('http://127.0.0.1:5173') ||
      /^http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:5173$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Security middleware - applied after CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware - use Winston stream for Morgan
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream: logger.stream }));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Rate limiting - apply general limiter to all routes
app.use('/api', generalLimiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  const startTime = process.uptime();
  const health = {
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(startTime)}s`,
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        status: 'unknown',
        message: 'Checking...'
      },
      redis: {
        status: 'unknown',
        message: 'Checking...',
        available: false
      }
    }
  };

  // Check database connection
  try {
    const dbConnected = await testConnection();
    health.services.database = {
      status: dbConnected ? 'connected' : 'disconnected',
      message: dbConnected ? 'Database connection healthy' : 'Database connection failed'
    };
    if (!dbConnected) {
      health.success = false;
    }
  } catch (error) {
    health.services.database = {
      status: 'error',
      message: error.message
    };
    health.success = false;
  }

  // Check Redis connection
  try {
    const redisConnected = isRedisConnected();
    health.services.redis = {
      status: redisConnected ? 'connected' : 'disconnected',
      message: redisConnected ? 'Redis connection healthy' : 'Redis not available (optional)',
      available: redisConnected
    };
    // Redis is optional, so don't mark health as failed if it's not connected
  } catch (error) {
    health.services.redis = {
      status: 'error',
      message: error.message,
      available: false
    };
  }

  const statusCode = health.success ? 200 : 503;
  res.status(statusCode).json(health);
});

// API routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import itemRoutes from './routes/items.js';
import supplierRoutes from './routes/suppliers.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import jobOrderRoutes from './routes/jobOrders.js';
import stockMovementRoutes from './routes/stockMovements.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import forecastRoutes from './routes/forecast.js';
import alertRoutes from './routes/alerts.js';
import settingsRoutes from './routes/settings.js';
import receiveTokenRoutes from './routes/receiveTokens.js';

// Apply stricter rate limiter to auth routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/job-orders', jobOrderRoutes);
app.use('/api/v1/stock-movements', stockMovementRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/forecast', forecastRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/receive-tokens', receiveTokenRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Initialize Redis (non-blocking - server will start even if Redis fails)
    if (process.env.REDIS_URL) {
      initializeRedis().catch((error) => {
        logger.warn('Redis initialization failed, continuing without cache:', error.message);
      });
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 API Base URL: http://localhost:${PORT}/api/v1`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Close Redis connection
      await closeRedis();

      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled Promise Rejection:', err);
      gracefulShutdown('unhandledRejection');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      gracefulShutdown('uncaughtException');
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;

