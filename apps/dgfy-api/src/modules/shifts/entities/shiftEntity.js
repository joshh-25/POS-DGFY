// ShiftEntity — Clean Architecture Entity layer (Enterprise Business Rules),
// mirroring ../../businesses/entities/businessEntity.js's role. Holds shift
// shape and minimal domain helpers, completely separate from persistence
// (the Shift Sequelize model, 08-02-SUMMARY.md) and HTTP concerns.
// shiftRepository.js translates Sequelize model rows -> plain objects
// directly (mirrors locationRepository.js's toPlain() convention); this
// entity is used by the usecase layer (shiftUseCases.js's listShifts) to
// attach the is_stale flag (D-11) without embedding that computation in the
// repository (a pure data-access adapter) or the model.

export class ShiftEntity {
    constructor({
        id = null,
        business_id = null,
        terminal_id = null,
        cashier_account_id = null,
        cashier_dgfy_account_id = null,
        status = 'open',
        opening_float_amount = null,
        expected_cash_amount = null,
        closing_cash_amount = null,
        cash_variance_amount = null,
        opened_at = null,
        closed_at = null,
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.business_id = business_id;
        this.terminal_id = terminal_id;
        this.cashier_account_id = cashier_account_id;
        this.cashier_dgfy_account_id = cashier_dgfy_account_id;
        this.status = status;
        this.opening_float_amount = opening_float_amount;
        this.expected_cash_amount = expected_cash_amount;
        this.closing_cash_amount = closing_cash_amount;
        this.cash_variance_amount = cash_variance_amount;
        this.opened_at = opened_at;
        this.closed_at = closed_at;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /** @returns {boolean} */
    isOpen() {
        return this.status === 'open';
    }

    /**
     * D-11: a shift open past thresholdMinutes is flagged stale — this is a
     * pure read-time computation, never a trigger for auto-closing. Closed
     * shifts (or shifts with no opened_at, which should never happen but is
     * guarded defensively) are never stale.
     * @param {number} thresholdMinutes - operator-configurable (D-11); this
     *   entity never hardcodes a default, the caller (usecase, closed over
     *   the module's injected staleThresholdMinutes) always supplies it.
     * @param {Date} [now]
     * @returns {boolean}
     */
    isStale(thresholdMinutes, now = new Date()) {
        if (!this.isOpen() || !this.opened_at) return false;
        const threshold = Number(thresholdMinutes);
        if (!Number.isFinite(threshold) || threshold <= 0) return false;
        const openedAtMs = new Date(this.opened_at).getTime();
        const ageMinutes = (now.getTime() - openedAtMs) / 60000;
        return ageMinutes > threshold;
    }

    /**
     * Public response shape — the stable field set the Shifts API returns.
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            business_id: this.business_id,
            terminal_id: this.terminal_id,
            cashier_account_id: this.cashier_account_id,
            cashier_dgfy_account_id: this.cashier_dgfy_account_id,
            status: this.status,
            opening_float_amount: this.opening_float_amount,
            expected_cash_amount: this.expected_cash_amount,
            closing_cash_amount: this.closing_cash_amount,
            cash_variance_amount: this.cash_variance_amount,
            opened_at: this.opened_at,
            closed_at: this.closed_at,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

/**
 * @param {Object} attrs
 * @returns {ShiftEntity}
 */
export const createShiftEntity = (attrs) => new ShiftEntity(attrs);

export default ShiftEntity;
