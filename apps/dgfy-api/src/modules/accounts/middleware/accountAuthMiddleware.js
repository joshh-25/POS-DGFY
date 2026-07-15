import jwt from 'jsonwebtoken';

// Bearer-token auth middleware for the accounts module's own session scope
// ('dgfy_account_session' — see usecases/accountUseCases.js's
// generateAccountSessionToken), distinct from apps/dgfy-api/src/middleware/
// dgfyAuth.js's 'dgfy' scope so the two modules' sessions can never be
// confused (dgfyAuth is the out-of-scope legacy-proxying module).

const ACCOUNT_SESSION_TOKEN_SCOPE = 'dgfy_account_session';

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization;
    return authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
};

const sendAuthError = (res, status, message) => res.status(status).json({
    success: false,
    data: null,
    error: { code: 'AUTHENTICATION_FAILED', message },
    message
});

/**
 * Resolves an opaque 'admin' role for the self-or-admin access control
 * required by GET /accounts/:id (D-04, threat T-04-06). `dgfy_core.accounts`
 * has no role column — Phase 4's roles/role_permissions tables are
 * tenant-scoped business roles (04-03-PLAN.md), not a landlord-level
 * platform-admin concept, and 04-CONTEXT.md explicitly leaves "admin
 * account lookup" strategy open for the planner/executor to decide. Until a
 * real platform-admin model exists, admin status is resolved from an
 * env-driven allowlist rather than invented schema.
 * @param {{email?: string}} account
 */
const resolveRole = (account) => {
    const adminEmails = String(process.env.ACCOUNT_ADMIN_EMAILS || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    const email = String(account?.email || '').toLowerCase();
    return adminEmails.includes(email) ? 'admin' : null;
};

/**
 * Dependency-injected factory (Dependency Inversion): receives the accounts
 * module's getAccount use case rather than importing a repository or model
 * directly, so it can be wired against any accounts module instance
 * (production singleton, or a test's isolated-database instance).
 * @param {{getAccount: Function}} deps
 */
export function buildAccountAuthMiddleware({ getAccount }) {
    if (typeof getAccount !== 'function') {
        throw new Error('buildAccountAuthMiddleware requires a getAccount use case.');
    }

    return async function authenticateAccount(req, res, next) {
        try {
            const token = getBearerToken(req);
            if (!token) {
                return sendAuthError(res, 401, 'Account authentication is required.');
            }

            let decoded;
            try {
                // WR-05: pin the allowed algorithm explicitly (defense in
                // depth) rather than relying on jwt.verify()'s default
                // inference from the token header.
                decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
            } catch (error) {
                return sendAuthError(res, 401, 'Invalid or expired session token.');
            }

            if (decoded?.token_scope !== ACCOUNT_SESSION_TOKEN_SCOPE || !decoded?.account_id) {
                return sendAuthError(res, 401, 'Invalid account session token.');
            }

            const result = await getAccount({ accountId: decoded.account_id });
            if (!result.isSuccess) {
                return sendAuthError(res, 401, 'Account is unavailable.');
            }

            const account = result.data.account;
            if (account.status && account.status !== 'active') {
                return sendAuthError(res, 401, 'Account is unavailable.');
            }

            req.account = { ...account, role: resolveRole(account) };
            return next();
        } catch (error) {
            return sendAuthError(res, 401, 'Invalid account session.');
        }
    };
}

export default buildAccountAuthMiddleware;
