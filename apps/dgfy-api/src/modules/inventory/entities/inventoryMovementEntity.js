// InventoryMovementEntity — Clean Architecture Entity layer (Enterprise
// Business Rules), mirroring ../../businesses/entities/businessEntity.js's
// role. Holds the append-only inventory_movements row shape and minimal
// domain helpers, completely separate from persistence (the InventoryMovement
// Sequelize model) and HTTP concerns. InventoryMovementRepository translates
// Sequelize model rows <-> plain objects via toPlain() directly; this entity
// is available for any usecase/controller that wants a richer domain object
// (e.g. isReservedEffect() to distinguish a wired manual movement from a
// future D-06 sale/booking effect row) instead of the plain shape.

export class InventoryMovementEntity {
    constructor({
        id = null,
        business_id = null,
        product_id = null,
        movement_type = null,
        quantity = null,
        reference_type = null,
        reference_id = null,
        actor_account_id = null,
        actor_staff_account_id = null,
        before_snapshot = null,
        after_snapshot = null,
        created_at = null
    } = {}) {
        this.id = id;
        this.business_id = business_id;
        this.product_id = product_id;
        this.movement_type = movement_type;
        this.quantity = quantity;
        this.reference_type = reference_type;
        this.reference_id = reference_id;
        this.actor_account_id = actor_account_id;
        this.actor_staff_account_id = actor_staff_account_id;
        this.before_snapshot = before_snapshot;
        this.after_snapshot = after_snapshot;
        this.created_at = created_at;
    }

    /** @returns {boolean} */
    isRestock() {
        return this.movement_type === 'restock';
    }

    /** @returns {boolean} */
    isLoss() {
        return this.movement_type === 'loss';
    }

    /** @returns {boolean} */
    isAdjustment() {
        return this.movement_type === 'adjustment';
    }

    /**
     * True for the reserved (unwired, D-06) sale/booking effect-type rows.
     * Nothing writes these yet this phase — see usecases/inventoryEffectContracts.js.
     * @returns {boolean}
     */
    isReservedEffect() {
        return this.movement_type === 'sale' || this.movement_type === 'booking';
    }

    /**
     * Public response shape — the append-only ledger row's stable field set.
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            business_id: this.business_id,
            product_id: this.product_id,
            movement_type: this.movement_type,
            quantity: this.quantity,
            reference_type: this.reference_type,
            reference_id: this.reference_id,
            actor_account_id: this.actor_account_id,
            actor_staff_account_id: this.actor_staff_account_id,
            before_snapshot: this.before_snapshot,
            after_snapshot: this.after_snapshot,
            created_at: this.created_at
        };
    }
}

/**
 * @param {Object} attrs
 * @returns {InventoryMovementEntity}
 */
export const createInventoryMovementEntity = (attrs) => new InventoryMovementEntity(attrs);

export default InventoryMovementEntity;
