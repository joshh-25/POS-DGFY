import crypto from 'crypto';

// storefrontOrderRepository.js — Phase 10 Plan 06 Task 1 (STF-05, D-04).
//
// Landlord (dgfy_core) persistence adapter for storefront_orders (10-01's
// StorefrontOrder model) — the durable, landlord-first order record STF-05
// requires. `storefrontOrderModel` is constructor-injected (Dependency
// Inversion), mirroring guestIdentityRepository.js's / commercePayment
// Repository.js's convention, so this repository stays unit-testable
// against a mocked Sequelize model without a live dgfy_core connection.
//
// Idempotency (D-04): callers look up an existing order first via
// findByIdempotency({tenant_id, target_type, idempotency_key}) — the
// UNIQUE (tenant_id, target_type, idempotency_key) index from 10-01
// enforces one canonical order per client submission at the DB level too,
// so a lost-guard race (two concurrent submits both miss the lookup) is
// resolved by catching the resulting unique-constraint violation on
// createOrder() and re-selecting the winner's row (see isUniqueConstraint
// Violation, reused by placeOrderUseCases.js).

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);

/**
 * Duck-types a MySQL/Sequelize unique-constraint violation, tolerating both
 * Sequelize's wrapped error shape and a raw mysql2 driver error — copied in
 * spirit from guestIdentityRepository.js's isUniqueConstraintViolation()
 * (same duplication convention, scoped to this repository's own unique
 * indexes: storefront_orders' (tenant_id, target_type, idempotency_key)
 * and public_reference).
 * @param {Error} error
 */
export const isUniqueConstraintViolation = (error) => {
    if (!error) return false;
    if (error.name === 'SequelizeUniqueConstraintError') return true;
    if (error.original && (error.original.code === 'ER_DUP_ENTRY' || error.original.errno === 1062)) return true;
    if (error.parent && (error.parent.code === 'ER_DUP_ENTRY' || error.parent.errno === 1062)) return true;
    return false;
};

/**
 * Deterministically stringifies a value with object keys sorted
 * (recursively), so semantically-identical payloads always hash to the
 * same request_hash regardless of key insertion order.
 * @param {*} value
 */
const sortKeysDeep = (value) => {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.keys(value).sort().reduce((acc, key) => {
            acc[key] = sortKeysDeep(value[key]);
            return acc;
        }, {});
    }
    return value;
};

/**
 * Computes the SHA-256 request_hash over a stable-stringified normalized
 * checkout payload (D-04). A duplicate `idempotency_key` submitted with an
 * identical payload hashes identically (safe replay); a changed payload
 * hashes differently (409 conflict, tamper/mistake detection).
 * @param {Object} payload
 * @returns {string} 64-char hex SHA-256 digest
 */
export const computeRequestHash = (payload) => crypto
    .createHash('sha256')
    .update(JSON.stringify(sortKeysDeep(payload || {})))
    .digest('hex');

const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const randomAlphaNumeric = (length) => {
    const bytes = crypto.randomBytes(length);
    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
        output += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
    }
    return output;
};

/**
 * Public-facing, opaque order reference (e.g. `SFO-7F3K9A2QXZ`). Opaque and
 * non-sequential by construction (T-10-06-05, IDOR guard) — mirrors
 * commercePaymentRepository.js's generateSessionPublicReference() scheme.
 */
export const generateOrderPublicReference = () => `SFO-${randomAlphaNumeric(10)}`;

export class StorefrontOrderRepository {
    /**
     * @param {{storefrontOrderModel}} deps - the Sequelize StorefrontOrder
     *   model (10-01's models/Landlord/StorefrontOrder.js), injected by the
     *   caller (index.js).
     */
    constructor({ storefrontOrderModel } = {}) {
        if (!storefrontOrderModel) {
            throw new Error('StorefrontOrderRepository requires a storefrontOrderModel.');
        }
        this.model = storefrontOrderModel;
    }

    toPlain(record) {
        return toPlain(record);
    }

    /**
     * Persists a new durable landlord order row (STF-05: created BEFORE any
     * tenant write or payment session exists). Callers are responsible for
     * catching a unique-constraint violation (lost-guard idempotency race)
     * and re-resolving via findByIdempotency — this method does not retry.
     * @param {Object} payload - matches StorefrontOrder's init() fields
     */
    async createOrder(payload) {
        const row = await this.model.create(payload);
        return this.toPlain(row);
    }

    /**
     * Idempotency lookup (D-04): the UNIQUE (tenant_id, target_type,
     * idempotency_key) index this queries against.
     * @param {{tenant_id: string, target_type?: string, idempotency_key: string}} args
     */
    async findByIdempotency({ tenant_id, target_type = 'storefront_checkout', idempotency_key } = {}) {
        if (!tenant_id || !idempotency_key) return null;
        const row = await this.model.findOne({ where: { tenant_id, target_type, idempotency_key } });
        return row ? this.toPlain(row) : null;
    }

    /**
     * Partial update by primary key (id). Used by placeOrderUseCases.js to
     * transition status (pending_payment -> awaiting_payment/failed/
     * finalized) and to re-stamp the shared D-08 expires_at.
     * @param {string} id
     * @param {Object} patch
     */
    async updateOrder(id, patch = {}) {
        const row = await this.model.findByPk(id);
        if (!row) return null;
        await row.update(patch);
        return this.toPlain(row);
    }

    /**
     * Opaque public-reference lookup (getOrderStatus, T-10-06-05 IDOR
     * guard) — never queried by the internal UUID primary key from an
     * untrusted caller.
     * @param {string} publicReference
     */
    async findByPublicReference(publicReference) {
        if (!publicReference) return null;
        const row = await this.model.findOne({ where: { public_reference: publicReference } });
        return row ? this.toPlain(row) : null;
    }
}

/**
 * @param {{storefrontOrderModel}} deps
 * @returns {StorefrontOrderRepository}
 */
export const buildStorefrontOrderRepository = (deps) => new StorefrontOrderRepository(deps);

export default StorefrontOrderRepository;
