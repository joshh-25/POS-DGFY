import jwt from 'jsonwebtoken';
import { getRedisClient } from '../config/redis.js';

// Mirrors backend/src/services/authService.js's verifyToken/blacklistToken/
// isTokenBlacklisted so a DGFY token issued by one service is honored (and
// can be blacklisted) by the other — same JWT_SECRET, same Redis instance,
// same "blacklist:token:<token>" key, no tenant-scoped key prefix (DGFY
// tokens are never tenant-scoped). See packages/dgfy-auth-core/README.md.
export const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

export const blacklistToken = async (token) => {
    const client = getRedisClient();
    if (!client) return false;

    try {
        const decoded = jwt.decode(token);
        if (!decoded?.exp) return false;
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl <= 0) return false;
        await client.set(`blacklist:token:${token}`, 'true', { EX: ttl });
        return true;
    } catch (error) {
        return false;
    }
};

export const isTokenBlacklisted = async (token) => {
    const client = getRedisClient();
    if (!client) return false; // fail-open, matching backend's default (unconfigured Redis) behavior

    try {
        const result = await client.get(`blacklist:token:${token}`);
        return result === 'true';
    } catch (error) {
        return false;
    }
};
