import { jest } from '@jest/globals';
import {
    buildCloseDayZReadingUseCase,
    buildGetDayCloseReadinessUseCase,
    buildGetCurrentXReadingUseCase,
    buildGetDailyZReadingUseCase,
    buildGetDailyZReadingDetailsUseCase,
    buildListPosZReadingsUseCase,
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

    it('buildListPosZReadingsUseCase returns only persisted snapshots for the resolved branch', async () => {
        const posRepository = {
            listZReadingSnapshots: jest.fn().mockResolvedValue({
                rows: [{
                    business_date: '2026-08-11',
                    location_id: 18,
                    reading_identifier: 'ZR-20260811-00000003',
                    generated_at: '2026-08-11T16:00:00.000Z',
                    closed_by_user_id: 11,
                    closed_by_display_name: 'Len2',
                    closed_from_terminal_id: 'COUNTER-02',
                    summary: { transaction_count: 4, total_amount: 1200.5, vat_amount: 128.63 }
                }],
                pagination: { page: 2, limit: 10, total: 11, totalPages: 2 }
            })
        };
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 18 });
        const useCase = buildListPosZReadingsUseCase({ posRepository, resolveLocationScope });

        const result = await useCase({
            query: {
                location_id: 7,
                date_from: '2026-08-01',
                date_to: '2026-08-31',
                search: 'Len2',
                terminal_id: 'COUNTER-02',
                closed_by: 'Len2',
                page: 2,
                limit: 10
            },
            user: { user_id: 11 }
        });

        expect(result.success).toBe(true);
        expect(resolveLocationScope).toHaveBeenCalledWith({
            requestedLocationId: 7,
            userId: 11,
            operationLabel: 'POS Z-reading history'
        });
        expect(posRepository.listZReadingSnapshots).toHaveBeenCalledWith({
            locationId: 18,
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
            search: 'Len2',
            terminalId: 'COUNTER-02',
            closedBy: 'Len2',
            page: 2,
            limit: 10
        });
        expect(result.data).toEqual(expect.objectContaining({
            location_id: 18,
            pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
            rows: [expect.objectContaining({
                reading_identifier: 'ZR-20260811-00000003',
                closed_by_display_name: 'Len2',
                snapshot_persisted: true,
                summary: expect.objectContaining({ transaction_count: 4, total_amount: 1200.5, vat_amount: 128.63 })
            })]
        }));
    });

    it('buildListPosZReadingsUseCase requires an authenticated user', async () => {
        const posRepository = { listZReadingSnapshots: jest.fn() };
        const useCase = buildListPosZReadingsUseCase({ posRepository });

        const result = await useCase({ query: {}, user: null });

        expect(result.success).toBe(false);
        expect(posRepository.listZReadingSnapshots).not.toHaveBeenCalled();
    });

    it('buildGetDayCloseReadinessUseCase reports the remaining branch shifts without requiring a PIN', async () => {
        const posRepository = {
            listOpenTerminalShiftsForLocation: jest.fn().mockResolvedValue([
                {
                    pos_terminal_shift_id: 31,
                    terminal_id: 'COUNTER-02',
                    opened_at: '2026-08-11T08:00:00.000Z',
                    cashier: { username: 'Cashier Two' }
                }
            ]),
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue(null)
        };
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 7 });
        const useCase = buildGetDayCloseReadinessUseCase({ posRepository, resolveLocationScope });

        const result = await useCase({
            businessDateInput: '2026-08-11',
            user: { user_id: 11 },
            locationId: 7
        });

        expect(result.success).toBe(true);
        expect(resolveLocationScope).toHaveBeenCalledWith({
            requestedLocationId: 7,
            userId: 11,
            operationLabel: 'POS day-close readiness'
        });
        expect(result.data).toEqual(expect.objectContaining({
            business_date: '2026-08-11',
            location_id: 7,
            ready: false,
            already_closed: false,
            open_shift_count: 1,
            open_shifts: [expect.objectContaining({
                shift_id: 31,
                terminal_id: 'COUNTER-02',
                cashier_name: 'Cashier Two'
            })]
        }));
    });

    it('buildGetDayCloseReadinessUseCase allows an existing Z-reading to be printed again', async () => {
        const posRepository = {
            listOpenTerminalShiftsForLocation: jest.fn().mockResolvedValue([]),
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue({
                reading_identifier: 'ZR-20260811-00000003',
                generated_at: '2026-08-11T16:00:00.000Z'
            })
        };
        const useCase = buildGetDayCloseReadinessUseCase({
            posRepository,
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 })
        });

        const result = await useCase({
            businessDateInput: '2026-08-11',
            user: { user_id: 11 },
            locationId: 7
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            ready: true,
            already_closed: true,
            reading_identifier: 'ZR-20260811-00000003'
        }));
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
            getZReadingSnapshotDetails: jest.fn().mockResolvedValue({
                branch_name: 'Main Branch',
                receipt_ranges: { sales: { beginning_invoice_number: 'INV-1', ending_invoice_number: 'INV-2' } },
                refunds: { succeeded_count: 1, succeeded_amount: 25 },
                shifts: [{ shift_id: 31, transaction_count: 2, sales_amount: 250 }]
            }),
            getZReadingReconciliationByBusinessDate: jest.fn().mockResolvedValue({
                status: 'matched',
                comparison_basis: 'completed_recognized_transaction_total',
                business_date: '2026-08-07',
                location_id: 7,
                report_recognized_sales: 250,
                z_total_amount: 250,
                variance: 0,
                evaluated_at: '2026-08-07T16:01:00.000Z',
                message: 'Report recognized sales match the immutable Z-reading total.'
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
        expect(posRepository.getZReadingSnapshotDetails).toHaveBeenCalledWith({
            businessDate: '2026-08-07',
            startAt: expect.any(Date),
            endAt: expect.any(Date),
            locationId: 7
        }, { transaction });
        expect(posRepository.createZReadingSnapshot).toHaveBeenCalledWith(expect.objectContaining({
            business_date: '2026-08-07',
            location_id: 7,
            summary: expect.objectContaining({
                transaction_count: 2,
                z_reading_details: expect.objectContaining({
                    captured: true,
                    branch_name: 'Main Branch',
                    generated_by: expect.objectContaining({ display_name: 'Cashier One' }),
                    shifts: [{ shift_id: 31, transaction_count: 2, sales_amount: 250 }]
                })
            })
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
            generated_at: '2026-08-07T16:00:00.000Z',
            reading_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            reading_evidence: expect.objectContaining({
                reading_type: 'Z',
                source_timezone: 'Asia/Manila',
                payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/)
            }),
            z_reading_reconciliation: expect.objectContaining({
                status: 'matched',
                report_recognized_sales: 250,
                z_total_amount: 250,
                variance: 0,
                evaluated_at: '2026-08-07T16:01:00.000Z'
            }),
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
            getZReadingReconciliationByBusinessDate: jest.fn().mockResolvedValue({
                status: 'matched',
                business_date: '2026-08-07',
                location_id: 7,
                report_recognized_sales: 250,
                z_total_amount: 250,
                variance: 0,
                evaluated_at: '2026-08-07T16:01:00.000Z'
            }),
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
            z_reading_reconciliation: expect.objectContaining({
                status: 'matched',
                evaluated_at: '2026-08-07T16:01:00.000Z'
            }),
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
            getZReadingReconciliationByBusinessDate: jest.fn().mockResolvedValue({
                status: 'not_generated',
                business_date: '2026-08-07',
                location_id: 7,
                report_recognized_sales: 480,
                z_total_amount: null,
                variance: null,
                evaluated_at: '2026-08-07T16:01:00.000Z'
            }),
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
            reading_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            reading_evidence: expect.objectContaining({
                reading_type: 'Z',
                source_timezone: 'Asia/Manila'
            }),
            z_reading_reconciliation: expect.objectContaining({
                status: 'not_generated',
                report_recognized_sales: 480,
                evaluated_at: '2026-08-07T16:01:00.000Z'
            }),
            replay_outcome: 'computed_on_demand'
        }));
    });

    it('buildGetDailyZReadingDetailsUseCase returns only saved details for the authorized branch', async () => {
        const snapshot = {
            business_date: '2026-08-07',
            location_id: 7,
            reading_identifier: 'ZR-20260807-00000012',
            z_counter_value: 12,
            reset_counter_value: 4,
            lifetime_grand_total_cents: 98000,
            generated_at: '2026-08-07T16:00:00.000Z',
            summary: {
                transaction_count: 2,
                total_amount: 250,
                payment_breakdown: [{ payment_type: 'cash', count: 2, amount: 250 }],
                z_reading_details: {
                    version: 1,
                    captured: true,
                    branch_name: 'Main Branch',
                    shifts: [{ shift_id: 31, transaction_count: 2, sales_amount: 250 }]
                }
            }
        };
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue(snapshot),
            getZReadingSummary: jest.fn(),
            getZReadingReconciliationByBusinessDate: jest.fn()
        };
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 7 });
        const useCase = buildGetDailyZReadingDetailsUseCase({ posRepository, resolveLocationScope });

        const result = await useCase({
            businessDateInput: '2026-08-07',
            user: { user_id: 11 },
            locationId: 7
        });

        expect(result.success).toBe(true);
        expect(resolveLocationScope).toHaveBeenCalledWith({
            requestedLocationId: 7,
            userId: 11,
            operationLabel: 'POS Z-reading details'
        });
        expect(posRepository.getLatestZReadingSnapshotByBusinessDate).toHaveBeenCalledWith(
            '2026-08-07',
            { locationId: 7 }
        );
        expect(result.data).toEqual(expect.objectContaining({
            snapshot_persisted: true,
            reading_identifier: 'ZR-20260807-00000012',
            summary: expect.objectContaining({
                transaction_count: 2,
                payment_breakdown: expect.arrayContaining([
                    expect.objectContaining({ payment_type: 'cash', amount: 250 })
                ])
            }),
            details: expect.objectContaining({
                captured: true,
                branch_name: 'Main Branch',
                shifts: [{ shift_id: 31, transaction_count: 2, sales_amount: 250 }]
            })
        }));
        expect(posRepository.getZReadingSummary).not.toHaveBeenCalled();
        expect(posRepository.getZReadingReconciliationByBusinessDate).not.toHaveBeenCalled();
    });

    it('buildGetDailyZReadingDetailsUseCase marks legacy snapshots without reconstructing them', async () => {
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue({
                business_date: '2026-08-07',
                location_id: 7,
                reading_identifier: 'ZR-20260807-00000012',
                summary: { transaction_count: 2, total_amount: 250 }
            }),
            getZReadingSummary: jest.fn()
        };
        const useCase = buildGetDailyZReadingDetailsUseCase({
            posRepository,
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 })
        });

        const result = await useCase({ businessDateInput: '2026-08-07', user: { user_id: 11 } });

        expect(result.success).toBe(true);
        expect(result.data.details).toEqual(expect.objectContaining({
            captured: false,
            unavailable_reason: 'This Z-reading predates saved cashier and shift details.'
        }));
        expect(posRepository.getZReadingSummary).not.toHaveBeenCalled();
    });

    it('keeps cashier and shift details out of the general POS Z-reading response', async () => {
        const posRepository = {
            getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue({
                business_date: '2026-08-07',
                location_id: 7,
                reading_identifier: 'ZR-20260807-00000012',
                z_counter_value: 12,
                reset_counter_value: 4,
                lifetime_grand_total_cents: 98000,
                summary: {
                    transaction_count: 2,
                    total_amount: 250,
                    z_reading_details: {
                        captured: true,
                        shifts: [{ cashier_sales: [{ display_name: 'Private Detail' }] }]
                    }
                }
            }),
            getZReadingReconciliationByBusinessDate: jest.fn().mockResolvedValue({ status: 'matched' })
        };
        const useCase = buildGetDailyZReadingUseCase({
            posRepository,
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 })
        });

        const result = await useCase({ businessDateInput: '2026-08-07', user: { user_id: 11 } });

        expect(result.success).toBe(true);
        expect(result.data.details).toBeUndefined();
        expect(result.data.summary).not.toHaveProperty('z_reading_details');
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
            reading_identifier: expect.stringMatching(/^XR-/),
            reading_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            reading_evidence: expect.objectContaining({
                reading_type: 'X',
                source_timezone: 'Asia/Manila',
                payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/)
            }),
            counters: expect.objectContaining({
                z_counter: 3,
                reset_counter: 9,
                lifetime_grand_total_cents: 250000
            }),
            summary: expect.objectContaining({
                transaction_count: 5,
                total_amount: 900,
                payment_breakdown: [
                    { payment_type: 'cash', payment_label: 'Cash', count: 5, amount: 900 },
                    { payment_type: 'gcash', payment_label: 'GCash', count: 0, amount: 0 },
                    { payment_type: 'maya', payment_label: 'Maya', count: 0, amount: 0 },
                    { payment_type: 'card', payment_label: 'Card (Credit/Debit)', count: 0, amount: 0 },
                    { payment_type: 'bank_transfer', payment_label: 'Bank Transfer', count: 0, amount: 0 },
                    { payment_type: 'employee_credit', payment_label: 'Employee Credit', count: 0, amount: 0 },
                    { payment_type: 'other', payment_label: 'Other', count: 0, amount: 0 }
                ]
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
