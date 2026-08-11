import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    assertDgfyLegalAcknowledgement,
    DGFY_LEGAL_TERM_FLOWS
} from '../../shared/utils/dgfyLegalTerms.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../../../utils/phoneNumber.js';
import { getModeRolePreset, getRoleCatalogMode } from '../../../config/modeRolePresets.js';

const JWT_EXPIRY = process.env.DGFY_JWT_EXPIRY || process.env.JWT_EXPIRY || '24h';
const HANDOFF_JWT_EXPIRY = process.env.DGFY_HANDOFF_JWT_EXPIRY || '2m';
const DEFAULT_DGFY_SESSION_SECONDS = 24 * 60 * 60;
const REMEMBERED_DGFY_SESSION_SECONDS = 30 * 24 * 60 * 60;
const parseStepUpWindowMinutes = () => {
    const parsed = Number.parseInt(process.env.DGFY_BUSINESS_STEP_UP_WINDOW_MINUTES || process.env.EMAIL_OTP_TTL_MINUTES || '10', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
};
const BUSINESS_STEP_UP_WINDOW_MINUTES = parseStepUpWindowMinutes();
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

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const hasBodyKey = (body, key) => Object.prototype.hasOwnProperty.call(body || {}, key);
const pickBodyValue = (body, snakeKey, camelKey, fallback) => {
    if (hasBodyKey(body, snakeKey)) return body[snakeKey];
    if (hasBodyKey(body, camelKey)) return body[camelKey];
    return fallback;
};

const buildFullName = (account) => normalizeName(`${account?.first_name || ''} ${account?.middle_name || ''} ${account?.last_name || ''}`);
const normalizeTenantToken = (value) => String(value || '').trim();
const getBusinessStepUpState = (account) => {
    const verifiedAt = account?.business_step_up_verified_at
        ? new Date(account.business_step_up_verified_at)
        : null;
    if (!verifiedAt || Number.isNaN(verifiedAt.getTime())) {
        return {
            verified: false,
            verified_at: null,
            expires_at: null
        };
    }
    const expiresAt = new Date(verifiedAt.getTime() + BUSINESS_STEP_UP_WINDOW_MINUTES * 60 * 1000);
    const verified = expiresAt.getTime() > Date.now();
    return {
        verified,
        verified_at: verifiedAt,
        expires_at: verified ? expiresAt : null
    };
};

const compactAuditEvidence = (values = {}) => Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

const buildMembershipAuditEvidence = ({
    account,
    membership = null,
    tenantId = null,
    evidence = {}
} = {}) => compactAuditEvidence({
    actor_dgfy_account_id: account?.id || null,
    tenant_id: tenantId || membership?.tenant_id || membership?.tenant?.id || null,
    membership_id: membership?.id || null,
    tenant_user_id: membership?.tenant_user_id || null,
    company_name: membership?.tenant?.name || null,
    role: membership?.role || null,
    role_preset_key: membership?.role_preset_key || null,
    membership_status: membership?.status || null,
    source: membership?.source || null,
    ...evidence
});

const buildBusinessAuditPayload = ({
    account,
    membership = null,
    tenantId = null,
    action,
    result,
    reason = '',
    metadata = {},
    evidence = {}
} = {}) => {
    const auditEvidence = buildMembershipAuditEvidence({
        account,
        membership,
        tenantId,
        evidence: {
            ...(metadata.extra || {}),
            ...evidence
        }
    });

    return {
        dgfy_account_id: account?.id,
        tenant_id: tenantId || membership?.tenant_id || membership?.tenant?.id || null,
        membership_id: membership?.id || null,
        action,
        result,
        reason: reason ? String(reason).slice(0, 500) : null,
        request_id: metadata.request_id || null,
        ip_address: metadata.ip_address || null,
        user_agent: metadata.user_agent || null,
        metadata: Object.keys(auditEvidence).length > 0 ? auditEvidence : null
    };
};

const isMembershipOwner = (membership, accountId = '') => {
    const tenant = membership?.tenant || null;
    const ownerAccountId = String(tenant?.owner_dgfy_account_id || '').trim();
    const currentAccountId = String(accountId || membership?.dgfy_account_id || '').trim();
    if (ownerAccountId) {
        return Boolean(currentAccountId && ownerAccountId === currentAccountId);
    }
    return String(membership?.source || '').trim().toLowerCase() === 'founder';
};

const serializeCompanyMembership = (membership, { currentTenantToken = '', accountId = '' } = {}) => {
    const tenant = membership?.tenant || null;
    const status = String(membership?.status || '').trim().toLowerCase();
    const tenantStatus = String(tenant?.status || '').trim().toLowerCase();
    const isAccepted = status === 'accepted';
    const isTenantActive = tenantStatus === 'active';
    const isOwner = isMembershipOwner(membership, accountId);
    const canSwitch = isAccepted && isTenantActive;
    const isInviteSourced = String(membership?.source || '').trim().toLowerCase() === 'invite';
    return {
        membership_id: membership?.id,
        tenant_id: membership?.tenant_id || tenant?.id || null,
        tenant_user_id: membership?.tenant_user_id || null,
        company_name: tenant?.name || 'Company',
        role: membership?.role || 'staff',
        source: membership?.source || 'invite',
        ownership: isOwner ? 'owner' : 'member',
        is_owner: isOwner,
        membership_status: status || 'pending',
        tenant_status: tenantStatus || 'unknown',
        plan: tenant?.plan || null,
        accepted_at: membership?.accepted_at || null,
        last_selected_at: membership?.last_selected_at || null,
        is_current: Boolean(
            currentTenantToken
            && tenant?.company_token
            && normalizeTenantToken(currentTenantToken) === normalizeTenantToken(tenant.company_token)
        ),
        can_switch: canSwitch,
        can_leave: canSwitch && !isOwner,
        can_transfer_ownership: canSwitch && isOwner,
        group: isOwner ? 'owned' : (status === 'pending' ? 'pending' : 'invited'),
        // Only source: 'invite' rows can actually be accepted/rejected (see
        // acceptDgfyInvitationUseCase's matching source === 'invite' guard) -
        // a founder's own still-provisioning company, or an admin handover/
        // provisioned membership, is pending for reasons that have nothing to
        // do with an invitation the account holder needs to act on.
        requires_action: canSwitch ? null : (
            status === 'pending'
                ? (isInviteSourced ? 'accept_invitation' : 'unavailable')
                : 'unavailable'
        )
    };
};

const verifyBusinessStepUp = async ({
    account,
    code,
    repository = null,
    verifyEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => {
    const stepUpState = getBusinessStepUpState(account);
    if (stepUpState.verified) return stepUpState;

    if (typeof verifyEmailOtp !== 'function') {
        throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'DGFY business security check is unavailable.', {
            statusCode: 500,
            details: { error_code: 'DGFY_BUSINESS_STEP_UP_UNAVAILABLE' }
        });
    }
    try {
        await verifyEmailOtp({
            purpose: emailOtpPurposes.DGFY_BUSINESS_STEP_UP,
            email: normalizeEmail(account?.email),
            code: String(code || '').trim(),
            tenantId: null
        });
    } catch (error) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            error.message || 'DGFY business security code is invalid or expired.',
            { statusCode: error.statusCode || 422, cause: error }
        );
    }

    const verifiedAt = new Date();
    try {
        await repository?.markBusinessStepUpVerified?.(account, verifiedAt);
    } catch (error) {
        throw new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'DGFY business security check could not be saved.',
            { statusCode: 500, cause: error }
        );
    }

    return getBusinessStepUpState({
        business_step_up_verified_at: verifiedAt
    });
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

export const generateDgfyToken = (account, {
    expiresIn = JWT_EXPIRY,
    sessionPersistence = 'standard'
} = {}) => jwt.sign({
    token_scope: 'dgfy',
    jti: randomUUID(),
    dgfy_account_id: account.id,
    email: account.email,
    username: account.username,
    session_persistence: sessionPersistence
}, process.env.JWT_SECRET, { expiresIn });

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
            await repository.mirrorPendingAffiliateInvitesForAccount?.(createdAccount, { transaction });
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
    const rememberDevice = body?.remember_device === true;
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
    const expiresIn = rememberDevice
        ? REMEMBERED_DGFY_SESSION_SECONDS
        : DEFAULT_DGFY_SESSION_SECONDS;
    const token = generateDgfyToken(reloaded || account, {
        expiresIn,
        sessionPersistence: rememberDevice ? 'remembered_device' : 'standard'
    });
    return ok({
        payload: {
            success: true,
            data: {
                account: sanitizeDgfyAccount(reloaded || account),
                token,
                expiresIn,
                rememberDevice
            }
        }
    });
};

export const buildGetDgfyMeUseCase = ({ repository }) => async ({ account }) => {
    await repository.mirrorPendingInvitationsForAccount?.(account);
    await repository.mirrorLegacyFounderMembershipsForAccount?.(account);
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

export const buildConfigureDgfyCompanyDayClosePinUseCase = ({
    comparePassword,
    configureTenantDayClosePinForDgfyAccount
}) => async ({ account, tenantId, body = {} }) => {
    const normalizedTenantId = String(tenantId || body?.tenant_id || body?.tenantId || '').trim();
    const currentPassword = String(body?.current_password || body?.currentPassword || '');
    const pin = String(body?.pin || '').trim();

    if (!account?.id || !normalizedTenantId || !currentPassword || !pin) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Company, current account password, and Day Close PIN are required.',
            { statusCode: 400 }
        ));
    }
    if (!/^[0-9]{4,12}$/.test(pin)) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'POS Day Close PIN must contain 4 to 12 digits.',
            { statusCode: 422 }
        ));
    }

    const passwordValid = await comparePassword(currentPassword, account.password_hash);
    if (!passwordValid) {
        return fail(new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'Current DGFY account password is incorrect.',
            { statusCode: 401 }
        ));
    }

    try {
        const configured = await configureTenantDayClosePinForDgfyAccount({
            account,
            tenantId: normalizedTenantId,
            pin
        });
        return ok({
            payload: {
                success: true,
                data: configured,
                message: 'POS Day Close PIN configured successfully.'
            }
        });
    } catch (error) {
        if (error instanceof DomainError) return fail(error);
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        const errorCode = statusCode === 401
            ? DomainErrorCode.AUTHENTICATION_FAILED
            : statusCode === 403
                ? DomainErrorCode.AUTHORIZATION_FAILED
                : statusCode === 404
                    ? DomainErrorCode.RESOURCE_NOT_FOUND
                    : statusCode < 500
                        ? DomainErrorCode.VALIDATION_FAILED
                        : DomainErrorCode.INTERNAL_ERROR;
        return fail(new DomainError(
            errorCode,
            error?.message || 'Unable to configure the POS Day Close PIN.',
            { statusCode, cause: error }
        ));
    }
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

export const buildListDgfyAccountCompaniesUseCase = ({ repository }) => async ({ account, currentTenantToken = '' }) => {
    await repository.mirrorPendingInvitationsForAccount?.(account);
    await repository.mirrorLegacyFounderMembershipsForAccount?.(account);
    const memberships = await repository.listMemberships(account.id);
    const registrationApplications = await repository.listRegistrationApplications?.(account.id) || [];
    const companies = memberships.map((membership) => serializeCompanyMembership(membership, {
        currentTenantToken,
        accountId: account.id
    }));
    const ownedCompanies = companies.filter((entry) => entry.can_switch && entry.is_owner);
    const invitedCompanies = companies.filter((entry) => entry.can_switch && !entry.is_owner);
    const pendingInvitations = companies.filter((entry) => entry.requires_action === 'accept_invitation');
    return ok({
        payload: {
            success: true,
            data: {
                companies,
                owned_companies: ownedCompanies,
                invited_companies: invitedCompanies,
                pending_invitations: pendingInvitations,
                registration_applications: registrationApplications.map((application) => ({
                    application_id: application.id,
                    company_name: application.tenant?.name || '',
                    status: application.review_status === 'rejected' ? 'rejected'
                        : application.provisioning_status === 'succeeded' ? 'ready'
                            : application.provisioning_status === 'failed' ? 'setup_delayed'
                                : application.provisioning_status === 'in_progress' ? 'setting_up_company'
                                    : 'pending_review',
                    status_path: `/register-company/status/${encodeURIComponent(String(application.id))}`,
                    updated_at: application.updatedAt
                })),
                accepted_count: companies.filter((entry) => entry.can_switch).length,
                pending_count: pendingInvitations.length,
                business_step_up: getBusinessStepUpState(account)
            }
        }
    });
};

export const buildSearchDgfyBusinessAccountsUseCase = ({ repository }) => async ({ query = '', tenantId = '' }) => {
    const normalizedQuery = String(query || '').trim();
    if (normalizedQuery.length < 2) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Search requires at least 2 characters.', { statusCode: 422 }));
    }
    const accounts = await repository.searchActiveAccounts(normalizedQuery, { tenantId });
    return ok({
        payload: {
            success: true,
            data: { accounts }
        }
    });
};

export const buildCreateDgfyInvitationUseCase = ({
    repository,
    sendEmail = null
}) => async ({ tenant, adminUser, body = {}, metadata = {} }) => {
    const dgfyAccountId = String(body?.dgfy_account_id || body?.dgfyAccountId || '').trim();
    const requestedRole = String(body?.role || '').trim().toLowerCase();
    const rolePresetKey = String(body?.role_preset_key || body?.rolePresetKey || '').trim() || null;
    let role = requestedRole || 'staff';
    let permissions = role === 'cashier' ? [] : (Array.isArray(body?.permissions) ? body.permissions : []);
    const locationIds = Array.isArray(body?.location_ids) ? body.location_ids : (Array.isArray(body?.locationIds) ? body.locationIds : []);
    const allowedRoles = new Set(['staff', 'cashier', 'po', 'do', 'jo', 'manager', 'admin']);

    if (!dgfyAccountId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY account id is required.', { statusCode: 422 }));
    }
    if (!tenant?.id || !tenant?.company_token) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Tenant context is required.', { statusCode: 400 }));
    }
    if (rolePresetKey) {
        try {
            const workflowMode = await repository.getTenantWorkflowMode(tenant);
            const preset = getModeRolePreset(rolePresetKey, workflowMode);
            if (!preset) {
                const roleCatalog = getRoleCatalogMode(workflowMode).replace(/_/g, ' ');
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Role preset is not valid for this company's ${roleCatalog} workflow.`,
                    { statusCode: 422 }
                ));
            }
            if (requestedRole && requestedRole !== preset.role) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Invitation role does not match the selected role preset.',
                    { statusCode: 422 }
                ));
            }
            role = preset.role;
            permissions = preset.permissions;
        } catch (error) {
            if (error instanceof DomainError) return fail(error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Unable to resolve the company role catalog.',
                { statusCode: error.statusCode || 500, cause: error }
            ));
        }
    }
    if (!allowedRoles.has(role)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invitation role is invalid.', { statusCode: 422 }));
    }
    if (role === 'cashier' && locationIds.length === 0) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Cashier invitations require at least one active store location.', { statusCode: 422 }));
    }
    if (role === 'admin' && adminUser?.is_master_admin !== true) {
        return fail(new DomainError(DomainErrorCode.FORBIDDEN, 'Only the company owner or master admin can invite an admin.', { statusCode: 403 }));
    }

    try {
        const result = await repository.createInvitationForDgfyAccount({
            dgfyAccountId,
            tenant,
            adminUser,
            role,
            rolePresetKey,
            permissions,
            locationIds
        });

        let emailSent = false;
        let deliveryError = null;
        if (typeof sendEmail === 'function') {
            try {
                await sendEmail({
                    to: result.account.email,
                    subject: `Invitation to join ${tenant.name} on DGFY`,
                    text: `${adminUser?.username || 'A company admin'} invited you to join ${tenant.name}. Sign in to your DGFY account, open My Account > Business, then accept or reject the invitation.`,
                    html: `<p>${adminUser?.username || 'A company admin'} invited you to join <strong>${tenant.name}</strong>.</p><p>Sign in to your DGFY account, open <strong>My Account &gt; Business</strong>, then accept or reject the invitation.</p>`
                });
                emailSent = true;
            } catch (error) {
                deliveryError = error.message || 'Email delivery failed.';
            }
        }

        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account: result.account,
            membership: result.membership,
            action: 'invitation_created',
            result: 'success',
            metadata,
            evidence: {
                actor_tenant_user_id: adminUser?.user_id || null,
                actor_username: adminUser?.username || null,
                target_dgfy_account_id: result.account?.id || dgfyAccountId,
                selected_role: role,
                selected_role_preset_key: rolePresetKey,
                location_ids: locationIds,
                permissions,
                email_sent: emailSent,
                delivery_error: deliveryError
            }
        }));

        return ok({
            payload: {
                success: true,
                data: {
                    membership: serializeCompanyMembership(result.membership, { accountId: result.account.id }),
                    email_sent: emailSent,
                    delivery_error: deliveryError
                },
                message: 'DGFY account invitation created.'
            }
        });
    } catch (error) {
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'Failed to create DGFY invitation.', { statusCode: error.statusCode || 500, cause: error }));
    }
};

export const buildRequestDgfyBusinessStepUpUseCase = ({
    requestEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ account, metadata = {} }) => {
    if (typeof requestEmailOtp !== 'function') {
        return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'DGFY business security check is unavailable.', { statusCode: 500 }));
    }

    try {
        const otp = await requestEmailOtp({
            purpose: emailOtpPurposes.DGFY_BUSINESS_STEP_UP,
            email: normalizeEmail(account?.email),
            tenantId: null,
            metadata
        });
        return ok({
            payload: {
                success: true,
                data: otp,
                message: 'DGFY business security code sent.'
            }
        });
    } catch (error) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            error.message || 'Unable to send DGFY business security code.',
            { statusCode: error.statusCode || 422, cause: error }
        ));
    }
};

export const buildSwitchDgfyCompanyUseCase = ({
    repository,
    createTenantSessionForDgfyAccount,
    findOwnedOpenShift = null
}) => async ({
    account,
    tenantId,
    body = {},
    metadata = {},
    currentTenantUserId = null,
    currentTenantId = null,
    authSource = ''
}) => {
    const resolvedTenantId = String(tenantId || body?.tenant_id || body?.tenantId || '').trim();

    if (!resolvedTenantId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Company id is required.', { statusCode: 400 }));
    }

    let membership = null;
    try {
        membership = await repository.findMembershipForAccount({
            dgfyAccountId: account.id,
            tenantId: resolvedTenantId,
            status: 'accepted'
        });

        if (!membership || !membership.tenant || membership.tenant.status !== 'active') {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'No active accepted company membership is available for this DGFY account.', { statusCode: 403 });
        }

        if (
            authSource === 'tenant_membership'
            && currentTenantUserId
            && typeof findOwnedOpenShift === 'function'
        ) {
            const openShift = await findOwnedOpenShift({
                tenantUserId: currentTenantUserId,
                tenantId: currentTenantId
            });
            if (openShift) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Close your active shift before switching companies.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'ACTIVE_SHIFT_OWNED',
                            current_tenant_id: currentTenantId || null,
                            ...openShift
                        }
                    }
                );
            }
        }

        const session = await createTenantSessionForDgfyAccount({
            account,
            tenantId: resolvedTenantId
        });
        await repository.updateMembershipLastSelected?.(membership);

        return {
            ...ok({
                payload: {
                    success: true,
                    data: session,
                    message: 'Company switched.'
                }
            }),
            auditContext: {
                account,
                membership,
                tenantId: resolvedTenantId,
                evidence: {
                    current_tenant_id: currentTenantId,
                    current_tenant_user_id: currentTenantUserId,
                    target_tenant_user_id: membership.tenant_user_id || session?.user_id || null,
                    target_role: membership.role || session?.role || null,
                    target_role_preset_key: membership.role_preset_key || null,
                    auth_source: authSource
                }
            }
        };
    } catch (error) {
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            tenantId: resolvedTenantId,
            action: 'company_switch_failed',
            result: 'failure',
            reason: error.message || 'Company switch failed.',
            metadata,
            evidence: {
                current_tenant_id: currentTenantId,
                current_tenant_user_id: currentTenantUserId,
                target_tenant_id: resolvedTenantId,
                target_tenant_user_id: membership?.tenant_user_id || null,
                target_role: membership?.role || null,
                target_role_preset_key: membership?.role_preset_key || null,
                auth_source: authSource,
                reason_code: error?.details?.reason_code || error?.code || null,
                shift_id: error?.details?.shift_id || null,
                terminal_id: error?.details?.terminal_id || null,
                location_id: error?.details?.location_id || null,
                cashier_id: error?.details?.cashier_id || null,
                previous_session_revoked: false,
                new_session_issued: false,
                session_rotated: false
            }
        }));
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(
            error?.statusCode === 401 ? DomainErrorCode.AUTHENTICATION_FAILED : DomainErrorCode.AUTHORIZATION_FAILED,
            error.message || 'Unable to switch companies for this DGFY account.',
            { statusCode: error?.statusCode || 403, cause: error }
        ));
    }
};

export const buildRecordDgfyCompanySwitchOutcomeUseCase = ({
    repository
}) => async ({
    account,
    membership = null,
    tenantId = null,
    result = 'success',
    reason = '',
    metadata = {},
    evidence = {}
}) => {
    const normalizedResult = result === 'success' ? 'success' : 'failure';
    await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
        account,
        membership,
        tenantId,
        action: normalizedResult === 'success' ? 'company_switch_success' : 'company_switch_failed',
        result: normalizedResult,
        reason,
        metadata,
        evidence
    }));

    return ok({
        recorded: true
    });
};

export const buildAcceptDgfyInvitationUseCase = ({
    repository
}) => async ({ account, membershipId, metadata = {} }) => {
    const id = parsePositiveInt(membershipId);
    if (!id) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invitation id is required.', { statusCode: 400 }));
    }

    let membership = null;
    try {
        membership = await repository.findMembershipById(id, {
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'db_name']
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
                                name: membership.tenant.name
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
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership: acceptedMembership,
            action: 'invitation_accept_success',
            result: 'success',
            metadata,
            evidence: {
                decision: 'accepted',
                accepted_at: acceptedMembership?.accepted_at || null
            }
        }));

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
                            status: acceptedMembership.tenant.status,
                            plan: acceptedMembership.tenant.plan
                        } : null
                    }
                }
            }
        });
    } catch (error) {
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            action: 'invitation_accept_failed',
            result: 'failure',
            reason: error.message || 'DGFY invitation acceptance failed.',
            metadata,
            evidence: {
                decision: 'accept',
                reason_code: error?.details?.reason_code || error?.code || null
            }
        }));
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'Failed to accept DGFY invitation.',
            { statusCode: 500, cause: error }
        ));
    }
};

export const buildRejectDgfyInvitationUseCase = ({
    repository
}) => async ({ account, membershipId, metadata = {} }) => {
    const id = parsePositiveInt(membershipId);
    if (!id) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invitation id is required.', { statusCode: 400 }));
    }

    let membership = null;
    try {
        membership = await repository.findMembershipById(id, {
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'db_name', 'owner_dgfy_account_id']
            }]
        });
        if (!membership || membership.dgfy_account_id !== account.id || membership.source !== 'invite') {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGFY invitation not found.', { statusCode: 404 });
        }
        if (membership.status !== 'pending') {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Only pending invitations can be rejected.', { statusCode: 409 });
        }
        const declined = await repository.declineInvitationMembership({ membership });
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership: declined,
            action: 'invitation_reject_success',
            result: 'success',
            metadata,
            evidence: {
                decision: 'rejected'
            }
        }));
        return ok({
            payload: {
                success: true,
                data: { membership: serializeCompanyMembership(declined, { accountId: account.id }) },
                message: 'Invitation rejected.'
            }
        });
    } catch (error) {
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            action: 'invitation_reject_failed',
            result: 'failure',
            reason: error.message || 'DGFY invitation rejection failed.',
            metadata,
            evidence: {
                decision: 'reject',
                reason_code: error?.details?.reason_code || error?.code || null
            }
        }));
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to reject DGFY invitation.', { statusCode: 500, cause: error }));
    }
};

export const buildLeaveDgfyCompanyUseCase = ({ repository }) => async ({ account, tenantId, metadata = {} }) => {
    const resolvedTenantId = String(tenantId || '').trim();
    if (!resolvedTenantId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Company id is required.', { statusCode: 400 }));
    }
    let membership = null;
    try {
        membership = await repository.findMembershipForAccount({
            dgfyAccountId: account.id,
            tenantId: resolvedTenantId,
            status: 'accepted'
        });
        if (!membership || !membership.tenant || membership.tenant.status !== 'active') {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Active company membership not found.', { statusCode: 404 });
        }
        if (isMembershipOwner(membership, account.id)) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Company owners must transfer ownership before leaving.', { statusCode: 403 });
        }
        const removed = await repository.leaveMembership({ membership });
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership: removed,
            action: 'company_leave_success',
            result: 'success',
            metadata
        }));
        return ok({
            payload: {
                success: true,
                data: { membership: serializeCompanyMembership(removed, { accountId: account.id }) },
                message: 'You left the company.'
            }
        });
    } catch (error) {
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            tenantId: resolvedTenantId,
            action: 'company_leave_failed',
            result: 'failure',
            reason: error.message || 'Company leave failed.',
            metadata
        }));
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to leave company.', { statusCode: 500, cause: error }));
    }
};

export const buildTransferDgfyCompanyOwnershipUseCase = ({
    repository,
    verifyEmailOtp,
    emailOtpPurposes = DEFAULT_EMAIL_OTP_PURPOSES
}) => async ({ account, tenantId, body = {}, metadata = {} }) => {
    const resolvedTenantId = String(tenantId || '').trim();
    const targetAccountId = String(body?.target_dgfy_account_id || body?.targetDgfyAccountId || '').trim();
    if (!resolvedTenantId || !targetAccountId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Company id and target DGFY account id are required.', { statusCode: 422 }));
    }
    let membership = null;
    try {
        membership = await repository.findMembershipForAccount({
            dgfyAccountId: account.id,
            tenantId: resolvedTenantId,
            status: 'accepted'
        });
        const tenant = membership?.tenant;
        const isOwner = String(tenant?.owner_dgfy_account_id || '') === String(account.id)
            || (!tenant?.owner_dgfy_account_id && String(membership?.source || '') === 'founder');
        if (!membership || !tenant || !isOwner) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Only the current company owner can transfer ownership.', { statusCode: 403 });
        }
        const targetMembership = await repository.findMembershipForAccount({
            dgfyAccountId: targetAccountId,
            tenantId: resolvedTenantId,
            status: 'accepted'
        });
        if (!targetMembership) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Ownership can only be transferred to an accepted company member.', { statusCode: 409 });
        }
        await verifyBusinessStepUp({
            account,
            code: String(body?.email_otp_code || body?.emailOtpCode || body?.code || '').trim(),
            repository,
            verifyEmailOtp,
            emailOtpPurposes
        });
        await repository.transferTenantOwnership({
            tenant,
            fromAccountId: account.id,
            toAccountId: targetAccountId
        });
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            action: 'ownership_transfer_success',
            result: 'success',
            metadata: { ...metadata, extra: { target_dgfy_account_id: targetAccountId } }
        }));
        return ok({
            payload: {
                success: true,
                data: { tenant_id: resolvedTenantId, owner_dgfy_account_id: targetAccountId },
                message: 'Company ownership transferred.'
            }
        });
    } catch (error) {
        await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            tenantId: resolvedTenantId,
            action: 'ownership_transfer_failed',
            result: 'failure',
            reason: error.message || 'Ownership transfer failed.',
            metadata: { ...metadata, extra: { target_dgfy_account_id: targetAccountId || null } }
        }));
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to transfer ownership.', { statusCode: 500, cause: error }));
    }
};

export const buildStartDgfyTenantSessionUseCase = ({
    createTenantSessionForDgfyAccount
}) => async ({ account, body }) => {
    const tenantId = String(body?.tenant_id || body?.tenantId || '').trim();
    const companyToken = String(body?.company_token || body?.companyToken || '').trim();
    const accessScope = String(body?.access_scope || body?.accessScope || '').trim().toLowerCase();

    if (!tenantId && !companyToken) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Company identity is required to start a SKUpervisor session.',
            { statusCode: 400 }
        ));
    }

    try {
        const session = await createTenantSessionForDgfyAccount({
            account,
            tenantId,
            companyToken
        });

        if (accessScope === 'pos') {
            const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
            const role = String(session?.role || '').trim().toLowerCase();
            const hasAllowedRole = session?.is_master_admin === true || role === 'cashier' || role === 'admin';
            if (!hasAllowedRole || (!permissions.includes('pos:view') && !permissions.includes('pos:transact'))) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'This DGFY account does not have POS access for the selected company.',
                    { statusCode: 403 }
                );
            }
        }

        return ok({
            payload: {
                success: true,
                data: session,
                message: 'SKUpervisor session started.'
            }
        });
    } catch (error) {
        return fail(new DomainError(
            error?.statusCode === 401 ? DomainErrorCode.AUTHENTICATION_FAILED : DomainErrorCode.AUTHORIZATION_FAILED,
            error.message || 'Unable to start a SKUpervisor session for this DGFY account.',
            { statusCode: error?.statusCode || 403, cause: error }
        ));
    }
};

export const buildStartDgfyPosSessionUseCase = ({
    createTenantSessionForDgfyAccount,
    repository = null,
    validateTerminalPolicy = null
}) => async ({ account, tenantId, body = {}, metadata = {} }) => {
    const resolvedTenantId = String(tenantId || body?.tenant_id || body?.tenantId || '').trim();
    const terminalId = String(body?.terminal_id || body?.terminalId || '').trim().toUpperCase();
    if (!resolvedTenantId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Company id is required for POS unlock.', { statusCode: 400 }));
    }
    if (!terminalId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Terminal or counter id is required for POS unlock.', { statusCode: 422 }));
    }
    let membership = null;
    try {
        if (repository?.findMembershipForAccount) {
            membership = await repository.findMembershipForAccount({
                dgfyAccountId: account.id,
                tenantId: resolvedTenantId,
                status: 'accepted'
            });
            const membershipStatus = String(membership?.status || '').trim().toLowerCase();
            const membershipTenantId = String(membership?.tenant_id || membership?.tenant?.id || '').trim();
            const tenantStatus = String(membership?.tenant?.status || '').trim().toLowerCase();
            if (
                !membership
                || membershipStatus !== 'accepted'
                || membershipTenantId !== resolvedTenantId
                || tenantStatus !== 'active'
            ) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'No active company membership is available for this DGFY account.', { statusCode: 403 });
            }
            await repository.createBusinessAuditLog?.(buildBusinessAuditPayload({
                account,
                membership,
                action: 'pos_unlock_attempted',
                result: 'success',
                metadata: { ...metadata, extra: { terminal_id: terminalId } }
            }));
        }
        const session = await createTenantSessionForDgfyAccount({
            account,
            tenantId: resolvedTenantId
        });
        if (String(session?.company?.id || '').trim() !== resolvedTenantId) {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'The authenticated tenant session does not match the selected company.',
                { statusCode: 403 }
            );
        }
        const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
        const userRole = String(session?.role || '').trim().toLowerCase();
        const hasAllowedPosRole = session?.is_master_admin === true
            || userRole === 'cashier'
            || userRole === 'admin';
        if (!hasAllowedPosRole) {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'An active Cashier or Admin role is required for POS access in the selected company.',
                { statusCode: 403 }
            );
        }
        if (!permissions.includes('pos:view') && !permissions.includes('pos:transact')) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'This DGFY account does not have POS access for the selected company.', { statusCode: 403 });
        }
        const terminalPolicy = typeof validateTerminalPolicy === 'function'
            ? await validateTerminalPolicy({
                tenantId: resolvedTenantId,
                terminalId,
                tenantUserId: membership?.tenant_user_id || session?.user_id || null,
                userRole,
                permissions,
                isMasterAdmin: session?.is_master_admin === true
            })
            : { terminal_id: terminalId, reason_code: 'NOT_VALIDATED' };
        await repository?.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            tenantId: resolvedTenantId,
            action: 'pos_unlock_success',
            result: 'success',
            metadata: {
                ...metadata,
                extra: {
                    terminal_id: terminalId,
                    terminal_policy_reason: terminalPolicy?.reason_code || null
                }
            }
        }));
        return ok({
            payload: {
                success: true,
                data: {
                    ...session,
                    pos: {
                        terminal_id: terminalId,
                        terminal_identity_policy: terminalPolicy
                    }
                },
                message: 'POS session started.'
            }
        });
    } catch (error) {
        await repository?.createBusinessAuditLog?.(buildBusinessAuditPayload({
            account,
            membership,
            tenantId: resolvedTenantId,
            action: 'pos_unlock_failed',
            result: 'failure',
            reason: error.message || 'POS unlock failed.',
            metadata: {
                ...metadata,
                extra: {
                    terminal_id: terminalId || null,
                    reason_code: error?.details?.terminal_identity_policy?.reason_code || error?.code || null
                }
            }
        }));
        if (error instanceof DomainError) return fail(error);
        return fail(new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, error.message || 'Unable to start POS session.', { statusCode: error.statusCode || 403, cause: error }));
    }
};
