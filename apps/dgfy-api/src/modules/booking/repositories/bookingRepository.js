import { Op } from 'sequelize';

// BookingRepository — Clean Architecture data access adapter for the
// tenant-scoped `bookings`/`booking_capacity` domain (BOK-01/BOK-02/BOK-03),
// mirroring ../../products/repositories/productRepository.js's copied
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// its "resolve models via tenantConnector.getModels(databaseName)"
// convention (never a direct model-factory import) — Booking/BookingCapacity
// are two of the 8 commerce Tenant models registered in
// TenantConnector.getModels() (08-02).
//
// createBooking() is this module's one hard-problem write path (research
// Pattern D): branch-level capacity is decremented via a SINGLE guarded
// UPDATE (`slots_remaining = slots_remaining - 1 WHERE ... AND
// slots_remaining >= 1`), asserting exactly one affected row BEFORE the
// booking row is ever inserted — never a findOne-then-update round trip
// (Pitfall 3 double-decrement). Both the capacity guard and the booking
// insert share one sequelize.transaction() (this plan's key_link).
// cancelBooking() releases the slot with the mirror `+ 1` inside the same
// transaction as the booking's status write (D-08).
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

/**
 * Thrown by createBooking() when the guarded capacity UPDATE affects 0 rows
 * (slots_remaining was already 0 for this product/branch/slot combination).
 * No booking row is written when this is thrown — the transaction rolls
 * back. Usecases duck-type on `error.name === 'BookingCapacityFullError'`
 * and map it to a 409 conflict (BOK-02).
 */
export class BookingCapacityFullError extends Error {
    constructor(message) {
        super(message || 'No booking capacity remaining for this slot.');
        this.name = 'BookingCapacityFullError';
    }
}

/**
 * Thrown by cancelBooking() when the booking is already cancelled — prevents
 * a double-release of the branch-capacity slot. Usecases duck-type on
 * `error.name === 'BookingAlreadyCancelledError'`.
 */
export class BookingAlreadyCancelledError extends Error {
    constructor(message) {
        super(message || 'This booking is already cancelled.');
        this.name = 'BookingAlreadyCancelledError';
    }
}

export class BookingRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   productRepository.js's doc comment) so this repository can always be
     *   constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('BookingRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors productRepository.js /
     * locationRepository.js). Throws TenantDatabaseUnavailableError for
     * every non-writable state.
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

    /**
     * Resolves Booking + BookingCapacity via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import — mirroring productRepository.js's resolveModel().
     */
    resolveModels(databaseName) {
        const { Booking, BookingCapacity } = this.tenantConnector.getModels(databaseName);
        return { Booking, BookingCapacity };
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn({Booking, BookingCapacity})` against it. Any error surfaced while
     * resolving the models or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one of this repository's own named errors (never
     * double-wrapped).
     * @param {string} businessId
     * @param {(models: {Booking, BookingCapacity}) => Promise<any>} fn
     */
    async withModels(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const models = this.resolveModels(databaseName);
            return await fn(models);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            if (error instanceof BookingCapacityFullError) throw error;
            if (error instanceof BookingAlreadyCancelledError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Creates a booking against a (product, branch, slot_start), decrementing
     * branch-level capacity via a single atomic guarded UPDATE inside the
     * SAME transaction as the booking insert (research Pattern D / BOK-02).
     *
     * Lazily provisions the booking_capacity counter row (seeded to
     * concurrentCapacity) on first use for this (product, branch,
     * slot_start) triple — the unique index on that triple
     * (unique_booking_capacity_product_branch_slot) makes concurrent
     * findOrCreate calls safe (Sequelize retries as a plain find when it
     * hits the unique-constraint race, rather than throwing).
     *
     * The capacity decrement itself is `slots_remaining = slots_remaining -
     * 1 WHERE ... AND slots_remaining >= 1` — a single guarded UPDATE
     * statement, never a findOne-then-update round trip. If the guarded
     * UPDATE affects 0 rows, capacity is full: BookingCapacityFullError is
     * thrown and the transaction rolls back BEFORE any booking row is
     * written (BOK-02's "no oversell" guarantee).
     *
     * @param {string} businessId
     * @param {{productId, branchId, slotStart, slotEnd?, customerAccountId?, concurrentCapacity}} input
     * @returns {Promise<Object>} the created booking (toPlain() shape)
     */
    async createBooking(businessId, {
        productId,
        branchId,
        slotStart,
        slotEnd = null,
        customerAccountId = null,
        concurrentCapacity
    } = {}) {
        if (!businessId) {
            throw new Error('BookingRepository.createBooking requires businessId.');
        }

        return this.withModels(businessId, async ({ Booking, BookingCapacity }) => {
            const sequelize = Booking.sequelize;

            return sequelize.transaction(async (transaction) => {
                await BookingCapacity.findOrCreate({
                    where: { product_id: productId, branch_id: branchId, slot_start: slotStart },
                    defaults: {
                        business_id: businessId,
                        product_id: productId,
                        branch_id: branchId,
                        slot_start: slotStart,
                        slots_remaining: concurrentCapacity
                    },
                    transaction
                });

                const [affectedRows] = await BookingCapacity.update(
                    { slots_remaining: sequelize.literal('slots_remaining - 1') },
                    {
                        where: {
                            product_id: productId,
                            branch_id: branchId,
                            slot_start: slotStart,
                            slots_remaining: { [Op.gte]: 1 }
                        },
                        transaction
                    }
                );

                if (affectedRows !== 1) {
                    throw new BookingCapacityFullError('No booking capacity remaining for this slot.');
                }

                const record = await Booking.create({
                    business_id: businessId,
                    product_id: productId,
                    branch_id: branchId,
                    customer_account_id: customerAccountId,
                    slot_start: slotStart,
                    slot_end: slotEnd,
                    status: 'booked'
                }, { transaction });

                return this.toPlain(record);
            });
        });
    }

    async findById(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModels(businessId, async ({ Booking }) => {
            const record = await Booking.findByPk(Number(id));
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * @param {string} businessId
     * @param {{branchId?, productId?, customerAccountId?}} [filter]
     */
    async findAll(businessId, { branchId, productId, customerAccountId } = {}) {
        if (!businessId) return [];
        return this.withModels(businessId, async ({ Booking }) => {
            const where = { business_id: businessId };
            if (branchId !== undefined && branchId !== null) where.branch_id = branchId;
            if (productId !== undefined && productId !== null) where.product_id = productId;
            if (customerAccountId) where.customer_account_id = customerAccountId;

            const records = await Booking.findAll({ where, order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * Cancels a booking, releasing its branch-capacity slot atomically
     * (mirror `+ 1`) in the SAME transaction as the status write (D-08).
     * Returns null if the booking does not exist; throws
     * BookingAlreadyCancelledError if it is already cancelled (never
     * double-releases the slot).
     * @param {string} businessId
     * @param {number|string} id
     * @returns {Promise<Object|null>} the cancelled booking (toPlain() shape)
     */
    async cancelBooking(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;

        return this.withModels(businessId, async ({ Booking, BookingCapacity }) => {
            const sequelize = Booking.sequelize;

            return sequelize.transaction(async (transaction) => {
                const record = await Booking.findByPk(Number(id), { transaction });
                if (!record) return null;
                if (record.status === 'cancelled') {
                    throw new BookingAlreadyCancelledError('This booking is already cancelled.');
                }

                await BookingCapacity.update(
                    { slots_remaining: sequelize.literal('slots_remaining + 1') },
                    {
                        where: {
                            product_id: record.product_id,
                            branch_id: record.branch_id,
                            slot_start: record.slot_start
                        },
                        transaction
                    }
                );

                await record.update({ status: 'cancelled', cancelled_at: new Date() }, { transaction });
                return this.toPlain(record);
            });
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            product_id: plain.product_id,
            branch_id: plain.branch_id,
            customer_account_id: plain.customer_account_id,
            slot_start: plain.slot_start,
            slot_end: plain.slot_end,
            status: plain.status,
            availment_id: plain.availment_id,
            cancelled_at: plain.cancelled_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {BookingRepository}
 */
export const buildBookingRepository = (deps) => new BookingRepository(deps);

export default BookingRepository;
