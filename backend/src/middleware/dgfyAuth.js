import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import { dgfyAccountRepository } from '../modules/dgfy/index.js';
import { getCookie, SESSION_COOKIE_NAMES } from '../utils/browserSessionCookies.js';

export const authenticateDgfyAccount = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : getCookie(req, SESSION_COOKIE_NAMES.dgfy);
        if (!token) {
            return res.status(401).json({
                success: false,
                data: null,
                message: 'DGFY account authentication is required.'
            });
        }

        if (await isTokenBlacklisted(token)) {
            return res.status(401).json({
                success: false,
                data: null,
                message: 'DGFY session has been revoked.'
            });
        }

        const decoded = verifyToken(token);
        if (decoded?.token_scope !== 'dgfy' || !decoded?.dgfy_account_id) {
            return res.status(401).json({
                success: false,
                data: null,
                message: 'Invalid DGFY account token.'
            });
        }

        const account = await dgfyAccountRepository.findById(decoded.dgfy_account_id);
        if (!account || !account.is_active) {
            return res.status(401).json({
                success: false,
                data: null,
                message: 'DGFY account is unavailable.'
            });
        }

        req.dgfyAccount = account;
        return next();
    } catch {
        return res.status(401).json({
            success: false,
            data: null,
            message: 'Invalid DGFY account session.'
        });
    }
};
