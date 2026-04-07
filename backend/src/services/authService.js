import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables before any validation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import * as cacheService from './cacheService.js';
import * as landlordService from './landlordService.js';
import logger from '../config/logger.js';


const TEST_JWT_SECRET_FALLBACK = 'test_jwt_secret_for_ci_only_32_chars!';
const TEST_REFRESH_SECRET_FALLBACK = 'test_refresh_secret_for_ci_only_32!';

// Validate required environment variables
if (process.env.NODE_ENV === 'test') {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = TEST_JWT_SECRET_FALLBACK;
  }
  if (!process.env.REFRESH_TOKEN_SECRET) {
    process.env.REFRESH_TOKEN_SECRET = TEST_REFRESH_SECRET_FALLBACK;
  }
}

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required but not set. Please configure your .env file.');
}
if (!process.env.REFRESH_TOKEN_SECRET) {
  throw new Error('FATAL: REFRESH_TOKEN_SECRET environment variable is required but not set. Please configure your .env file.');
}

// Validate secret strength (minimum length)
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for security.');
}
if (process.env.REFRESH_TOKEN_SECRET.length < 32) {
  throw new Error('FATAL: REFRESH_TOKEN_SECRET must be at least 32 characters long for security.');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

const getBlacklistFailureMode = () => {
  const configuredMode = (process.env.AUTH_BLACKLIST_FAILURE_MODE || '').trim().toLowerCase();

  if (configuredMode === 'fail_closed' || configuredMode === 'fail-closed') {
    return 'fail_closed';
  }

  if (configuredMode === 'fail_open' || configuredMode === 'fail-open') {
    return 'fail_open';
  }

  return process.env.NODE_ENV === 'production' ? 'fail_closed' : 'fail_open';
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

export const generateToken = (user) => {
  const payload = {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

export const generateRefreshToken = (user) => {
  const payload = {
    user_id: user.user_id,
    type: 'refresh',
    jti: randomUUID()
  };
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
};

export const registerUser = async (userData) => {
  const { username, email, password } = userData;
  // Always create new users as 'staff' - only admins can change roles via User Management
  const role = 'staff';

  // Check if user already exists
  const User = dbStore.get('User');
  const existingUser = await User.findOne({
    where: {
      [Op.or]: [{ email }, { username }]
    }
  });

  if (existingUser) {
    const error = new Error('User already exists with this email or username');
    error.statusCode = 409;
    throw error;
  }

  // Hash password
  const password_hash = await hashPassword(password);

  // Create user
  const user = await User.create({
    username,
    email,
    password_hash,
    role,
    is_active: true
  });

  // Add email-to-tenant mapping for future token-less login
  const store = dbStore.getStore();
  const tenantId = store?.tenantId;
  // Guard: Only map if we have a real tenant context (not 'default' fallback)
  if (tenantId && tenantId !== 'default') {
    try {
      await landlordService.addEmailTenantMapping(email, tenantId);
    } catch (mappingError) {
      // Log but don't fail registration if mapping fails
      console.warn('Failed to add email-tenant mapping:', mappingError.message);
    }
  }

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: user.permissions || [],
    is_master_admin: user.is_master_admin || false
  };
};

export const loginUser = async (email, password) => {
  // Find user by email
  const User = dbStore.get('User');
  const user = await User.findOne({ where: { email } });

  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  if (!user.is_active) {
    const error = new Error('User account is inactive');
    error.statusCode = 403;
    throw error;
  }

  // Check if user has been removed from company
  if (user.deleted_at) {
    const error = new Error('User account has been removed from this company');
    error.statusCode = 403;
    throw error;
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Generate tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Update last login
  await user.update({ last_login: new Date() });

  // Calculate expires in seconds
  const expiresIn = 24 * 60 * 60; // 24 hours in seconds

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: user.permissions || [],
    is_master_admin: user.is_master_admin || false,
    token,
    refreshToken,
    expiresIn
  };
};

export const refreshUserToken = async (refreshToken) => {
  try {
    // 1. Check if token is blacklisted (Reuse Detection)
    const isBlacklisted = await isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      // CRITICAL: Refresh token reuse detected!
      // In a real-world production system, we might want to invalidate ALL tokens
      // for this user "family" here. For now, we block the request.
      const error = new Error('Refresh token reused or revoked - security alert');
      error.statusCode = 401;
      throw error;
    }

    // 2. Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.type !== 'refresh') {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }

    // 3. Find user
    const User = dbStore.get('User');
    const user = await User.findByPk(decoded.user_id);

    if (!user || !user.is_active || user.deleted_at) {
      const error = new Error('User not found or inactive');
      error.statusCode = 401;
      throw error;
    }

    // 4. Generate NEW access token and NEW refresh token
    const token = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);
    const expiresIn = 24 * 60 * 60; // 24 hours in seconds

    // 5. Blacklist the OLD refresh token immediately
    await blacklistToken(refreshToken);

    return {
      token,
      refreshToken: newRefreshToken,
      expiresIn
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      const authError = new Error('Invalid or expired refresh token');
      authError.statusCode = 401;
      throw authError;
    }
    throw error;
  }
};

/**
 * Blacklist a token (add to Redis blacklist)
 * @param {string} token - JWT token to blacklist
 * @returns {Promise<boolean>} - True if successful
 */
export const blacklistToken = async (token) => {
  try {
    // Decode token to get expiration time (without verification)
    const decoded = jwt.decode(token); if (!decoded || !decoded.exp) {
      return false;
    }    // Calculate TTL: time until token expires
    const currentTime = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - currentTime;    // Only blacklist if token hasn't expired yet
    if (ttl > 0) {
      const blacklistKey = `blacklist:token:${token}`;
      await cacheService.set(blacklistKey, 'true', ttl);
      return true;
    } return false;
  } catch (error) {
    // If Redis is unavailable, log warning but don't throw
    // Token will still be invalidated client-side
    console.warn('Failed to blacklist token (Redis unavailable):', error.message);
    return false;
  }
};/**
 * Check if a token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>} - True if blacklisted
 */
export const isTokenBlacklisted = async (token) => {
  const failureMode = getBlacklistFailureMode();

  if (!process.env.REDIS_URL) {
    logger.warn('Skipping token blacklist check: REDIS_URL not configured');
    return false; // Fail Open if Redis is not configured (Dev/Test)
  }

  if (!cacheService.isAvailable()) {
    if (failureMode === 'fail_closed') {
      logger.error('CRITICAL: Redis unavailable for token blacklist check. Denying access (Fail Closed).');
      const error = new Error('Service unavailable: Validation check failed');
      error.statusCode = 503;
      throw error;
    }

    logger.warn('Redis unavailable for token blacklist check. Allowing request (Fail Open mode).');
    return false;
  }

  try {
    const blacklistKey = `blacklist:token:${token}`;
    // Use getCritical to enforce fail-closed when configured.
    const result = await cacheService.getCritical(blacklistKey);
    return result === 'true';
  } catch {
    if (failureMode === 'fail_closed') {
      logger.error('CRITICAL: Token blacklist check failed during Redis read. Denying access (Fail Closed).');
      const serviceError = new Error('Service unavailable: Validation check failed');
      serviceError.statusCode = 503;
      throw serviceError;
    }

    logger.warn('Token blacklist Redis read failed. Allowing request (Fail Open mode).');
    return false;
  }
};
