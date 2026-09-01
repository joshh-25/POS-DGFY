import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildOverrideDeliveryFeeUseCase } from '../src/modules/pos/usecases/deliveryFeeOverrideUseCases.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createTransactionHandle = () => {
    const handle = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => { handle.finished = true; }),
        rollback: jest.fn(async () => { handle.finished = true; })
    };
    return handle;
};

const buildFixture = ({ transactionOverrides = {} } = {}) => {
    const state = {
        transaction: {
            pos_transaction_id: 501,
            invoice_number: 'NFS-000501',
            order_method: 'delivery',
            status: 'completed',
            payment_status: 'unpaid',
            delivery_fee: 80,
            subtotal_amount: 500,
            total_amount: 580,
            amount_paid: 0,
            // A real unpaid order always has balance_due: 0 (see deliveryFeeOverrideUseCases.js's
            // RF-1 comment on PR #1336) -- 580 here was an impossible fixture that hid the bug the
            // "leaves balance_due at 0" regression test below now covers.
            balance_due: 0,
            cashier_id: 12,
            location_id: 3,
            ...transactionOverrides
        },
        auditLogs: []
    };
    const sequelize = {
        transaction: jest.fn(async () => createTransactionHandle())
    };
    const posRepository = {
        async getTransactionById(transactionId) {
            if (Number(transactionId) !== Number(state.transaction.pos_transaction_id)) return null;
            return clone(state.transaction);
        },
        async updateTransactionLifecycle(transactionId, payload) {
            if (Number(transactionId) !== Number(state.transaction.pos_transaction_id)) return null;
            state.transaction = { ...state.transaction, ...clone(payload) };
            return clone(state.transaction);
        },
        async createAuditLog(payload) {
            state.auditLogs.push(clone(payload));
            return clone(payload);
        }
    };

    return { state, sequelize, posRepository };
};

const runInTenantContext = (sequelize, callback) => dbStore.run({
    tenantId: 'tenant-masu',
    sequelize
}, callback);

describe('POS staff delivery-fee override use case (Phase 238, #1330)', () => {
    it('overrides the fee while unpaid, recomputes total, leaves balance_due at 0, and writes an audit_logs row', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'Rider surcharge for flooded route' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction.delivery_fee).toBe(150);
        expect(result.data.transaction.total_amount).toBe(650);
        expect(result.data.transaction.balance_due).toBe(0);
        expect(result.data.delivery_fee_override).toEqual(expect.objectContaining({
            previous_delivery_fee: 80,
            new_delivery_fee: 150,
            previous_total_amount: 580,
            new_total_amount: 650,
            previous_balance_due: 0,
            new_balance_due: 0,
            no_op: false
        }));
        expect(fixture.state.auditLogs).toHaveLength(1);
        expect(fixture.state.auditLogs[0]).toEqual(expect.objectContaining({
            user_id: 44,
            entity_type: 'pos_transaction',
            entity_id: 501,
            action: 'UPDATE',
            event_type: 'pos_delivery_fee_overridden',
            terminal_id: null,
            shift_id: null,
            location_id: 3,
            reason: 'Rider surcharge for flooded route'
        }));
        expect(fixture.state.auditLogs[0].changes).toEqual(expect.objectContaining({
            previous_delivery_fee: 80,
            new_delivery_fee: 150,
            payment_status_at_override: 'unpaid'
        }));
    });

    // RF-1/RF-2 regression (PR #1336 review): a real unpaid COD order always has balance_due: 0,
    // and no code path ever clears it after collection -- a naive "recompute from amount_paid"
    // would flip it to the full new total and permanently brick delivery completion
    // (posUseCases.js:1511, DELIVERY_BALANCE_DUE_OUTSTANDING) while risking a double charge.
    it('leaves balance_due at 0 on a real unpaid COD order after an override', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 200, reason: 'COD order, rider surcharge' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(true);
        expect(fixture.state.transaction.payment_status).toBe('unpaid');
        expect(fixture.state.transaction.amount_paid).toBe(0);
        expect(result.data.transaction.delivery_fee).toBe(200);
        expect(result.data.transaction.total_amount).toBe(700);
        expect(result.data.transaction.balance_due).toBe(0);
    });

    it('handles a fee decrease and floors balance_due at zero', async () => {
        const fixture = buildFixture({ transactionOverrides: { delivery_fee: 80, total_amount: 580, balance_due: 580 } });
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 0, reason: 'Waived: address was inside free-delivery zone' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction.delivery_fee).toBe(0);
        expect(result.data.transaction.total_amount).toBe(500);
        expect(result.data.transaction.balance_due).toBe(500);
    });

    it('is a no-op (no DB write, no audit row) when the same fee is resubmitted', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 80, reason: 'Resubmitted retry, same amount' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.delivery_fee_override.no_op).toBe(true);
        expect(fixture.state.auditLogs).toHaveLength(0);
        expect(fixture.state.transaction.total_amount).toBe(580);
    });

    it('refuses the override once payment has been collected (paid)', async () => {
        const fixture = buildFixture({ transactionOverrides: { payment_status: 'paid', amount_paid: 580, balance_due: 0 } });
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'Too late, already paid' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details?.reason_code).toBe('DELIVERY_FEE_OVERRIDE_PAYMENT_SETTLED');
        expect(fixture.state.auditLogs).toHaveLength(0);
        expect(fixture.state.transaction.delivery_fee).toBe(80);
    });

    it('refuses the override on a partially_paid (downpayment) order', async () => {
        const fixture = buildFixture({ transactionOverrides: { payment_status: 'partially_paid', amount_paid: 200, balance_due: 380 } });
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'Downpayment already collected' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details?.reason_code).toBe('DELIVERY_FEE_OVERRIDE_PAYMENT_SETTLED');
    });

    it('refuses the override on a non-delivery order', async () => {
        const fixture = buildFixture({ transactionOverrides: { order_method: 'pickup' } });
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'Not a delivery order' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.details?.reason_code).toBe('DELIVERY_FEE_OVERRIDE_NOT_A_DELIVERY_ORDER');
    });

    it('refuses the override on a voided transaction', async () => {
        const fixture = buildFixture({ transactionOverrides: { status: 'voided' } });
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'Voided order' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details?.reason_code).toBe('POS_TRANSACTION_VOIDED');
    });

    it('requires a reason of at least 3 characters', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'ok' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.transaction.delivery_fee).toBe(80);
    });

    it('requires an authenticated actor', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 150, reason: 'No actor on the request' },
            user: {}
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('rejects a negative delivery_fee', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: -10, reason: 'Negative fee should be rejected' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns not-found for a nonexistent transaction', async () => {
        const fixture = buildFixture();
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 999999,
            payload: { delivery_fee: 150, reason: 'Transaction does not exist' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });
});
