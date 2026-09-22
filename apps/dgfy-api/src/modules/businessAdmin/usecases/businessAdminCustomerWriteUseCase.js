import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const normalizeText = (value) => String(value ?? '').trim();

const publicCustomer = (customer) => ({
    customer_id: customer.customer_id == null ? null : Number(customer.customer_id),
    name: customer.name,
    email: customer.email,
    phone: customer.phone || null,
    is_active: customer.is_active !== false,
    created_at: customer.created_at || null,
    account_status: 'invite_required'
});

export const buildCreateBusinessAdminCustomerUseCase = ({ businessAdminCustomerRepository }) => async ({ body = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });

    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const phone = normalizeText(body.phone) || null;

    if (!name || name.length > 255) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'Customer name is required and must not exceed 255 characters.', 422, { reason_code: 'BUSINESS_ADMIN_CUSTOMER_NAME_INVALID' });
    }
    if (!email || email.length > 255 || !EMAIL_PATTERN.test(email)) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'A valid customer email is required.', 422, { reason_code: 'BUSINESS_ADMIN_CUSTOMER_EMAIL_INVALID' });
    }
    if (phone && phone.length > 50) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'Customer phone must not exceed 50 characters.', 422, { reason_code: 'BUSINESS_ADMIN_CUSTOMER_PHONE_INVALID' });
    }

    try {
        const existing = await businessAdminCustomerRepository.findCustomerByEmail(email);
        if (existing) {
            return fail(DomainErrorCode.CONFLICT, 'A customer with this email already exists.', 409, { reason_code: 'BUSINESS_ADMIN_CUSTOMER_EMAIL_EXISTS' });
        }

        const created = await businessAdminCustomerRepository.createCustomer({ name, email, phone });
        return {
            success: true,
            data: {
                customer: publicCustomer(created),
                message: 'Customer profile created. A storefront password has not been issued.'
            }
        };
    } catch (error) {
        const databaseCode = error?.original?.code || error?.parent?.code || error?.code;
        if (databaseCode === 'ER_DUP_ENTRY') {
            return fail(DomainErrorCode.CONFLICT, 'A customer with this email already exists.', 409, { reason_code: 'BUSINESS_ADMIN_CUSTOMER_EMAIL_EXISTS' });
        }
        return {
            success: false,
            error: new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to create the customer profile.', { statusCode: 500, cause: error })
        };
    }
};
