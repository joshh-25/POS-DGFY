// BookingEntity — Clean Architecture Entity layer (Enterprise Business
// Rules), mirroring ../../businesses/entities/businessEntity.js's role and
// ../../products/entities/productEntity.js's structure. Holds booking shape
// and minimal domain helpers, completely separate from persistence (the
// Booking Sequelize model, apps/dgfy-api/src/models/Tenant/Booking.js) and
// HTTP concerns. BookingRepository translates Sequelize model rows <-> plain
// objects that match this entity's toPlain() shape; this entity is available
// for any usecase/controller that wants a richer domain object
// (isCancellable()/ownedBy()) than the repository's plain return value —
// mirroring productEntity.js's convention of existing standalone without
// bookingUseCases.js importing it directly.

export class BookingEntity {
    constructor({
        id = null,
        business_id = null,
        product_id = null,
        branch_id = null,
        customer_account_id = null,
        slot_start = null,
        slot_end = null,
        status = 'booked',
        // Reserved, no FK — the Availment table is Phase 9 (BOK-03).
        availment_id = null,
        cancelled_at = null,
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.business_id = business_id;
        this.product_id = product_id;
        this.branch_id = branch_id;
        this.customer_account_id = customer_account_id;
        this.slot_start = slot_start;
        this.slot_end = slot_end;
        this.status = status;
        this.availment_id = availment_id;
        this.cancelled_at = cancelled_at;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /**
     * Only a currently-`booked` Booking can be cancelled (D-08: cancel + a
     * fresh create covers any change-of-mind need — there is no separate
     * change-the-slot action). Prevents double-releasing the branch-capacity
     * slot on an already-cancelled or already-fulfilled Booking.
     * @returns {boolean}
     */
    isCancellable() {
        return this.status === 'booked';
    }

    /**
     * D-09: the second half of the dual cancel-authorization check — the
     * booking's own consumer account may cancel it, in addition to
     * staff/owner (checked separately at the usecase layer via
     * businessRepository membership).
     * @param {string} accountId
     * @returns {boolean}
     */
    ownedBy(accountId) {
        return Boolean(accountId) && this.customer_account_id === accountId;
    }

    /**
     * Public response shape — the exact field set the Booking API returns.
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            business_id: this.business_id,
            product_id: this.product_id,
            branch_id: this.branch_id,
            customer_account_id: this.customer_account_id,
            slot_start: this.slot_start,
            slot_end: this.slot_end,
            status: this.status,
            availment_id: this.availment_id,
            cancelled_at: this.cancelled_at,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

/**
 * @param {Object} attrs
 * @returns {BookingEntity}
 */
export const createBookingEntity = (attrs) => new BookingEntity(attrs);

export default BookingEntity;
