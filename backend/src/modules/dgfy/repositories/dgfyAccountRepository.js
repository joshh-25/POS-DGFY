import { Op } from 'sequelize';
import {
    DgfyAccount,
    DgfyAccountAdminAuditLog,
    DgfyAccountHandoff,
    DgfyAccountTenantMembership,
    DgfyLegalAcknowledgement,
    Tenant,
    UserInvitation
} from '../../../models/index.js';
import dbStore from '../../../utils/dbStore.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import * as landlordService from '../../../services/landlordService.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../../../config/permissions.js';
import { normalizePhoneNumber } from '../../../utils/phoneNumber.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

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
        return account.update({ email_verified_at: account.email_verified_at || new Date() });
    },

    updateProfile(account, data = {}) {
        if (!account) return null;
        return account.update(data);
    },

    updatePassword(account, passwordHash) {
        if (!account) return null;
        return account.update({ password_hash: passwordHash });
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
            attributes: ['id', 'tenant_id', 'tenant_user_id', 'role', 'status', 'source', 'accepted_at', 'created_at'],
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan']
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
                attributes: ['id', 'tenant_id', 'tenant_user_id', 'role', 'status', 'source', 'accepted_at', 'created_at', 'updated_at'],
                include: [{
                    model: Tenant,
                    as: 'tenant',
                    attributes: ['id', 'name', 'company_token', 'status', 'plan']
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
                attributes: ['id', 'name', 'company_token', 'status', 'plan']
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

    findMembershipById(id, options = {}) {
        return DgfyAccountTenantMembership.findByPk(id, options);
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

        return dbStore.run(context, async () => {
            const User = dbStore.get('User');
            const tenantUserId = parsePositiveInt(membership.tenant_user_id);
            const role = String(membership.role || 'staff').trim().toLowerCase() || 'staff';
            const email = normalizeEmail(account.email);
            const phone = normalizePhoneNumber(account.phone);
            const tenantTransaction = await sequelizeInstance.transaction();
            const now = new Date();

            let user;
            try {
                const username = await buildUniqueUsername(User, account.first_name, tenantUserId, { transaction: tenantTransaction });

                user = tenantUserId ? await User.findByPk(tenantUserId, { transaction: tenantTransaction }) : null;
                if (!user) {
                    user = await User.findOne({ where: { email }, transaction: tenantTransaction });
                }

                if (user && normalizeEmail(user.email) !== email) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Invitation tenant user does not match the DGFY account email.',
                        { statusCode: 409 }
                    );
                }

                if (user) {
                    const resolvedRole = user.role || role;
                    await user.update({
                        username,
                        email,
                        phone_number: phone,
                        role: resolvedRole,
                        permissions: user.permissions || DEFAULT_ROLE_PERMISSIONS[resolvedRole] || [],
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
                        password_hash: account.password_hash,
                        role,
                        permissions: DEFAULT_ROLE_PERMISSIONS[role] || [],
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
                    attributes: ['id', 'name', 'company_token', 'status', 'plan']
                }]
            });
        });
    },

    listMemberships(dgfyAccountId) {
        return DgfyAccountTenantMembership.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            include: [{
                model: Tenant,
                as: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan']
            }],
            order: [['created_at', 'DESC']]
        });
    }
};

export default dgfyAccountRepository;
