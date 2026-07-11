// LocationRepository — Clean Architecture data access adapter for the
// tenant-scoped `locations` domain (D-10, D-12), mirroring
// ./businessRepository.js's role. Every location use case reaches location
// data exclusively through this repository. No business logic lives here,
// only data access + businessId-scoped storage.
//
// KNOWN LIMITATION (Wave 3.5, mirrors 04-03-PLAN.md/04-03-SUMMARY.md's
// identical staff-onboarding precedent for BusinessRepository): this
// repository stores locations in an in-memory Map keyed by businessId
// rather than a real dgfy_business_<stable_opaque_suffix> tenant MySQL
// database, because:
//   1. No TenantConnector exists in apps/dgfy-api yet — resolving a
//      per-tenant database connection is explicitly Wave 4 scope
//      (04-04-PLAN.md's key_links: "TenantConnector -> resolves
//      per-tenant database; Phase 4 uses for tenant model access").
//   2. No BusinessDatabaseRegistry model exists yet (also explicitly
//      Wave 4 Task 2) to map a business_id to its tenant database_name.
//   3. No business tenant-database *provisioning* flow exists anywhere in
//      this codebase — apps/dgfy-migration-runner only migrates schema
//      into *already-known* DGFY_BUSINESS_DB_NAMES targets; nothing
//      dynamically creates a new dgfy_business_* database when
//      POST /businesses creates a brand-new business.
//   4. Auto-creating/syncing a tenant database's schema from live
//      request-handling code (rather than a migration) would violate this
//      project's explicit constraint (.planning/PROJECT.md Constraints:
//      "Migrations run from a dedicated one-shot container ... long-running
//      API containers must not be the primary migration execution
//      surface").
// Every Map is keyed by businessId, so cross-business data access is
// structurally impossible (satisfies this plan's tenant-isolation
// requirement at the application layer) even though the physical storage
// isn't yet a separate per-tenant database. `locationModel` (the real
// Sequelize model from ../../../models/Tenant/Location.js) is accepted as
// an optional constructor dependency purely so Wave 4 can swap this
// repository's internals for real tenant-connection-backed queries without
// changing its call sites (locationUseCases.js) — it is NOT used for
// persistence yet. See 04-03.5-SUMMARY.md for full rationale and the
// human-verify checkpoint discussion.
export class LocationRepository {
    /**
     * @param {{locationModel?: Object}} deps - `locationModel` is accepted
     *   for forward-compatibility with Wave 4's real tenant-connection
     *   wiring but is not queried by this bridging implementation.
     */
    constructor({ locationModel } = {}) {
        this.locationModel = locationModel || null;
        // businessId -> Map(locationId -> plain location record)
        this.store = new Map();
        // businessId -> next auto-increment integer id (mirrors the real
        // migration's INTEGER autoincrement primary key)
        this.nextIdByBusiness = new Map();
    }

    getBusinessStore(businessId) {
        if (!this.store.has(businessId)) {
            this.store.set(businessId, new Map());
        }
        return this.store.get(businessId);
    }

    nextId(businessId) {
        const current = this.nextIdByBusiness.get(businessId) || 0;
        const next = current + 1;
        this.nextIdByBusiness.set(businessId, next);
        return next;
    }

    /**
     * Inserts a location for businessId. If this is the business's first
     * location, it is automatically marked is_primary=true (there is
     * always exactly one primary once at least one location exists).
     * @param {{businessId, name, address_line, latitude?, longitude?}} input
     */
    async create({ businessId, name, address_line, latitude = null, longitude = null }) {
        if (!businessId) throw new Error('LocationRepository.create requires businessId.');

        const businessStore = this.getBusinessStore(businessId);
        const isFirstLocation = businessStore.size === 0;
        const now = new Date();

        const record = {
            id: this.nextId(businessId),
            name,
            address_line,
            latitude,
            longitude,
            is_active: true,
            is_primary: isFirstLocation,
            created_at: now,
            updated_at: now
        };

        businessStore.set(record.id, record);
        return { ...record };
    }

    async findById(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        const businessStore = this.store.get(businessId);
        if (!businessStore) return null;
        const record = businessStore.get(Number(id));
        return record ? { ...record } : null;
    }

    /**
     * Case-insensitive lookup by name, scoped to businessId.
     */
    async findByName(businessId, name) {
        if (!businessId || !name) return null;
        const businessStore = this.store.get(businessId);
        if (!businessStore) return null;
        const normalized = String(name).trim().toLowerCase();
        for (const record of businessStore.values()) {
            if (String(record.name).trim().toLowerCase() === normalized) {
                return { ...record };
            }
        }
        return null;
    }

    async findAll(businessId) {
        if (!businessId) return [];
        const businessStore = this.store.get(businessId);
        if (!businessStore) return [];
        return Array.from(businessStore.values()).map((record) => ({ ...record }));
    }

    async findPrimary(businessId) {
        if (!businessId) return null;
        const businessStore = this.store.get(businessId);
        if (!businessStore) return null;
        for (const record of businessStore.values()) {
            if (record.is_primary) return { ...record };
        }
        return null;
    }

    /**
     * Partial update: only fields present on `updates` are written.
     */
    async update(businessId, id, updates = {}) {
        const businessStore = this.store.get(businessId);
        if (!businessStore) return null;
        const record = businessStore.get(Number(id));
        if (!record) return null;

        const patch = {};
        ['name', 'address_line', 'latitude', 'longitude', 'is_active'].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(updates, key)) {
                patch[key] = updates[key];
            }
        });

        const updated = { ...record, ...patch, updated_at: new Date() };
        businessStore.set(record.id, updated);
        return { ...updated };
    }

    /**
     * Sets newLocationId as the business's sole primary location, clearing
     * is_primary on every other location for this business.
     * @returns {Object|null} the updated (now-primary) location, or null if
     *   newLocationId does not belong to businessId.
     */
    async updatePrimary(businessId, newLocationId) {
        const businessStore = this.store.get(businessId);
        if (!businessStore) return null;
        const target = businessStore.get(Number(newLocationId));
        if (!target) return null;

        const now = new Date();
        for (const record of businessStore.values()) {
            if (record.is_primary && record.id !== target.id) {
                businessStore.set(record.id, { ...record, is_primary: false, updated_at: now });
            }
        }

        const updated = { ...target, is_primary: true, updated_at: now };
        businessStore.set(updated.id, updated);
        return { ...updated };
    }

    /**
     * Soft delete: sets is_active=false. Record remains in the store (and
     * findAll()) so callers can inspect it and, if desired, restore() it.
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
}

/**
 * @param {{locationModel?: Object}} [deps]
 * @returns {LocationRepository}
 */
export const buildLocationRepository = (deps) => new LocationRepository(deps);

export default LocationRepository;
