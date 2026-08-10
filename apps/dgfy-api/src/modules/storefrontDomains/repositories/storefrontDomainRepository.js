import {
    StorefrontCustomDomain,
    StorefrontCustomDomainAuditLog,
    StorefrontCustomDomainOperation,
    StorefrontDiscoveryIndex,
    Tenant,
    sequelize
} from '../../../models/index.js';
import { Op } from 'sequelize';

const toPlain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : value;

export const storefrontDomainRepository = {
    findTenantById(tenantId, options = {}) {
        return Tenant.findByPk(tenantId, options);
    },

    listByTenant(tenantId) {
        return StorefrontCustomDomain.findAll({
            where: { tenant_id: tenantId },
            order: [['created_at', 'DESC']]
        });
    },

    listOperationsByTenant(tenantId, limit = 50) {
        return StorefrontCustomDomainOperation.findAll({
            where: { tenant_id: tenantId },
            order: [['created_at', 'DESC']],
            limit: Math.min(Math.max(Number(limit) || 50, 1), 100)
        });
    },

    listDomainsForMaintenance() {
        return StorefrontCustomDomain.findAll({
            where: {
                status: { [Op.in]: ['active', 'eligibility_grace'] }
            },
            order: [['tenant_id', 'ASC'], ['created_at', 'ASC']]
        });
    },

    findByIdForTenant(domainId, tenantId, options = {}) {
        return StorefrontCustomDomain.findOne({
            where: { id: domainId, tenant_id: tenantId },
            ...options
        });
    },

    findByHostname(hostname, options = {}) {
        return StorefrontCustomDomain.findOne({ where: { hostname }, ...options });
    },

    findCanonicalByTenant(tenantId, options = {}) {
        return StorefrontCustomDomain.findOne({
            where: {
                tenant_id: tenantId,
                role: 'canonical',
                status: { [Op.ne]: 'removed' }
            },
            ...options
        });
    },

    countAliasesByTenant(tenantId, options = {}) {
        return StorefrontCustomDomain.count({
            where: {
                tenant_id: tenantId,
                role: 'alias',
                status: { [Op.ne]: 'removed' }
            },
            ...options
        });
    },

    repointAliases(tenantId, canonicalDomainId, previousCanonicalDomainId, options = {}) {
        return StorefrontCustomDomain.update(
            { canonical_domain_id: canonicalDomainId },
            {
                where: {
                    tenant_id: tenantId,
                    role: 'alias',
                    canonical_domain_id: previousCanonicalDomainId,
                    status: { [Op.ne]: 'removed' }
                },
                ...options
            }
        );
    },

    create(values, options = {}) {
        return StorefrontCustomDomain.create(values, options);
    },

    createAudit(values, options = {}) {
        return StorefrontCustomDomainAuditLog.create(values, options);
    },

    createOperation(values, options = {}) {
        return StorefrontCustomDomainOperation.create(values, options);
    },

    findOperationByIdempotencyKey(idempotencyKey, options = {}) {
        return StorefrontCustomDomainOperation.findOne({
            where: { idempotency_key: idempotencyKey },
            ...options
        });
    },

    findOperationById(operationId, options = {}) {
        return StorefrontCustomDomainOperation.findByPk(operationId, options);
    },

    transaction(callback) {
        return sequelize.transaction(callback);
    },

    async resolveActiveByHostname(hostname) {
        const domain = await StorefrontCustomDomain.findOne({
            where: { hostname, status: { [Op.in]: ['active', 'eligibility_grace'] } }
        });
        if (!domain) return null;

        const [tenant, discovery, canonicalDomain] = await Promise.all([
            Tenant.findOne({
                where: { id: domain.tenant_id, status: 'active' },
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'subscription_status']
            }),
            StorefrontDiscoveryIndex.findOne({
                where: { tenant_id: domain.tenant_id, is_visible: true },
                attributes: ['tenant_id', 'tenant_name', 'tenant_company_token', 'slug', 'storefront_open']
            }),
            domain.role === 'alias' && domain.canonical_domain_id
                ? StorefrontCustomDomain.findOne({
                    where: {
                        id: domain.canonical_domain_id,
                        tenant_id: domain.tenant_id,
                        role: 'canonical',
                        status: { [Op.in]: ['active', 'eligibility_grace'] }
                    },
                    attributes: ['id', 'hostname', 'status']
                })
                : null
        ]);
        if (!tenant || !discovery || (domain.role === 'alias' && !canonicalDomain)) return null;

        return {
            domain: toPlain(domain),
            canonical_domain: toPlain(canonicalDomain || domain),
            tenant: toPlain(tenant),
            discovery: toPlain(discovery)
        };
    },

    async listActiveCanonicalOriginsByTenantIds(tenantIds = []) {
        if (!Array.isArray(tenantIds) || tenantIds.length === 0) return new Map();
        const rows = await StorefrontCustomDomain.findAll({
            where: {
                tenant_id: tenantIds,
                status: { [Op.in]: ['active', 'eligibility_grace'] },
                role: 'canonical'
            },
            attributes: ['tenant_id', 'hostname']
        });
        return new Map(rows.map((row) => [String(row.tenant_id), `https://${row.hostname}`]));
    },

    async leaseNextOperation({ leaseOwner, leaseExpiresAt, now = new Date() }) {
        return sequelize.transaction(async (transaction) => {
            const operation = await StorefrontCustomDomainOperation.findOne({
                where: {
                    status: { [Op.in]: ['queued', 'retry'] },
                    next_attempt_at: { [Op.lte]: now },
                    attempts: { [Op.lt]: sequelize.col('max_attempts') }
                },
                order: [['next_attempt_at', 'ASC'], ['created_at', 'ASC']],
                transaction,
                lock: transaction.LOCK.UPDATE,
                skipLocked: true
            });
            if (!operation) return null;
            await operation.update({
                status: 'leased',
                lease_owner: leaseOwner,
                lease_expires_at: leaseExpiresAt,
                attempts: Number(operation.attempts || 0) + 1
            }, { transaction });
            return operation;
        });
    }
};
