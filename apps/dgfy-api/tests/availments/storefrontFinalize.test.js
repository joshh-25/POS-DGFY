import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AvailmentRepository } from '../../src/modules/availments/repositories/availmentRepository.js';
import {
    buildFinalizeStorefrontOrderUseCase,
    normalizeStorefrontPaymentMethod
} from '../../src/modules/availments/usecases/storefrontFinalizeUseCases.js';

/**
 * 10-07-PLAN.md Task 2: storefront-order -> tenant-Availment finalize seam
 * (RESEARCH structural gap #1 — finalizePersist cannot be reused; no shift/
 * terminal/cashier, cross-DB customer_account_id, unique source_reference
 * idempotency, reservation->sale via the injected commitReservation port).
 *
 * Two layers under test:
 *  - AvailmentRepository.finalizeStorefrontOrder: the actual transactional/
 *    idempotent/rollback behavior, mocking tenantConnector + Sequelize
 *    models (mirrors tests/inventory/inventoryReservation.test.js's
 *    mock-Sequelize pattern).
 *  - buildFinalizeStorefrontOrderUseCase: validation, money recompute, and
 *    delegation to a mocked repository.
 */

const makeMockModels = () => {
    const mockSequelize = {
        transaction: jest.fn(async (callback) => {
            const mockTransaction = { LOCK: { UPDATE: 'UPDATE' } };
            return callback(mockTransaction);
        })
    };

    const AvailmentModel = {
        findOne: jest.fn(),
        create: jest.fn(),
        sequelize: mockSequelize
    };

    const AvailmentItemModel = {
        create: jest.fn().mockResolvedValue({})
    };

    const PaymentModel = {
        create: jest.fn()
    };

    return { mockSequelize, AvailmentModel, AvailmentItemModel, PaymentModel };
};

const makeRepository = (models) => {
    const tenantConnector = {
        getModels: jest.fn(() => ({
            Availment: models.AvailmentModel,
            AvailmentItem: models.AvailmentItemModel,
            Payment: models.PaymentModel
        }))
    };
    const businessDatabaseRegistryRepository = {
        findByBusinessId: jest.fn().mockResolvedValue({
            database_name: 'dgfy_business_test',
            status: 'active',
            verified_at: new Date()
        })
    };
    return new AvailmentRepository({ tenantConnector, businessDatabaseRegistryRepository });
};

const baseHeader = () => ({
    subtotal_amount: '200.0000',
    discount_amount: '0.0000',
    vat_amount: '21.4300',
    vat_exempt_amount: '0.0000',
    total_amount: '200.0000'
});

const basePayment = () => ({
    payment_method: 'gcash',
    amount_received: '200.0000',
    change_due: null,
    payment_handoff_mode: 'external',
    payment_reference: 'pay_abc123'
});

const baseLines = () => [{ productId: 1, productName: 'Widget', quantity: 2, unitPrice: '100.00' }];

describe('AvailmentRepository.finalizeStorefrontOrder', () => {
    let models;
    let repository;
    let mockCommitReservation;

    beforeEach(() => {
        models = makeMockModels();
        repository = makeRepository(models);
        mockCommitReservation = jest.fn().mockResolvedValue({ isSuccess: true });
    });

    it('creates a finalized Availment + AvailmentItem lines + Payment and commits the reservation on a fresh call', async () => {
        models.AvailmentModel.findOne.mockResolvedValue(null);
        models.AvailmentModel.create.mockResolvedValue({
            id: 501,
            business_id: 'biz-1',
            status: 'finalized',
            source_reference: 'SFO-1',
            ...baseHeader()
        });
        models.PaymentModel.create.mockResolvedValue({
            id: 9001,
            business_id: 'biz-1',
            availment_id: 501,
            ...basePayment()
        });

        const result = await repository.finalizeStorefrontOrder('biz-1', {
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            lines: baseLines(),
            header: baseHeader(),
            payment: basePayment(),
            commitReservation: mockCommitReservation
        });

        expect(result.idempotent).toBe(false);
        expect(result.availment.id).toBe(501);
        expect(result.payment.id).toBe(9001);
        expect(result.payment.payment_reference).toBe('pay_abc123');

        // No shift/terminal/cashier fields on the created Availment.
        expect(models.AvailmentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                business_id: 'biz-1',
                customer_account_id: 'acct-1',
                source_reference: 'SFO-1',
                status: 'finalized',
                shift_id: null,
                terminal_id: null,
                cashier_account_id: null,
                cashier_dgfy_account_id: null
            }),
            expect.objectContaining({ transaction: expect.anything() })
        );

        expect(models.AvailmentItemModel.create).toHaveBeenCalledTimes(1);
        expect(models.AvailmentItemModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ availment_id: 501, product_id: 1, quantity: 2, unit_price: '100.00' }),
            expect.objectContaining({ transaction: expect.anything() })
        );

        // Reservation->sale conversion via the injected single-writer port (ADR 0029).
        expect(mockCommitReservation).toHaveBeenCalledTimes(1);

        expect(models.PaymentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                availment_id: 501,
                payment_method: 'gcash',
                payment_reference: 'pay_abc123'
            }),
            expect.objectContaining({ transaction: expect.anything() })
        );
    });

    it('is idempotent: a second call for the same source_reference returns the existing Availment without a second stock deduction', async () => {
        const existingRow = {
            id: 501,
            business_id: 'biz-1',
            status: 'finalized',
            source_reference: 'SFO-1',
            items: [],
            payments: [{ id: 9001, business_id: 'biz-1', availment_id: 501, ...basePayment() }],
            ...baseHeader()
        };
        models.AvailmentModel.findOne.mockResolvedValue(existingRow);

        const result = await repository.finalizeStorefrontOrder('biz-1', {
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            lines: baseLines(),
            header: baseHeader(),
            payment: basePayment(),
            commitReservation: mockCommitReservation
        });

        expect(result.idempotent).toBe(true);
        expect(result.availment.id).toBe(501);
        expect(result.payment.id).toBe(9001);

        // No second write of any kind — the row-locked lookup short-circuits.
        expect(models.AvailmentModel.create).not.toHaveBeenCalled();
        expect(models.AvailmentItemModel.create).not.toHaveBeenCalled();
        expect(models.PaymentModel.create).not.toHaveBeenCalled();
        expect(mockCommitReservation).not.toHaveBeenCalled();
    });

    it('re-resolves a lost-guard unique-constraint race to the winner\'s existing row', async () => {
        // First lookup (inside the losing transaction) finds nothing...
        models.AvailmentModel.findOne
            .mockResolvedValueOnce(null)
            // ...then the post-catch re-query (outside any transaction) finds the winner's row.
            .mockResolvedValueOnce({
                id: 777,
                business_id: 'biz-1',
                status: 'finalized',
                source_reference: 'SFO-1',
                items: [],
                payments: [{ id: 9002, business_id: 'biz-1', availment_id: 777, ...basePayment() }],
                ...baseHeader()
            });

        const uniqueError = new Error('Duplicate entry for unique_availments_source_reference');
        uniqueError.name = 'SequelizeUniqueConstraintError';
        models.AvailmentModel.create.mockRejectedValue(uniqueError);

        const result = await repository.finalizeStorefrontOrder('biz-1', {
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            lines: baseLines(),
            header: baseHeader(),
            payment: basePayment(),
            commitReservation: mockCommitReservation
        });

        expect(result.idempotent).toBe(true);
        expect(result.availment.id).toBe(777);
        expect(models.PaymentModel.create).not.toHaveBeenCalled();
    });

    it('rolls back the entire transaction when the reservation commit fails — no Availment persisted', async () => {
        models.AvailmentModel.findOne.mockResolvedValue(null);
        models.AvailmentModel.create.mockResolvedValue({
            id: 501,
            business_id: 'biz-1',
            status: 'finalized',
            source_reference: 'SFO-1',
            ...baseHeader()
        });
        const failingCommitReservation = jest.fn().mockResolvedValue({
            isSuccess: false,
            error: { message: 'Insufficient stock' }
        });

        await expect(repository.finalizeStorefrontOrder('biz-1', {
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            lines: baseLines(),
            header: baseHeader(),
            payment: basePayment(),
            commitReservation: failingCommitReservation
        })).rejects.toThrow(/Reservation commit failed/);

        // Payment is created AFTER the reservation commit in the same
        // transaction — a failed commit means it's never reached, so
        // nothing partial is left over once the transaction rolls back.
        expect(models.PaymentModel.create).not.toHaveBeenCalled();
    });

    it('propagates a thrown (not just failed-result) commitReservation error and still never creates a Payment', async () => {
        models.AvailmentModel.findOne.mockResolvedValue(null);
        models.AvailmentModel.create.mockResolvedValue({
            id: 501,
            business_id: 'biz-1',
            status: 'finalized',
            source_reference: 'SFO-1',
            ...baseHeader()
        });
        const throwingCommitReservation = jest.fn().mockRejectedValue(new Error('unexpected DB error'));

        await expect(repository.finalizeStorefrontOrder('biz-1', {
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            lines: baseLines(),
            header: baseHeader(),
            payment: basePayment(),
            commitReservation: throwingCommitReservation
        })).rejects.toThrow();

        expect(models.PaymentModel.create).not.toHaveBeenCalled();
    });
});

describe('normalizeStorefrontPaymentMethod (A4)', () => {
    it('maps cash/gcash/credit_card and the qrph alias', () => {
        expect(normalizeStorefrontPaymentMethod('cash')).toBe('cash');
        expect(normalizeStorefrontPaymentMethod('gcash')).toBe('gcash');
        expect(normalizeStorefrontPaymentMethod('qrph')).toBe('gcash');
        expect(normalizeStorefrontPaymentMethod('qr-ph')).toBe('gcash');
        expect(normalizeStorefrontPaymentMethod('credit_card')).toBe('credit_card');
        expect(normalizeStorefrontPaymentMethod('card')).toBe('credit_card');
    });

    it('returns null for unrecognized values', () => {
        expect(normalizeStorefrontPaymentMethod('bitcoin')).toBeNull();
        expect(normalizeStorefrontPaymentMethod(null)).toBeNull();
    });
});

describe('buildFinalizeStorefrontOrderUseCase', () => {
    let repository;
    let commitReservation;
    let useCase;

    beforeEach(() => {
        repository = {
            finalizeStorefrontOrder: jest.fn().mockResolvedValue({
                availment: { id: 501, source_reference: 'SFO-1' },
                payment: { id: 9001 },
                idempotent: false
            })
        };
        commitReservation = jest.fn().mockResolvedValue({ isSuccess: true });
        useCase = buildFinalizeStorefrontOrderUseCase({ repository, commitReservation });
    });

    it('throws at build time when commitReservation is not a function', () => {
        expect(() => buildFinalizeStorefrontOrderUseCase({ repository })).toThrow(/commitReservation/);
    });

    it('rejects missing businessId/sourceReference (400)', async () => {
        const result = await useCase({ lines: baseLines(), paymentMethod: 'cash' });
        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('rejects an empty lines array (400)', async () => {
        const result = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: [],
            paymentMethod: 'cash'
        });
        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('rejects an unrecognized paymentMethod (400)', async () => {
        const result = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: baseLines(),
            paymentMethod: 'bitcoin'
        });
        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('rejects a missing/invalid fulfillmentMode (400) — CR-01 fix, 11-REVIEW.md', async () => {
        const missing = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: baseLines(),
            paymentMethod: 'gcash'
        });
        expect(missing.isSuccess).toBe(false);
        expect(missing.statusCode).toBe(400);
        expect(repository.finalizeStorefrontOrder).not.toHaveBeenCalled();

        const invalid = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: baseLines(),
            paymentMethod: 'gcash',
            fulfillmentMode: 'dine_in'
        });
        expect(invalid.isSuccess).toBe(false);
        expect(invalid.statusCode).toBe(400);
        expect(repository.finalizeStorefrontOrder).not.toHaveBeenCalled();
    });

    it('rejects a totalCentavos that does not match the recomputed line total (400)', async () => {
        const result = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: baseLines(), // 2 x 100.00 = 20000 centavos
            totalCentavos: 999,
            paymentMethod: 'gcash'
        });
        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(repository.finalizeStorefrontOrder).not.toHaveBeenCalled();
    });

    it('delegates to the repository with server-recomputed money and a bound commitReservation', async () => {
        const result = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            lines: baseLines(),
            totalCentavos: 20000,
            paymentMethod: 'gcash',
            paymentReference: 'pay_abc123',
            fulfillmentMode: 'delivery'
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.availment.id).toBe(501);
        expect(result.data.idempotent).toBe(false);

        expect(repository.finalizeStorefrontOrder).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            sourceReference: 'SFO-1',
            customerAccountId: 'acct-1',
            header: expect.objectContaining({ total_amount: '200.0000' }),
            payment: expect.objectContaining({ payment_method: 'gcash', payment_reference: 'pay_abc123' }),
            commitReservation: expect.any(Function)
        }));

        // The bound commitReservation forwards businessId/sourceReference to the injected port.
        const { commitReservation: boundCommitReservation } = repository.finalizeStorefrontOrder.mock.calls[0][1];
        await boundCommitReservation('txn-1');
        expect(commitReservation).toHaveBeenCalledWith({ businessId: 'biz-1', referenceId: 'SFO-1', transaction: 'txn-1' });
    });

    it('maps a TenantDatabaseUnavailableError from the repository to a 503', async () => {
        class TenantDatabaseUnavailableError extends Error {
            constructor(reason) {
                super('unreachable');
                this.name = 'TenantDatabaseUnavailableError';
                this.reason = reason;
            }
        }
        repository.finalizeStorefrontOrder.mockRejectedValue(new TenantDatabaseUnavailableError('unreachable'));

        const result = await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: baseLines(),
            paymentMethod: 'cash',
            fulfillmentMode: 'pickup'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(503);
    });

    it('sets amount_received to the cash total with no payment_handoff_mode for cash payments', async () => {
        await useCase({
            businessId: 'biz-1',
            sourceReference: 'SFO-1',
            lines: baseLines(),
            paymentMethod: 'cash',
            fulfillmentMode: 'pickup'
        });

        expect(repository.finalizeStorefrontOrder).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            payment: expect.objectContaining({
                payment_method: 'cash',
                amount_received: '200.0000',
                payment_handoff_mode: null
            })
        }));
    });
});
