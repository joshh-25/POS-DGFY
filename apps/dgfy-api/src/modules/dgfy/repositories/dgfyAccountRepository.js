import { DataTypes, Op } from 'sequelize';
import {
    DgfyAccount,
    DgfyAccountAdminAuditLog,
    DgfyAccountBusinessAuditLog,
    DgfyAccountHandoff,
    DgfyAccountTenantMembership,
    DgfyLegalAcknowledgement,
    CompanyRegistrationApplication,
    Tenant,
    UserTenantMapping,
    UserInvitation
} from '../../../models/index.js';
import { dgfyAffiliateRepository } from './dgfyAffiliateRepository.js';
import dbStore from '../../../utils/dbStore.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import * as landlordService from '../../../services/landlordService.js';
import logger from '../../../config/logger.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../../../config/permissions.js';
import { normalizePhoneNumber } from '../../../utils/phoneNumber.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import {
    staffRoleRepository,
    applyStaffRoleAssignmentInTransaction
} from '../../staff/repositories/staffRoleRepository.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseStrictPositiveInt = (value) => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeSearch = (value) => String(value || '').trim();
const INERT_TENANT_DGFY_HASH = 'DGFY_ACCOUNT_AUTH_ONLY';
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const parseWorkflowModeSetting = (setting) => {
    if (!setting) return DEFAULT_WORKFLOW_MODE;
    const raw = setting.setting_value;
    if (setting.data_type === 'json' && typeof raw === 'string') {
        try {
            return normalizeWorkflowMode(JSON.parse(raw));
        } catch {
            return DEFAULT_WORKFLOW_MODE;
        }
    }
    return normalizeWorkflowMode(raw);
};
const maskPhone = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.length <= 4) return '****';
    return `${'*'.repeat(Math.max(4, raw.length - 4))}${raw.slice(-4)}`;
};

const membershipIsCurrentOwner = (membership) => {
    const tenant = membership?.tenant || null;
    const ownerAccountId = String(tenant?.owner_dgfy_account_id || '').trim();
    const membershipAccountId = String(membership?.dgfy_account_id || '').trim();
    if (ownerAccountId) {
        return Boolean(membershipAccountId && ownerAccountId === membershipAccountId);
    }
    return String(membership?.source || '').trim().toLowerCase() === 'founder';
};

const buildUniqueUsername = async (User, baseName, currentUserId = null, options = {}) => {
    const base = normalizeName(baseName).replace(/[^\w.-]+/g, '').slice(0, 45) || 'dgfy';
    let candidate = base;
    let suffix = 1;
    while (true) {
        const existing = await User.findOne({ where: { username: candidate }, ...options });
        if (!existing || (currentUserId && existing.user_id === currentUserId)) {
            return candidate;
        }
        suffix += 1;
        candidate = `${base}${suffix}`;
    }
};

export const ensureTenantUserInvitationSchema = async (sequelizeInstance) => {
    if (!sequelizeInstance?.getQueryInterface) return;
    const queryInterface = sequelizeInstance.getQueryInterface();
    const tableInfo = await queryInterface.describeTable('users');
    const addColumnIfMissing = async (column, definition) => {
        if (!tableInfo[column]) {
            await queryInterface.addColumn('users', column, definition);
            tableInfo[column] = definition;
        }
    };

    await addColumnIfMissing('phone_number', {
        type: DataTypes.STRING(40),
        allowNull: true
    });
    await addColumnIfMissing('role_preset_key', {
        type: DataTypes.STRING(80),
        allowNull: true
    });
    await addColumnIfMissing('permissions', {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
    });
    await addColumnIfMissing('is_master_admin', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    });
    await addColumnIfMissing('invitation_token', {
        type: DataTypes.STRING(64),
        allowNull: true
    });
    await addColumnIfMissing('invitation_expires_at', {
        type: DataTypes.DATE,
        allowNull: true
    });
    await addColumnIfMissing('invited_by', {
        type: DataTypes.INTEGER,
        allowNull: true
    });
    await addColumnIfMissing('invitation_status', {
        type: DataTypes.ENUM('pending', 'accepted', 'expired', 'cancelled', 'declined'),
        allowNull: true
    });
    await addColumnIfMissing('invitation_delivery_status', {
        type: DataTypes.ENUM('not_configured', 'sent', 'failed', 'manual_link'),
        allowNull: true
    });
    await addColumnIfMissing('invitation_delivery_error', {
        type: DataTypes.STRING(500),
        allowNull: true
    });
    await addColumnIfMissing('invitation_last_sent_at', {
        type: DataTypes.DATE,
        allowNull: true
    });
    await addColumnIfMissing('invitation_accepted_at', {
        type: DataTypes.DATE,
        allowNull: true
    });
    await addColumnIfMissing('invitation_cancelled_at', {
        type: DataTypes.DATE,
        allowNull: true
    });
    await addColumnIfMissing('invitation_cancelled_by', {
        type: DataTypes.INTEGER,
        allowNull: true
    });
    await addColumnIfMissing('deleted_at', {
        type: DataTypes.DATE,
        allowNull: true
    });
    await addColumnIfMissing('deleted_by', {
        type: DataTypes.INTEGER,
        allowNull: true
    });

    await queryInterface.changeColumn('users', 'role', {
        type: DataTypes.ENUM('admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo'),
        allowNull: true,
        defaultValue: 'staff'
    });
    await queryInterface.changeColumn('users', 'invitation_status', {
        type: DataTypes.ENUM('pending', 'accepted', 'expired', 'cancelled', 'declined'),
        allowNull: true
    });
};

const customRoleUnavailableError = () => new DomainError(
    DomainErrorCode.CONFLICT,
    'The invited custom staff role is no longer available. Ask a company administrator to send a new invitation.',
    { statusCode: 409 }
);

const acceptCustomStaffRoleInvitation = async ({ membership, account, tenant, registry, sequelizeInstance }) => {
    const User = dbStore.get('User');
    const UserLocationGrant = dbStore.get('UserLocationGrant');
    const TenantLocation = dbStore.get('TenantLocation');
    const StaffRole = dbStore.get('StaffRole');
    const tenantUserId = parsePositiveInt(membership.tenant_user_id);
    const staffRoleId = parsePositiveInt(registry.staff_role_id);
    const email = normalizeEmail(account.email);
    const phone = normalizePhoneNumber(account.phone);
    const now = new Date();

    if (!tenantUserId || !staffRoleId || registry.status !== 'pending') {
        throw customRoleUnavailableError();
    }
    if (new Date(registry.expires_at).getTime() <= now.getTime()) {
        const expiredError = new DomainError(DomainErrorCode.CONFLICT, 'This invitation has expired. Ask a company administrator to send a new invitation.', { statusCode: 409 });
        const transaction = await sequelizeInstance.transaction();
        try {
            const user = await User.findByPk(tenantUserId, { transaction, lock: transaction.LOCK.UPDATE });
            if (user?.invitation_status === 'pending') {
                await user.update({ invitation_status: 'expired', invitation_token: null }, { transaction });
            }
            await transaction.commit();
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            throw error;
        }
        await landlordService.transitionInvitationRegistryByTenantUser({
            tenantId: tenant.id,
            tenantUserId,
            expectedStatus: 'pending',
            updates: { status: 'expired' }
        }).catch((error) => logger.warn('[DGFY] Expired staff-role invitation registry sync failed', {
            tenant_id: tenant.id,
            tenant_user_id: tenantUserId,
            error_name: error?.name || 'Error'
        }));
        await DgfyAccountTenantMembership.update({ status: 'removed' }, {
            where: { id: membership.id, status: 'pending', source: 'invite' }
        }).catch(() => {});
        throw expiredError;
    }

    let user = null;
    let invitationUnavailable = false;
    let acceptedMembership = null;
    let registryTransitioned = false;
    let membershipTransitioned = false;
    const transaction = await sequelizeInstance.transaction();
    try {
        const role = StaffRole
            ? await StaffRole.findByPk(staffRoleId, { transaction, lock: transaction.LOCK.UPDATE })
            : null;
        user = await User.findByPk(tenantUserId, { transaction, lock: transaction.LOCK.UPDATE });

        if (!user || normalizeEmail(user.email) !== email) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'The invited company account does not match this DGFY account.', { statusCode: 409 });
        }
        if (user.invitation_status !== 'pending' || !user.invitation_expires_at || new Date(user.invitation_expires_at).getTime() <= now.getTime()) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'Only pending, unexpired invitations can be accepted.', { statusCode: 409 });
        }

        if (!role?.is_active || Number(user.staff_role_id) !== staffRoleId || String(user.role || '').toLowerCase() !== 'staff') {
            await user.update({
                invitation_token: null,
                invitation_status: 'cancelled',
                invitation_cancelled_at: now,
                invitation_cancelled_by: null,
                is_active: false
            }, { transaction });
            invitationUnavailable = true;
        } else {
            const grants = UserLocationGrant
                ? await UserLocationGrant.findAll({
                    where: { user_id: user.user_id },
                    attributes: ['location_id'],
                    transaction
                })
                : [];
            const locationIds = [...new Set(grants.map((grant) => Number(grant.location_id)).filter((id) => Number.isInteger(id) && id > 0))];
            const activeGrantCount = locationIds.length > 0 && TenantLocation
                ? await TenantLocation.count({
                    where: { location_id: { [Op.in]: locationIds }, is_active: true },
                    transaction
                })
                : 0;
            if (locationIds.length === 0 || activeGrantCount !== locationIds.length) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'One or more assigned locations are no longer active. Ask a company administrator to review the invitation.', { statusCode: 409 });
            }

            await applyStaffRoleAssignmentInTransaction({
                repository: staffRoleRepository,
                target: user,
                role,
                actorUserId: user.invited_by || null,
                transaction,
                auditChanges: {
                    assignment_source: 'invitation_acceptance',
                    accepted_by_dgfy_account_id: account.id
                }
            });
            await user.update({
                username: await buildUniqueUsername(User, account.first_name, tenantUserId, { transaction }),
                email,
                phone_number: phone,
                role: 'staff',
                role_preset_key: null,
                is_active: true,
                invitation_token: null,
                invitation_status: 'accepted',
                invitation_accepted_at: now
            }, { transaction });

            const registryTransition = await landlordService.transitionInvitationRegistryByTenantUser({
                tenantId: tenant.id,
                tenantUserId,
                expectedStatus: 'pending',
                updates: { status: 'accepted', accepted_at: now, cancellation_reason: null }
            });
            if (!registryTransition) throw new DomainError(DomainErrorCode.CONFLICT, 'This invitation is no longer pending.', { statusCode: 409 });
            registryTransitioned = true;

            const [updatedMembershipCount] = await DgfyAccountTenantMembership.update({
                tenant_user_id: tenantUserId,
                status: 'accepted',
                accepted_at: now
            }, {
                where: {
                    id: membership.id,
                    dgfy_account_id: account.id,
                    tenant_id: tenant.id,
                    source: 'invite',
                    status: 'pending'
                }
            });
            if (updatedMembershipCount !== 1) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'This invitation is no longer pending.', { statusCode: 409 });
            }
            membershipTransitioned = true;
        }

        await transaction.commit();
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        try {
            if (membershipTransitioned) {
                await DgfyAccountTenantMembership.update({ status: 'pending', accepted_at: null }, {
                    where: { id: membership.id, status: 'accepted', accepted_at: now }
                });
            }
            if (registryTransitioned) {
                await landlordService.transitionInvitationRegistryByTenantUser({
                    tenantId: tenant.id,
                    tenantUserId,
                    expectedStatus: 'accepted',
                    updates: { status: 'pending', accepted_at: null }
                });
            }
        } catch (compensationError) {
            logger.error('[DGFY] Accepted staff-role invitation compensation failed', {
                tenant_id: tenant.id,
                tenant_user_id: tenantUserId,
                staff_role_id: staffRoleId,
                error_name: compensationError?.name || 'Error'
            });
        }
        throw error;
    }

    if (invitationUnavailable) {
        try {
            await landlordService.transitionInvitationRegistryByTenantUser({
                tenantId: tenant.id,
                tenantUserId,
                expectedStatus: 'pending',
                updates: {
                    status: 'cancelled',
                    cancellation_reason: 'staff_role_unavailable',
                    cancelled_at: now,
                    cancelled_by_user_id: null
                }
            });
            await DgfyAccountTenantMembership.update({ status: 'removed' }, {
                where: {
                    id: membership.id,
                    tenant_id: tenant.id,
                    tenant_user_id: tenantUserId,
                    source: 'invite',
                    status: 'pending'
                }
            });
        } catch (error) {
            logger.error('[DGFY] Defensive staff-role invitation cancellation sync failed', {
                tenant_id: tenant.id,
                tenant_user_id: tenantUserId,
                staff_role_id: staffRoleId,
                error_name: error?.name || 'Error'
            });
        }
        throw customRoleUnavailableError();
    }

    await landlordService.addEmailTenantMapping(email, tenant.id).catch(() => {});
    acceptedMembership = await DgfyAccountTenantMembership.findByPk(membership.id, {
        include: [{ association: 'tenant', attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id'] }]
    });
    return { membership: acceptedMembership, staffRoleAssigned: true };
};

const cancelOrphanedCustomStaffRoleInvitation = async ({ membership, tenant, tenantUser, sequelizeInstance }) => {
    const User = dbStore.get('User');
    const StaffRole = dbStore.get('StaffRole');
    const tenantUserId = parsePositiveInt(membership.tenant_user_id);
    const staffRoleId = parseStrictPositiveInt(tenantUser?.staff_role_id);
    const now = new Date();

    if (tenantUserId && staffRoleId) {
        const transaction = await sequelizeInstance.transaction();
        try {
            if (StaffRole) {
                await StaffRole.findByPk(staffRoleId, { transaction, lock: transaction.LOCK.UPDATE });
            }
            const user = await User.findByPk(tenantUserId, { transaction, lock: transaction.LOCK.UPDATE });
            if (user?.invitation_status === 'pending' && Number(user.staff_role_id) === staffRoleId) {
                await user.update({
                    invitation_token: null,
                    invitation_status: 'cancelled',
                    invitation_cancelled_at: now,
                    invitation_cancelled_by: null,
                    is_active: false
                }, { transaction });
            }
            await transaction.commit();
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            throw error;
        }
    }

    try {
        await landlordService.transitionInvitationRegistryByTenantUser({
            tenantId: tenant.id,
            tenantUserId,
            expectedStatus: 'pending',
            updates: {
                status: 'cancelled',
                cancellation_reason: 'staff_role_unavailable',
                cancelled_at: now,
                cancelled_by_user_id: null
            }
        });
    } catch (error) {
        logger.error('[DGFY] Orphaned staff-role invitation registry cancellation failed', {
            tenant_id: tenant.id,
            tenant_user_id: tenantUserId,
            staff_role_id: staffRoleId,
            error_name: error?.name || 'Error'
        });
    }

    try {
        await DgfyAccountTenantMembership.update({ status: 'removed' }, {
            where: {
                id: membership.id,
                tenant_id: tenant.id,
                tenant_user_id: tenantUserId,
                source: 'invite',
                status: 'pending'
            }
        });
    } catch (error) {
        logger.error('[DGFY] Orphaned staff-role membership cancellation failed', {
            tenant_id: tenant.id,
            tenant_user_id: tenantUserId,
            staff_role_id: staffRoleId,
            error_name: error?.name || 'Error'
        });
    }
};

export const dgfyAccountRepository = {
    transaction(callback) {
        return DgfyAccount.sequelize.transaction(callback);
    },

    findByEmail(email) {
        return DgfyAccount.findOne({
            where: {
                email: String(email || '').trim().toLowerCase(),
                deleted_at: null
            }
        });
    },

    findByPhone(phone) {
        return DgfyAccount.findOne({
            where: {
                phone: String(phone || '').trim(),
                deleted_at: null
            }
        });
    },

    findById(id, options = {}) {
        return DgfyAccount.findByPk(id, options);
    },

    async searchActiveAccounts(query, { tenantId = '' } = {}) {
        const normalized = normalizeSearch(query);
        if (normalized.length < 2) return [];

        const include = [];
        if (tenantId) {
            include.push({
                model: DgfyAccountTenantMembership,
                as: 'tenantMemberships',
                required: false,
                where: { tenant_id: tenantId }
            });
        }

        const accounts = await DgfyAccount.findAll({
            where: {
                is_active: true,
                deleted_at: null,
                [Op.or]: [
                    { email: { [Op.like]: `%${normalized.toLowerCase()}%` } },
                    { phone: { [Op.like]: `%${normalized}%` } },
                    { username: { [Op.like]: `%${normalized}%` } },
                    { first_name: { [Op.like]: `%${normalized}%` } },
                    { last_name: { [Op.like]: `%${normalized}%` } }
                ]
            },
            include,
            limit: 10,
            order: [['last_name', 'ASC'], ['first_name', 'ASC']]
        });

        return accounts.map((account) => {
            const membership = Array.isArray(account.tenantMemberships) ? account.tenantMemberships[0] : null;
            const membershipStatus = String(membership?.status || '').trim().toLowerCase() || null;
            return {
                dgfy_account_id: account.id,
                display_name: normalizeName(`${account.first_name || ''} ${account.middle_name || ''} ${account.last_name || ''}`),
                email: account.email,
                masked_phone: maskPhone(account.phone),
                account_status: 'active',
                membership_status: membershipStatus,
                already_connected: ['pending', 'accepted'].includes(membershipStatus)
            };
        });
    },

    findByAcceptedTenantUserMembership({ tenantId, tenantUserId }, options = {}) {
        const resolvedTenantId = String(tenantId || '').trim();
        const resolvedTenantUserId = parsePositiveInt(tenantUserId);
        if (!resolvedTenantId || !resolvedTenantUserId) return null;

        return DgfyAccount.findOne({
            where: {
                is_active: true,
                deleted_at: null
            },
            include: [{
                model: DgfyAccountTenantMembership,
                as: 'tenantMemberships',
                required: true,
                where: {
                    tenant_id: resolvedTenantId,
                    tenant_user_id: resolvedTenantUserId,
                    status: 'accepted'
                },
                attributes: ['id', 'tenant_id', 'tenant_user_id', 'role', 'status', 'source', 'accepted_at']
            }],
            ...options
        });
    },

    create(data, options = {}) {
        return DgfyAccount.create(data, options);
    },

    recordLegalAcknowledgement(payload, options = {}) {
        return DgfyLegalAcknowledgement.create(payload, options);
    },

    updateLastLogin(account) {
        if (!account) return null;
        return account.update({ last_login_at: new Date() });
    },

    markEmailVerified(account) {
        if (!account) return null;
        return account.update({
            email_verified_at: account.email_verified_at || new Date(),
            email_verification_source: account.email_verification_source || 'public_otp'
        });
    },

    updateProfile(account, data = {}) {
        if (!account) return null;
        return account.update(data);
    },

    updatePassword(account, passwordHash, extraUpdates = {}) {
        if (!account) return null;
        return account.update({ password_hash: passwordHash, ...extraUpdates });
    },

    async listAdminAccounts({
        status = 'all',
        verification = 'all',
        membership = 'all',
        search = '',
        page = 1,
        limit = 25
    } = {}) {
        const where = {};
        const normalizedStatus = String(status || 'all').trim().toLowerCase();
        const normalizedVerification = String(verification || 'all').trim().toLowerCase();
        const normalizedMembership = String(membership || 'all').trim().toLowerCase();
        const normalizedSearch = String(search || '').trim();

        if (normalizedStatus === 'deleted') {
            where.deleted_at = { [Op.ne]: null };
        } else {
            where.deleted_at = null;
        }
        if (normalizedStatus === 'active') where.is_active = true;
        if (normalizedStatus === 'suspended') where.is_active = false;
        if (normalizedVerification === 'verified') where.email_verified_at = { [Op.ne]: null };
        if (normalizedVerification === 'unverified') where.email_verified_at = null;
        if (normalizedSearch) {
            where[Op.or] = [
                { first_name: { [Op.like]: `%${normalizedSearch}%` } },
                { middle_name: { [Op.like]: `%${normalizedSearch}%` } },
                { last_name: { [Op.like]: `%${normalizedSearch}%` } },
                { username: { [Op.like]: `%${normalizedSearch}%` } },
                { email: { [Op.like]: `%${normalizedSearch.toLowerCase()}%` } },
                { phone: { [Op.like]: `%${normalizedSearch}%` } }
            ];
        }

        const include = [{
            model: DgfyAccountTenantMembership,
            as: 'tenantMemberships',
            required: normalizedMembership === 'has_membership',
            attributes: ['id', 'tenant_id', 'tenant_user_id', 'role', 'status', 'source', 'accepted_at', 'last_selected_at', 'created_at'],
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }]
        }];

        if (normalizedMembership === 'no_membership') {
            where['$tenantMemberships.id$'] = null;
        }

        const resolvedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
        const resolvedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 25, 1), 100);
        const result = await DgfyAccount.findAndCountAll({
            where,
            include,
            distinct: true,
            subQuery: false,
            limit: resolvedLimit,
            offset: (resolvedPage - 1) * resolvedLimit,
            order: [['created_at', 'DESC']]
        });

        return {
            rows: result.rows,
            count: result.count,
            page: resolvedPage,
            limit: resolvedLimit
        };
    },

    async getAdminAccountSummary() {
        const activeWhere = { deleted_at: null };
        const [total, active, suspended, deleted, verifiedEmail] = await Promise.all([
            DgfyAccount.count({ where: activeWhere }),
            DgfyAccount.count({ where: { ...activeWhere, is_active: true } }),
            DgfyAccount.count({ where: { ...activeWhere, is_active: false } }),
            DgfyAccount.count({ where: { deleted_at: { [Op.ne]: null } } }),
            DgfyAccount.count({ where: { ...activeWhere, email_verified_at: { [Op.ne]: null } } })
        ]);

        return {
            total,
            active,
            suspended,
            deleted,
            verified_email: verifiedEmail,
            unverified_email: Math.max(total - verifiedEmail, 0)
        };
    },

    findAccountForAdmin(id, options = {}) {
        return DgfyAccount.findByPk(id, {
            include: [{
                model: DgfyAccountTenantMembership,
                as: 'tenantMemberships',
                attributes: ['id', 'tenant_id', 'tenant_user_id', 'role', 'status', 'source', 'accepted_at', 'last_selected_at', 'created_at', 'updated_at'],
                include: [{
                    model: Tenant,
                    as: 'tenant',
                    attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
                }]
            }],
            ...options
        });
    },

    listAdminAuditLogs(dgfyAccountId, { limit = 20 } = {}) {
        return DgfyAccountAdminAuditLog.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            order: [['created_at', 'DESC']],
            limit: Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100)
        });
    },

    updateAdminProfile(account, data = {}, options = {}) {
        if (!account) return null;
        return account.update(data, options);
    },

    updateAdminLifecycle(account, isActive, options = {}) {
        if (!account) return null;
        return account.update({ is_active: Boolean(isActive) }, options);
    },

    deleteAdminAccount(account, payload = {}, options = {}) {
        if (!account) return null;
        return account.update(payload, options);
    },

    createAdminAuditLog(payload, options = {}) {
        return DgfyAccountAdminAuditLog.create(payload, options);
    },

    findActiveAdminAssignableAccount(id, options = {}) {
        return DgfyAccount.findOne({
            where: { id, is_active: true, deleted_at: null },
            ...options
        });
    },

    createBusinessAuditLog(payload, options = {}) {
        return DgfyAccountBusinessAuditLog.create(payload, options).catch((error) => {
            logger.warn('[DGFY] Business audit log write failed', {
                action: payload?.action,
                result: payload?.result,
                dgfy_account_id: payload?.dgfy_account_id,
                tenant_id: payload?.tenant_id,
                error: error?.message
            });
            return null;
        });
    },

    createBusinessAuditLogStrict(payload, options = {}) {
        return DgfyAccountBusinessAuditLog.create(payload, options);
    },

    createHandoff({ jti, dgfyAccountId, expiresAt }) {
        return DgfyAccountHandoff.create({
            jti,
            dgfy_account_id: dgfyAccountId,
            expires_at: expiresAt
        });
    },

    async consumeHandoff({ jti, dgfyAccountId }) {
        const [updatedCount] = await DgfyAccountHandoff.update(
            { consumed_at: new Date() },
            {
                where: {
                    jti,
                    dgfy_account_id: dgfyAccountId,
                    consumed_at: null,
                    expires_at: { [Op.gt]: new Date() }
                }
            }
        );
        if (updatedCount !== 1) return null;
        return DgfyAccountHandoff.findOne({ where: { jti, dgfy_account_id: dgfyAccountId } });
    },

    async mirrorPendingInvitationsForAccount(account, options = {}) {
        if (!account?.id || !account?.email) return [];

        const invitations = await UserInvitation.findAll({
            where: {
                email: normalizeEmail(account.email),
                status: 'pending',
                expires_at: { [Op.gt]: new Date() }
            },
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }],
            ...options
        });

        const mirrored = [];
        for (const invitation of invitations) {
            if (!invitation.tenant || invitation.tenant.status !== 'active') continue;
            const membership = await this.upsertInvitationMembership({
                dgfyAccountId: account.id,
                tenantId: invitation.tenant_id,
                tenantUserId: invitation.tenant_user_id,
                role: invitation.role
            }, options);
            mirrored.push(membership);
        }
        return mirrored;
    },

    // Affiliate twin of mirrorPendingInvitationsForAccount: when a brand-new account is created,
    // auto-enroll it into any store that had a pending affiliate invite for this email. Delegates to
    // the affiliate repository (same dgfy module) so all invite/enrollment DB logic lives in one place.
    async mirrorPendingAffiliateInvitesForAccount(account, options = {}) {
        return dgfyAffiliateRepository.mirrorPendingAffiliateInvitesForAccount(account, options);
    },

    async mirrorLegacyFounderMembershipsForAccount(account, options = {}) {
        if (!account?.id || !account?.email || !account?.email_verified_at) return [];

        const email = normalizeEmail(account.email);
        const mappings = await UserTenantMapping.findAll({
            where: { email },
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'db_name', 'owner_dgfy_account_id']
            }],
            ...options
        });

        const mirrored = [];
        for (const mapping of mappings) {
            const tenant = mapping.tenant;
            if (!tenant || tenant.status !== 'active') continue;

            // Explicit membership rows are authoritative. The legacy mirror is only
            // allowed to create a missing founder membership; it must never resurrect
            // a membership that an account owner previously removed or declined.
            const existingMembership = await DgfyAccountTenantMembership.findOne({
                where: {
                    dgfy_account_id: account.id,
                    tenant_id: tenant.id
                },
                attributes: ['id', 'status', 'source'],
                ...options
            });
            if (existingMembership) continue;

            try {
                const sequelizeInstance = await tenantConnector.getConnection(tenant);
                const tenantModels = getTenantModels(sequelizeInstance);
                const User = tenantModels.User;
                const user = await User.findOne({ where: { email } });

                if (!user || normalizeEmail(user.email) !== email) continue;
                if (!user.is_active || user.deleted_at || user.is_master_admin !== true) continue;

                const membership = await this.upsertFounderMembership({
                    dgfyAccountId: account.id,
                    tenantId: tenant.id,
                    tenantUserId: user.user_id,
                    role: user.role || 'admin'
                }, options);
                if (!tenant.owner_dgfy_account_id) {
                    await tenant.update({ owner_dgfy_account_id: account.id }).catch(() => {});
                }
                mirrored.push(membership);
            } catch (error) {
                logger.warn('[DGFY] Legacy founder membership mirror skipped', {
                    dgfy_account_id: account.id,
                    tenant_id: tenant.id,
                    email,
                    error: error?.message
                });
            }
        }

        return mirrored;
    },

    upsertFounderMembership({
        dgfyAccountId,
        tenantId,
        tenantUserId,
        role = 'admin'
    }, options = {}) {
        return DgfyAccountTenantMembership.findOrCreate({
            where: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId
            },
            defaults: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId,
                tenant_user_id: tenantUserId || null,
                role,
                status: 'accepted',
                source: 'founder',
                accepted_at: new Date()
            },
            ...options
        }).then(async ([membership, created]) => {
            if (!created) {
                await membership.update({
                    tenant_user_id: tenantUserId || membership.tenant_user_id,
                    role,
                    status: 'accepted',
                    source: 'founder',
                    accepted_at: membership.accepted_at || new Date()
                }, options);
            }
            const tenant = await Tenant.findByPk(tenantId).catch(() => null);
            if (tenant && !tenant.owner_dgfy_account_id) {
                await tenant.update({ owner_dgfy_account_id: dgfyAccountId }, options).catch(() => {});
            }
            return membership.reload(options);
        });
    },

    upsertPendingFounderMembership({ dgfyAccountId, tenantId, role = 'admin' }, options = {}) {
        return DgfyAccountTenantMembership.findOrCreate({
            where: { dgfy_account_id: dgfyAccountId, tenant_id: tenantId },
            defaults: { dgfy_account_id: dgfyAccountId, tenant_id: tenantId, tenant_user_id: null, role, status: 'pending', source: 'founder' },
            ...options
        }).then(async ([membership]) => {
            if (membership.status !== 'accepted') await membership.update({ role, status: 'pending', source: 'founder', tenant_user_id: null }, options);
            return membership.reload(options);
        });
    },

    async upsertInvitationMembership({
        dgfyAccountId,
        tenantId,
        tenantUserId,
        role = 'staff'
    }, options = {}) {
        const [membership, created] = await DgfyAccountTenantMembership.findOrCreate({
            where: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId
            },
            defaults: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId,
                tenant_user_id: tenantUserId || null,
                role,
                status: 'pending',
                source: 'invite'
            },
            ...options
        });

        if (!created && membership.status !== 'accepted') {
            await membership.update({
                tenant_user_id: tenantUserId || membership.tenant_user_id,
                role,
                status: 'pending',
                source: 'invite',
                accepted_at: null
            }, options);
        }

        return membership.reload(options);
    },

    async upsertAcceptedLegacyMembership({
        dgfyAccountId,
        tenantId,
        tenantUserId,
        role = 'staff',
        source = 'invite'
    }, options = {}) {
        const now = new Date();
        const [membership] = await DgfyAccountTenantMembership.findOrCreate({
            where: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId
            },
            defaults: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId,
                tenant_user_id: tenantUserId || null,
                role,
                status: 'accepted',
                source,
                accepted_at: now
            },
            ...options
        });

        await membership.update({
            tenant_user_id: tenantUserId || membership.tenant_user_id,
            role,
            status: 'accepted',
            source,
            accepted_at: membership.accepted_at || now
        }, options);

        return membership.reload({
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }],
            ...options
        });
    },

    async createInvitationForDgfyAccount({
        dgfyAccountId,
        tenant,
        adminUser,
        role = 'staff',
        rolePresetKey = null,
        staffRoleId = null,
        permissions = [],
        locationIds = []
    }) {
        if (!tenant?.id || !tenant?.company_token) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Tenant context is required for DGFY invitation.', { statusCode: 400 });
        }

        const account = await DgfyAccount.findOne({
            where: { id: dgfyAccountId, is_active: true, deleted_at: null }
        });
        if (!account) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Active DGFY account not found.', { statusCode: 404 });
        }

        const existingMembership = await DgfyAccountTenantMembership.findOne({
            where: {
                dgfy_account_id: account.id,
                tenant_id: tenant.id
            }
        });
        if (existingMembership && ['pending', 'accepted'].includes(String(existingMembership.status || '').toLowerCase())) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'This DGFY account is already connected or invited to this company.', { statusCode: 409 });
        }

        const sequelizeInstance = await tenantConnector.getConnection(tenant);
        const tenantModels = getTenantModels(sequelizeInstance);
        const context = {
            sequelize: sequelizeInstance,
            tenantId: tenant.id,
            tenantToken: tenant.company_token,
            tenantName: tenant.name,
            tenantPlan: tenant.plan,
            ...tenantModels
        };

        await ensureTenantUserInvitationSchema(sequelizeInstance);

        return dbStore.run(context, async () => {
            const User = dbStore.get('User');
            const UserLocationGrant = dbStore.get('UserLocationGrant');
            const TenantLocation = dbStore.get('TenantLocation');
            const StaffRole = dbStore.get('StaffRole');
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            let user;
            let membership;
            let membershipCreated = false;
            let membershipWriteAttempted = false;
            let registryWriteAttempted = false;
            let previousRegistry = null;
            const previousMembershipState = existingMembership?.get
                ? existingMembership.get({ plain: true })
                : existingMembership;
            const hasCustomStaffRole = staffRoleId !== null && staffRoleId !== undefined;
            const normalizedStaffRoleId = hasCustomStaffRole ? parseStrictPositiveInt(staffRoleId) : null;
            const requestedLocationIds = Array.isArray(locationIds) ? locationIds : [];
            if (hasCustomStaffRole && !normalizedStaffRoleId) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'staff_role_id must be a positive integer.', { statusCode: 422 });
            }
            const numericLocationIds = requestedLocationIds.map((id) => Number(id));
            if (hasCustomStaffRole && (numericLocationIds.length === 0 || numericLocationIds.some((id) => !Number.isInteger(id) || id <= 0))) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Custom staff-role invitations require at least one valid active store location.', { statusCode: 422 });
            }
            const normalizedLocationIds = Array.from(new Set((hasCustomStaffRole ? numericLocationIds : requestedLocationIds
                .map((id) => Number.parseInt(id, 10)))
                .filter((id) => Number.isInteger(id) && id > 0)));
            let staffRole = null;
            const transaction = await sequelizeInstance.transaction();

            try {
                if (normalizedStaffRoleId) {
                    if (!StaffRole) {
                        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Custom staff roles are not available for this company.', { statusCode: 404 });
                    }
                    staffRole = await StaffRole.findByPk(normalizedStaffRoleId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (!staffRole || !staffRole.is_active) {
                        throw new DomainError(DomainErrorCode.CONFLICT, 'The selected staff role is no longer available. Refresh roles and choose an active role.', { statusCode: 409 });
                    }
                }

                if (normalizedLocationIds.length > 0) {
                    const activeLocationCount = await TenantLocation.count({
                        where: {
                            location_id: { [Op.in]: normalizedLocationIds },
                            is_active: true
                        },
                        transaction
                    });
                    if (activeLocationCount !== normalizedLocationIds.length) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            'Every invited user location must exist and be active in this company.',
                            { statusCode: 422 }
                        );
                    }
                }

                if (normalizedStaffRoleId && !UserLocationGrant) {
                    throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Location grants are not available for this company.', { statusCode: 500 });
                }

                user = await User.findOne({
                    where: { email: normalizeEmail(account.email) },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const username = await buildUniqueUsername(User, account.first_name, user?.user_id || null, { transaction });
                const payload = {
                    username,
                    email: normalizeEmail(account.email),
                    phone_number: normalizePhoneNumber(account.phone),
                    password_hash: user?.password_hash || INERT_TENANT_DGFY_HASH,
                    role: staffRole ? 'staff' : role,
                    role_preset_key: staffRole ? null : (rolePresetKey || null),
                    staff_role_id: staffRole?.staff_role_id || null,
                    permissions: staffRole ? [] : (Array.isArray(permissions) && permissions.length > 0 ? permissions : (DEFAULT_ROLE_PERMISSIONS[role] || [])),
                    permission_mode: staffRole ? 'inherit' : 'custom',
                    is_active: false,
                    invitation_token: null,
                    invitation_expires_at: expiresAt,
                    invited_by: adminUser?.user_id || null,
                    invitation_status: 'pending',
                    invitation_delivery_status: 'not_configured',
                    invitation_delivery_error: null,
                    invitation_last_sent_at: null,
                    invitation_accepted_at: null,
                    invitation_cancelled_at: null,
                    invitation_cancelled_by: null,
                    deleted_at: null,
                    deleted_by: null
                };
                if (user) {
                    await user.update(payload, { transaction });
                } else {
                    user = await User.create(payload, { transaction });
                }

                if (UserLocationGrant) {
                    await UserLocationGrant.destroy({ where: { user_id: user.user_id }, transaction });
                    if (normalizedLocationIds.length > 0) {
                        await UserLocationGrant.bulkCreate(normalizedLocationIds.map((locationId) => ({
                            user_id: user.user_id,
                            location_id: locationId,
                            created_by: adminUser?.user_id || null
                        })), { transaction });
                    }
                }

                previousRegistry = await landlordService.findInvitationRegistryByTenantUser({
                    tenantId: tenant.id,
                    tenantUserId: user.user_id
                });
                const [resolvedMembership, created] = await DgfyAccountTenantMembership.findOrCreate({
                    where: {
                        dgfy_account_id: account.id,
                        tenant_id: tenant.id
                    },
                    defaults: {
                        dgfy_account_id: account.id,
                        tenant_id: tenant.id,
                        tenant_user_id: user.user_id,
                        role,
                        status: 'pending',
                        source: 'invite'
                    }
                });
                membership = resolvedMembership;
                membershipCreated = created;
                membershipWriteAttempted = true;
                await membership.update({
                    tenant_user_id: user.user_id,
                    role,
                    status: 'pending',
                    source: 'invite',
                    accepted_at: null
                });

                registryWriteAttempted = true;
                await landlordService.upsertUserInvitationRegistry({
                    tenantId: tenant.id,
                    tenantUserId: user.user_id,
                    email: normalizeEmail(account.email),
                    role,
                    token: `${membership.id}:${account.id}:${tenant.id}`,
                    status: 'pending',
                    deliveryStatus: 'not_configured',
                    staffRoleId: staffRole?.staff_role_id || null,
                    staffRoleName: staffRole?.name || null,
                    cancellationReason: null,
                    invitedByUserId: adminUser?.user_id || null,
                    invitedByName: adminUser?.username || null,
                    expiresAt
                });
                await transaction.commit();
            } catch (error) {
                if (!transaction.finished) await transaction.rollback();
                try {
                    if (membershipWriteAttempted && membership) {
                        if (membershipCreated) {
                            await membership.destroy();
                        } else if (previousMembershipState) {
                            await membership.update({
                                tenant_user_id: previousMembershipState.tenant_user_id,
                                role: previousMembershipState.role,
                                status: previousMembershipState.status,
                                source: previousMembershipState.source,
                                accepted_at: previousMembershipState.accepted_at
                            });
                        }
                    }
                    if (registryWriteAttempted && user?.user_id) {
                        if (previousRegistry) {
                            await previousRegistry.update({
                                email: previousRegistry.email,
                                role: previousRegistry.role,
                                staff_role_id: previousRegistry.staff_role_id,
                                staff_role_name: previousRegistry.staff_role_name,
                                cancellation_reason: previousRegistry.cancellation_reason,
                                token_hash: previousRegistry.token_hash,
                                status: previousRegistry.status,
                                delivery_status: previousRegistry.delivery_status,
                                delivery_error: previousRegistry.delivery_error,
                                invited_by_user_id: previousRegistry.invited_by_user_id,
                                invited_by_name: previousRegistry.invited_by_name,
                                expires_at: previousRegistry.expires_at,
                                last_sent_at: previousRegistry.last_sent_at,
                                accepted_at: previousRegistry.accepted_at,
                                cancelled_at: previousRegistry.cancelled_at,
                                cancelled_by_user_id: previousRegistry.cancelled_by_user_id
                            });
                        } else {
                            await landlordService.deleteInvitationRegistryByTenantUser({
                                tenantId: tenant.id,
                                tenantUserId: user.user_id
                            });
                        }
                    }
                } catch (compensationError) {
                    logger.error('[DGFY] Invitation compensation failed after landlord write failure', {
                        tenant_id: tenant.id,
                        tenant_user_id: user?.user_id || null,
                        dgfy_account_id: account.id,
                        error_name: compensationError?.name || 'Error'
                    });
                }
                throw error;
            }

            return {
                account,
                tenantUser: user,
                membership: await membership.reload({
                    include: [{
                        model: Tenant,
                        as: 'tenant',
                        attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
                    }]
                })
            };
        });
    },

    async getTenantWorkflowMode(tenant) {
        if (!tenant?.id || !tenant?.company_token) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Tenant context is required to resolve the company role catalog.',
                { statusCode: 400 }
            );
        }

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
            const SystemSetting = dbStore.get('SystemSetting');
            if (!SystemSetting) return DEFAULT_WORKFLOW_MODE;
            const setting = await SystemSetting.findOne({
                where: { setting_key: WORKFLOW_MODE_SETTING_KEY },
                attributes: ['setting_key', 'setting_value', 'data_type']
            }).catch(() => null);
            return parseWorkflowModeSetting(setting);
        });
    },

    findMembershipById(id, options = {}) {
        return DgfyAccountTenantMembership.findByPk(id, options);
    },

    findMembershipForAccount({ dgfyAccountId, tenantId, status = null }, options = {}) {
        const where = {
            dgfy_account_id: dgfyAccountId,
            tenant_id: tenantId
        };
        if (status) where.status = status;
        return DgfyAccountTenantMembership.findOne({
            where,
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }],
            ...options
        });
    },

    async acceptInvitationMembership({ membership, account }) {
        const tenant = membership?.tenant;
        if (!tenant || !tenant.company_token || tenant.status !== 'active') {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Company is not available for invitation acceptance.',
                { statusCode: 403 }
            );
        }

        const sequelizeInstance = await tenantConnector.getConnection(tenant);
        const tenantModels = getTenantModels(sequelizeInstance);
        const context = {
            sequelize: sequelizeInstance,
            tenantId: tenant.id,
            tenantToken: tenant.company_token,
            tenantName: tenant.name,
            tenantPlan: tenant.plan,
            ...tenantModels
        };

        await ensureTenantUserInvitationSchema(sequelizeInstance);

        return dbStore.run(context, async () => {
            const User = dbStore.get('User');
            const invitationRegistry = await landlordService.findInvitationRegistryByTenantUser({
                tenantId: tenant.id,
                tenantUserId: membership.tenant_user_id
            });
            const tenantInvitation = membership.tenant_user_id
                ? await User.findByPk(membership.tenant_user_id, {
                    attributes: ['user_id', 'staff_role_id', 'invitation_status']
                })
                : null;
            const registryStaffRoleId = invitationRegistry?.staff_role_id == null
                ? null
                : parseStrictPositiveInt(invitationRegistry.staff_role_id);
            const tenantStaffRoleId = parseStrictPositiveInt(tenantInvitation?.staff_role_id);
            if (registryStaffRoleId) {
                return acceptCustomStaffRoleInvitation({
                    membership,
                    account,
                    tenant,
                    registry: invitationRegistry,
                    sequelizeInstance
                });
            }
            if (tenantStaffRoleId) {
                await cancelOrphanedCustomStaffRoleInvitation({
                    membership,
                    tenant,
                    tenantUser: tenantInvitation,
                    sequelizeInstance
                });
                throw customRoleUnavailableError();
            }

            const tenantUserId = parsePositiveInt(membership.tenant_user_id);
            const role = String(membership.role || 'staff').trim().toLowerCase() || 'staff';
            const email = normalizeEmail(account.email);
            const phone = normalizePhoneNumber(account.phone);
            const tenantTransaction = await sequelizeInstance.transaction();
            const now = new Date();

            let user;
            try {
                const username = await buildUniqueUsername(User, account.first_name, tenantUserId, { transaction: tenantTransaction });

                user = tenantUserId ? await User.findByPk(tenantUserId, { transaction: tenantTransaction, lock: tenantTransaction.LOCK.UPDATE }) : null;
                if (tenantUserId && !user) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'The invited company role is no longer available. Ask a company administrator to send a new invitation.',
                        { statusCode: 409 }
                    );
                }
                if (!tenantUserId) {
                    user = await User.findOne({ where: { email }, transaction: tenantTransaction });
                }

                if (user && normalizeEmail(user.email) !== email) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Invitation tenant user does not match the DGFY account email.',
                        { statusCode: 409 }
                    );
                }

                if (user && user.invitation_status && user.invitation_status !== 'pending') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Only pending invitations can be accepted. Ask a company administrator to send a new invitation.',
                        { statusCode: 409 }
                    );
                }
                if (user?.staff_role_id !== null && user?.staff_role_id !== undefined) {
                    throw customRoleUnavailableError();
                }

                if (user) {
                    const resolvedRole = user.role || role;
                    await user.update({
                        username,
                        email,
                        phone_number: phone,
                        role: resolvedRole,
                        permissions: user.permissions || DEFAULT_ROLE_PERMISSIONS[resolvedRole] || [],
                        permission_mode: user.permission_mode || 'custom',
                        is_active: true,
                        invitation_token: null,
                        invitation_status: 'accepted',
                        invitation_accepted_at: now
                    }, { transaction: tenantTransaction });
                } else {
                    user = await User.create({
                        username,
                        email,
                        phone_number: phone,
                        password_hash: INERT_TENANT_DGFY_HASH,
                        role,
                        permissions: DEFAULT_ROLE_PERMISSIONS[role] || [],
                        permission_mode: 'custom',
                        is_active: true,
                        invitation_status: 'accepted',
                        invitation_accepted_at: now
                    }, { transaction: tenantTransaction });
                }

                await tenantTransaction.commit();
            } catch (error) {
                await tenantTransaction.rollback();
                throw error;
            }

            await landlordService.addEmailTenantMapping(email, tenant.id).catch(() => {});
            await landlordService.updateInvitationRegistryByTenantUser({
                tenantId: tenant.id,
                tenantUserId: user.user_id,
                updates: {
                    status: 'accepted',
                    accepted_at: now
                }
            }).catch(() => {});

            await membership.update({
                tenant_user_id: user.user_id,
                status: 'accepted',
                accepted_at: now
            });

            return membership.reload({
                include: [{
                    association: 'tenant',
                    attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
                }]
            });
        });
    },

    async declineInvitationMembership({ membership }) {
        const now = new Date();
        if (membership?.tenant_id && membership?.tenant_user_id) {
            await landlordService.updateInvitationRegistryByTenantUser({
                tenantId: membership.tenant_id,
                tenantUserId: membership.tenant_user_id,
                updates: {
                    status: 'declined',
                    cancelled_at: now
                }
            }).catch(() => {});
        }
        if (membership?.tenant?.company_token && membership.tenant_user_id) {
            const sequelizeInstance = await tenantConnector.getConnection(membership.tenant);
            const tenantModels = getTenantModels(sequelizeInstance);
            await ensureTenantUserInvitationSchema(sequelizeInstance);
            await dbStore.run({
                sequelize: sequelizeInstance,
                tenantId: membership.tenant.id,
                tenantToken: membership.tenant.company_token,
                tenantName: membership.tenant.name,
                tenantPlan: membership.tenant.plan,
                ...tenantModels
            }, async () => {
                const User = dbStore.get('User');
                const user = await User.findByPk(membership.tenant_user_id).catch(() => null);
                if (user && user.invitation_status === 'pending') {
                    await user.update({
                        invitation_status: 'declined',
                        invitation_cancelled_at: now
                    });
                }
            });
        }
        await membership.update({ status: 'declined' });
        return membership.reload({
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }]
        });
    },

    async leaveMembership({ membership }) {
        if (!membership) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Company membership not found.', { statusCode: 404 });
        }
        const tenant = membership.tenant;
        if (membershipIsCurrentOwner(membership)) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Company owners must transfer ownership before leaving.', { statusCode: 403 });
        }

        if (tenant?.company_token && membership.tenant_user_id) {
            const sequelizeInstance = await tenantConnector.getConnection(tenant);
            const tenantModels = getTenantModels(sequelizeInstance);
            await dbStore.run({
                sequelize: sequelizeInstance,
                tenantId: tenant.id,
                tenantToken: tenant.company_token,
                tenantName: tenant.name,
                tenantPlan: tenant.plan,
                ...tenantModels
            }, async () => {
                const User = dbStore.get('User');
                const user = await User.findByPk(membership.tenant_user_id).catch(() => null);
                if (user) {
                    await user.update({
                        is_active: false,
                        deleted_at: new Date()
                    });
                }
            });
        }

        await membership.update({ status: 'removed' });
        return membership.reload({
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }]
        });
    },

    async transferTenantOwnership({ tenant, fromAccountId, toAccountId }) {
        await tenant.update({
            owner_dgfy_account_id: toAccountId,
            ownership_status: 'claimed',
            ownership_transferred_by: fromAccountId,
            ownership_transferred_at: new Date()
        });
        const previousOwnerMembership = await DgfyAccountTenantMembership.findOne({
            where: {
                dgfy_account_id: fromAccountId,
                tenant_id: tenant.id,
                status: 'accepted'
            }
        });
        if (previousOwnerMembership) {
            await previousOwnerMembership.update({ source: 'invite' });
        }
        const targetMembership = await DgfyAccountTenantMembership.findOne({
            where: {
                dgfy_account_id: toAccountId,
                tenant_id: tenant.id,
                status: 'accepted'
            }
        });
        if (targetMembership) {
            await targetMembership.update({ source: 'founder' });
        }
        return tenant.reload();
    },

    async removeMembershipForAccount({ dgfyAccountId, tenantId }, options = {}) {
        const membership = await DgfyAccountTenantMembership.findOne({
            where: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId,
                status: 'accepted'
            },
            ...options
        });
        if (!membership) return null;

        await membership.update({ status: 'removed' }, options);
        return membership.reload({
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }],
            ...options
        });
    },

    async removeMembershipForTenantUser({ tenantId, tenantUserId }, options = {}) {
        const [updatedCount] = await DgfyAccountTenantMembership.update(
            { status: 'removed' },
            {
                where: {
                    tenant_id: tenantId,
                    tenant_user_id: tenantUserId,
                    status: { [Op.in]: ['pending', 'accepted'] }
                },
                ...options
            }
        );

        return updatedCount;
    },

    async forceAssignTenantOwnership({ tenant, toAccountId, tenantUserId = null, role = 'admin', actorAccountId = null }, options = {}) {
        await tenant.update({
            owner_dgfy_account_id: toAccountId,
            ownership_status: 'claimed',
            ownership_transferred_by: actorAccountId || null,
            ownership_transferred_at: new Date()
        }, options);
        await DgfyAccountTenantMembership.update(
            { source: 'invite' },
            {
                where: {
                    tenant_id: tenant.id,
                    source: 'founder',
                    dgfy_account_id: { [Op.ne]: toAccountId }
                },
                ...options
            }
        );
        const [membership] = await DgfyAccountTenantMembership.findOrCreate({
            where: {
                dgfy_account_id: toAccountId,
                tenant_id: tenant.id
            },
            defaults: {
                dgfy_account_id: toAccountId,
                tenant_id: tenant.id,
                tenant_user_id: tenantUserId || null,
                role,
                status: 'accepted',
                source: 'admin_handover',
                accepted_at: new Date()
            },
            ...options
        });
        await membership.update({
            tenant_user_id: tenantUserId || membership.tenant_user_id,
            role,
            status: 'accepted',
            source: 'admin_handover',
            accepted_at: membership.accepted_at || new Date()
        }, options);
        return membership.reload(options);
    },

    listMemberships(dgfyAccountId) {
        return DgfyAccountTenantMembership.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'owner_dgfy_account_id']
            }],
            order: [
                ['last_selected_at', 'DESC'],
                ['updated_at', 'DESC'],
                ['created_at', 'DESC']
            ]
        });
    },

    listRegistrationApplications(dgfyAccountId) {
        return CompanyRegistrationApplication.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'status', 'rejection_reason']
            }],
            order: [['updated_at', 'DESC']]
        });
    },

    updateMembershipLastSelected(membership, options = {}) {
        if (!membership) return null;
        return membership.update({ last_selected_at: new Date() }, options);
    },

    markBusinessStepUpVerified(account, verifiedAt = new Date(), options = {}) {
        if (!account) return null;
        return account.update({ business_step_up_verified_at: verifiedAt }, options);
    }
};

export default dgfyAccountRepository;
