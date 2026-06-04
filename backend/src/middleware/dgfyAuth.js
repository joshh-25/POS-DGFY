import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import { dgfyAccountRepository } from '../modules/dgfy/index.js';

export const authenticateDgfyAccount = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                data: null,
                message: 'DGFY account authentication is required.'
            });
        }

        const token = authHeader.substring(7);
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
