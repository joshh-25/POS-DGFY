import { verifyToken, isTokenBlacklisted } from '../infra/tokenSession.js';
import { dgfyAccountRepository } from '../modules/dgfyAuth/index.js';

const sendDgfyAuthError = (res, status, message) => res.status(status).json({
    success: false,
    data: null,
    message
});

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization;
    return authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
};

// Mobile-only: bearer token via Authorization header. No cookie fallback —
// this service never sets or reads browser session cookies (see ADR 0026 and
// apps/dgfy-api/src/modules/dgfyAuth/controllers/dgfyAuthHandlers.js).
export const authenticateDgfyAccount = async (req, res, next) => {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return sendDgfyAuthError(res, 401, 'DGFY account authentication is required.');
        }

        const decoded = verifyToken(token);
        if (decoded?.token_scope !== 'dgfy' || !decoded?.dgfy_account_id) {
            return sendDgfyAuthError(res, 401, 'Invalid DGFY account token.');
        }

        if (await isTokenBlacklisted(token)) {
            return sendDgfyAuthError(res, 401, 'DGFY session has been revoked.');
        }

        const account = await dgfyAccountRepository.findById(decoded.dgfy_account_id);
        if (!account || !account.is_active || account.deleted_at) {
            return sendDgfyAuthError(res, 401, 'DGFY account is unavailable.');
        }

        req.dgfyAccount = account;
        return next();
    } catch (error) {
        return sendDgfyAuthError(res, error.statusCode || 401, error.message || 'Invalid DGFY account session.');
    }
};
