import dbStore from '../../../utils/dbStore.js';
import { Op } from 'sequelize';
import { assertTenantLocationRepositoryContract } from '../contracts/tenantLocationRepository.contract.js';
import { TENANT_LOCATION_REFERENCE_SOURCES } from './tenantLocationReferenceSources.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const createReferenceGuardUnavailableError = (source, reason) => Object.assign(
    new Error(`Tenant location reference guard is unavailable for ${source.modelName}`),
    {
        name: 'TenantLocationReferenceGuardUnavailableError',
        code: 'TENANT_LOCATION_REFERENCE_GUARD_UNAVAILABLE',
        sourceKey: source.key,
        modelName: source.modelName,
        reason
    }
);

const resolveReferenceModel = (source) => {
    const store = dbStore.getStore?.();
    const Model = store?.[source.modelName];
    if (!Model) {
        throw createReferenceGuardUnavailableError(source, 'model_missing_from_tenant_context');
    }
    if (typeof Model.count !== 'function') {
        throw createReferenceGuardUnavailableError(source, 'model_count_unavailable');
    }
    return Model;
};

const countModelRows = async (source, locationId, transaction = null) => {
    const Model = resolveReferenceModel(source);
    const where = source.where(locationId);
    return Model.count({ where, transaction });
};

export const tenantLocationRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async listLocations({ includeInactive = true } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const where = includeInactive ? {} : { is_active: true };

        const rows = await TenantLocation.findAll({
            where,
            order: [
                ['is_primary_storefront', 'DESC'],
                ['is_active', 'DESC'],
                ['name', 'ASC'],
                ['location_id', 'ASC']
            ]
        });

        return rows.map(toPlain);
    },

    async findById(locationId, options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findByPk(locationId, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async findByName(name, { excludeLocationId = null, includeInactive = false } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return null;

        const where = {
            name: {
                [Op.like]: trimmedName
            }
        };

        if (!includeInactive) {
            where.is_active = true;
        }

        if (excludeLocationId) {
            where.location_id = {
                [Op.ne]: excludeLocationId
            };
        }

        const row = await TenantLocation.findOne({ where });
        return toPlain(row);
    },

    async findActivePrimary(options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findOne({
            where: {
                is_active: true,
                is_primary_storefront: true
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction
                ? options.transaction.LOCK.UPDATE
                : undefined
        });
        return toPlain(row);
    },

    async findPrimaryFallbackCandidate({ excludeLocationId = null, transaction = null } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const where = { is_active: true };
        if (excludeLocationId) {
            where.location_id = { [Op.ne]: excludeLocationId };
        }

        const row = await TenantLocation.findOne({
            where,
            order: [
                ['is_open', 'DESC'],
                ['updated_at', 'DESC'],
                ['location_id', 'DESC']
            ],
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async clearPrimaryFlags({ excludeLocationId = null, transaction = null } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const where = {};
        if (excludeLocationId) {
            where.location_id = { [Op.ne]: excludeLocationId };
        }

        await TenantLocation.update(
            { is_primary_storefront: false },
            { where, transaction }
        );
    },

    async setPrimaryFlagById(locationId, { transaction = null } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findByPk(locationId, {
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(
            { is_primary_storefront: true },
            { transaction }
        );
        return toPlain(row);
    },

    async create(payload = {}, options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const created = await TenantLocation.create(payload, {
            transaction: options.transaction
        });
        return toPlain(created);
    },

    async updateById(locationId, payload = {}, options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findByPk(locationId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction
                ? options.transaction.LOCK.UPDATE
                : undefined
        });

        if (!row) {
            return null;
        }

        await row.update(payload, {
            transaction: options.transaction
        });

        return toPlain(row);
    },

    async deactivateById(locationId, options = {}) {
        return this.updateById(locationId, {
            is_active: false,
            is_open: false,
            is_primary_storefront: false
        }, options);
    },

    async countOperationalReferences(locationId, { transaction = null } = {}) {
        const entries = await Promise.all(
            TENANT_LOCATION_REFERENCE_SOURCES.map(async (source) => {
                const count = await countModelRows(source, locationId, transaction);
                return [source.key, Number(count || 0)];
            })
        );

        const counts = Object.fromEntries(entries);
        counts.total = entries.reduce((sum, [, count]) => sum + count, 0);
        return counts;
    },

    async deleteById(locationId, options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findByPk(locationId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction
                ? options.transaction.LOCK.UPDATE
                : undefined
        });

        if (!row) {
            return null;
        }

        const plain = toPlain(row);
        await row.destroy({ transaction: options.transaction });
        return plain;
    }
};

assertTenantLocationRepositoryContract(tenantLocationRepository);
