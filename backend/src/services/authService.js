import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables before any validation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '../models/User.js';
import * as cacheService from './cacheService.js';

// Validate required environment variables
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
    type: 'refresh'
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
    is_active: true // Keep is_active for User model as it's still BOOLEAN in User.js
  });

  // Generate tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Update last login
  await user.update({ last_login: new Date() });

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    token,
    refreshToken
  };
};

export const loginUser = async (email, password) => {
  console.log(`[AuthDebug] Attempting login for: ${email}`); // DEBUG LOG
  // Find user by email
  const user = await User.findOne({ where: { email } });

  if (!user) {
    console.log(`[AuthDebug] User not found: ${email}`); // DEBUG LOG
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Check if user is active
  if (!user.is_active) {
    console.log(`[AuthDebug] User inactive: ${email}`); // DEBUG LOG
    const error = new Error('User account is inactive');
    error.statusCode = 403;
    throw error;
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    console.log(`[AuthDebug] Password invalid for: ${email}`); // DEBUG LOG
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
    token,
    refreshToken,
    expiresIn
  };
};

export const refreshUserToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.type !== 'refresh') {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }

    // Find user
    const user = await User.findByPk(decoded.user_id);

    if (!user || !user.is_active) {
      const error = new Error('User not found or inactive');
      error.statusCode = 401;
      throw error;
    }

    // Generate new access token
    const token = generateToken(user);
    const expiresIn = 24 * 60 * 60; // 24 hours in seconds

    return {
      token,
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
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.exp) {
      return false;
    }    // Calculate TTL: time until token expires
    const currentTime = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - currentTime;

    // Only blacklist if token hasn't expired yet
    if (ttl > 0) {
      const blacklistKey = `blacklist:token:${token}`;
      await cacheService.set(blacklistKey, 'true', ttl);
      return true;
    }

    return false;
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
  try {
    const blacklistKey = `blacklist:token:${token}`;
    const result = await cacheService.get(blacklistKey);
    return result === 'true';
  } catch (error) {
    // If Redis is unavailable, assume token is not blacklisted
    // Better to allow access than block legitimate users
    return false;
  }
};