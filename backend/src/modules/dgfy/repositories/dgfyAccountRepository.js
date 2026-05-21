import { Op } from 'sequelize';
import { DgfyAccount, DgfyAccountTenantMembership, Tenant, UserInvitation } from '../../../models/index.js';
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
    findByEmail(email) {
        return DgfyAccount.findOne({
            where: { email: String(email || '').trim().toLowerCase() }
        });
    },

    findByPhone(phone) {
        return DgfyAccount.findOne({
            where: { phone: String(phone || '').trim() }
        });
    },

    findById(id, options = {}) {
        return DgfyAccount.findByPk(id, options);
    },

    create(data, options = {}) {
        return DgfyAccount.create(data, options);
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

    async mirrorPendingInvitationsForAccount(account) {
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
            }]
        });

        const mirrored = [];
        for (const invitation of invitations) {
            if (!invitation.tenant || invitation.tenant.status !== 'active') continue;
            const membership = await this.upsertInvitationMembership({
                dgfyAccountId: account.id,
                tenantId: invitation.tenant_id,
                tenantUserId: invitation.tenant_user_id,
                role: invitation.role
            });
            mirrored.push(membership);
        }
        return mirrored;
    },

    upsertFounderMembership({
        dgfyAccountId,
        tenantId,
        tenantUserId,
        role = 'admin'
    }) {
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
            }
        }).then(async ([membership, created]) => {
            if (!created) {
                await membership.update({
                    tenant_user_id: tenantUserId || membership.tenant_user_id,
                    role,
                    status: 'accepted',
                    source: 'founder',
                    accepted_at: membership.accepted_at || new Date()
                });
            }
            return membership.reload();
        });
    },

    async upsertInvitationMembership({
        dgfyAccountId,
        tenantId,
        tenantUserId,
        role = 'staff'
    }) {
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
            }
        });

        if (!created && membership.status !== 'accepted') {
            await membership.update({
                tenant_user_id: tenantUserId || membership.tenant_user_id,
                role,
                status: 'pending',
                source: 'invite',
                accepted_at: null
            });
        }

        return membership.reload();
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
