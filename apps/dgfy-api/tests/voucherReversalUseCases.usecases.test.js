// Use-case tests for src/modules/vouchers/usecases/voucherReversalUseCases.js (Phase 105, #455).
//
// No database: `repository` is a plain in-memory fake modeled on the real
// `reverseRedemptionCounters` (symmetric decrement, floored at zero) and the ledger/lines writers.
//
// NOTE: `buildReverseVoucherRedemptionUseCase` is currently unreachable from any real HTTP request
// (`buildCancelStoreOrderUseCase` has no `status: 'voided'` path yet -- ADR 0066 Consequences #3).
// These tests exercise it directly, on its own contract, exactly as the task asked.

import { buildReverseVoucherRedemptionUseCase } from '../src/modules/vouchers/usecases/voucherReversalUseCases.js';
import { VoucherReasonCode } from '../src/modules/vouchers/domain/voucherErrors.js';

const FAKE_TRANSACTION = { id: 'fake-tx' };

const makeFakeRepository = ({ vouchers = [], redemptions = [], lines = [] } = {}) => {
    const state = {
        vouchers: vouchers.map((v) => ({ ...v })),
        redemptions: redemptions.map((r) => ({ ...r })),
        lines: lines.map((l) => ({ ...l })),
        nextRedemptionId: (redemptions.reduce((max, r) => Math.max(max, r.voucher_redemption_id || 0), 0)) + 1,
        nextLineId: (lines.reduce((max, l) => Math.max(max, l.voucher_redemption_line_id || 0), 0)) + 1,
        calls: []
    };

    const findVoucher = (id) => state.vouchers.find((v) => v.voucher_id === Number(id));

    const repository = {
        __state: state,

        async findById(id) {
            state.calls.push('findById');
            const row = findVoucher(id);
            return row ? { ...row } : null;
        },

        async findRedemptionById(id) {
            state.calls.push('findRedemptionById');
            const row = state.redemptions.find((r) => r.voucher_redemption_id === Number(id));
            return row ? { ...row } : null;
        },

        async findRedemptionByIdempotencyKey(key) {
            state.calls.push('findRedemptionByIdempotencyKey');
            const row = state.redemptions.find((r) => r.idempotency_key === key);
            return row ? { ...row } : null;
        },

        async reverseRedemptionCounters(voucherId, { discountCentavos, quantity } = {}) {
            state.calls.push('reverseRedemptionCounters');
            const voucher = findVoucher(voucherId);
            if (!voucher) return 0;
            const discount = Math.max(0, Math.round(Number(discountCentavos) || 0));
            const qty = Math.max(0, Math.round(Number(quantity) || 0));
            voucher.redeemed_count = Math.max(0, voucher.redeemed_count - 1);
            voucher.redeemed_value_centavos = Math.max(0, voucher.redeemed_value_centavos - discount);
            voucher.redeemed_quantity = Math.max(0, voucher.redeemed_quantity - qty);
            voucher.version += 1;
            return 1;
        },

        async createRedemptionLedgerEntry(values) {
            state.calls.push('createRedemptionLedgerEntry');
            const entry = { voucher_redemption_id: state.nextRedemptionId++, ...values };
            state.redemptions.push(entry);
            return { ...entry };
        },

        async listRedemptionLines(voucherRedemptionId) {
            state.calls.push('listRedemptionLines');
            return state.lines
                .filter((line) => line.voucher_redemption_id === Number(voucherRedemptionId))
                .map((line) => ({ ...line }));
        },

        async createRedemptionLines(values) {
            state.calls.push('createRedemptionLines');
            const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
                voucher_redemption_line_id: state.nextLineId++,
                ...v
            }));
            state.lines.push(...rows);
            return rows;
        }
    };

    return repository;
};

const baseVoucher = () => ({
    voucher_id: 1,
    code: 'SAVE10',
    redeemed_count: 1,
    redeemed_value_centavos: 1000,
    redeemed_quantity: 2,
    version: 1
});

const baseRedemption = () => ({
    voucher_redemption_id: 10,
    voucher_id: 1,
    entry_type: 'redemption',
    channel: 'storefront',
    location_id: null,
    store_customer_id: null,
    code_snapshot: 'SAVE10',
    benefit_config_snapshot: { benefit_class: 'percent_off', percent_off_bps: 1000 },
    subtotal_centavos: 10000,
    discount_centavos: 1000,
    benefit_quantity: 2,
    idempotency_key: 'storefront:checkout-key-1:1'
});

const baseLine = () => ({
    voucher_redemption_line_id: 100,
    voucher_redemption_id: 10,
    item_id: 1,
    quantity: 2,
    base_unit_price_centavos: 5000,
    voucher_unit_price_centavos: 4500,
    discount_centavos: 1000
});

const expectVoucherError = async (promise, reasonCode) => {
    await expect(promise).rejects.toMatchObject({
        name: 'DomainError',
        details: expect.objectContaining({ reason_code: reasonCode })
    });
};

describe('buildReverseVoucherRedemptionUseCase', () => {
    it('throws when called without an open transaction', async () => {
        const repository = makeFakeRepository();
        const reverse = buildReverseVoucherRedemptionUseCase({ repository });
        await expect(reverse({ originalRedemptionId: 10 })).rejects.toMatchObject({ name: 'DomainError' });
    });

    it('rejects a missing original redemption', async () => {
        const repository = makeFakeRepository();
        const reverse = buildReverseVoucherRedemptionUseCase({ repository });
        await expectVoucherError(
            reverse({ originalRedemptionId: 999, transaction: FAKE_TRANSACTION }),
            VoucherReasonCode.VOUCHER_NOT_FOUND
        );
    });

    it('rejects reversing an entry that is not itself a redemption', async () => {
        const repository = makeFakeRepository({
            vouchers: [baseVoucher()],
            redemptions: [{ ...baseRedemption(), entry_type: 'reversal' }]
        });
        const reverse = buildReverseVoucherRedemptionUseCase({ repository });
        await expectVoucherError(
            reverse({ originalRedemptionId: 10, transaction: FAKE_TRANSACTION }),
            VoucherReasonCode.VOUCHER_INVALID_STATUS_TRANSITION
        );
    });

    it('decrements counters, writes a negated ledger entry, and mirrors negated lines', async () => {
        const repository = makeFakeRepository({
            vouchers: [baseVoucher()],
            redemptions: [baseRedemption()],
            lines: [baseLine()]
        });
        const reverse = buildReverseVoucherRedemptionUseCase({ repository });
        const result = await reverse({ originalRedemptionId: 10, reason: 'order cancelled', transaction: FAKE_TRANSACTION });

        expect(result.applied).toBe(true);
        expect(result.idempotentReplay).toBe(false);
        expect(result.discountCentavos).toBe(-1000);

        const voucher = repository.__state.vouchers[0];
        expect(voucher.redeemed_count).toBe(0);
        expect(voucher.redeemed_value_centavos).toBe(0);
        expect(voucher.redeemed_quantity).toBe(0);

        const reversalEntry = repository.__state.redemptions.find((r) => r.entry_type === 'reversal');
        expect(reversalEntry).toBeDefined();
        expect(reversalEntry.discount_centavos).toBe(-1000);
        expect(reversalEntry.benefit_quantity).toBe(-2);
        expect(reversalEntry.reversal_of_redemption_id).toBe(10);
        expect(reversalEntry.idempotency_key).toBe('reversal:10');

        const reversalLines = repository.__state.lines.filter((l) => l.voucher_redemption_id === reversalEntry.voucher_redemption_id);
        expect(reversalLines).toHaveLength(1);
        expect(reversalLines[0].discount_centavos).toBe(-1000);
        expect(reversalLines[0].base_unit_price_centavos).toBe(5000);
        expect(reversalLines[0].voucher_unit_price_centavos).toBe(4500);
    });

    it('is idempotent: replaying the same original redemption id does not double-reverse', async () => {
        const repository = makeFakeRepository({
            vouchers: [baseVoucher()],
            redemptions: [baseRedemption()],
            lines: [baseLine()]
        });
        const reverse = buildReverseVoucherRedemptionUseCase({ repository });

        const first = await reverse({ originalRedemptionId: 10, transaction: FAKE_TRANSACTION });
        const second = await reverse({ originalRedemptionId: 10, transaction: FAKE_TRANSACTION });

        expect(second.idempotentReplay).toBe(true);
        expect(second.reversalId).toBe(first.reversalId);

        const voucher = repository.__state.vouchers[0];
        // Counters moved exactly once, not twice.
        expect(voucher.redeemed_count).toBe(0);
        expect(repository.__state.calls.filter((call) => call === 'reverseRedemptionCounters')).toHaveLength(1);
        expect(repository.__state.redemptions.filter((r) => r.entry_type === 'reversal')).toHaveLength(1);
    });

    it('floors counters at zero rather than going negative', async () => {
        const repository = makeFakeRepository({
            vouchers: [{ ...baseVoucher(), redeemed_count: 0, redeemed_value_centavos: 0, redeemed_quantity: 0 }],
            redemptions: [baseRedemption()],
            lines: [baseLine()]
        });
        const reverse = buildReverseVoucherRedemptionUseCase({ repository });
        await reverse({ originalRedemptionId: 10, transaction: FAKE_TRANSACTION });

        const voucher = repository.__state.vouchers[0];
        expect(voucher.redeemed_count).toBe(0);
        expect(voucher.redeemed_value_centavos).toBe(0);
        expect(voucher.redeemed_quantity).toBe(0);
    });
});
