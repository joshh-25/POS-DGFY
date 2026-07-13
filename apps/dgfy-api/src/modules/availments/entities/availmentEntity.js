// AvailmentEntity — Clean Architecture Entity layer, mirroring
// ../../inventory/entities/inventoryMovementEntity.js's role. Holds the
// availment row shape plus its items array and minimal domain helpers,
// completely separate from persistence (the Availment Sequelize model) and
// HTTP concerns. This entity is available for any usecase/controller that
// wants a richer domain object (e.g. isFinalized() or isCancelledLine())
// instead of the plain shape.

export class AvailmentEntity {
    constructor({
        id = null,
        business_id = null,
        branch_id = null,
        customer_account_id = null,
        cashier_account_id = null,
        cashier_dgfy_account_id = null,
        terminal_id = null,
        shift_id = null,
        status = 'draft',
        document_context = null,
        subtotal_amount = null,
        discount_amount = null,
        vat_amount = null,
        vat_exempt_amount = null,
        total_amount = null,
        sc_pwd_id_number = null,
        sc_pwd_metadata = null,
        finalized_at = null,
        items = [],
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.business_id = business_id;
        this.branch_id = branch_id;
        this.customer_account_id = customer_account_id;
        this.cashier_account_id = cashier_account_id;
        this.cashier_dgfy_account_id = cashier_dgfy_account_id;
        this.terminal_id = terminal_id;
        this.shift_id = shift_id;
        this.status = status;
        this.document_context = document_context;
        this.subtotal_amount = subtotal_amount;
        this.discount_amount = discount_amount;
        this.vat_amount = vat_amount;
        this.vat_exempt_amount = vat_exempt_amount;
        this.total_amount = total_amount;
        this.sc_pwd_id_number = sc_pwd_id_number;
        this.sc_pwd_metadata = sc_pwd_metadata;
        this.finalized_at = finalized_at;
        this.items = items || [];
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /** @returns {boolean} */
    isFinalized() {
        return this.status === 'finalized';
    }

    /** @returns {boolean} */
    isDraft() {
        return this.status === 'draft';
    }

    /**
     * Returns true if the given availment_items row is cancelled
     * (soft-deleted). Used to filter the current active lines for receipt
     * rendering and stock-effect calculation.
     * @param {Object} item
     * @returns {boolean}
     */
    isCancelledLine(item) {
        return item && item.cancelled_at != null;
    }

    /**
     * Public response shape — the stable field set of the availment header,
     * excluding the full items/discounts/payments arrays (those are in the
     * plain shape via getters or separate calls).
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            business_id: this.business_id,
            branch_id: this.branch_id,
            customer_account_id: this.customer_account_id,
            cashier_account_id: this.cashier_account_id,
            cashier_dgfy_account_id: this.cashier_dgfy_account_id,
            terminal_id: this.terminal_id,
            shift_id: this.shift_id,
            status: this.status,
            document_context: this.document_context,
            subtotal_amount: this.subtotal_amount,
            discount_amount: this.discount_amount,
            vat_amount: this.vat_amount,
            vat_exempt_amount: this.vat_exempt_amount,
            total_amount: this.total_amount,
            sc_pwd_id_number: this.sc_pwd_id_number,
            sc_pwd_metadata: this.sc_pwd_metadata,
            finalized_at: this.finalized_at,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

/**
 * @param {Object} attrs
 * @returns {AvailmentEntity}
 */
export const createAvailmentEntity = (attrs) => new AvailmentEntity(attrs);

export default AvailmentEntity;
