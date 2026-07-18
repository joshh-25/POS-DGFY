// GuestIdentityRepository — Clean Architecture data access adapter for the
// LANDLORD (dgfy_core) `storefront_guest_identities` table (10-01-PLAN.md's
// StorefrontGuestIdentity model). Persists a lightweight, persistent guest
// identity keyed by verified email (D-06, STF-03) — never a fresh anonymous
// record per order, so a repeat guest's email maps to exactly one identity.
//
// `storefrontGuestIdentityModel` is constructor-injected (Dependency
// Inversion) rather than imported directly, mirroring
// ../../businesses/repositories/businessDatabaseRegistryRepository.js and
// ../../compliance/repositories/complianceModeStateRepository.js's
// convention, so this repository stays unit-testable against a mocked
// Sequelize model without a live dgfy_core connection.

/**
 * Duck-types a MySQL/Sequelize unique-constraint violation, tolerating both
 * Sequelize's wrapped error shape and a raw mysql2 driver error — copied in
 * spirit from shiftRepository.js's / complianceModeStateRepository.js's
 * isUniqueConstraintViolation() (same duplication convention, scoped to this
 * repository's own unique index: storefront_guest_identities.verified_email).
 * @param {Error} error
 */
const isUniqueConstraintViolation = (error) => {
    if (!error) return false;
    if (error.name === 'SequelizeUniqueConstraintError') return true;
    if (error.original && (error.original.code === 'ER_DUP_ENTRY' || error.original.errno === 1062)) return true;
    if (error.parent && (error.parent.code === 'ER_DUP_ENTRY' || error.parent.errno === 1062)) return true;
    return false;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export class GuestIdentityRepository {
    /**
     * @param {{storefrontGuestIdentityModel}} deps - the Sequelize
     *   StorefrontGuestIdentity model (10-01's models/Landlord/
     *   StorefrontGuestIdentity.js), injected by the caller (index.js).
     */
    constructor({ storefrontGuestIdentityModel } = {}) {
        if (!storefrontGuestIdentityModel) {
            throw new Error('GuestIdentityRepository requires a storefrontGuestIdentityModel.');
        }
        this.model = storefrontGuestIdentityModel;
    }

    toPlain(record) {
        return typeof record?.get === 'function' ? record.get({ plain: true }) : record;
    }

    /**
     * Looks up an existing guest identity by verified email (D-06 repeat-
     * guest recognition). Returns null for an unknown/blank email — never
     * queries with an empty string.
     * @param {string} email
     */
    async findByEmail(email) {
        const normalized = normalizeEmail(email);
        if (!normalized) return null;
        const record = await this.model.findOne({ where: { verified_email: normalized } });
        return record ? this.toPlain(record) : null;
    }

    /**
     * CR-03 fix (10-REVIEW.md): looks up a guest identity by its opaque
     * UUID primary key. Used by resolveCheckoutIdentity to confirm a
     * client-supplied guestIdentityId actually corresponds to a real,
     * previously-OTP-verified identity row before writing it onto an
     * order, rather than trusting a bare client-supplied id. Returns null
     * for a blank/unknown id — never queries with an empty value.
     * @param {string} id
     */
    async findById(id) {
        if (!id) return null;
        const record = await this.model.findByPk(id);
        return record ? this.toPlain(record) : null;
    }

    /**
     * Finds the existing identity by the UNIQUE verified_email or inserts a
     * new one, then refreshes phone/display_name/last_order_at — one
     * persistent identity per verified email (D-06, STF-03).
     *
     * Race-safe against the model's unique index (T-10-04-03): two
     * concurrent first-orders from the same guest both attempt `create()`;
     * the loser's insert throws a unique-constraint violation, which is
     * caught here and re-resolved by re-selecting the row the winner just
     * created — never surfaced as an error to the caller, and the two
     * requests collapse onto the same identity id.
     *
     * @param {{email: string, phone?: string|null, displayName?: string|null}} args
     * @returns {Promise<string>} the guest identity id
     */
    async upsertByVerifiedEmail({ email, phone = null, displayName = null } = {}) {
        const normalized = normalizeEmail(email);
        if (!normalized) {
            throw new Error('upsertByVerifiedEmail requires an email.');
        }

        let record = await this.model.findOne({ where: { verified_email: normalized } });

        if (!record) {
            try {
                record = await this.model.create({
                    verified_email: normalized,
                    phone: phone || null,
                    display_name: displayName || null
                });
            } catch (createError) {
                if (!isUniqueConstraintViolation(createError)) {
                    throw createError;
                }
                // Concurrent first-order collapse (T-10-04-03): another
                // request won the race and already inserted this email —
                // re-select it rather than erroring out.
                record = await this.model.findOne({ where: { verified_email: normalized } });
                if (!record) {
                    // Should not happen (the violating row must exist), but
                    // never silently swallow an unexplained inconsistency.
                    throw createError;
                }
            }
        }

        const patch = { last_order_at: new Date() };
        if (phone) patch.phone = phone;
        if (displayName) patch.display_name = displayName;
        await record.update(patch);

        return record.id;
    }
}

/**
 * @param {{storefrontGuestIdentityModel}} deps
 * @returns {GuestIdentityRepository}
 */
export const buildGuestIdentityRepository = (deps) => new GuestIdentityRepository(deps);

export default GuestIdentityRepository;
