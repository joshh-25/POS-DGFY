import defineLocationModel from '../../../models/Tenant/Location.js';

// LocationRepository — Clean Architecture data access adapter for the
// tenant-scoped `locations` domain (D-10, D-12), mirroring
// ./accountStaffAssignmentRepository.js's role. Every location use case
// reaches location data exclusively through this repository. No business
// logic lives here, only data access + tenant-database resolution.
//
// Wave 7 gap-closure (04-07-PLAN.md, Task 1): CLOSES the in-memory Map
// bridging stub 04-03.5-SUMMARY.md/04-SUMMARY.md flagged as pending —
// locations now persist through a real per-tenant Sequelize connection
// resolved via the injected TenantConnector, exactly like
// ./accountStaffAssignmentRepository.js already does. `businessId` is
// resolved to a `database_name` through the injected
// BusinessDatabaseRegistryRepository on every call — the registry row must
// be `status: 'active'` AND have `verified_at` populated (04-06-SUMMARY.md's
// documented meaning of "active/verified": there is no separate 'verified'
// enum value) before any tenant connection is attempted, so a
// still-`provisioning`/`migrating`/`deprecated` or verification-pending
// business can never receive a location write. Every failure path throws
// TenantDatabaseUnavailableError (never an uncaught Sequelize/connection
// exception) so callers (locationUseCases.js) can map it to a stable
// ApplicationResult failure.
export class TenantDatabaseUnavailableError extends Error {
    /**
     * @param {'missing'|'provisioning'|'inactive'|'unverified'|'unreachable'|'not_configured'} reason
     * @param {string} [message]
     */
    constructor(reason, message) {
        super(message || `Tenant database unavailable for this business (${reason}).`);
        this.name = 'TenantDatabaseUnavailableError';
        this.reason = reason;
    }
}

export class LocationRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   ../index.js's buildBusinessesModule() doc comment: it may be null
     *   before a BusinessDatabaseRegistry model is wired up) so this
     *   repository can always be constructed; every operation fails closed
     *   with TenantDatabaseUnavailableError('not_configured', ...) when it
     *   is omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('LocationRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
        this.modelsByDatabase = new Map(); // databaseName -> Location model
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (04-06-SUMMARY.md: "verified"
     * is status='active' + verified_at populated, not a distinct status).
     * Throws TenantDatabaseUnavailableError for every non-writable state.
     * @param {string} businessId
     * @returns {Promise<string>}
     */
    async resolveDatabaseName(businessId) {
        if (!this.businessDatabaseRegistryRepository) {
            throw new TenantDatabaseUnavailableError(
                'not_configured',
                'Tenant database registry is not configured.'
            );
        }

        const registryEntry = await this.businessDatabaseRegistryRepository.findByBusinessId(businessId);
        if (!registryEntry || !registryEntry.database_name) {
            throw new TenantDatabaseUnavailableError(
                'missing',
                'No tenant database is registered for this business.'
            );
        }
        if (registryEntry.status === 'provisioning') {
            throw new TenantDatabaseUnavailableError('provisioning', 'Tenant database is still provisioning.');
        }
        if (registryEntry.status !== 'active') {
            throw new TenantDatabaseUnavailableError('inactive', 'Tenant database is not active.');
        }
        if (!registryEntry.verified_at) {
            throw new TenantDatabaseUnavailableError('unverified', 'Tenant database has not been verified.');
        }

        return registryEntry.database_name;
    }

    resolveModel(databaseName) {
        if (this.modelsByDatabase.has(databaseName)) {
            return this.modelsByDatabase.get(databaseName);
        }
        const connection = this.tenantConnector.getConnection(databaseName);
        const model = defineLocationModel(connection);
        this.modelsByDatabase.set(databaseName, model);
        return model;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(Location)` against it. Any error surfaced while resolving the
     * model or running the query (e.g. an unreachable tenant MySQL server)
     * is normalized to TenantDatabaseUnavailableError('unreachable', ...)
     * unless it is already one (never double-wrapped).
     * @param {string} businessId
     * @param {(model: Object) => Promise<any>} fn
     */
    async withModel(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const model = this.resolveModel(databaseName);
            return await fn(model);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Inserts a location for businessId. If this is the business's first
     * location, it is automatically marked is_primary=true (there is
     * always exactly one primary once at least one location exists).
     * @param {{businessId, name, address_line, latitude?, longitude?}} input
     */
    async create({ businessId, name, address_line, latitude = null, longitude = null }) {
        if (!businessId) throw new Error('LocationRepository.create requires businessId.');

        return this.withModel(businessId, async (Location) => {
            const isFirstLocation = (await Location.count()) === 0;
            const record = await Location.create({
                name,
                address_line,
                latitude,
                longitude,
                is_active: true,
                is_primary: isFirstLocation
            });
            return this.toPlain(record);
        });
    }

    async findById(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModel(businessId, async (Location) => {
            const record = await Location.findByPk(Number(id));
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Case-insensitive lookup by name, scoped to businessId (its own tenant
     * database).
     */
    async findByName(businessId, name) {
        if (!businessId || !name) return null;
        return this.withModel(businessId, async (Location) => {
            const record = await Location.findOne({
                where: Location.sequelize.where(
                    Location.sequelize.fn('LOWER', Location.sequelize.col('name')),
                    String(name).trim().toLowerCase()
                )
            });
            return record ? this.toPlain(record) : null;
        });
    }

    async findAll(businessId) {
        if (!businessId) return [];
        return this.withModel(businessId, async (Location) => {
            const records = await Location.findAll({ order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    async findPrimary(businessId) {
        if (!businessId) return null;
        return this.withModel(businessId, async (Location) => {
            const record = await Location.findOne({ where: { is_primary: true } });
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Partial update: only fields present on `updates` are written.
     */
    async update(businessId, id, updates = {}) {
        return this.withModel(businessId, async (Location) => {
            const record = await Location.findByPk(Number(id));
            if (!record) return null;

            const patch = {};
            ['name', 'address_line', 'latitude', 'longitude', 'is_active'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(updates, key)) {
                    patch[key] = updates[key];
                }
            });

            await record.update(patch);
            return this.toPlain(record);
        });
    }

    /**
     * Sets newLocationId as the business's sole primary location, clearing
     * is_primary on every other location for this business's tenant
     * database.
     * @returns {Object|null} the updated (now-primary) location, or null if
     *   newLocationId does not exist in this tenant database.
     */
    async updatePrimary(businessId, newLocationId) {
        return this.withModel(businessId, async (Location) => {
            const target = await Location.findByPk(Number(newLocationId));
            if (!target) return null;

            await Location.update({ is_primary: false }, { where: { is_primary: true } });
            await target.reload();
            await target.update({ is_primary: true });
            return this.toPlain(target);
        });
    }

    /**
     * Soft delete: sets is_active=false. Record remains in the tenant table
     * (and findAll()) so callers can inspect it and, if desired, restore()
     * it.
     */
    async delete(businessId, id) {
        return this.update(businessId, id, { is_active: false });
    }

    /**
     * Un-soft-delete: sets is_active=true.
     */
    async restore(businessId, id) {
        return this.update(businessId, id, { is_active: true });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            name: plain.name,
            address_line: plain.address_line,
            latitude: plain.latitude,
            longitude: plain.longitude,
            is_active: plain.is_active,
            is_primary: plain.is_primary,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {LocationRepository}
 */
export const buildLocationRepository = (deps) => new LocationRepository(deps);

export default LocationRepository;
