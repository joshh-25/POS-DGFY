import { afterEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildGetMerchantTenderReconciliationUseCase,
    buildReviewMerchantTenderReconciliationUseCase
} from '../src/modules/pos/usecases/merchantTenderReconciliationUseCases.js';

const buildTransaction = () => {
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; })
    };
    return transaction;
};

const buildHarness = ({ latest = null } = {}) => {
    const transaction = buildTransaction();
    const expected = {
        breakdown: {
            gcash: { amount: 750, count: 2 },
            maya: { amount: 0, count: 0 },
            card: { amount: 300, count: 1 },
            bank_transfer: { amount: 200, count: 1 }
        },
        total: 1250
    };
    const records = latest ? [latest] : [];
    const posRepository = {
        getTerminalShiftById: jest.fn().mockResolvedValue({
            pos_terminal_shift_id: 41,
            business_date: '2026-08-13',
            status: 'closed',
            cashier_id: 15,
            terminal_id: 'COUNTER-01',
            location_id: 3
        }),
        getMerchantTenderExpectedByShift: jest.fn().mockResolvedValue(expected),
        getLatestMerchantTenderReconciliation: jest.fn().mockImplementation(async () => records.at(-1) || null),
        findMerchantTenderReconciliationByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createMerchantTenderReconciliation: jest.fn(async (payload) => {
            const created = { pos_merchant_tender_reconciliation_id: records.length + 101, ...payload };
            records.push(created);
            return created;
        })
    };
    return { transaction, sequelize: { transaction: jest.fn().mockResolvedValue(transaction) }, posRepository, records };
};

afterEach(() => jest.restoreAllMocks());

describe('POS merchant-owned tender reconciliation', () => {
    it('loads server-computed expected totals without changing financial rows', async () => {
        const harness = buildHarness();
        const useCase = buildGetMerchantTenderReconciliationUseCase({ posRepository: harness.posRepository });

        const result = await useCase({ shiftId: 41 });

        expect(result.success).toBe(true);
        expect(result.data.expected.total).toBe(1250);
        expect(result.data.expected.breakdown.gcash).toEqual({ amount: 750, count: 2 });
        expect(harness.posRepository.createMerchantTenderReconciliation).not.toHaveBeenCalled();
    });

    it('records a balanced manager review as immutable evidence', async () => {
        const harness = buildHarness();
        const useCase = buildReviewMerchantTenderReconciliationUseCase({ posRepository: harness.posRepository });
        const result = await dbStore.run({ sequelize: harness.sequelize }, () => useCase({
            shiftId: 41,
            user: { user_id: 99 },
            payload: {
                idempotency_key: 'manager-review-001',
                observed_breakdown: { gcash: 750, maya: 0, card: 300, bank_transfer: 200 }
            }
        }));

        expect(result.success).toBe(true);
        expect(result.data.reconciliation.status).toBe('balanced');
        expect(result.data.reconciliation.variance_total).toBe(0);
        expect(harness.posRepository.createMerchantTenderReconciliation).toHaveBeenCalledWith(
            expect.objectContaining({ reviewed_by: 99, expected_total: 1250, observed_total: 1250 }),
            expect.objectContaining({ transaction: harness.transaction })
        );
        expect(harness.transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('requires a manager note for any method-level variance, even when totals offset', async () => {
        const harness = buildHarness();
        const useCase = buildReviewMerchantTenderReconciliationUseCase({ posRepository: harness.posRepository });
        const result = await dbStore.run({ sequelize: harness.sequelize }, () => useCase({
            shiftId: 41,
            user: { user_id: 99 },
            payload: {
                idempotency_key: 'manager-review-002',
                observed_breakdown: { gcash: 700, maya: 50, card: 300, bank_transfer: 200 }
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('MERCHANT_TENDER_VARIANCE_NOTE_REQUIRED');
        expect(harness.posRepository.createMerchantTenderReconciliation).not.toHaveBeenCalled();
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('appends a reviewed variance that supersedes the prior record without updating it', async () => {
        const prior = { pos_merchant_tender_reconciliation_id: 77, expected_breakdown: {}, reviewed_at: new Date('2026-08-13T08:00:00Z') };
        const harness = buildHarness({ latest: prior });
        const useCase = buildReviewMerchantTenderReconciliationUseCase({ posRepository: harness.posRepository });
        const result = await dbStore.run({ sequelize: harness.sequelize }, () => useCase({
            shiftId: 41,
            user: { user_id: 99 },
            payload: {
                idempotency_key: 'manager-review-003',
                observed_breakdown: { gcash: 700, maya: 0, card: 300, bank_transfer: 200 },
                review_note: 'GCash statement is short by PHP 50.'
            }
        }));

        expect(result.success).toBe(true);
        expect(result.data.reconciliation.status).toBe('variance_reviewed');
        expect(result.data.reconciliation.supersedes_reconciliation_id).toBe(77);
        expect(result.data.reconciliation.variance_breakdown.gcash).toBe(-50);
        expect(harness.records[0]).toBe(prior);
    });
});
