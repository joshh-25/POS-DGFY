import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildOverrideDeliveryFeeUseCase } from '../src/modules/pos/usecases/deliveryFeeOverrideUseCases.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

// PosTransaction.js's two-part delivery-fee invariant, asserted as one helper so every test below
// checks BOTH halves rather than the half that happens to be convenient (#1564):
//   override IS NULL     -> base - waiver === delivery_fee
//   override IS NOT NULL -> delivery_fee === override (base/waiver retained, deliberately not
//                           reconciling -- they are the pre-override provenance)
const expectDeliveryFeeInvariant = (row) => {
    const fee = Number(row.delivery_fee);
    const base = Number(row.delivery_fee_base);
    const waiver = Number(row.delivery_fee_waiver);
    const override = row.delivery_fee_override;

    if (override === null || override === undefined) {
        expect(Math.max(0, base - waiver)).toBe(fee);
        return;
    }
    expect(Number(override)).toBe(fee);
};

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
            // #1564: the Phase 237 (#1329) money-provenance columns this fixture previously
            // omitted entirely -- which is why the original 12 tests could not have caught the
            // missing delivery_fee_override write. A storefront-checkout delivery order at rest:
            // base - waiver === delivery_fee, override NULL (no override has happened yet).
            delivery_fee_mode: 'fixed',
            delivery_fee_base: 80,
            delivery_fee_waiver: 0,
            delivery_fee_override: null,
            delivery_fee_calc_version: 1,
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
        // #1564: the persisted override amount, which this use case previously never wrote.
        expect(result.data.transaction.delivery_fee_override).toBe(150);
        expect(result.data.delivery_fee_override).toEqual(expect.objectContaining({
            previous_delivery_fee: 80,
            new_delivery_fee: 150,
            previous_delivery_fee_override: null,
            new_delivery_fee_override: 150,
            previous_total_amount: 580,
            new_total_amount: 650,
            previous_balance_due: 0,
            new_balance_due: 0,
            provenance_only: false,
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
            previous_delivery_fee_override: null,
            new_delivery_fee_override: 150,
            provenance_only: false,
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

    // #1564 narrows the no-op: matching money is no longer enough on its own, the provenance
    // column has to already be at the target too. A genuine retry of a successful override always
    // satisfies both (the first call wrote the override), so retry idempotency is unchanged --
    // this fixture reflects the post-first-override state that a retry actually sees.
    it('is a no-op (no DB write, no audit row) when the same fee is resubmitted after an override', async () => {
        const fixture = buildFixture({ transactionOverrides: { delivery_fee_override: 80 } });
        const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 501,
            payload: { delivery_fee: 80, reason: 'Resubmitted retry, same amount' },
            user: { user_id: 44 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.delivery_fee_override.no_op).toBe(true);
        expect(result.data.delivery_fee_override.provenance_only).toBe(false);
        expect(fixture.state.auditLogs).toHaveLength(0);
        expect(fixture.state.transaction.total_amount).toBe(580);
        expect(fixture.state.transaction.delivery_fee_override).toBe(80);
        expectDeliveryFeeInvariant(fixture.state.transaction);
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
    // ---------------------------------------------------------------------------------------
    // Phase 281 (#1564): delivery-fee override provenance.
    //
    // Phase 237 (#1329) added pos_transactions.delivery_fee_mode/base/waiver/override/calc_version
    // and documented the invariant on the model. Phase 238 (#1330), written against the flat
    // column only, never wrote delivery_fee_override -- so every applied override left a row
    // claiming `base - waiver === delivery_fee` (override NULL) while that arithmetic no longer
    // held, with nothing in the columns to explain it.
    // ---------------------------------------------------------------------------------------
    describe('override provenance (#1564)', () => {
        it('records delivery_fee_override so the base/waiver invariant is superseded by design, not silently violated', async () => {
            const fixture = buildFixture();
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

            // Pre-state: the formula's own number, invariant's first half holding.
            expectDeliveryFeeInvariant(fixture.state.transaction);

            const result = await runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 150, reason: 'Rider surcharge, flooded route' },
                user: { user_id: 44 }
            }));

            expect(result.success).toBe(true);
            const row = fixture.state.transaction;

            // The regression itself: without the override write this is exactly the silent
            // violation #1564 describes -- fee moved, base/waiver did not, override still NULL.
            expect(row.delivery_fee).toBe(150);
            expect(row.delivery_fee_base).toBe(80);
            expect(row.delivery_fee_waiver).toBe(0);
            expect(row.delivery_fee_override).toBe(150);
            expect(row.delivery_fee_base - row.delivery_fee_waiver).not.toBe(row.delivery_fee);

            // ...and that is fine, because the override column now says why. Second half holds.
            expectDeliveryFeeInvariant(row);
        });

        it('leaves delivery_fee_base/waiver/mode/calc_version untouched as pre-override provenance', async () => {
            const fixture = buildFixture();
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

            await runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 25, reason: 'Goodwill reduction, late delivery' },
                user: { user_id: 44 }
            }));

            // The override replaces the RESULT outright (ADR 0012's 2026-09-02 amendment); it never
            // back-computes a base or a waiver to make the old arithmetic reconcile.
            expect(fixture.state.transaction).toEqual(expect.objectContaining({
                delivery_fee_mode: 'fixed',
                delivery_fee_base: 80,
                delivery_fee_waiver: 0,
                delivery_fee_calc_version: 1,
                delivery_fee: 25,
                delivery_fee_override: 25
            }));
        });

        it('persists a waive-to-free override as 0, never NULL (the null-vs-zero distinction)', async () => {
            const fixture = buildFixture({ transactionOverrides: { balance_due: 580 } });
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

            const result = await runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 0, reason: 'Waived: address inside the free-delivery zone' },
                user: { user_id: 44 }
            }));

            expect(result.success).toBe(true);
            // 0 means "staff set it free"; NULL would mean "no override happened" -- conflating the
            // two is exactly what PosTransaction.js's nullable column exists to prevent.
            expect(fixture.state.transaction.delivery_fee_override).toBe(0);
            expect(fixture.state.transaction.delivery_fee_override).not.toBeNull();
            expect(fixture.state.transaction.delivery_fee).toBe(0);
            expectDeliveryFeeInvariant(fixture.state.transaction);
        });

        it('records the override on a POS-created delivery order that carries no storefront breakdown', async () => {
            // POS cashier checkout writes delivery_fee: 0 and never populates the breakdown columns
            // (posUseCases.js), so those rows sit at the column defaults. An override on one still
            // has to leave a provenance trail.
            const fixture = buildFixture({
                transactionOverrides: {
                    delivery_fee: 0,
                    delivery_fee_base: 0,
                    delivery_fee_waiver: 0,
                    delivery_fee_override: null,
                    total_amount: 500,
                    balance_due: 0
                }
            });
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

            const result = await runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 120, reason: 'Manual delivery fee for a POS-created order' },
                user: { user_id: 44 }
            }));

            expect(result.success).toBe(true);
            expect(fixture.state.transaction.delivery_fee).toBe(120);
            expect(fixture.state.transaction.delivery_fee_override).toBe(120);
            expect(fixture.state.transaction.total_amount).toBe(620);
            expectDeliveryFeeInvariant(fixture.state.transaction);
        });

        it('repairs a pre-#1564 row (fee already overridden, provenance still NULL) without moving any money', async () => {
            // The state Phase 238 left behind and that no backfill will fix (ADR 0012 is
            // forward-only): delivery_fee was overridden to 150, base/waiver still say 80/0, and
            // delivery_fee_override is NULL. Resubmitting the same 150 must stamp provenance.
            const fixture = buildFixture({
                transactionOverrides: {
                    delivery_fee: 150,
                    delivery_fee_base: 80,
                    delivery_fee_waiver: 0,
                    delivery_fee_override: null,
                    total_amount: 650,
                    balance_due: 0
                }
            });
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

            const result = await runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 150, reason: 'Re-confirming the surcharge already applied' },
                user: { user_id: 44 }
            }));

            expect(result.success).toBe(true);
            expect(result.data.delivery_fee_override).toEqual(expect.objectContaining({
                no_op: false,
                provenance_only: true,
                previous_delivery_fee: 150,
                new_delivery_fee: 150,
                previous_delivery_fee_override: null,
                new_delivery_fee_override: 150,
                previous_total_amount: 650,
                new_total_amount: 650,
                previous_balance_due: 0,
                new_balance_due: 0
            }));
            // No money moved -- only the provenance column changed.
            expect(fixture.state.transaction.delivery_fee).toBe(150);
            expect(fixture.state.transaction.total_amount).toBe(650);
            expect(fixture.state.transaction.balance_due).toBe(0);
            expect(fixture.state.transaction.delivery_fee_override).toBe(150);
            expectDeliveryFeeInvariant(fixture.state.transaction);

            // A repair is a real, reasoned staff action, so it is audited like any other -- and
            // distinguishably, via provenance_only.
            expect(fixture.state.auditLogs).toHaveLength(1);
            expect(fixture.state.auditLogs[0].changes).toEqual(expect.objectContaining({
                provenance_only: true,
                previous_delivery_fee_override: null,
                new_delivery_fee_override: 150
            }));
        });

        it('is a true no-op on the resubmit that follows a repair (retry idempotency preserved)', async () => {
            const fixture = buildFixture({
                transactionOverrides: {
                    delivery_fee: 150,
                    delivery_fee_override: null,
                    total_amount: 650,
                    balance_due: 0
                }
            });
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });
            const submit = () => runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 150, reason: 'Retried request, same absolute amount' },
                user: { user_id: 44 }
            }));

            const first = await submit();
            const second = await submit();

            expect(first.data.delivery_fee_override.provenance_only).toBe(true);
            expect(second.data.delivery_fee_override.no_op).toBe(true);
            // Exactly one audit row across both submits -- the retry adds nothing.
            expect(fixture.state.auditLogs).toHaveLength(1);
            expect(fixture.state.transaction.total_amount).toBe(650);
        });

        it('fails loudly (INTERNAL_ERROR) if persistence silently drops the delivery_fee_override write', async () => {
            // A tenant DB still missing the Phase 237 column, or a repository that filters unknown
            // attributes, would otherwise reproduce this exact bug silently. The post-write
            // assertion has to cover provenance, not just the money.
            const fixture = buildFixture();
            fixture.posRepository.updateTransactionLifecycle = async (transactionId, payload) => {
                const persisted = { ...payload };
                delete persisted.delivery_fee_override;
                fixture.state.transaction = { ...fixture.state.transaction, ...persisted };
                return { ...fixture.state.transaction };
            };
            const useCase = buildOverrideDeliveryFeeUseCase({ posRepository: fixture.posRepository });

            const result = await runInTenantContext(fixture.sequelize, () => useCase({
                posTransactionId: 501,
                payload: { delivery_fee: 150, reason: 'Provenance column dropped by persistence' },
                user: { user_id: 44 }
            }));

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INTERNAL_ERROR');
            expect(fixture.state.auditLogs).toHaveLength(0);
        });
    });
});
