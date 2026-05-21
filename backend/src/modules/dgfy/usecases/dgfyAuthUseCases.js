import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../../../utils/phoneNumber.js';

const JWT_EXPIRY = process.env.DGFY_JWT_EXPIRY || process.env.JWT_EXPIRY || '24h';
const HANDOFF_JWT_EXPIRY = process.env.DGFY_HANDOFF_JWT_EXPIRY || '2m';
const DEFAULT_EMAIL_OTP_PURPOSES = Object.freeze({
    DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification',
    DGFY_PASSWORD_RESET: 'dgfy_password_reset'
});

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
        email_verified_at: account.email_verified_at || null,
        phone_verified_at: account.phone_verified_at || null,
        is_email_verified: Boolean(account.email_verified_at),
        last_login_at: account.last_login_at || null
    };
};

export const generateDgfyToken = (account) => jwt.sign({
    token_scope: 'dgfy',
    dgfy_account_id: account.id,
    email: account.email,
    username: account.username
}, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });

export const generateDgfyHandoffToken = (account, jti) => jwt.sign({
    token_scope: 'dgfy_handoff',
    jti,
    dgfy_account_id: account.id,
    email: account.email
}, process.env.JWT_SECRET, { expiresIn: HANDOFF_JWT_EXPIRY });

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

    await repository.mirrorPendingInvitationsForAccount?.(account);

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
    await repository.mirrorPendingInvitationsForAccount?.(reloaded || account);
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
    await repository.mirrorPendingInvitationsForAccount?.(account);
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

export const buildUpdateDgfyProfileUseCase = ({ repository }) => async ({ account, body }) => {
    const firstName = normalizeName(body?.first_name || body?.firstName || account.first_name);
    const lastName = normalizeName(body?.last_name || body?.lastName || account.last_name);
    const phone = normalizePhoneNumber(body?.phone ?? account.phone);
    const email = normalizeEmail(body?.email || account.email);

    if (email !== normalizeEmail(account.email)) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'DGFY email changes require a verified email-change flow and are not available from this screen yet.',
            { statusCode: 400 }
        ));
    }

    if (!firstName || !lastName || !phone) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'First name, last name, and phone are required.',
            { statusCode: 400 }
        ));
    }

    if (!isValidPhoneNumber(phone)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Phone must be a valid phone number.', { statusCode: 400 }));
    }

    const existingByPhone = await repository.findByPhone(phone);
    if (existingByPhone && existingByPhone.id !== account.id) {
        return fail(new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this phone number.', { statusCode: 409 }));
    }

    const updated = await repository.updateProfile(account, {
        first_name: firstName,
        last_name: lastName,
        username: firstName,
        phone,
        phone_verified_at: phone === account.phone ? account.phone_verified_at : null
    });

    return ok({
        payload: {
            success: true,
            data: {
                account: sanitizeDgfyAccount(updated || account)
            },
            message: 'DGFY profile updated.'
        }
    });
};

export const buildChangeDgfyPasswordUseCase = ({
    repository,
    comparePassword,
    hashPassword
}) => async ({ account, body }) => {
    const currentPassword = String(body?.current_password || body?.currentPassword || '');
    const newPassword = String(body?.new_password || body?.newPassword || '');
    const confirmPassword = String(body?.confirm_password || body?.confirmPassword || '');

    if (!currentPassword || !newPassword) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Current password and new password are required.', { statusCode: 400 }));
    }

    if (newPassword.length < 8) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'New password must be at least 8 characters.', { statusCode: 400 }));
    }

    if (confirmPassword && newPassword !== confirmPassword) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Passwords do not match.', { statusCode: 400 }));
    }

    const passwordValid = await comparePassword(currentPassword, account.password_hash);
    if (!passwordValid) {
        return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Current password is invalid.', { statusCode: 401 }));
    }

    await repository.updatePassword(account, await hashPassword(newPassword));
    return ok({
        payload: {
            success: true,
            data: null,
            message: 'DGFY password changed.'
        }
    });
};

export const buildRequestDgfyEmailVerificationUseCase = ({
    requestEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ account, metadata = {} }) => {
    if (!account?.email) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY account email is required.', { statusCode: 400 }));
    }

    if (account.email_verified_at) {
        return ok({
            payload: {
                success: true,
                data: {
                    verified: true,
                    email: account.email,
                    email_verified_at: account.email_verified_at
                },
                message: 'DGFY email is already verified.'
            }
        });
    }

    try {
        const otp = await requestEmailOtp({
            purpose: emailOtpPurposes.DGFY_ACCOUNT_VERIFICATION,
            email: account.email,
            tenantId: null,
            metadata
        });
        return ok({
            statusCode: 202,
            payload: {
                success: true,
                data: otp,
                message: 'DGFY email verification code sent.'
            }
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            error.message || 'DGFY email verification code could not be sent.',
            { statusCode: error.statusCode || 500, cause: error }
        ));
    }
};

export const buildVerifyDgfyEmailUseCase = ({
    repository,
    verifyEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ account, body }) => {
    const code = String(body?.code || body?.email_otp_code || '').trim();
    try {
        await verifyEmailOtp({
            purpose: emailOtpPurposes.DGFY_ACCOUNT_VERIFICATION,
            email: account.email,
            code,
            tenantId: null
        });
        const verified = await repository.markEmailVerified(account);
        return ok({
            payload: {
                success: true,
                data: {
                    account: sanitizeDgfyAccount(verified || account)
                },
                message: 'DGFY email verified.'
            }
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            error.message || 'DGFY email verification failed.',
            { statusCode: error.statusCode || 422, cause: error }
        ));
    }
};

export const buildRequestDgfyPasswordResetUseCase = ({
    repository,
    requestEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ body, metadata = {} }) => {
    const email = normalizeEmail(body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid email address.', { statusCode: 400 }));
    }

    const account = await repository.findByEmail(email);
    if (!account || !account.is_active) {
        return ok({
            statusCode: 202,
            payload: {
                success: true,
                data: null,
                message: 'If a matching DGFY account exists, a password reset code has been sent.'
            }
        });
    }

    try {
        const otp = await requestEmailOtp({
            purpose: emailOtpPurposes.DGFY_PASSWORD_RESET,
            email,
            tenantId: null,
            metadata
        });
        return ok({
            statusCode: 202,
            payload: {
                success: true,
                data: otp,
                message: 'If a matching DGFY account exists, a password reset code has been sent.'
            }
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            error.message || 'DGFY password reset code could not be sent.',
            { statusCode: error.statusCode || 500, cause: error }
        ));
    }
};

export const buildCompleteDgfyPasswordResetUseCase = ({
    repository,
    verifyEmailOtp,
    hashPassword,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ body }) => {
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || body?.email_otp_code || '').trim();
    const password = String(body?.password || body?.new_password || body?.newPassword || '');
    const confirmPassword = String(body?.confirm_password || body?.confirmPassword || '');

    if (!email || !code || !password) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Email, reset code, and new password are required.', { statusCode: 400 }));
    }
    if (password.length < 8) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Password must be at least 8 characters.', { statusCode: 400 }));
    }
    if (confirmPassword && password !== confirmPassword) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Passwords do not match.', { statusCode: 400 }));
    }

    try {
        const account = await repository.findByEmail(email);
        if (!account || !account.is_active) {
            throw new Error('DGFY password reset code is invalid or expired.');
        }
        await verifyEmailOtp({
            purpose: emailOtpPurposes.DGFY_PASSWORD_RESET,
            email,
            code,
            tenantId: null
        });
        await repository.updatePassword(account, await hashPassword(password));
        return ok({
            payload: {
                success: true,
                data: null,
                message: 'DGFY password reset complete.'
            }
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            error.message || 'DGFY password reset code is invalid or expired.',
            { statusCode: error.statusCode || 422, cause: error }
        ));
    }
};

export const buildCreateDgfyHandoffUseCase = ({ repository }) => async ({ account }) => {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 120 * 1000);
    await repository.createHandoff({
        jti,
        dgfyAccountId: account.id,
        expiresAt
    });

    return ok({
        payload: {
            success: true,
            data: {
                handoff_token: generateDgfyHandoffToken(account, jti),
                expiresIn: 120
            }
        }
    });
};

export const buildExchangeDgfyHandoffUseCase = ({ repository }) => async ({ body }) => {
    const handoffToken = String(body?.handoff_token || body?.handoffToken || '').trim();
    if (!handoffToken) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY handoff token is required.', { statusCode: 400 }));
    }

    try {
        const decoded = jwt.verify(handoffToken, process.env.JWT_SECRET);
        if (decoded?.token_scope !== 'dgfy_handoff' || !decoded?.dgfy_account_id || !decoded?.jti) {
            throw new Error('Invalid handoff token scope.');
        }

        const handoff = await repository.consumeHandoff({
            jti: decoded.jti,
            dgfyAccountId: decoded.dgfy_account_id
        });
        if (!handoff) {
            throw new Error('DGFY handoff token was already used or expired.');
        }

        const account = await repository.findById(decoded.dgfy_account_id);
        if (!account || !account.is_active) {
            throw new Error('DGFY account is unavailable.');
        }

        await repository.mirrorPendingInvitationsForAccount?.(account);
        const token = generateDgfyToken(account);
        return ok({
            payload: {
                success: true,
                data: {
                    account: sanitizeDgfyAccount(account),
                    token,
                    expiresIn: 24 * 60 * 60
                }
            }
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'DGFY handoff token is invalid or expired.',
            { statusCode: 401, cause: error }
        ));
    }
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
