import jwt from 'jsonwebtoken';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../../../utils/phoneNumber.js';

const JWT_EXPIRY = process.env.DGFY_JWT_EXPIRY || process.env.JWT_EXPIRY || '24h';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildFullName = (account) => normalizeName(`${account?.first_name || ''} ${account?.last_name || ''}`);

export const sanitizeDgfyAccount = (account) => {
    if (!account) return null;
    return {
        id: account.id,
        first_name: account.first_name,
        last_name: account.last_name,
        username: account.username,
        email: account.email,
        phone: account.phone,
        is_active: account.is_active,
        last_login_at: account.last_login_at || null
    };
};

export const generateDgfyToken = (account) => jwt.sign({
    token_scope: 'dgfy',
    dgfy_account_id: account.id,
    email: account.email,
    username: account.username
}, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });

export const buildRegisterDgfyAccountUseCase = ({
    repository,
    hashPassword
}) => async ({ body }) => {
    const firstName = normalizeName(body?.first_name || body?.firstName);
    const lastName = normalizeName(body?.last_name || body?.lastName);
    const email = normalizeEmail(body?.email);
    const phone = normalizePhoneNumber(body?.phone);
    const password = String(body?.password || '');
    const confirmPassword = String(body?.confirm_password || body?.confirmPassword || '');

    if (!firstName || !lastName || !email || !phone || !password) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'First name, last name, email, phone, and password are required.',
            { statusCode: 400 }
        ));
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid email address.', { statusCode: 400 }));
    }

    if (!isValidPhoneNumber(phone)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Phone must be a valid phone number.', { statusCode: 400 }));
    }

    if (password.length < 8) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Password must be at least 8 characters.', { statusCode: 400 }));
    }

    if (confirmPassword && password !== confirmPassword) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Passwords do not match.', { statusCode: 400 }));
    }

    const existingByEmail = await repository.findByEmail(email);
    if (existingByEmail) {
        return fail(new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this email.', { statusCode: 409 }));
    }

    const existingByPhone = await repository.findByPhone(phone);
    if (existingByPhone) {
        return fail(new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this phone number.', { statusCode: 409 }));
    }

    const account = await repository.create({
        first_name: firstName,
        last_name: lastName,
        username: firstName,
        email,
        phone,
        password_hash: await hashPassword(password)
    });

    const token = generateDgfyToken(account);
    return ok({
        statusCode: 201,
        payload: {
            success: true,
            data: {
                account: sanitizeDgfyAccount(account),
                token,
                expiresIn: 24 * 60 * 60
            }
        }
    });
};

export const buildLoginDgfyAccountUseCase = ({
    repository,
    comparePassword
}) => async ({ body }) => {
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    if (!email || !password) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Email and password are required.', { statusCode: 400 }));
    }

    const account = await repository.findByEmail(email);
    if (!account) {
        return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Invalid email or password.', { statusCode: 401 }));
    }

    if (!account.is_active) {
        return fail(new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'DGFY account is inactive.', { statusCode: 403 }));
    }

    const passwordValid = await comparePassword(password, account.password_hash);
    if (!passwordValid) {
        return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Invalid email or password.', { statusCode: 401 }));
    }

    await repository.updateLastLogin(account);
    const reloaded = await repository.findById(account.id);
    const token = generateDgfyToken(reloaded || account);
    return ok({
        payload: {
            success: true,
            data: {
                account: sanitizeDgfyAccount(reloaded || account),
                token,
                expiresIn: 24 * 60 * 60
            }
        }
    });
};

export const buildGetDgfyMeUseCase = ({ repository }) => async ({ account }) => {
    const memberships = await repository.listMemberships(account.id);
    return ok({
        payload: {
            success: true,
            data: {
                account: sanitizeDgfyAccount(account),
                memberships: memberships.map((membership) => ({
                    id: membership.id,
                    tenant_id: membership.tenant_id,
                    tenant_user_id: membership.tenant_user_id,
                    role: membership.role,
                    status: membership.status,
                    source: membership.source,
                    accepted_at: membership.accepted_at || null,
                    company: membership.tenant ? {
                        id: membership.tenant.id,
                        name: membership.tenant.name,
                        company_token: membership.tenant.company_token,
                        status: membership.tenant.status,
                        plan: membership.tenant.plan
                    } : null
                }))
            }
        }
    });
};

export const buildAcceptDgfyInvitationUseCase = ({ repository }) => async ({ account, membershipId }) => {
    const id = parsePositiveInt(membershipId);
    if (!id) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invitation id is required.', { statusCode: 400 }));
    }

    try {
        const membership = await repository.findMembershipById(id, {
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan']
            }]
        });

        if (!membership || membership.dgfy_account_id !== account.id || membership.source !== 'invite') {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGFY invitation not found.', { statusCode: 404 });
        }

        if (membership.status === 'accepted') {
            return ok({
                payload: {
                    success: true,
                    data: {
                        membership: {
                            id: membership.id,
                            status: membership.status,
                            tenant_user_id: membership.tenant_user_id,
                            company: membership.tenant ? {
                                id: membership.tenant.id,
                                name: membership.tenant.name,
                                company_token: membership.tenant.company_token
                            } : null
                        }
                    }
                }
            });
        }

        if (membership.status !== 'pending') {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Only pending DGFY invitations can be accepted.', { statusCode: 409 });
        }

        const acceptedMembership = await repository.acceptInvitationMembership({ membership, account });

        return ok({
            payload: {
                success: true,
                data: {
                    membership: {
                        id: acceptedMembership.id,
                        tenant_id: acceptedMembership.tenant_id,
                        tenant_user_id: acceptedMembership.tenant_user_id,
                        role: acceptedMembership.role,
                        status: acceptedMembership.status,
                        source: acceptedMembership.source,
                        accepted_at: acceptedMembership.accepted_at || null,
                        display_name: buildFullName(account),
                        company: acceptedMembership.tenant ? {
                            id: acceptedMembership.tenant.id,
                            name: acceptedMembership.tenant.name,
                            company_token: acceptedMembership.tenant.company_token,
                            status: acceptedMembership.tenant.status,
                            plan: acceptedMembership.tenant.plan
                        } : null
                    }
                }
            }
        });
    } catch (error) {
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'Failed to accept DGFY invitation.',
            { statusCode: 500, cause: error }
        ));
    }
};
