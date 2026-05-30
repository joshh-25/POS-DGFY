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
import { onboardingRepository } from '../modules/onboarding/repositories/onboardingRepository.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import { getTokenBlacklistFailureMode } from '../config/hostingProfile.js';
import { verifyEmailOtp, EMAIL_OTP_PURPOSES } from './emailOtpService.js';


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

const normalizePermissionArray = (rawPermissions) => {
  let normalized = rawPermissions;

  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = [];
    }
  }

  if (!Array.isArray(normalized)) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
};

const resolveEffectivePermissionsForUser = (user) => {
  const normalizedRole = String(user?.role || 'staff').trim().toLowerCase();
  const parsedPermissions = normalizePermissionArray(user?.permissions);
  if (parsedPermissions.length > 0) {
    return parsedPermissions;
  }

  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  return Array.isArray(roleDefaults) ? [...roleDefaults] : [];
};

const resolveTenantIdForToken = (user, explicitTenantId = null) => {
  const normalizedExplicit = String(explicitTenantId || '').trim();
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const normalizedUserTenant = String(user?.tenant_id || '').trim();
  if (normalizedUserTenant) {
    return normalizedUserTenant;
  }

  const normalizedStoreTenant = String(dbStore.getStore()?.tenantId || '').trim();
  if (normalizedStoreTenant && normalizedStoreTenant !== 'default') {
    return normalizedStoreTenant;
  }

  return null;
};

const requireTenantAuthContext = ({ operation = 'authentication' } = {}) => {
  const store = dbStore.getStore() || {};
  const tenantId = store?.tenantId;

  if (tenantId && tenantId !== 'default') {
    return store;
  }

  const contextFailure = String(store?.tenantContextFailure || '').trim().toLowerCase();
  const resolvedTenantStatus = String(store?.resolvedTenantStatus || '').trim().toLowerCase();

  const error = new Error('Company token is required for authentication.');
  error.statusCode = 400;
  error.details = {
    operation,
    tenant_context_failure: contextFailure || 'missing_tenant_context',
    resolved_tenant_status: resolvedTenantStatus || null
  };

  if (contextFailure === 'invalid_token') {
    error.statusCode = 404;
    error.message = 'Invalid company token.';
    throw error;
  }

  if (contextFailure === 'db_unavailable' && resolvedTenantStatus === 'pending') {
    error.statusCode = 403;
    error.message = 'Tenant is pending approval and is not yet provisioned for login/registration.';
    throw error;
  }

  if (contextFailure === 'db_unavailable' && resolvedTenantStatus === 'rejected') {
    error.statusCode = 403;
    error.message = 'Tenant registration has been rejected. Please re-submit registration for review.';
    throw error;
  }

  if (contextFailure === 'db_unavailable' && resolvedTenantStatus === 'inactive') {
    error.statusCode = 403;
    error.message = 'Tenant account is inactive. Contact support or request reactivation.';
    throw error;
  }

  if (contextFailure === 'db_unavailable') {
    error.statusCode = 503;
    error.message = 'Tenant database is unavailable. Please try again later.';
    throw error;
  }

  throw error;
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

export const generateToken = (user, options = {}) => {
  const resolvedTenantId = resolveTenantIdForToken(user, options?.tenantId);
  const payload = {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {})
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

export const generateRefreshToken = (user, options = {}) => {
  const resolvedTenantId = resolveTenantIdForToken(user, options?.tenantId);
  const payload = {
    user_id: user.user_id,
    type: 'refresh',
    jti: randomUUID(),
    ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {})
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
  await requireTenantAuthContext({ operation: 'auth.register' });
  const { username, email, password, phone_number: phoneNumber, email_otp_code: emailOtpCode } = userData;
  // Always create new users as 'staff' - only admins can change roles via User Management
  const role = 'staff';
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];

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

  const store = dbStore.getStore();
  const tenantId = store?.tenantId;
  const normalizedOtpCode = String(emailOtpCode || '').trim();
  if (process.env.NODE_ENV !== 'test' || normalizedOtpCode) {
    await verifyEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.TENANT_USER_REGISTRATION,
      email,
      code: emailOtpCode,
      tenantId
    });
  }

  // Hash password
  const password_hash = await hashPassword(password);

  // Create user
  const user = await User.create({
    username,
    email,
    phone_number: String(phoneNumber || '').trim(),
    password_hash,
    role,
    permissions: defaultPermissions,
    is_active: true
  });

  // Add email-to-tenant mapping for future token-less login
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
    phone_number: user.phone_number || null,
    role: user.role,
    permissions: resolveEffectivePermissionsForUser(user),
    is_master_admin: user.is_master_admin || false
  };
};

export const loginUser = async (email, password) => {
  const tenantStore = await requireTenantAuthContext({ operation: 'auth.login' });
  const tenantId = String(tenantStore?.tenantId || '').trim();
  if (!tenantId || tenantId === 'default') {
    const error = new Error('Tenant context is required to issue login tokens.');
    error.statusCode = 400;
    throw error;
  }
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
  const token = generateToken(user, { tenantId });
  const refreshToken = generateRefreshToken(user, { tenantId });

  // Update last login
  await user.update({ last_login: new Date() });

  // Calculate expires in seconds
  const expiresIn = 24 * 60 * 60; // 24 hours in seconds
  let onboarding = null;
  if (user.is_master_admin === true) {
    try {
      onboarding = await onboardingRepository.getStatus({
        storeNameBaseline: dbStore.getStore()?.tenantName || ''
      });
    } catch (error) {
      logger.warn('[AuthService] Failed to load onboarding status during login bootstrap', {
        user_id: user.user_id || null,
        tenant_id: dbStore.getStore()?.tenantId || null,
        error: error.message
      });
      onboarding = null;
    }
  }

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    phone_number: user.phone_number || null,
    role: user.role,
    permissions: resolveEffectivePermissionsForUser(user),
    is_master_admin: user.is_master_admin || false,
    onboarding,
    token,
    refreshToken,
    expiresIn
  };
};

export const refreshUserToken = async (refreshToken) => {
  try {
    const tenantStore = await requireTenantAuthContext({ operation: 'auth.refresh_token' });
    const tenantId = String(tenantStore?.tenantId || '').trim();
    if (!tenantId || tenantId === 'default') {
      const contextError = new Error('Tenant context is required to refresh tokens.');
      contextError.statusCode = 400;
      throw contextError;
    }
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

    const tokenTenantId = String(decoded?.tenant_id || '').trim();
    if (!tokenTenantId) {
      const error = new Error('Invalid refresh token tenant binding');
      error.statusCode = 401;
      throw error;
    }

    if (tokenTenantId !== tenantId) {
      const error = new Error('Refresh token tenant mismatch');
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
    const token = generateToken(user, { tenantId });
    const newRefreshToken = generateRefreshToken(user, { tenantId });
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
  const failureMode = getTokenBlacklistFailureMode();

  if (!process.env.REDIS_URL) {
    if (failureMode === 'fail_closed') {
      logger.error('CRITICAL: REDIS_URL is not configured for token blacklist check. Denying access (Fail Closed).');
      const error = new Error('Service unavailable: Validation check failed');
      error.statusCode = 503;
      throw error;
    }

    logger.warn('Skipping token blacklist check: REDIS_URL not configured (Fail Open mode)');
    return false;
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
