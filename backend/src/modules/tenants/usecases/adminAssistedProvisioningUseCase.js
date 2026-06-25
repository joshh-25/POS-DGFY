import { randomBytes } from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { isWorkflowMode, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import { resolveRegisteredTenantPlan } from './tenantPlanPolicy.js';
import { isValidPhoneNumber, normalizePhoneNumber } from '../../../utils/phoneNumber.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../../../config/permissions.js';
import dbStore from '../../../utils/dbStore.js';
import { getTenantModels as getTenantModelsDefault } from '../../../utils/tenantModelFactory.js';

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeReason = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const generateTemporaryPassword = () => `Dgfy-${randomBytes(9).toString('base64url')}1!`;

const requireReason = (value) => {
    const reason = normalizeReason(value);
    if (reason.length < 3) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Reason is required and must be at least 3 characters.', { statusCode: 400 });
    }
    return reason.slice(0, 500);
};

const buildPlatformActor = (actor = {}) => String(actor?.username || 'platform_admin').trim() || 'platform_admin';

const buildSafeTenantSnapshot = (tenant) => tenant ? {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    admin_email: tenant.admin_email,
    admin_phone: tenant.admin_phone,
    plan: tenant.plan,
    owner_dgfy_account_id: tenant.owner_dgfy_account_id || null,
    provisioning_source: tenant.provisioning_source || 'public_registration',
    ownership_status: tenant.ownership_status || 'claimed'
} : null;

const buildTenantAuditPayload = ({ tenantId, action, actor, reason, metadata = {}, beforeSnapshot = null, afterSnapshot = null }) => ({
    tenant_id: tenantId,
    action,
    actor_username: buildPlatformActor(actor),
    reason,
    request_id: metadata.request_id || null,
    ip_address: metadata.ip_address || null,
    user_agent: metadata.user_agent || null,
    before_snapshot: beforeSnapshot,
    after_snapshot: afterSnapshot,
    metadata: metadata.extra || {}
});

const validateAccountInput = async ({ body, dgfyAccountRepository }) => {
    const firstName = normalizeName(body.first_name || body.firstName);
    const middleName = normalizeName(body.middle_name || body.middleName || '');
    const lastName = normalizeName(body.last_name || body.lastName);
    const email = normalizeEmail(body.email);
    const phone = normalizePhoneNumber(body.phone);
    const temporaryPassword = String(body.temporary_password || body.temporaryPassword || '') || generateTemporaryPassword();

    if (!firstName || !lastName || !email || !phone) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY last name, first name, email, and phone are required.', { statusCode: 400 });
    }
    if (!isValidEmail(email)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid DGFY email address.', { statusCode: 400 });
    }
    if (!isValidPhoneNumber(phone)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY phone must be a valid phone number.', { statusCode: 400 });
    }
    if (temporaryPassword.length < 8) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Temporary password must be at least 8 characters.', { statusCode: 400 });
    }
    if (await dgfyAccountRepository.findByEmail(email)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this email address.', { statusCode: 409 });
    }
    if (await dgfyAccountRepository.findByPhone(phone)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'A DGFY account already exists with this phone number.', { statusCode: 409 });
    }

    return { firstName, middleName, lastName, email, phone, temporaryPassword };
};

const createAdminProvisionedAccount = async ({ input, dgfyAccountRepository, hashPassword, transaction }) => (
    dgfyAccountRepository.create({
        first_name: input.firstName,
        middle_name: input.middleName || null,
        last_name: input.lastName,
        username: input.firstName,
        email: input.email,
        phone: input.phone,
        password_hash: await hashPassword(input.temporaryPassword),
        is_active: true,
        email_verified_at: new Date(),
        email_verification_source: 'platform_admin_provisioned',
        provisioning_status: 'admin_provisioned',
        temporary_password_active: true
    }, { transaction })
);

const validateTenantInput = ({ body, ownerAccount = null }) => {
    const name = normalizeName(body.name || body.company_name || body.companyName);
    const workflowMode = normalizeWorkflowMode(body.workflowMode || body.workflow_mode);
    const adminEmail = normalizeEmail(ownerAccount?.email || body.adminEmail || body.admin_email);
    const adminPhone = normalizePhoneNumber(ownerAccount?.phone || body.adminPhone || body.admin_phone);
    const adminUsername = normalizeName(ownerAccount?.first_name || body.adminUsername || body.admin_username || 'Admin') || 'Admin';
    const temporaryPassword = String(body.adminPassword || body.admin_password || body.temporary_password || body.temporaryPassword || '') || generateTemporaryPassword();

    if (!name || !adminEmail || !adminPhone || !temporaryPassword || !isWorkflowMode(workflowMode)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Company name, admin email, admin phone, temporary password, and business industry are required.',
            { statusCode: 400 }
        );
    }
    if (!isValidEmail(adminEmail)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid admin email address.', { statusCode: 400 });
    }
    if (!isValidPhoneNumber(adminPhone)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Admin phone must be a valid phone number.', { statusCode: 400 });
    }
    if (temporaryPassword.length < 8) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Temporary password must be at least 8 characters.', { statusCode: 400 });
    }

    return { name, workflowMode, adminEmail, adminPhone, adminUsername, temporaryPassword };
};

const createTenantRecord = async ({
    tenantInput,
    tenantAdminRepository,
    hashPassword,
    idGenerator,
    ownerDgfyAccountId = null,
    ownershipStatus,
    transaction
}) => {
    const uuid = idGenerator();
    const safeName = tenantInput.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company';
    const dbName = `sku_tenant_${safeName}_${uuid.split('-')[0]}`;
    const subdomain = `${safeName}-${uuid.split('-')[0]}`;
    const companyToken = `token-${safeName}-${uuid.split('-')[0]}`;
    return tenantAdminRepository.createTenant({
        id: uuid,
        name: tenantInput.name,
        domain: subdomain,
        db_name: dbName,
        company_token: companyToken,
        status: 'pending',
        admin_email: tenantInput.adminEmail,
        admin_phone: tenantInput.adminPhone,
        admin_password_hash: await hashPassword(tenantInput.temporaryPassword),
        plan: resolveRegisteredTenantPlan(),
        subscription_status: 'inactive',
        payment_method: 'manual',
        compliance_mode_state: 'non_compliant_active',
        compliance_mode_choice_required: false,
        compliance_mode_selected_at: new Date(),
        compliance_mode_selected_by: 'platform_admin_provisioning',
        compliance_policy_version: '2026.04.07',
        compliance_profile: {},
        owner_dgfy_account_id: ownerDgfyAccountId,
        provisioning_source: 'platform_admin',
        ownership_status: ownershipStatus,
        settings: {
            workflow_mode: tenantInput.workflowMode
        }
    }, { transaction });
};

const createOrUpdateTenantMasterAdminForAccount = async ({ tenantConnector, getTenantModels, tenant, account }) => {
    const sequelizeInstance = await tenantConnector.getConnection(tenant);
    const tenantModels = getTenantModels(sequelizeInstance);
    return dbStore.run({
        sequelize: sequelizeInstance,
        tenantId: tenant.id,
        tenantToken: tenant.company_token,
        tenantName: tenant.name,
        tenantPlan: tenant.plan,
        ...tenantModels
    }, async () => {
        const User = dbStore.get('User');
        const email = normalizeEmail(account.email);
        let user = await User.findOne({ where: { email } });
        const payload = {
            username: normalizeName(account.first_name || account.username || 'Admin') || 'Admin',
            email,
            phone_number: normalizePhoneNumber(account.phone),
            role: 'admin',
            permissions: DEFAULT_ROLE_PERMISSIONS.admin || [],
            is_active: true,
            is_master_admin: true,
            invitation_status: 'accepted',
            invitation_accepted_at: new Date(),
            deleted_at: null,
            deleted_by: null
        };
        if (user) {
            await user.update(payload);
            return user;
        }
        user = await User.create({
            ...payload,
            password_hash: 'DGFY_ACCOUNT_AUTH_ONLY'
        });
        return user;
    });
};

const provisionCreatedTenant = async ({ provisionTenant, tenant, tenantInput }) => provisionTenant({
    tenantId: tenant.id,
    name: tenant.name,
    dbName: tenant.db_name,
    companyToken: tenant.company_token,
    adminEmail: tenant.admin_email,
    adminPhone: tenant.admin_phone,
    adminUsername: tenantInput.adminUsername,
    adminPasswordHash: tenant.admin_password_hash,
    workflowMode: tenantInput.workflowMode
});

export const buildCreateAdminProvisionedTenantUseCase = ({
    tenantAdminRepository,
    provisionTenant,
    hashPassword,
    idGenerator,
    logger
}) => async ({ body = {}, actor = {}, metadata = {} } = {}) => {
    try {
        const reason = requireReason(body.reason);
        const tenantInput = validateTenantInput({ body });
        if (await tenantAdminRepository.findTenantByName(tenantInput.name)) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A company with this name already exists.', { statusCode: 409 });
        }

        const tenant = await tenantAdminRepository.transaction(async (transaction) => {
            const created = await createTenantRecord({
                tenantInput,
                tenantAdminRepository,
                hashPassword,
                idGenerator,
                ownerDgfyAccountId: null,
                ownershipStatus: 'unassigned',
                transaction
            });
            await tenantAdminRepository.createTenantAdminAuditLog(buildTenantAuditPayload({
                tenantId: created.id,
                action: 'admin_create_tenant',
                actor,
                reason,
                metadata,
                afterSnapshot: buildSafeTenantSnapshot(created)
            }), { transaction });
            return created;
        });
        const provisioned = await provisionCreatedTenant({ provisionTenant, tenant, tenantInput });
        const reloaded = await tenantAdminRepository.findTenantById(tenant.id);
        return ok({
            statusCode: 201,
            payload: {
                success: true,
                data: {
                    tenant: buildSafeTenantSnapshot(reloaded || tenant),
                    provisioned,
                    temporary_password: tenantInput.temporaryPassword
                },
                message: 'Admin-provisioned company created.'
            }
        });
    } catch (error) {
        logger?.error?.('[AdminProvisioning] Tenant provisioning failed', error);
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'Admin company provisioning failed.', { statusCode: error.statusCode || 500, cause: error }));
    }
};

export const buildCreateAdminProvisionedAccountAndTenantUseCase = ({
    tenantAdminRepository,
    dgfyAccountRepository,
    provisionTenant,
    hashPassword,
    idGenerator,
    logger
}) => async ({ body = {}, actor = {}, metadata = {} } = {}) => {
    try {
        const reason = requireReason(body.reason);
        const accountInput = await validateAccountInput({ body: body.dgfy_account || body.account || body, dgfyAccountRepository });
        const tenantInput = validateTenantInput({ body: body.company || body.tenant || body, ownerAccount: { email: accountInput.email, phone: accountInput.phone, first_name: accountInput.firstName } });
        if (await tenantAdminRepository.findTenantByName(tenantInput.name)) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A company with this name already exists.', { statusCode: 409 });
        }

        const { account, tenant } = await tenantAdminRepository.transaction(async (transaction) => {
            const createdAccount = await createAdminProvisionedAccount({
                input: accountInput,
                dgfyAccountRepository,
                hashPassword,
                transaction
            });
            await dgfyAccountRepository.createAdminAuditLog({
                dgfy_account_id: createdAccount.id,
                action: 'admin_create_dgfy_account',
                actor_username: buildPlatformActor(actor),
                reason,
                request_id: metadata.request_id || null,
                ip_address: metadata.ip_address || null,
                user_agent: metadata.user_agent || null,
                before_snapshot: null,
                after_snapshot: {
                    id: createdAccount.id,
                    email: createdAccount.email,
                    phone: createdAccount.phone,
                    provisioning_status: createdAccount.provisioning_status,
                    temporary_password_active: true
                }
            }, { transaction });
            const createdTenant = await createTenantRecord({
                tenantInput,
                tenantAdminRepository,
                hashPassword,
                idGenerator,
                ownerDgfyAccountId: createdAccount.id,
                ownershipStatus: 'claimed',
                transaction
            });
            await tenantAdminRepository.createTenantAdminAuditLog(buildTenantAuditPayload({
                tenantId: createdTenant.id,
                action: 'admin_create_account_and_tenant',
                actor,
                reason,
                metadata,
                afterSnapshot: buildSafeTenantSnapshot(createdTenant)
            }), { transaction });
            return { account: createdAccount, tenant: createdTenant };
        });

        const provisioned = await provisionCreatedTenant({ provisionTenant, tenant, tenantInput });
        const membership = await dgfyAccountRepository.forceAssignTenantOwnership({
            tenant,
            toAccountId: account.id,
            tenantUserId: provisioned?.admin_user_id || null,
            role: 'admin',
            actorAccountId: null
        });
        const reloaded = await tenantAdminRepository.findTenantById(tenant.id);
        return ok({
            statusCode: 201,
            payload: {
                success: true,
                data: {
                    account: {
                        id: account.id,
                        email: account.email,
                        phone: account.phone,
                        provisioning_status: account.provisioning_status,
                        temporary_password_active: true
                    },
                    tenant: buildSafeTenantSnapshot(reloaded || tenant),
                    membership: {
                        id: membership.id,
                        status: membership.status,
                        source: membership.source,
                        tenant_user_id: membership.tenant_user_id
                    },
                    provisioned,
                    temporary_password: accountInput.temporaryPassword
                },
                message: 'Admin-provisioned DGFY account and company created.'
            }
        });
    } catch (error) {
        logger?.error?.('[AdminProvisioning] Account and tenant provisioning failed', error);
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'Admin account and company provisioning failed.', { statusCode: error.statusCode || 500, cause: error }));
    }
};

export const buildAssignTenantOwnerByAdminUseCase = ({
    tenantAdminRepository,
    dgfyAccountRepository,
    tenantConnector,
    getTenantModels = getTenantModelsDefault,
    logger
}) => async ({ tenantId, body = {}, actor = {}, metadata = {} } = {}) => {
    try {
        const reason = requireReason(body.reason);
        const targetAccountId = String(body.dgfy_account_id || body.dgfyAccountId || '').trim();
        const force = body.force === undefined ? true : Boolean(body.force);
        if (!targetAccountId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Target DGFY account id is required.', { statusCode: 400 });
        }
        const tenant = await tenantAdminRepository.findTenantById(tenantId);
        if (!tenant || tenant.status !== 'active') {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Active company not found.', { statusCode: 404 });
        }
        const account = await dgfyAccountRepository.findActiveAdminAssignableAccount(targetAccountId);
        if (!account) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Active DGFY account not found.', { statusCode: 404 });
        }

        const beforeSnapshot = buildSafeTenantSnapshot(tenant);
        const tenantUser = await createOrUpdateTenantMasterAdminForAccount({ tenantConnector, getTenantModels, tenant, account });
        const membership = await dgfyAccountRepository.forceAssignTenantOwnership({
            tenant,
            toAccountId: account.id,
            tenantUserId: tenantUser?.user_id || null,
            role: 'admin'
        });
        const reloaded = await tenantAdminRepository.findTenantById(tenant.id);
        await tenantAdminRepository.createTenantAdminAuditLog(buildTenantAuditPayload({
            tenantId: tenant.id,
            action: force ? 'admin_force_assign_owner' : 'admin_assign_owner',
            actor,
            reason,
            metadata,
            beforeSnapshot,
            afterSnapshot: buildSafeTenantSnapshot(reloaded || tenant)
        }));

        return ok({
            payload: {
                success: true,
                data: {
                    tenant: buildSafeTenantSnapshot(reloaded || tenant),
                    membership: {
                        id: membership.id,
                        dgfy_account_id: membership.dgfy_account_id,
                        status: membership.status,
                        source: membership.source,
                        tenant_user_id: membership.tenant_user_id
                    }
                },
                message: force ? 'Company owner force-assigned.' : 'Company owner assigned.'
            }
        });
    } catch (error) {
        logger?.error?.('[AdminProvisioning] Owner assignment failed', error);
        return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'Owner assignment failed.', { statusCode: error.statusCode || 500, cause: error }));
    }
};
