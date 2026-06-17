import dbStore from '../utils/dbStore.js';
import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import { normalizeTenantIdentifier, verifyStoreToken } from '../modules/store/utils/storeJwtToken.js';
import { dgfyAccountRepository } from '../modules/dgfy/index.js';
import logger from '../config/logger.js';
import { getCookie, SESSION_COOKIE_NAMES } from '../utils/browserSessionCookies.js';

const timestamp = () => new Date().toISOString();
const DGFY_LINKED_STORE_PASSWORD_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoO.WIVbt6rp2ZYkRIzxqVqvla0ZCqXa.G';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isMissingDgfyAccountColumnError = (error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    const message = String(error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || '');
    return code === 'ER_BAD_FIELD_ERROR' && message.includes('dgfy_account_id');
};

const unauthorized = (res, message) => res.status(401).json({
    success: false,
    data: null,
    message,
    timestamp: timestamp()
});

const forbidden = (res, message) => res.status(403).json({
    success: false,
    data: null,
    message,
    timestamp: timestamp()
});

const conflict = (res, message, errorCode = 'STORE_CUSTOMER_LINK_REQUIRED') => res.status(409).json({
    success: false,
    data: null,
    message,
    error_code: errorCode,
    timestamp: timestamp()
});

class StoreCustomerLinkRequiredError extends Error {
    constructor(message = 'Store customer account requires explicit DGFY linking before this session can manage it.') {
        super(message);
        this.name = 'StoreCustomerLinkRequiredError';
    }
}

const resolveOrCreateCustomerForDgfyAccount = async (account) => {
    const StoreCustomer = dbStore.get('StoreCustomer');
    const email = String(account?.email || '').trim().toLowerCase();
    if (!email) return null;

    let customer = null;
    try {
        customer = await StoreCustomer.findOne({ where: { dgfy_account_id: account.id } });
    } catch (error) {
        if (!isMissingDgfyAccountColumnError(error)) throw error;
        logger.warn('[StoreAuth] store_customers.dgfy_account_id is unavailable; DGFY storefront auth failed closed', {
            dgfy_account_id: account.id,
            email_hash: email ? `len:${email.length}` : 'missing'
        });
        throw new StoreCustomerLinkRequiredError('DGFY storefront customer linking is not available for this tenant schema.');
    }

    if (!customer) {
        const sameEmailCustomer = await StoreCustomer.findOne({ where: { email } });
        if (sameEmailCustomer) {
            throw new StoreCustomerLinkRequiredError();
        }
    }

    const payload = {
        dgfy_account_id: account.id,
        email,
        password_hash: DGFY_LINKED_STORE_PASSWORD_HASH,
        name: `${account.first_name || ''} ${account.middle_name || ''} ${account.last_name || ''}`.trim() || account.username || email,
        phone: account.phone || null,
        is_active: true,
        last_login: new Date()
    };

    if (customer) {
        if (customer.is_active === false) return customer;
        const updatePayload = {
            name: payload.name,
            phone: payload.phone,
            last_login: payload.last_login,
            dgfy_account_id: account.id
        };
        try {
            await customer.update(updatePayload);
        } catch (error) {
            if (!isMissingDgfyAccountColumnError(error)) throw error;
            throw new StoreCustomerLinkRequiredError('DGFY storefront customer linking is not available for this tenant schema.');
        }
        return customer.reload();
    }

    try {
        customer = await StoreCustomer.create(payload);
    } catch (error) {
        if (!isMissingDgfyAccountColumnError(error)) throw error;
        throw new StoreCustomerLinkRequiredError('DGFY storefront customer linking is not available for this tenant schema.');
    }
    return customer;
};

const tryAuthenticateDgfyStoreCustomer = async (token, req, res, next) => {
    if (await isTokenBlacklisted(token)) {
        return unauthorized(res, 'DGFY session has been revoked');
    }

    let decoded;
    try {
        decoded = verifyToken(token);
    } catch {
        return null;
    }

    if (decoded?.token_scope !== 'dgfy' || !decoded?.dgfy_account_id) {
        return null;
    }

    const account = await dgfyAccountRepository.findById(decoded.dgfy_account_id);
    if (!account || account.is_active === false) {
        return unauthorized(res, 'DGFY account is unavailable');
    }

    let customer;
    try {
        customer = await resolveOrCreateCustomerForDgfyAccount(account);
    } catch (error) {
        if (error instanceof StoreCustomerLinkRequiredError) {
            return conflict(res, error.message);
        }
        throw error;
    }
    if (!customer) {
        return unauthorized(res, 'DGFY account cannot be linked to this storefront');
    }
    if (customer.is_active === false) {
        return forbidden(res, 'Store customer account is inactive');
    }

    req.storeCustomer = {
        customer_id: customer.customer_id,
        dgfy_account_id: account.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        is_active: customer.is_active,
        auth_source: 'dgfy'
    };

    return next();
};

export const authenticateStoreCustomer = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ')
            ? authHeader.slice(7)
            : '';
        const storefrontCookieToken = getCookie(req, SESSION_COOKIE_NAMES.storefront);
        const dgfyCookieToken = getCookie(req, SESSION_COOKIE_NAMES.dgfy);
        const token = bearerToken || storefrontCookieToken || dgfyCookieToken;
        if (!token) {
            return unauthorized(res, 'Store authentication required');
        }

        let decoded;
        try {
            decoded = verifyStoreToken(token);
        } catch (error) {
            const dgfyResult = await tryAuthenticateDgfyStoreCustomer(token, req, res, next);
            if (dgfyResult !== null) {
                return dgfyResult;
            }
            if (error?.name === 'TokenExpiredError') {
                return unauthorized(res, 'Store session expired');
            }
            return unauthorized(res, 'Invalid store token');
        }

        if (decoded?.type !== 'store_customer') {
            const dgfyResult = await tryAuthenticateDgfyStoreCustomer(token, req, res, next);
            if (dgfyResult !== null) {
                return dgfyResult;
            }
            return unauthorized(res, 'Invalid store token type');
        }

        const tenantId = normalizeTenantIdentifier(req.tenant?.id);
        const tokenTenantId = normalizeTenantIdentifier(decoded?.tenant_id);
        if (!tenantId || !tokenTenantId || tenantId !== tokenTenantId) {
            return forbidden(res, 'Store token is not valid for this tenant context');
        }

        const customerId = parsePositiveInt(decoded?.customer_id);
        if (!customerId) {
            return unauthorized(res, 'Invalid store token payload');
        }

        const StoreCustomer = dbStore.get('StoreCustomer');
        const customer = await StoreCustomer.findByPk(customerId);
        if (!customer) {
            return unauthorized(res, 'Store customer account not found');
        }
        if (customer.is_active === false) {
            return forbidden(res, 'Store customer account is inactive');
        }

        req.storeCustomer = {
            customer_id: customer.customer_id,
            email: customer.email,
            name: customer.name,
            phone: customer.phone,
            is_active: customer.is_active
        };

        return next();
    } catch (error) {
        return next(error);
    }
};

export const optionalStoreCustomer = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = getCookie(req, SESSION_COOKIE_NAMES.storefront);
        const dgfyCookieToken = getCookie(req, SESSION_COOKIE_NAMES.dgfy);
        if ((!authHeader || !authHeader.startsWith('Bearer ')) && !cookieToken && !dgfyCookieToken) {
            return next();
        }

        await authenticateStoreCustomer(req, res, next);
    } catch (error) {
        next(error);
    }
};
