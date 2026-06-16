import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import { dgfyAccountRepository } from '../modules/dgfy/index.js';
import { getCookie, SESSION_COOKIE_NAMES } from '../utils/browserSessionCookies.js';
import { authenticate } from './auth.js';

const sendDgfyAuthError = (res, status, message) => res.status(status).json({
    success: false,
    data: null,
    message
});

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization;
    return authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
};

const getDgfyCookieToken = (req) => getCookie(req, SESSION_COOKIE_NAMES.dgfy);

const getDgfyToken = (req) => {
    return getBearerToken(req) || getDgfyCookieToken(req);
};

const attachDgfyAccountFromToken = async (req, token, decodedToken = null) => {
    const decoded = decodedToken || verifyToken(token);
    if (decoded?.token_scope !== 'dgfy' || !decoded?.dgfy_account_id) {
        const error = new Error('Invalid DGFY account token.');
        error.statusCode = 401;
        throw error;
    }

    if (await isTokenBlacklisted(token)) {
        const error = new Error('DGFY session has been revoked.');
        error.statusCode = 401;
        throw error;
    }

    const account = await dgfyAccountRepository.findById(decoded.dgfy_account_id);
    if (!account || !account.is_active || account.deleted_at) {
        const error = new Error('DGFY account is unavailable.');
        error.statusCode = 401;
        throw error;
    }

    req.dgfyAccount = account;
    req.dgfyAuthSource = 'dgfy_session';
    return account;
};

export const authenticateDgfyAccount = async (req, res, next) => {
    try {
        const token = getDgfyToken(req);
        if (!token) {
            return sendDgfyAuthError(res, 401, 'DGFY account authentication is required.');
        }
        await attachDgfyAccountFromToken(req, token);
        return next();
    } catch (error) {
        return sendDgfyAuthError(res, error.statusCode || 401, error.message || 'Invalid DGFY account session.');
    }
};

const authenticateThroughTenantMembership = (req, res, next) => {
    return authenticate(req, res, async (error) => {
        if (error) return next(error);

        try {
            const account = await dgfyAccountRepository.findByAcceptedTenantUserMembership({
                tenantId: req.tenant?.id || req.user?.tenant_id,
                tenantUserId: req.user?.user_id
            });

            if (!account) {
                return sendDgfyAuthError(
                    res,
                    401,
                    'This IMS user is not linked to a DGFY account membership. Sign in with DGFY or accept an invitation first.'
                );
            }

            req.dgfyAccount = account;
            req.dgfyAuthSource = 'tenant_membership';
            return next();
        } catch (lookupError) {
            return next(lookupError);
        }
    });
};

export const authenticateDgfyAccountOrTenantMembership = async (req, res, next) => {
    const bearerToken = getBearerToken(req);
    if (bearerToken) {
        try {
            const decoded = verifyToken(bearerToken);
            if (decoded?.token_scope === 'dgfy') {
                await attachDgfyAccountFromToken(req, bearerToken, decoded);
                return next();
            }
            return authenticateThroughTenantMembership(req, res, next);
        } catch (error) {
            return sendDgfyAuthError(res, error.statusCode || 401, error.message || 'Invalid DGFY account session.');
        }
    }

    if (getDgfyCookieToken(req)) {
        return authenticateDgfyAccount(req, res, next);
    }

    return authenticateThroughTenantMembership(req, res, next);
};
