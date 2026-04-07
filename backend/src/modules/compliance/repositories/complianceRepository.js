import dbStore from '../../../utils/dbStore.js';

const COMPLIANCE_TRANSITIONS = Object.freeze({
    non_compliant_active: new Set(['non_compliant_active', 'compliant_pending']),
    compliant_pending: new Set(['compliant_pending', 'compliant_active']),
    compliant_active: new Set(['compliant_active'])
});

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const mergeObjects = (base, incoming) => {
    const output = { ...base };
    Object.keys(incoming || {}).forEach((key) => {
        const nextValue = incoming[key];
        if (
            nextValue
            && typeof nextValue === 'object'
            && !Array.isArray(nextValue)
            && output[key]
            && typeof output[key] === 'object'
            && !Array.isArray(output[key])
        ) {
            output[key] = mergeObjects(output[key], nextValue);
            return;
        }
        output[key] = nextValue;
    });
    return output;
};

const getModel = (name) => dbStore.get(name);

const assertTransitionAllowed = ({ previousState, nextState }) => {
    if (!nextState || previousState == null || previousState === nextState) {
        return;
    }

    const allowed = COMPLIANCE_TRANSITIONS[previousState];
    if (!allowed || !allowed.has(nextState)) {
        throw new Error(`Compliance mode transition blocked: ${previousState} -> ${nextState}`);
    }
};

export const complianceRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async findTenantById(tenantId, options = {}) {
        const Tenant = getModel('Tenant');
        const tenant = await Tenant.findByPk(tenantId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(tenant);
    },

    async updateTenantById(tenantId, payload = {}, options = {}) {
        const Tenant = getModel('Tenant');
        const tenant = await Tenant.findByPk(tenantId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        if (!tenant) {
            return null;
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'compliance_mode_state')) {
            assertTransitionAllowed({
                previousState: tenant.compliance_mode_state || null,
                nextState: payload.compliance_mode_state
            });
        }

        await tenant.update(payload, { transaction: options.transaction });
        return toPlain(tenant);
    },

    async updateComplianceProfile(tenantId, patch = {}, options = {}) {
        const Tenant = getModel('Tenant');
        const tenant = await Tenant.findByPk(tenantId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        if (!tenant) return null;

        const current = (tenant.compliance_profile && typeof tenant.compliance_profile === 'object')
            ? tenant.compliance_profile
            : {};

        const nextProfile = mergeObjects(current, patch || {});
        await tenant.update({ compliance_profile: nextProfile }, { transaction: options.transaction });

        return {
            tenant: toPlain(tenant),
            compliance_profile: nextProfile
        };
    },

    async listArtifactsByTenantId(tenantId, options = {}) {
        const TenantComplianceArtifact = getModel('TenantComplianceArtifact');
        const rows = await TenantComplianceArtifact.findAll({
            where: { tenant_id: tenantId },
            order: [['updated_at', 'DESC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createArtifact(payload = {}, options = {}) {
        const TenantComplianceArtifact = getModel('TenantComplianceArtifact');
        const created = await TenantComplianceArtifact.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async updateArtifactById(artifactId, payload = {}, options = {}) {
        const TenantComplianceArtifact = getModel('TenantComplianceArtifact');
        const row = await TenantComplianceArtifact.findByPk(artifactId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listPeripheralsByTenantId(tenantId, options = {}) {
        const TenantCompliancePeripheral = getModel('TenantCompliancePeripheral');
        const rows = await TenantCompliancePeripheral.findAll({
            where: { tenant_id: tenantId },
            order: [['updated_at', 'DESC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createPeripheral(payload = {}, options = {}) {
        const TenantCompliancePeripheral = getModel('TenantCompliancePeripheral');
        const created = await TenantCompliancePeripheral.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async updatePeripheralById(peripheralId, payload = {}, options = {}) {
        const TenantCompliancePeripheral = getModel('TenantCompliancePeripheral');
        const row = await TenantCompliancePeripheral.findByPk(peripheralId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async createAuditLog(payload = {}, options = {}) {
        const TenantComplianceAuditLog = getModel('TenantComplianceAuditLog');
        const created = await TenantComplianceAuditLog.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async listAuditLogsByTenantId(tenantId, { limit = 100 } = {}) {
        const TenantComplianceAuditLog = getModel('TenantComplianceAuditLog');
        const rows = await TenantComplianceAuditLog.findAll({
            where: { tenant_id: tenantId },
            order: [['created_at', 'DESC']],
            limit: Math.min(Number(limit) || 100, 500)
        });
        return rows.map(toPlain);
    }
};
