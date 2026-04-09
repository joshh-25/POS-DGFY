import { jest } from '@jest/globals';
import {
    buildGetCurrentXReadingUseCase,
    buildIncrementGovernedResetCounterUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import dbStore from '../src/utils/dbStore.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('POS readings usecases', () => {
    it('buildGetCurrentXReadingUseCase returns on-demand summary with counters', async () => {
        const posRepository = {
            getZReadingSummary: jest.fn().mockResolvedValue({
                transaction_count: 5,
                subtotal_amount: 1000,
                discount_amount: 100,
                service_fee_total: 0,
                vatable_sales: 803.57,
                vat_amount: 96.43,
                vat_exempt_sales: 0,
                zero_rated_sales: 0,
                total_amount: 900,
                payment_breakdown: [{ payment_type: 'cash', count: 5, amount: 900 }],
                order_method_breakdown: [{ order_method: 'dine_in', count: 5, amount: 900 }]
            }),
            getPersistentCounterValue: jest
                .fn()
                .mockResolvedValueOnce(3)
                .mockResolvedValueOnce(9)
                .mockResolvedValueOnce(250000)
        };
        const useCase = buildGetCurrentXReadingUseCase({ posRepository });

        const result = await useCase({
            query: {
                business_date: '2026-04-08',
                terminal_id: 'WEB-POS-01'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            business_date: '2026-04-08',
            terminal_id: 'WEB-POS-01',
            snapshot_persisted: false,
            counters: expect.objectContaining({
                z_counter: 3,
                reset_counter: 9,
                lifetime_grand_total_cents: 250000
            }),
            summary: expect.objectContaining({
                transaction_count: 5,
                total_amount: 900
            })
        }));
    });

    it('buildIncrementGovernedResetCounterUseCase validates confirmation text', async () => {
        const useCase = buildIncrementGovernedResetCounterUseCase({
            posRepository: {}
        });

        const result = await useCase({
            payload: {
                reason: 'Audit reset after regulator check',
                confirmation_text: 'WRONG'
            },
            user: { user_id: 5 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
    });

    it('buildIncrementGovernedResetCounterUseCase records reset event snapshot', async () => {
        const transaction = {
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            finished: false
        };
        const posRepository = {
            getPersistentCounterValue: jest
                .fn()
                .mockResolvedValueOnce(4)
                .mockResolvedValueOnce(345600),
            incrementPersistentCounter: jest.fn().mockResolvedValue(12),
            createZReadingSnapshot: jest.fn().mockResolvedValue({
                reading_identifier: 'RST-20260408-00000012'
            })
        };
        const useCase = buildIncrementGovernedResetCounterUseCase({ posRepository });
        const sequelize = {
            transaction: jest.fn().mockResolvedValue(transaction)
        };

        const result = await dbStore.run({ sequelize }, async () => (
            useCase({
                payload: {
                    reason: 'Audit reset after regulator reconciliation',
                    evidence_ref: 'AUDIT-2026-04-08-001',
                    confirmation_text: 'INCREMENT RESET COUNTER'
                },
                user: { user_id: 5 }
            })
        ));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            reason: 'Audit reset after regulator reconciliation',
            evidence_ref: 'AUDIT-2026-04-08-001',
            counters: expect.objectContaining({
                z_counter: 4,
                reset_counter: 12,
                lifetime_grand_total_cents: 345600
            })
        }));
        expect(posRepository.createZReadingSnapshot).toHaveBeenCalledWith(expect.objectContaining({
            reading_identifier: expect.stringMatching(/^RST-/),
            summary: expect.objectContaining({
                event_type: 'governed_reset_counter_increment',
                actor_user_id: 5
            })
        }), expect.objectContaining({ transaction }));
        expect(transaction.commit).toHaveBeenCalled();
    });
});

