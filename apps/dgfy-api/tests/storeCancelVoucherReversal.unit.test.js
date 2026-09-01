// Unit tests for #1390 (Phase 242, epic #1321): a cancelled storefront order now reverses whichever
// voucher redemption(s) it recorded at checkout -- item axis, delivery axis, or both.
//
// No database anywhere in this file. storeRepository is a hand-built fake mirroring
// storeCancelDownpaymentLifecycle.unit.test.js's own shape (that suite pins the ADJACENT concern --
// this function's payment-lifecycle block, post-commit and fail-open -- and is unmodified by this
// change; its own regression coverage is left alone).
//
// The voucher REPOSITORY is faked (not mocked via jest.unstable_mockModule) and passed straight to
// `buildReverseVoucherRedemptionUseCase`, so the REAL reversal logic -- idempotency pre-check,
// symmetric decrement floored at zero, the negated ledger row, mirrored line allocations -- runs for
// real against an in-memory store, the same pattern storeCheckoutDeliveryWaiverDualAxis.unit.test.js
// already establishes one call site over. The built use case is wrapped in a jest.fn spy so call
// count/arguments can still be asserted without re-mocking its internals.

import { describe, expect, it, jest } from '@jest/globals';
import { buildCancelStoreOrderUseCase } from '../src/modules/store/usecases/storeUseCases.js';
import { buildReverseVoucherRedemptionUseCase } from '../src/modules/vouchers/usecases/voucherReversalUseCases.js';
import { generateStoreCancelProof } from '../src/modules/store/utils/storeJwtToken.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TRACKING_PIN = 'SK-CANCEL';
const ORDER_ID = 903;

const ITEM_VOUCHER_ID = 501;
const DELIVERY_VOUCHER_ID = 502;

const makeTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const baseOrder = (overrides = {}) => ({
    pos_transaction_id: ORDER_ID,
    tracking_pin: TRACKING_PIN,
    store_customer_id: 55,
    fulfillment_status: 'placed',
    idempotency_key: 'chk-key-12345',
    delivery_fee_waiver_voucher_id: null,
    discount: null,
    ...overrides
});

const itemVoucherFixture = (overrides = {}) => ({
    voucher_id: ITEM_VOUCHER_ID,
    redeemed_count: 1,
    redeemed_value_centavos: 1000,
    redeemed_quantity: 0,
    version: 1,
    ...overrides
});

const deliveryVoucherFixture = (overrides = {}) => ({
    voucher_id: DELIVERY_VOUCHER_ID,
    redeemed_count: 1,
    redeemed_value_centavos: 5000,
    redeemed_quantity: 0,
    version: 1,
    ...overrides
});

// A fresh (non-reversal) redemption row, as `createRedemptionLedgerEntry` would have written it at
// checkout time -- shape mirrors VoucherRedemption's own columns.
const redemptionRow = ({
    id,
    voucherId,
    benefitTarget,
    discountCentavos,
    posTransactionId = ORDER_ID,
    idempotencyKey
}) => ({
    voucher_redemption_id: id,
    voucher_id: voucherId,
    entry_type: 'redemption',
    pos_transaction_id: posTransactionId,
    channel: 'storefront',
    location_id: null,
    store_customer_id: 55,
    code_snapshot: benefitTarget === 'delivery' ? 'FREEDEL' : 'ITEM10',
    benefit_config_snapshot: { benefit_target: benefitTarget },
    subtotal_centavos: 10000,
    discount_centavos: discountCentavos,
    benefit_quantity: 0,
    redeemed_count_before: 0,
    redeemed_count_after: 1,
    redeemed_value_before_centavos: 0,
    redeemed_value_after_centavos: discountCentavos,
    redeemed_quantity_before: 0,
    redeemed_quantity_after: 0,
    idempotency_key: idempotencyKey
});

const buildFakeVoucherRepository = ({ vouchers = [], redemptions = [] } = {}) => {
    const state = {
        vouchers: vouchers.map((v) => ({ ...v })),
        redemptions: redemptions.map((r) => ({ ...r })),
        lines: [],
        nextRedemptionId: 1000
    };

    const findVoucher = (id) => state.vouchers.find((v) => v.voucher_id === Number(id));

    return {
        __state: state,
        async findById(id) {
            const row = findVoucher(id);
            return row ? { ...row } : null;
        },
        async findRedemptionByIdempotencyKey(key) {
            const row = state.redemptions.find((r) => r.idempotency_key === key);
            return row ? { ...row } : null;
        },
        async findRedemptionById(id) {
            const row = state.redemptions.find((r) => r.voucher_redemption_id === Number(id));
            return row ? { ...row } : null;
        },
        async listRedemptionsByTransactionId(posTransactionId) {
            return state.redemptions
                .filter((r) => r.pos_transaction_id === Number(posTransactionId) && r.channel === 'storefront')
                .sort((a, b) => a.voucher_redemption_id - b.voucher_redemption_id)
                .map((r) => ({ ...r }));
        },
        async reverseRedemptionCounters(voucherId, { discountCentavos, quantity } = {}) {
            const voucher = findVoucher(voucherId);
            if (!voucher) return 0;
            voucher.redeemed_count = Math.max(0, voucher.redeemed_count - 1);
            voucher.redeemed_value_centavos = Math.max(0, voucher.redeemed_value_centavos - (Number(discountCentavos) || 0));
            voucher.redeemed_quantity = Math.max(0, voucher.redeemed_quantity - (Number(quantity) || 0));
            voucher.version += 1;
            return 1;
        },
        async createRedemptionLedgerEntry(values) {
            const entry = { voucher_redemption_id: state.nextRedemptionId++, ...values };
            state.redemptions.push(entry);
            return { ...entry };
        },
        async listRedemptionLines(voucherRedemptionId) {
            return state.lines.filter((l) => l.voucher_redemption_id === voucherRedemptionId).map((l) => ({ ...l }));
        },
        async createRedemptionLines(values) {
            const rows = Array.isArray(values) ? values : [values];
            state.lines.push(...rows);
            return rows;
        }
    };
};

const build = ({ voucherRepository, order = baseOrder(), reverseImplOverride = null } = {}) => {
    const transaction = makeTransaction();
    const storeRepository = {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        getOrderByTrackingPin: jest.fn()
            .mockResolvedValueOnce(order)
            .mockResolvedValueOnce({ ...order, fulfillment_status: 'cancelled' }),
        updateOrderByTrackingPin: jest.fn().mockResolvedValue({ ...order, fulfillment_status: 'cancelled' })
    };
    const inventoryReservationService = { releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' }) };
    const realReverse = buildReverseVoucherRedemptionUseCase({ repository: voucherRepository });
    const reverseVoucherRedemptionUseCase = jest.fn(reverseImplOverride || realReverse);

    const useCase = buildCancelStoreOrderUseCase({
        storeRepository,
        inventoryReservationService,
        voucherRepository,
        reverseVoucherRedemptionUseCase
    });

    return { useCase, transaction, storeRepository, inventoryReservationService, reverseVoucherRedemptionUseCase, voucherRepository };
};

const run = (fixture, overrides = {}) => fixture.useCase({
    trackingPin: TRACKING_PIN,
    tenantId: TENANT_ID,
    storeCustomer: { customer_id: 55 },
    payload: {},
    ...overrides
});

describe('storefront order cancellation reverses its voucher redemption(s) (#1390)', () => {
    // Case 1
    it('reverses an item-axis-only redemption', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture()],
            redemptions: [redemptionRow({
                id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
            })]
        });
        const fixture = build({
            voucherRepository,
            order: baseOrder({ discount: { discount_type: 'voucher' } })
        });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).toHaveBeenCalledTimes(1);
        expect(fixture.reverseVoucherRedemptionUseCase).toHaveBeenCalledWith(expect.objectContaining({
            originalRedemptionId: 1,
            reason: `Storefront order cancelled (${TRACKING_PIN})`
        }));
        expect(result.data.voucher_reversal).toMatchObject({ attempted: 1, reversed: 1 });

        const reversalRow = voucherRepository.__state.redemptions.find((r) => r.entry_type === 'reversal');
        expect(reversalRow).toBeDefined();
        expect(reversalRow.discount_centavos).toBe(-1000);
        const voucherAfter = voucherRepository.__state.vouchers.find((v) => v.voucher_id === ITEM_VOUCHER_ID);
        expect(voucherAfter.redeemed_count).toBe(0);
        expect(voucherAfter.redeemed_value_centavos).toBe(0);
    });

    // Case 2
    it('reverses a delivery-axis-only redemption with zero benefit_quantity and no mirrored lines', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [deliveryVoucherFixture()],
            redemptions: [redemptionRow({
                id: 2, voucherId: DELIVERY_VOUCHER_ID, benefitTarget: 'delivery', discountCentavos: 5000,
                idempotencyKey: `storefront:chk-key-12345:delivery:${DELIVERY_VOUCHER_ID}`
            })]
        });
        const fixture = build({
            voucherRepository,
            order: baseOrder({ delivery_fee_waiver_voucher_id: DELIVERY_VOUCHER_ID })
        });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).toHaveBeenCalledTimes(1);
        expect(result.data.voucher_reversal.entries[0]).toMatchObject({ benefit_target: 'delivery' });

        const reversalRow = voucherRepository.__state.redemptions.find((r) => r.entry_type === 'reversal');
        // Math.abs, not toBe(0) -- the real use case computes `-benefitQuantity`, which is -0 (not
        // 0) when the original was already 0, per JS's own signed-zero arithmetic. -0 is 0 to MySQL
        // and to every consumer of this column; only Jest's Object.is-based toBe cares about the
        // sign bit, so the assertion is written to not care about it either.
        expect(Math.abs(reversalRow.benefit_quantity)).toBe(0);
        expect(voucherRepository.__state.lines).toHaveLength(0);
    });

    // Case 3 (headline)
    it('reverses BOTH axes independently when an order carries an item and a delivery voucher', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture(), deliveryVoucherFixture()],
            redemptions: [
                redemptionRow({
                    id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                    idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
                }),
                redemptionRow({
                    id: 2, voucherId: DELIVERY_VOUCHER_ID, benefitTarget: 'delivery', discountCentavos: 5000,
                    idempotencyKey: `storefront:chk-key-12345:delivery:${DELIVERY_VOUCHER_ID}`
                })
            ]
        });
        const fixture = build({
            voucherRepository,
            order: baseOrder({ discount: { discount_type: 'voucher' }, delivery_fee_waiver_voucher_id: DELIVERY_VOUCHER_ID })
        });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).toHaveBeenCalledTimes(2);
        expect(result.data.voucher_reversal).toMatchObject({ attempted: 2, reversed: 2 });
        const targets = result.data.voucher_reversal.entries.map((e) => e.benefit_target).sort();
        expect(targets).toEqual(['delivery', 'items']);

        const itemVoucherAfter = voucherRepository.__state.vouchers.find((v) => v.voucher_id === ITEM_VOUCHER_ID);
        const deliveryVoucherAfter = voucherRepository.__state.vouchers.find((v) => v.voucher_id === DELIVERY_VOUCHER_ID);
        expect(itemVoucherAfter.redeemed_count).toBe(0);
        expect(deliveryVoucherAfter.redeemed_count).toBe(0);
    });

    // Case 4
    it('is a zero-query no-op when the order carries no voucher at all', async () => {
        const voucherRepository = buildFakeVoucherRepository({});
        jest.spyOn(voucherRepository, 'listRedemptionsByTransactionId');
        const fixture = build({ voucherRepository, order: baseOrder() });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).not.toHaveBeenCalled();
        expect(voucherRepository.listRedemptionsByTransactionId).not.toHaveBeenCalled();
        expect(result.data.voucher_reversal).toEqual({ attempted: 0, reversed: 0, entries: [] });
    });

    // Case 5
    it('is idempotent when the reversal ledger row already exists', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture({ redeemed_count: 0, redeemed_value_centavos: 0 })],
            redemptions: [
                redemptionRow({
                    id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                    idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
                }),
                // Already reversed in a prior (interrupted) attempt.
                { voucher_redemption_id: 999, voucher_id: ITEM_VOUCHER_ID, entry_type: 'reversal', discount_centavos: -1000, idempotency_key: 'reversal:1' }
            ]
        });
        jest.spyOn(voucherRepository, 'reverseRedemptionCounters');
        jest.spyOn(voucherRepository, 'createRedemptionLedgerEntry');
        const fixture = build({
            voucherRepository,
            order: baseOrder({ discount: { discount_type: 'voucher' } })
        });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(voucherRepository.reverseRedemptionCounters).not.toHaveBeenCalled();
        expect(voucherRepository.createRedemptionLedgerEntry).not.toHaveBeenCalled();
        expect(result.data.voucher_reversal.entries[0]).toMatchObject({ idempotent_replay: true, reversal_id: 999 });
    });

    // Case 6
    it('rejects a re-cancel with 409 before any voucher work runs', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture()],
            redemptions: [redemptionRow({
                id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
            })]
        });
        jest.spyOn(voucherRepository, 'listRedemptionsByTransactionId');
        const fixture = build({
            voucherRepository,
            order: baseOrder({ discount: { discount_type: 'voucher' }, fulfillment_status: 'cancelled' })
        });

        const result = await run(fixture);

        expect(result.success).toBe(false);
        expect(fixture.reverseVoucherRedemptionUseCase).not.toHaveBeenCalled();
        expect(voucherRepository.listRedemptionsByTransactionId).not.toHaveBeenCalled();
    });

    // Case 7 -- fail-CLOSED, the headline behaviour this PR ships.
    it('rolls the ENTIRE cancellation back when the reversal fails', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture()],
            redemptions: [redemptionRow({
                id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
            })]
        });
        jest.spyOn(voucherRepository, 'reverseRedemptionCounters').mockRejectedValue(new Error('deadlock detected'));
        const commerceOrderLifecycleUseCase = jest.fn();
        const order = baseOrder({ discount: { discount_type: 'voucher' } });
        const transaction = makeTransaction();
        const storeRepository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            getOrderByTrackingPin: jest.fn().mockResolvedValueOnce(order),
            updateOrderByTrackingPin: jest.fn()
        };
        const realReverse = buildReverseVoucherRedemptionUseCase({ repository: voucherRepository });
        const useCase = buildCancelStoreOrderUseCase({
            storeRepository,
            inventoryReservationService: { releaseOnlineOrderInventory: jest.fn().mockResolvedValue({}) },
            commerceOrderLifecycleUseCase,
            voucherRepository,
            reverseVoucherRedemptionUseCase: realReverse
        });

        const result = await useCase({
            trackingPin: TRACKING_PIN,
            tenantId: TENANT_ID,
            storeCustomer: { customer_id: 55 },
            payload: {}
        });

        expect(result.success).toBe(false);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(storeRepository.updateOrderByTrackingPin).not.toHaveBeenCalled();
        expect(commerceOrderLifecycleUseCase).not.toHaveBeenCalled();
    });

    // Case 8 -- lock ordering.
    it('runs inventory release, then the reversal, then the status update, then commit, in that order', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture()],
            redemptions: [redemptionRow({
                id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
            })]
        });
        const fixture = build({
            voucherRepository,
            order: baseOrder({ discount: { discount_type: 'voucher' } })
        });

        await run(fixture);

        const inventoryOrder = fixture.inventoryReservationService.releaseOnlineOrderInventory.mock.invocationCallOrder[0];
        const reversalOrder = fixture.reverseVoucherRedemptionUseCase.mock.invocationCallOrder[0];
        const updateOrder = fixture.storeRepository.updateOrderByTrackingPin.mock.invocationCallOrder[0];
        const commitOrder = fixture.transaction.commit.mock.invocationCallOrder[0];

        expect(inventoryOrder).toBeLessThan(reversalOrder);
        expect(reversalOrder).toBeLessThan(updateOrder);
        expect(updateOrder).toBeLessThan(commitOrder);
    });

    // Case 9 -- legacy delivery-axis recovery.
    it('recovers a legacy (pos_transaction_id NULL) delivery-axis redemption via the exact-key fallback', async () => {
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [deliveryVoucherFixture()],
            redemptions: [redemptionRow({
                id: 2, voucherId: DELIVERY_VOUCHER_ID, benefitTarget: 'delivery', discountCentavos: 5000,
                posTransactionId: null, // legacy: never attached
                idempotencyKey: `storefront:chk-key-12345:delivery:${DELIVERY_VOUCHER_ID}`
            })]
        });
        const fixture = build({
            voucherRepository,
            order: baseOrder({ delivery_fee_waiver_voucher_id: DELIVERY_VOUCHER_ID })
        });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).toHaveBeenCalledWith(expect.objectContaining({ originalRedemptionId: 2 }));
        expect(result.data.voucher_reversal).toMatchObject({ attempted: 1, reversed: 1 });
    });

    // Case 10 -- documented, observable gap.
    it('logs a warning and does not reverse a legacy item-axis-only redemption (no reconstruction path exists)', async () => {
        const loggerModule = await import('../src/config/logger.js');
        const warnSpy = jest.spyOn(loggerModule.default, 'warn').mockImplementation(() => {});
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture()],
            redemptions: [redemptionRow({
                id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                posTransactionId: null, // legacy: never attached, and unrecoverable for the item axis
                idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
            })]
        });
        const fixture = build({
            voucherRepository,
            order: baseOrder({ discount: { discount_type: 'voucher' } })
        });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).not.toHaveBeenCalled();
        expect(result.data.voucher_reversal).toEqual({ attempted: 0, reversed: 0, entries: [] });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('item-axis voucher discount'), expect.any(Object));
        warnSpy.mockRestore();
    });

    // Case 11 -- guest checkout is not accidentally gated behind the logged-in branch.
    it('still reverses a voucher redemption on a guest cancellation with a valid cancel_proof', async () => {
        const guestOrder = baseOrder({ store_customer_id: null, discount: { discount_type: 'voucher' } });
        const voucherRepository = buildFakeVoucherRepository({
            vouchers: [itemVoucherFixture()],
            redemptions: [redemptionRow({
                id: 1, voucherId: ITEM_VOUCHER_ID, benefitTarget: 'items', discountCentavos: 1000,
                idempotencyKey: `storefront:chk-key-12345:${ITEM_VOUCHER_ID}`
            })]
        });
        const fixture = build({ voucherRepository, order: guestOrder });
        const cancelProof = generateStoreCancelProof({
            trackingPin: TRACKING_PIN,
            tenantId: TENANT_ID,
            orderId: ORDER_ID
        });

        const result = await run(fixture, { storeCustomer: null, payload: { cancel_proof: cancelProof } });

        expect(result.success).toBe(true);
        expect(fixture.reverseVoucherRedemptionUseCase).toHaveBeenCalledTimes(1);
    });
});
