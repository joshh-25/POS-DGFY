import { jest } from '@jest/globals';
import {
    buildCloseDayZReadingUseCase,
    buildGetCurrentXReadingUseCase,
    buildGetDailyZReadingUseCase,
    buildIncrementGovernedResetCounterUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import dbStore from '../src/utils/dbStore.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('POS readings usecases', () => {
    const createTransaction = () => ({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        finished: false
    });

    it('buildCloseDayZReadingUseCase scopes the snapshot to the authorized branch', async () => {
        const transaction = createTransaction();
        const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 7 });
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue(null),
            getZReadingSummary: jest.fn().mockResolvedValue({
                transaction_count: 2,
                total_amount: 250
            }),
            incrementPersistentCounter: jest.fn()
                .mockResolvedValueOnce(12)
                .mockResolvedValueOnce(4),
            getPersistentCounterValue: jest.fn().mockResolvedValue(98000),
            createZReadingSnapshot: jest.fn().mockResolvedValue({
                pos_z_reading_snapshot_id: 44,
                location_id: 7,
                reading_identifier: 'ZR-20260807-00000012',
                z_counter_value: 12,
                reset_counter_value: 4,
                lifetime_grand_total_cents: 98000,
                generated_at: '2026-08-07T16:00:00.000Z'
            }),
            findActiveDayCloseOperatorById: jest.fn().mockResolvedValue({
                user_id: 11,
                username: 'Cashier One',
                is_active: true,
                pos_day_close_pin_hash: 'hash'
            }),
            listOpenTerminalShiftsForLocation: jest.fn().mockResolvedValue([]),
            createAuditLog: jest.fn().mockResolvedValue({ log_id: 1 })
        };

        const useCase = buildCloseDayZReadingUseCase({
            posRepository,
            resolveLocationScope,
            verifyDayCloseOperator: jest.fn().mockResolvedValue({ user_id: 11 })
        });

        const result = await dbStore.run({ sequelize }, () => useCase({
            businessDateInput: '2026-08-07',
            dayClosePin: '1234',
            terminalId: 'COUNTER-01',
            user: { user_id: 11 },
            locationId: 7
        }));

        expect(result.success).toBe(true);
        expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({
            requestedLocationId: 7,
            userId: 11,
            transaction,
            operationLabel: 'POS close-day Z-reading'
        }));
        expect(posRepository.getZReadingSummary).toHaveBeenCalledWith({
            startAt: expect.any(Date),
            endAt: expect.any(Date),
            locationId: 7
        }, { transaction });
        expect(posRepository.createZReadingSnapshot).toHaveBeenCalledWith(expect.objectContaining({
            business_date: '2026-08-07',
            location_id: 7,
            summary: expect.objectContaining({ transaction_count: 2 })
        }), { transaction });
        expect(posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 11,
            entity_type: 'pos_z_reading',
            action: 'CREATE',
            changes: expect.objectContaining({ day_close_pin_confirmed: true })
        }), { transaction });
        expect(result.data).toEqual(expect.objectContaining({
            business_date: '2026-08-07',
            location_id: 7,
            snapshot_reused: false,
            replay_outcome: 'new_snapshot'
        }));
        expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('buildCloseDayZReadingUseCase reuses an existing branch snapshot without incrementing counters', async () => {
        const transaction = createTransaction();
        const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
        const existingSnapshot = {
            business_date: '2026-08-07',
            location_id: 7,
            reading_identifier: 'ZR-20260807-00000012',
            z_counter_value: 12,
            reset_counter_value: 4,
            lifetime_grand_total_cents: 98000,
            generated_at: '2026-08-07T16:00:00.000Z',
            summary: { transaction_count: 2, total_amount: 250 }
        };
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue(existingSnapshot),
            findActiveDayCloseOperatorById: jest.fn().mockResolvedValue({
                user_id: 11,
                username: 'Cashier One',
                is_active: true,
                pos_day_close_pin_hash: 'hash'
            }),
            getZReadingSummary: jest.fn(),
            incrementPersistentCounter: jest.fn(),
            getPersistentCounterValue: jest.fn(),
            createZReadingSnapshot: jest.fn(),
            createAuditLog: jest.fn().mockResolvedValue({ log_id: 2 })
        };
        const useCase = buildCloseDayZReadingUseCase({
            posRepository,
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 }),
            verifyDayCloseOperator: jest.fn().mockResolvedValue({ user_id: 11 })
        });

        const result = await dbStore.run({ sequelize }, () => useCase({
            businessDateInput: '2026-08-07',
            dayClosePin: '1234',
            terminalId: 'COUNTER-01',
            user: { user_id: 11 },
            locationId: 7
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            reading_identifier: existingSnapshot.reading_identifier,
            snapshot_reused: true,
            idempotent_replay: true,
            replay_outcome: 'existing_snapshot'
        }));
        expect(posRepository.getZReadingSummary).not.toHaveBeenCalled();
        expect(posRepository.incrementPersistentCounter).not.toHaveBeenCalled();
        expect(posRepository.createZReadingSnapshot).not.toHaveBeenCalled();
        expect(posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 11,
            action: 'VIEW',
            changes: expect.objectContaining({
                operation: 'reprint_close_day_z_reading',
                day_close_pin_confirmed: true
            })
        }), { transaction });
        expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('buildCloseDayZReadingUseCase requires every branch shift to close first', async () => {
        const transaction = createTransaction();
        const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue(null),
            findActiveDayCloseOperatorById: jest.fn().mockResolvedValue({
                user_id: 11,
                is_active: true,
                pos_day_close_pin_hash: 'hash'
            }),
            listOpenTerminalShiftsForLocation: jest.fn().mockResolvedValue([
                { pos_terminal_shift_id: 31, terminal_id: 'COUNTER-02', cashier: { username: 'Cashier Two' } }
            ]),
            getZReadingSummary: jest.fn(),
            incrementPersistentCounter: jest.fn(),
            getPersistentCounterValue: jest.fn(),
            createZReadingSnapshot: jest.fn(),
            createAuditLog: jest.fn()
        };
        const useCase = buildCloseDayZReadingUseCase({
            posRepository,
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 }),
            verifyDayCloseOperator: jest.fn().mockResolvedValue({ user_id: 11 })
        });

        const result = await dbStore.run({ sequelize }, () => useCase({
            businessDateInput: '2026-08-07',
            dayClosePin: '1234',
            terminalId: 'COUNTER-01',
            user: { user_id: 11 },
            locationId: 7
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'Z_READING_OPEN_SHIFTS',
            open_shift_count: 1
        }));
        expect(posRepository.getZReadingSummary).not.toHaveBeenCalled();
        expect(posRepository.createZReadingSnapshot).not.toHaveBeenCalled();
    });

    it('buildGetDailyZReadingUseCase applies the authorized branch to on-demand reads', async () => {
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue(null),
            getZReadingSummary: jest.fn().mockResolvedValue({
                transaction_count: 3,
                total_amount: 480
            }),
            getPersistentCounterValue: jest.fn()
                .mockResolvedValueOnce(12)
                .mockResolvedValueOnce(4)
                .mockResolvedValueOnce(98000)
        };
        const useCase = buildGetDailyZReadingUseCase({
            posRepository,
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 })
        });

        const result = await useCase({
            businessDateInput: '2026-08-07',
            user: { user_id: 11 },
            locationId: 7
        });

        expect(result.success).toBe(true);
        expect(posRepository.getLatestZReadingSnapshotByBusinessDate).toHaveBeenCalledWith(
            '2026-08-07',
            { locationId: 7 }
        );
        expect(posRepository.getZReadingSummary).toHaveBeenCalledWith({
            startAt: expect.any(Date),
            endAt: expect.any(Date),
            locationId: 7
        });
        expect(result.data).toEqual(expect.objectContaining({
            business_date: '2026-08-07',
            location_id: 7,
            snapshot_persisted: false,
            replay_outcome: 'computed_on_demand'
        }));
    });

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
