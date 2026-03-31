import dbStore from '../utils/dbStore.js';
import { normalizeTenantIdentifier, verifyStoreToken } from '../modules/store/utils/storeJwtToken.js';

const timestamp = () => new Date().toISOString();

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

export const authenticateStoreCustomer = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return unauthorized(res, 'Store authentication required');
        }

        const token = authHeader.slice(7);
        let decoded;
        try {
            decoded = verifyStoreToken(token);
        } catch (error) {
            if (error?.name === 'TokenExpiredError') {
                return unauthorized(res, 'Store session expired');
            }
            return unauthorized(res, 'Invalid store token');
        }

        if (decoded?.type !== 'store_customer') {
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
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        await authenticateStoreCustomer(req, res, next);
    } catch (error) {
        next(error);
    }
};
