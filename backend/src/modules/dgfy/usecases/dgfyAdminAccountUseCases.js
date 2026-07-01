import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../../../utils/phoneNumber.js';
import { createHash, randomBytes } from 'crypto';

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeReason = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const hasBodyKey = (body, key) => Object.prototype.hasOwnProperty.call(body || {}, key);

const requireAccountId = (accountId) => {
    const value = String(accountId || '').trim();
    if (!value) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY account id is required.', { statusCode: 400 });
    }
    return value;
};

const requireReason = (reason) => {
    const value = normalizeReason(reason);
    if (value.length < 3) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Reason is required and must be at least 3 characters.', { statusCode: 400 });
    }
    return value.slice(0, 500);
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePassword = (value) => String(value || '');
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));

export const generateTemporaryPassword = () => `Dgfy-${randomBytes(9).toString('base64url')}1!`;

const requireConfirmEmail = (providedEmail, accountEmail) => {
    const provided = normalizeEmail(providedEmail);
    const expected = normalizeEmail(accountEmail);
    if (!provided || provided !== expected) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Confirm the current DGFY account email before deleting.', { statusCode: 400 });
    }
};

const isDeletedAccount = (account) => Boolean(account?.deleted_at);

const assertNotDeleted = (account) => {
    if (isDeletedAccount(account)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'DGFY account is already deleted.', { statusCode: 409 });
    }
};

const buildNumericSuffix = (value, length) => {
    const hash = createHash('sha256').update(String(value || 'dgfy-account')).digest('hex');
    return hash
        .split('')
        .map((char) => (Number.parseInt(char, 16) % 10).toString())
        .join('')
        .slice(0, length)
        .padEnd(length, '0');
};

const buildDeletionPlaceholder = (accountId, now = new Date()) => {
    const stableId = String(accountId || 'dgfy-account').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18) || buildNumericSuffix(accountId, 12);
    const timeToken = now.getTime().toString(36);
    const suffix = `${stableId}-${timeToken}`.toLowerCase();
    return {
        first_name: 'Deleted',
        middle_name: null,
        last_name: 'Account',
        username: `deleted_${suffix}`.slice(0, 80),
        email: `deleted+${suffix}@deleted.dgfy.local`.slice(0, 255),
        phone: `+639${buildNumericSuffix(`${accountId}:${timeToken}`, 9)}`,
        password_hash: `deleted-account-${suffix}`.slice(0, 255)
    };
};

const serializeTenantMembership = (membership) => ({
    id: membership.id,
    tenant_id: membership.tenant_id,
    tenant_user_id: membership.tenant_user_id,
    role: membership.role,
    status: membership.status,
    source: membership.source,
    accepted_at: membership.accepted_at || null,
    created_at: membership.created_at || null,
    updated_at: membership.updated_at || null,
    company: membership.tenant ? {
        id: membership.tenant.id,
        name: membership.tenant.name,
        company_token: membership.tenant.company_token,
        status: membership.tenant.status,
        plan: membership.tenant.plan
    } : null
});

export const sanitizeAdminDgfyAccount = (account) => {
    if (!account) return null;
    const memberships = Array.isArray(account.tenantMemberships) ? account.tenantMemberships : [];
    return {
        id: account.id,
        first_name: account.first_name,
        middle_name: account.middle_name || null,
        last_name: account.last_name,
        username: account.username,
        email: account.email,
        phone: account.phone,
        is_active: account.is_active,
        lifecycle_status: isDeletedAccount(account) ? 'deleted' : account.is_active ? 'active' : 'suspended',
        deleted_at: account.deleted_at || null,
        deleted_by: account.deleted_by || null,
        deletion_reason: account.deletion_reason || null,
        email_verified_at: account.email_verified_at || null,
        phone_verified_at: account.phone_verified_at || null,
        provisioning_status: account.provisioning_status || 'self_registered',
        temporary_password_active: Boolean(account.temporary_password_active),
        email_verification_source: account.email_verification_source || null,
        merchant_terms_acknowledged_at: account.merchant_terms_acknowledged_at || null,
        is_email_verified: Boolean(account.email_verified_at),
        is_phone_verified: Boolean(account.phone_verified_at),
        last_login_at: account.last_login_at || null,
        created_at: account.created_at || null,
        updated_at: account.updated_at || null,
        membership_count: memberships.length,
        memberships: memberships.map(serializeTenantMembership)
    };
};

const serializeAdminAuditLog = (log) => ({
    audit_log_id: log.audit_log_id,
    action: log.action,
    actor_username: log.actor_username,
    reason: log.reason || null,
    request_id: log.request_id || null,
    ip_address: log.ip_address || null,
    user_agent: log.user_agent || null,
    before_snapshot: log.before_snapshot || null,
    after_snapshot: log.after_snapshot || null,
    created_at: log.created_at || null
});

const buildSafeSnapshot = (account) => {
    const safe = sanitizeAdminDgfyAccount(account);
    if (!safe) return null;
    return {
        id: safe.id,
        first_name: safe.first_name,
        middle_name: safe.middle_name,
        last_name: safe.last_name,
        username: safe.username,
        email: safe.email,
        phone: safe.phone,
        is_active: safe.is_active,
        lifecycle_status: safe.lifecycle_status,
        deleted_at: safe.deleted_at,
        deleted_by: safe.deleted_by,
        email_verified_at: safe.email_verified_at,
        phone_verified_at: safe.phone_verified_at,
        provisioning_status: safe.provisioning_status,
        temporary_password_active: safe.temporary_password_active,
        email_verification_source: safe.email_verification_source,
        merchant_terms_acknowledged_at: safe.merchant_terms_acknowledged_at,
        membership_count: safe.membership_count
    };
};

const buildAuditPayload = ({ accountId, action, actor = {}, reason = null, metadata = {}, beforeSnapshot, afterSnapshot }) => ({
    dgfy_account_id: accountId,
    action,
    actor_username: String(actor?.username || 'platform_admin').trim() || 'platform_admin',
    reason: reason || null,
    request_id: metadata?.request_id || null,
    ip_address: metadata?.ip_address || null,
    user_agent: metadata?.user_agent || null,
    before_snapshot: beforeSnapshot || null,
    after_snapshot: afterSnapshot || null
});

const getAccountOrFail = async (repository, accountId, options = {}) => {
    const account = await repository.findAccountForAdmin(accountId, options);
    if (!account) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'DGFY account not found.', { statusCode: 404 });
    }
    return account;
};

export const buildListAdminDgfyAccountsUseCase = ({ repository }) => async ({ query = {} } = {}) => {
    const result = await repository.listAdminAccounts(query);
    const summary = await repository.getAdminAccountSummary();
    return ok({
        payload: {
            success: true,
            data: {
                accounts: result.rows.map(sanitizeAdminDgfyAccount),
                pagination: {
                    page: result.page,
                    limit: result.limit,
                    total: result.count,
                    total_pages: Math.max(Math.ceil(result.count / result.limit), 1)
                },
                summary
            }
        }
    });
};

export const buildCreateAdminProvisionedDgfyAccountUseCase = ({ repository, hashPassword, temporaryPasswordGenerator = generateTemporaryPassword }) => async ({
    body = {},
    actor = {},
    metadata = {}
} = {}) => {
    try {
        const firstName = normalizeName(body.first_name || body.firstName);
        const middleName = normalizeName(body.middle_name || body.middleName || '');
        const lastName = normalizeName(body.last_name || body.lastName);
        const email = normalizeEmail(body.email);
        const phone = normalizePhoneNumber(body.phone);
        const reason = requireReason(body.reason);
        const requestedPassword = normalizePassword(body.temporary_password || body.temporaryPassword);
        const temporaryPassword = requestedPassword || temporaryPasswordGenerator();

        if (!firstName || !lastName || !email || !phone) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Last name, first name, email, phone, and reason are required.', { statusCode: 400 });
        }
        if (!isValidEmail(email)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid email address.', { statusCode: 400 });
        }
        if (!isValidPhoneNumber(phone)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Phone must be a valid phone number.', { statusCode: 400 });
        }
        if (temporaryPassword.length < 8) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Temporary password must be at least 8 characters.', { statusCode: 400 });
        }

        const existingByEmail = await repository.findByEmail(email);
        if (existingByEmail) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this email address.', { statusCode: 409 });
        }
        const existingByPhone = await repository.findByPhone(phone);
        if (existingByPhone) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this phone number.', { statusCode: 409 });
        }

        const account = await repository.transaction(async (transaction) => {
            const created = await repository.create({
                first_name: firstName,
                middle_name: middleName || null,
                last_name: lastName,
                username: firstName,
                email,
                phone,
                password_hash: await hashPassword(temporaryPassword),
                is_active: true,
                email_verified_at: new Date(),
                email_verification_source: 'platform_admin_provisioned',
                provisioning_status: 'admin_provisioned',
                temporary_password_active: true
            }, { transaction });
            await repository.createAdminAuditLog(buildAuditPayload({
                accountId: created.id,
                action: 'admin_create_dgfy_account',
                actor,
                reason,
                metadata,
                beforeSnapshot: null,
                afterSnapshot: buildSafeSnapshot(created)
            }), { transaction });
            return created;
        });

        return ok({
            statusCode: 201,
            payload: {
                success: true,
                data: {
                    account: sanitizeAdminDgfyAccount(account),
                    temporary_password: temporaryPassword
                },
                message: 'Admin-provisioned DGFY account created.'
            }
        });
    } catch (error) {
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to create admin-provisioned DGFY account.', { cause: error }));
    }
};

export const buildGetAdminDgfyAccountUseCase = ({ repository }) => async ({ accountId } = {}) => {
    try {
        const id = requireAccountId(accountId);
        const account = await getAccountOrFail(repository, id);
        const auditLogs = await repository.listAdminAuditLogs(id, { limit: 25 });
        return ok({
            payload: {
                success: true,
                data: {
                    account: sanitizeAdminDgfyAccount(account),
                    audit_logs: auditLogs.map(serializeAdminAuditLog)
                }
            }
        });
    } catch (error) {
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to load DGFY account.', { cause: error }));
    }
};

export const buildUpdateAdminDgfyAccountProfileUseCase = ({ repository }) => async ({
    accountId,
    body = {},
    actor = {},
    metadata = {}
} = {}) => {
    try {
        const id = requireAccountId(accountId);
        if (hasBodyKey(body, 'email')) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'DGFY email changes require a verified email-change flow and are not available from platform admin yet.',
                { statusCode: 400 }
            );
        }

        const account = await getAccountOrFail(repository, id);
        assertNotDeleted(account);
        const firstName = normalizeName(body.first_name ?? account.first_name);
        const middleName = normalizeName(body.middle_name ?? account.middle_name ?? '');
        const lastName = normalizeName(body.last_name ?? account.last_name);
        const phone = normalizePhoneNumber(body.phone ?? account.phone);

        if (!firstName || !lastName || !phone) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Last name, first name, and phone are required.', { statusCode: 400 });
        }
        if (!isValidPhoneNumber(phone)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Phone must be a valid phone number.', { statusCode: 400 });
        }

        const existingByPhone = await repository.findByPhone(phone);
        if (existingByPhone && existingByPhone.id !== account.id) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this phone number.', { statusCode: 409 });
        }

        const beforeSnapshot = buildSafeSnapshot(account);
        const phoneChanged = phone !== account.phone;
        const updates = {
            first_name: firstName,
            middle_name: middleName || null,
            last_name: lastName,
            username: firstName,
            phone,
            phone_verified_at: phoneChanged ? null : account.phone_verified_at
        };

        const updated = await repository.transaction(async (transaction) => {
            const saved = await repository.updateAdminProfile(account, updates, { transaction });
            await repository.createAdminAuditLog(buildAuditPayload({
                accountId: id,
                action: 'profile_update',
                actor,
                metadata,
                beforeSnapshot,
                afterSnapshot: buildSafeSnapshot(saved || { ...account, ...updates })
            }), { transaction });
            return saved;
        });

        const reloaded = await repository.findAccountForAdmin(id);
        return ok({
            payload: {
                success: true,
                data: { account: sanitizeAdminDgfyAccount(reloaded || updated || account) },
                message: 'DGFY account profile updated.'
            }
        });
    } catch (error) {
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to update DGFY account profile.', { cause: error }));
    }
};

const buildLifecycleUseCase = ({ repository, action, isActive, message }) => async ({
    accountId,
    body = {},
    actor = {},
    metadata = {}
} = {}) => {
    try {
        const id = requireAccountId(accountId);
        const reason = requireReason(body.reason);
        const account = await getAccountOrFail(repository, id);
        assertNotDeleted(account);
        const beforeSnapshot = buildSafeSnapshot(account);

        if (Boolean(account.is_active) === Boolean(isActive)) {
            const lifecycleStatus = isActive ? 'active' : 'suspended';
            throw new DomainError(DomainErrorCode.CONFLICT, `DGFY account is already ${lifecycleStatus}.`, { statusCode: 409 });
        }

        const updated = await repository.transaction(async (transaction) => {
            const saved = await repository.updateAdminLifecycle(account, isActive, { transaction });
            await repository.createAdminAuditLog(buildAuditPayload({
                accountId: id,
                action,
                actor,
                reason,
                metadata,
                beforeSnapshot,
                afterSnapshot: buildSafeSnapshot(saved || { ...account, is_active: isActive })
            }), { transaction });
            return saved;
        });

        const reloaded = await repository.findAccountForAdmin(id);
        return ok({
            payload: {
                success: true,
                data: { account: sanitizeAdminDgfyAccount(reloaded || updated || account) },
                message
            }
        });
    } catch (error) {
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, `Failed to ${action} DGFY account.`, { cause: error }));
    }
};

export const buildSuspendAdminDgfyAccountUseCase = ({ repository }) => buildLifecycleUseCase({
    repository,
    action: 'suspend',
    isActive: false,
    message: 'DGFY account suspended.'
});

export const buildReactivateAdminDgfyAccountUseCase = ({ repository }) => buildLifecycleUseCase({
    repository,
    action: 'reactivate',
    isActive: true,
    message: 'DGFY account reactivated.'
});

export const buildDeleteAdminDgfyAccountUseCase = ({ repository }) => async ({
    accountId,
    body = {},
    actor = {},
    metadata = {}
} = {}) => {
    try {
        const id = requireAccountId(accountId);
        const reason = requireReason(body.reason);
        const account = await getAccountOrFail(repository, id);
        assertNotDeleted(account);
        requireConfirmEmail(body.confirm_email, account.email);

        const beforeSnapshot = buildSafeSnapshot(account);
        const deletedAt = new Date();
        const actorUsername = String(actor?.username || 'platform_admin').trim() || 'platform_admin';
        const placeholder = buildDeletionPlaceholder(id, deletedAt);
        const updates = {
            ...placeholder,
            is_active: false,
            email_verified_at: null,
            phone_verified_at: null,
            last_login_at: null,
            deleted_at: deletedAt,
            deleted_by: actorUsername,
            deletion_reason: reason
        };

        const updated = await repository.transaction(async (transaction) => {
            const saved = await repository.deleteAdminAccount(account, updates, { transaction });
            await repository.createAdminAuditLog(buildAuditPayload({
                accountId: id,
                action: 'delete',
                actor,
                reason,
                metadata,
                beforeSnapshot,
                afterSnapshot: buildSafeSnapshot(saved || { ...account, ...updates })
            }), { transaction });
            return saved;
        });

        const reloaded = await repository.findAccountForAdmin(id);
        return ok({
            payload: {
                success: true,
                data: { account: sanitizeAdminDgfyAccount(reloaded || updated || { ...account, ...updates }) },
                message: 'DGFY account deleted and credentials released.'
            }
        });
    } catch (error) {
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to delete DGFY account.', { cause: error }));
    }
};
