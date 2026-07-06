import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ok, fail } from '../contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';
import {
    assertDgfyLegalAcknowledgement,
    DGFY_LEGAL_TERM_FLOWS
} from '../utils/dgfyLegalTerms.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phoneNumber.js';

const JWT_EXPIRY = process.env.DGFY_JWT_EXPIRY || process.env.JWT_EXPIRY || '24h';
const HANDOFF_JWT_EXPIRY = process.env.DGFY_HANDOFF_JWT_EXPIRY || '2m';
const DEFAULT_EMAIL_OTP_PURPOSES = Object.freeze({
    DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification',
    DGFY_PASSWORD_RESET: 'dgfy_password_reset',
    DGFY_BUSINESS_STEP_UP: 'dgfy_business_step_up'
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const DGFY_ACCOUNT_ALREADY_EXISTS_DETAILS = Object.freeze({
    error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS'
});
const buildLegalPersistenceError = () => new DomainError(
    DomainErrorCode.INTERNAL_ERROR,
    'DGFY legal acknowledgement persistence is unavailable.',
    {
        statusCode: 500,
        details: {
            error_code: 'LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_UNAVAILABLE'
        }
    }
);

const buildDgfyAccountConflictError = (field) => new DomainError(
    DomainErrorCode.CONFLICT,
    field === 'phone'
        ? 'A DGFY account already exists with this phone number.'
        : 'A DGFY account already exists with this email.',
    {
        statusCode: 409,
        details: {
            ...DGFY_ACCOUNT_ALREADY_EXISTS_DETAILS,
            field
        }
    }
);

const toLegalPersistenceFailure = (error) => (
    error instanceof DomainError
        ? error
        : new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'DGFY account registration failed while saving legal acknowledgement evidence.',
            {
                statusCode: 500,
                details: {
                    error_code: 'LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_FAILED'
                }
            }
        )
);

const hasBodyKey = (body, key) => Object.prototype.hasOwnProperty.call(body || {}, key);
const pickBodyValue = (body, snakeKey, camelKey, fallback) => {
    if (hasBodyKey(body, snakeKey)) return body[snakeKey];
    if (hasBodyKey(body, camelKey)) return body[camelKey];
    return fallback;
};

export const sanitizeDgfyAccount = (account) => {
    if (!account) return null;
    return {
        id: account.id,
        first_name: account.first_name,
        middle_name: account.middle_name || null,
        last_name: account.last_name,
        username: account.username,
        email: account.email,
        phone: account.phone,
        is_active: account.is_active,
        email_verified_at: account.email_verified_at || null,
        phone_verified_at: account.phone_verified_at || null,
        business_step_up_verified_at: account.business_step_up_verified_at || null,
        provisioning_status: account.provisioning_status || 'self_registered',
        temporary_password_active: Boolean(account.temporary_password_active),
        email_verification_source: account.email_verification_source || null,
        merchant_terms_acknowledged_at: account.merchant_terms_acknowledged_at || null,
        is_email_verified: Boolean(account.email_verified_at),
        last_login_at: account.last_login_at || null
    };
};

export const generateDgfyToken = (account) => jwt.sign({
    token_scope: 'dgfy',
    jti: randomUUID(),
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

export const buildPreflightDgfyAccountRegistrationUseCase = ({
    repository
}) => async ({ body }) => {
    const email = normalizeEmail(body?.email);
    const phone = normalizePhoneNumber(body?.phone);

    if (!email || !phone) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Email and phone are required.',
            { statusCode: 400 }
        ));
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid email address.', { statusCode: 400 }));
    }

    if (!isValidPhoneNumber(phone)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Phone must be a valid phone number.', { statusCode: 400 }));
    }

    const existingByEmail = await repository.findByEmail(email);
    if (existingByEmail) {
        return fail(buildDgfyAccountConflictError('email'));
    }

    const existingByPhone = await repository.findByPhone(phone);
    if (existingByPhone) {
        return fail(buildDgfyAccountConflictError('phone'));
    }

    return ok({
        payload: {
            success: true,
            data: {
                available: true
            },
            message: 'DGFY registration credentials are available.'
        }
    });
};

export const buildRegisterDgfyAccountUseCase = ({
    repository,
    hashPassword,
    verifyEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ body, metadata = {} }) => {
    const firstName = normalizeName(body?.first_name || body?.firstName);
    const middleName = normalizeName(body?.middle_name || body?.middleName);
    const lastName = normalizeName(body?.last_name || body?.lastName);
    const email = normalizeEmail(body?.email);
    const phone = normalizePhoneNumber(body?.phone);
    const password = String(body?.password || '');
    const confirmPassword = String(body?.confirm_password || body?.confirmPassword || '');
    const emailOtpCode = String(body?.email_otp_code || body?.emailOtpCode || '').trim();

    if (!firstName || !lastName || !email || !phone || !password) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Last name, first name, email, phone, and password are required.',
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

    let legalAcknowledgement;
    try {
        legalAcknowledgement = assertDgfyLegalAcknowledgement({
            flow: DGFY_LEGAL_TERM_FLOWS.ACCOUNT_REGISTRATION,
            body
        });
    } catch (error) {
        return fail(error);
    }

    if (typeof repository.recordLegalAcknowledgement !== 'function' || typeof repository.transaction !== 'function') {
        return fail(buildLegalPersistenceError());
    }

    const existingByEmail = await repository.findByEmail(email);
    if (existingByEmail) {
        return fail(buildDgfyAccountConflictError('email'));
    }

    const existingByPhone = await repository.findByPhone(phone);
    if (existingByPhone) {
        return fail(buildDgfyAccountConflictError('phone'));
    }

    if (typeof verifyEmailOtp !== 'function') {
        return fail(new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'DGFY account email verification is unavailable.',
            {
                statusCode: 500,
                details: { error_code: 'DGFY_EMAIL_VERIFICATION_UNAVAILABLE' }
            }
        ));
    }

    try {
        await verifyEmailOtp({
            purpose: emailOtpPurposes.DGFY_ACCOUNT_VERIFICATION,
            email,
            code: emailOtpCode,
            tenantId: null
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            error.message || 'DGFY email verification failed.',
            { statusCode: error.statusCode || 422, cause: error }
        ));
    }

    let account;
    try {
        account = await repository.transaction(async (transaction) => {
            const createdAccount = await repository.create({
                first_name: firstName,
                middle_name: middleName || null,
                last_name: lastName,
                username: firstName,
                email,
                phone,
                password_hash: await hashPassword(password),
                email_verified_at: new Date(),
                email_verification_source: 'public_otp',
                provisioning_status: 'self_registered',
                temporary_password_active: false,
                merchant_terms_acknowledged_at: new Date()
            }, { transaction });

            await repository.mirrorPendingInvitationsForAccount?.(createdAccount, { transaction });
            await repository.mirrorLegacyFounderMembershipsForAccount?.(createdAccount, { transaction });
            await repository.recordLegalAcknowledgement({
                ...legalAcknowledgement,
                dgfy_account_id: createdAccount.id,
                tenant_id: null,
                ip_address: metadata.ip_address || null,
                user_agent: metadata.user_agent || null,
                request_id: metadata.request_id || null,
                accepted_at: new Date()
            }, { transaction });

            return createdAccount;
        });
    } catch (error) {
        return fail(toLegalPersistenceFailure(error));
    }

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
    await repository.mirrorLegacyFounderMembershipsForAccount?.(reloaded || account);
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
    await repository.mirrorLegacyFounderMembershipsForAccount?.(account);
    // apps/dgfy-api's slim repository has no membership concept — fall back to
    // an empty list instead of the tenant-shaped listMemberships() backend has.
    const memberships = repository.listMemberships
        ? await repository.listMemberships(account.id)
        : [];
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
                    last_selected_at: membership.last_selected_at || null,
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
    const firstName = normalizeName(pickBodyValue(body, 'first_name', 'firstName', account.first_name));
    const middleName = normalizeName(pickBodyValue(body, 'middle_name', 'middleName', account.middle_name || ''));
    const lastName = normalizeName(pickBodyValue(body, 'last_name', 'lastName', account.last_name));
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
            'Last name, first name, and phone are required.',
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
        middle_name: middleName || null,
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

    await repository.updatePassword(account, await hashPassword(newPassword), {
        temporary_password_active: false
    });
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
        await repository.updatePassword(account, await hashPassword(password), {
            temporary_password_active: false
        });
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
    const softFail = body?.soft_fail === true || body?.softFail === true;
    const invalidHandoffPayload = () => ok({
        payload: {
            success: true,
            data: {
                status: 'invalid',
                reason: 'expired_or_consumed'
            },
            message: 'DGFY handoff token is invalid or expired.'
        }
    });

    if (!handoffToken) {
        if (softFail) return invalidHandoffPayload();
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
        await repository.mirrorLegacyFounderMembershipsForAccount?.(account);
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
        if (softFail) return invalidHandoffPayload();
        return fail(new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'DGFY handoff token is invalid or expired.',
            { statusCode: 401, cause: error }
        ));
    }
};
