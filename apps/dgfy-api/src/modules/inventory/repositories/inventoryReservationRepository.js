// InventoryReservationRepository — Clean Architecture data access adapter for
// the tenant-scoped `inventory_reservations` stock-hold ledger (D-07/D-09/D-10,
// ADR 0029). Mirrors inventoryMovementRepository.js's TenantDatabaseUnavailableError
// / resolveDatabaseName / withModel scaffold and error handling patterns.
//
// modules/inventory is the SOLE writer of inventory_reservations rows and stock
// effects (ADR 0029). This repository exposes ONLY reserve/commit/release/
// expireDue/availableToSell/setReservationExpiry operations — no direct stock
// write methods, ever. Reservations convert to sales via the injected recordSale
// single-writer effect (never direct stock_count updates).
//
// D-09: availableToSell and the reserveStock guard both exclude expired-active
// rows from the held sum on-read, so a missed sweep or missed webhook never
// causes phantom out-of-stock. The sweep helper (expireDueReservations) is a
// durable cleanup, not a correctness requirement.

import { Op } from 'sequelize';
import { TenantDatabaseUnavailableError, InsufficientStockError } from './inventoryMovementRepository.js';

export class InventoryReservationRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   inventoryMovementRepository.js's pattern) so this repository can always
     *   be constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError when omitted.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('InventoryReservationRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors inventoryMovementRepository.js).
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
     * Resolves the InventoryReservation model via TenantConnector.getModels().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).InventoryReservation;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(InventoryReservation)` against it. Any error surfaced while resolving
     * is normalized to TenantDatabaseUnavailableError('unreachable', ...) unless
     * it is already one (never double-wrapped).
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
     * Computes available-to-sell: on_hand minus SUM(quantity) of live-active
     * reservations for the given product.
     *
     * D-09: live-active means status='active' AND (expires_at IS NULL OR
     * expires_at > now). Expired-but-unswept active rows are excluded from the
     * held sum, so availability is correct on-read regardless of sweep timing.
     *
     * @param {string} businessId
     * @param {number} productId
     * @param {Date} [now] - defaults to new Date()
     * @returns {Promise<number>}
     */
    async availableToSell(businessId, productId, now = null) {
        if (!businessId || !productId) return 0;
        const timestamp = now || new Date();

        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const { InventoryReservation, Product } = this.tenantConnector.getModels(databaseName);
            const sequelize = InventoryReservation.sequelize;

            const product = await Product.findByPk(Number(productId));
            if (!product) return 0;

            if (product.inventory_mode === 'non_stock') {
                // Non-stock products have no inventory constraints
                return Number.MAX_SAFE_INTEGER;
            }

            const onHand = Number(product.stock_count || 0);

            // D-09: exclude expired-active rows from the held sum on-read.
            // CR-02 fix (10-REVIEW.md): MUST filter by product_id — without
            // it this summed EVERY active, non-expired reservation for the
            // ENTIRE tenant (every product), not just this one, corrupting
            // availability across every product in the tenant. WR-03 fix:
            // replaced the raw sequelize.literal/Op.gt-as-boolean idiom with
            // a plain Sequelize `where` object (portable, unambiguous, and
            // makes the missing product_id filter far less likely to recur).
            const heldResult = await InventoryReservation.findAll({
                attributes: [
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'heldSum']
                ],
                where: {
                    product_id: Number(productId),
                    status: 'active',
                    [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: timestamp } }]
                },
                raw: true
            });

            const heldAmount = Number(heldResult[0]?.heldSum || 0);
            return Math.max(0, onHand - heldAmount);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Places a hold on stock: for each line, atomically checks availableToSell
     * and inserts an active reservation row inside one tenant transaction.
     *
     * D-07: storefront orders immediately reserve stock as temporary holds.
     * D-09: expired-active rows excluded from availableToSell on-read.
     * D-10: TenantDatabaseUnavailableError on DB unreachable (fail-fast, distinct
     *       from InsufficientStockError).
     *
     * All-or-nothing: if ANY line fails, entire operation rolls back.
     *
     * @param {string} businessId
     * @param {{productId: number, quantity: number}[]} lines
     * @param {string} referenceId - storefront order's public_reference
     * @param {Date} [expiresAt] - session expiry or null for permanent hold
     * @returns {Promise<{reservations: Object[]}>}
     */
    async reserveStock(businessId, lines = [], referenceId, expiresAt = null) {
        if (!businessId) {
            throw new Error('InventoryReservationRepository.reserveStock requires businessId.');
        }

        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const { InventoryReservation, Product } = this.tenantConnector.getModels(databaseName);
            const sequelize = InventoryReservation.sequelize;
            const now = new Date();

            const executeReserve = async (transaction) => {
                const reservations = [];

                // For each line: row-lock product, compute availableToSell, reject if insufficient
                for (const line of lines) {
                    const product = await Product.findByPk(Number(line.productId), {
                        lock: sequelize.Transaction.LOCK.UPDATE,
                        transaction
                    });

                    if (!product) {
                        throw new InsufficientStockError(
                            `Product ${line.productId} not found for reservation.`
                        );
                    }

                    if (product.inventory_mode === 'basic_inventory') {
                        // D-09: exclude expired-active from held sum on-read.
                        // CR-02/WR-03 fix (10-REVIEW.md): filter by
                        // product_id (this line's own product, not every
                        // product in the tenant) via a plain Sequelize
                        // `where` object rather than the fragile
                        // literal/Op.gt-as-boolean idiom.
                        const heldResult = await InventoryReservation.findAll({
                            attributes: [
                                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'heldSum']
                            ],
                            where: {
                                product_id: Number(line.productId),
                                status: 'active',
                                [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }]
                            },
                            transaction,
                            raw: true
                        });

                        const heldAmount = Number(heldResult[0]?.heldSum || 0);
                        const onHand = Number(product.stock_count || 0);
                        const availableToSell = Math.max(0, onHand - heldAmount);

                        const requestedQty = Number(line.quantity);
                        if (requestedQty > availableToSell) {
                            throw new InsufficientStockError(
                                `Insufficient stock for product ${line.productId}: requested ${requestedQty}, available ${availableToSell}.`
                            );
                        }
                    }

                    // Insert active reservation (all-or-nothing inside transaction)
                    const reservation = await InventoryReservation.create({
                        business_id: businessId,
                        product_id: Number(line.productId),
                        quantity: Number(line.quantity),
                        reference_type: 'storefront_order',
                        reference_id: referenceId,
                        status: 'active',
                        expires_at: expiresAt
                    }, { transaction });

                    reservations.push(this.toPlain(reservation));
                }

                return { reservations };
            };

            return await sequelize.transaction(executeReserve);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            if (error instanceof InsufficientStockError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Converts active reservations for an order into sale effects via the
     * injected recordSale single-writer (never direct stock_count write).
     * Marks converted reservations 'committed'. Idempotent: already-committed
     * rows are no-op.
     *
     * ADR 0029: only recordSale writes InventoryMovement/stock_count.
     *
     * @param {string} businessId
     * @param {string} referenceId - order's public_reference
     * @param {Object} recordSaleUseCase - injected single-writer effect
     * @param {Object} [transaction] - optional: use caller's transaction (e.g., finalize txn)
     * @returns {Promise<void>}
     */
    async commitReservation(businessId, referenceId, recordSaleUseCase, transaction = null) {
        if (!businessId || !referenceId) {
            throw new Error('commitReservation requires businessId and referenceId.');
        }

        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const { InventoryReservation } = this.tenantConnector.getModels(databaseName);

            const executeCommit = async (txn) => {
                // Find active reservations for this order
                const activeReservations = await InventoryReservation.findAll({
                    where: {
                        reference_id: referenceId,
                        status: 'active'
                    },
                    transaction: txn
                });

                // For each active reservation: call recordSale, then mark committed
                for (const reservation of activeReservations) {
                    await recordSaleUseCase({
                        businessId,
                        productId: reservation.product_id,
                        quantity: reservation.quantity,
                        referenceType: 'inventory_reservation',
                        referenceId: referenceId,
                        transaction: txn
                    });

                    await reservation.update({ status: 'committed' }, { transaction: txn });
                }
            };

            if (transaction) {
                // Use provided transaction
                return await executeCommit(transaction);
            }
            // Use a new transaction
            const sequelize = InventoryReservation.sequelize;
            return await sequelize.transaction(executeCommit);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Releases held stock: marks active reservations 'released'. Idempotent:
     * already-released rows are no-op.
     *
     * @param {string} businessId
     * @param {string} referenceId - order's public_reference
     * @returns {Promise<number>} - number of rows updated
     */
    async releaseReservation(businessId, referenceId) {
        if (!businessId || !referenceId) {
            throw new Error('releaseReservation requires businessId and referenceId.');
        }

        return this.withModel(businessId, async (InventoryReservation) => {
            const [affectedRows] = await InventoryReservation.update(
                { status: 'released' },
                {
                    where: {
                        reference_id: referenceId,
                        status: 'active'
                    }
                }
            );
            return affectedRows;
        });
    }

    /**
     * D-09: auto-release sweep helper. Releases all active reservations with
     * expires_at <= now. Idempotent and safe to run repeatedly.
     *
     * Note: availableToSell correctness does NOT depend on this sweep having
     * run — expired-active rows are excluded from availability on-read.
     *
     * @param {string} businessId
     * @param {Date} [now] - defaults to new Date()
     * @returns {Promise<number>} - number of rows released
     */
    async expireDueReservations(businessId, now = null) {
        if (!businessId) return 0;
        const timestamp = now || new Date();

        return this.withModel(businessId, async (InventoryReservation) => {
            const [affectedRows] = await InventoryReservation.update(
                { status: 'released' },
                {
                    where: {
                        status: 'active',
                        expires_at: {
                            [InventoryReservation.sequelize.Op.lte]: timestamp
                        }
                    }
                }
            );
            return affectedRows;
        });
    }

    /**
     * Stamps the shared session clock (D-08) on reservation rows matching
     * the order's referenceId.
     *
     * @param {string} businessId
     * @param {string} referenceId
     * @param {Date} expiresAt
     * @returns {Promise<number>} - number of rows updated
     */
    async setReservationExpiry(businessId, referenceId, expiresAt) {
        if (!businessId || !referenceId) {
            throw new Error('setReservationExpiry requires businessId and referenceId.');
        }

        return this.withModel(businessId, async (InventoryReservation) => {
            const [affectedRows] = await InventoryReservation.update(
                { expires_at: expiresAt },
                {
                    where: {
                        reference_id: referenceId
                    }
                }
            );
            return affectedRows;
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            product_id: plain.product_id,
            quantity: plain.quantity,
            reference_type: plain.reference_type,
            reference_id: plain.reference_id,
            status: plain.status,
            expires_at: plain.expires_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {InventoryReservationRepository}
 */
export const buildInventoryReservationRepository = (deps) => new InventoryReservationRepository(deps);

export default InventoryReservationRepository;
