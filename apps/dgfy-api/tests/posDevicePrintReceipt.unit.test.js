import { jest } from '@jest/globals';

const mockGetAllSettingsUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

let buildPrintPosReceiptUseCase;
let buildClaimOnlineOrderReceiptAutoPrintUseCase;
let buildPrintPosShiftSummaryUseCase;
let buildPrintPosZReadingUseCase;

beforeAll(async () => {
    ({
        buildPrintPosReceiptUseCase,
        buildClaimOnlineOrderReceiptAutoPrintUseCase,
        buildPrintPosShiftSummaryUseCase,
        buildPrintPosZReadingUseCase
    } = await import('../src/modules/pos/usecases/posDeviceUseCases.js'));
});

const buildTransaction = () => ({
    pos_transaction_id: 42,
    invoice_number: 'INV-0001',
    total_amount: 150,
    lines: []
});

const buildPosRepositoryStub = ({
    transaction = buildTransaction(),
    postCloseVoids = {
        post_close_void_transaction_count: 0,
        post_close_void_amount: 0,
        post_close_voided_item_count: 0
    }
} = {}) => ({
    findOperationReplayByKey: jest.fn().mockResolvedValue(null),
    findOpenTerminalShift: jest.fn().mockResolvedValue({ pos_terminal_shift_id: 9 }),
    getTransactionById: jest.fn().mockResolvedValue(transaction),
    createAuditLog: jest.fn().mockResolvedValue(null),
    createOperationReplay: jest.fn().mockResolvedValue(null),
    getTerminalShiftById: jest.fn().mockResolvedValue({
        pos_terminal_shift_id: 9,
        business_date: '2026-08-07',
        terminal_id: 'POS-01',
        location_id: 1,
        cashier_id: 1,
        status: 'closed',
        opening_float_amount: 100,
        closing_cash_amount: 250,
        expected_cash_amount: 250,
        cash_variance_amount: 0,
        closed_at: '2026-08-07T12:00:00.000Z',
        cashEvents: []
    }),
    getShiftCashSalesTotal: jest.fn().mockResolvedValue(150),
    getZReadingSummary: jest.fn().mockResolvedValue({
        transaction_count: 1,
        subtotal_amount: 150,
        discount_amount: 0,
        vat_amount: 0,
        total_amount: 150,
        payment_breakdown: [{ payment_type: 'cash', count: 1, amount: 150 }]
    }),
    getPostCloseVoidSummaryForShift: jest.fn().mockResolvedValue(postCloseVoids),
    getLatestZReadingSnapshotByBusinessDate: jest.fn().mockResolvedValue({
        pos_z_reading_snapshot_id: 12,
        business_date: '2026-08-07',
        location_id: 3,
        reading_identifier: 'Z-20260807-0001',
        generated_at: '2026-08-07T12:00:00.000Z',
        summary: {
            transaction_count: 2,
            total_amount: 300,
            payment_breakdown: [{ payment_type: 'cash', count: 2, amount: 300 }]
        },
        z_counter_value: 7,
        reset_counter_value: 2,
        lifetime_grand_total_cents: 1234500
    })
});

beforeEach(() => {
    mockGetAllSettingsUseCase.mockReset().mockResolvedValue({ success: true, data: {}, error: null });
});

describe('buildPrintPosReceiptUseCase — client-delegated printing', () => {
    it('skips the server driver and still audits + returns the canonical receipt contract when a client driver already printed', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'client_managed',
            printReceipt: jest.fn()
        };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: {
                transaction_id: 42,
                client_driver_id: 'imin_native',
                client_result: { success: true, message: 'Printed via iMin' }
            },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.printReceipt).not.toHaveBeenCalled();
        expect(result.data.bridge).toEqual({
            ok: true,
            delegated: true,
            driver: 'imin_native',
            client_result: { success: true, message: 'Printed via iMin' }
        });
        expect(result.data.receipt_contract).toBeDefined();

        expect(posRepository.createAuditLog).toHaveBeenCalledTimes(1);
        const [auditCall] = posRepository.createAuditLog.mock.calls;
        expect(auditCall[0].changes.driver_id).toBe('imin_native');

        expect(posRepository.createOperationReplay).not.toHaveBeenCalled();
    });

    it('records a failed client print outcome without throwing', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = { id: 'client_managed', printReceipt: jest.fn() };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: {
                transaction_id: 42,
                client_driver_id: 'imin_native',
                client_result: { success: false, reason_code: 'PAPER_OUT' }
            },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(result.data.bridge.ok).toBe(false);
    });

    it('still dispatches to the server driver when no client_driver_id is provided', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            printReceipt: jest.fn().mockResolvedValue({ ok: true, result: { copies: 1 } })
        };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: { transaction_id: 42 },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.printReceipt).toHaveBeenCalledTimes(1);
        expect(result.data.bridge).toEqual({ ok: true, result: { copies: 1 } });
    });

    // logo_raster (issue #321): the LAN/USB bridge path pre-rasterizes the
    // configured company icon via resolveReceiptLogoRaster (see
    // receiptLogoRaster.unit.test.js for the encoding itself) and folds it into
    // the receipt's business settings. This only checks the wiring -- that the
    // field is present and null when no icon is configured -- not the encoding.
    it('includes a null business.logo_raster when no company icon is configured', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            printReceipt: jest.fn().mockResolvedValue({ ok: true, result: { copies: 1 } })
        };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        await useCase({
            payload: { transaction_id: 42 },
            user: { user_id: 1 }
        });

        const [printCall] = deviceDriver.printReceipt.mock.calls;
        expect(printCall[0].receipt.business).toHaveProperty('logo_raster', null);
    });
});

describe('buildClaimOnlineOrderReceiptAutoPrintUseCase', () => {
    const eligibleTransaction = {
        pos_transaction_id: 42,
        order_source: 'online_store',
        fulfillment_status: 'confirmed',
        payment_status: 'paid',
        payment_provider: 'paymongo',
        balance_due: 0,
        location_id: 3
    };

    it('atomically grants only one automatic receipt claim across terminals', async () => {
        let storedReplay = null;
        const posRepository = {
            findOpenTerminalShift: jest.fn().mockResolvedValue({ location_id: 3 }),
            getTransactionById: jest.fn().mockResolvedValue(eligibleTransaction),
            createOperationReplay: jest.fn(async (payload) => {
                storedReplay ||= payload;
                return storedReplay;
            })
        };
        const claim = buildClaimOnlineOrderReceiptAutoPrintUseCase({ posRepository });

        const first = await claim({
            payload: { transaction_id: 42, terminal_id: 'COUNTER-01' },
            user: { user_id: 7 }
        });
        const second = await claim({
            payload: { transaction_id: 42, terminal_id: 'COUNTER-02' },
            user: { user_id: 8 }
        });

        expect(first).toMatchObject({ success: true, data: { claimed: true, eligible: true } });
        expect(second).toMatchObject({ success: true, data: { claimed: false, eligible: true } });
    });

    it.each([
        ['cash on delivery', { payment_provider: null, payment_status: 'unpaid' }],
        ['downpayment', { payment_provider: 'paymongo', payment_status: 'partially_paid', balance_due: 75 }],
        ['unconfirmed order', { fulfillment_status: 'placed' }]
    ])('does not auto-print an ineligible %s order', async (_label, override) => {
        const posRepository = {
            findOpenTerminalShift: jest.fn().mockResolvedValue({ location_id: 3 }),
            getTransactionById: jest.fn().mockResolvedValue({ ...eligibleTransaction, ...override }),
            createOperationReplay: jest.fn()
        };
        const claim = buildClaimOnlineOrderReceiptAutoPrintUseCase({ posRepository });

        const result = await claim({
            payload: { transaction_id: 42, terminal_id: 'COUNTER-01' },
            user: { user_id: 7 }
        });

        expect(result).toMatchObject({ success: true, data: { claimed: false, eligible: false } });
        expect(posRepository.createOperationReplay).not.toHaveBeenCalled();
    });
});

describe('buildPrintPosShiftSummaryUseCase', () => {
    it('records the cashier sales summary when a client driver prints after close', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = { id: 'client_managed', printShiftSummary: jest.fn() };
        const useCase = buildPrintPosShiftSummaryUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            shiftId: 9,
            payload: {
                idempotency_key: 'shift-summary-0001',
                client_driver_id: 'imin_native',
                client_result: { success: true, message: 'Printed via iMin' }
            },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(result.data.shift_summary.sales_summary.total_amount).toBe(150);
        expect(deviceDriver.printShiftSummary).not.toHaveBeenCalled();
        expect(posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            entity_type: 'pos_device_shift_summary',
            entity_id: 9
        }));
    });

    it('dispatches the closed shift summary to the server printer driver', async () => {
        const posRepository = buildPosRepositoryStub({
            postCloseVoids: {
                post_close_void_transaction_count: 1,
                post_close_void_amount: 125,
                post_close_voided_item_count: 1
            }
        });
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            printShiftSummary: jest.fn().mockResolvedValue({ ok: true, result: { copies: 1 } })
        };
        const useCase = buildPrintPosShiftSummaryUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            shiftId: 9,
            payload: { reason: 'shift_close_report' },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.printShiftSummary).toHaveBeenCalledWith(expect.objectContaining({
            copies: 1,
            paper_width: '80mm',
            shift_summary: expect.objectContaining({
                cash_summary: expect.objectContaining({ cash_sales_amount: 150 }),
                sales_summary: expect.objectContaining({
                    void_transaction_count: 1,
                    void_amount: 125,
                    post_close_void_transaction_count: 1,
                    post_close_void_amount: 125
                })
            })
        }));
        expect(posRepository.getPostCloseVoidSummaryForShift).toHaveBeenCalledWith({
            shiftId: 9,
            closedAt: '2026-08-07T12:00:00.000Z',
            terminalId: 'POS-01',
            locationId: 1
        }, { transaction: undefined });
    });
});

describe('buildPrintPosZReadingUseCase', () => {
    it('dispatches the branch snapshot to the server printer driver', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            printZReading: jest.fn().mockResolvedValue({ ok: true, result: { copies: 1 } })
        };
        const useCase = buildPrintPosZReadingUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            businessDateInput: '2026-08-07',
            locationId: 3,
            payload: { reason: 'close_day_report' },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(posRepository.getLatestZReadingSnapshotByBusinessDate).toHaveBeenCalledWith('2026-08-07', {
            locationId: 3
        });
        expect(deviceDriver.printZReading).toHaveBeenCalledWith(expect.objectContaining({
            copies: 1,
            paper_width: '80mm',
            z_reading: expect.objectContaining({
                z_reading: expect.objectContaining({
                    reading_identifier: 'Z-20260807-0001',
                    z_counter_value: 7
                })
            })
        }));
        expect(posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            entity_type: 'pos_device_z_reading',
            entity_id: 12
        }));
    });

    it('accepts a client print result without dispatching to the server driver', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = { id: 'client_managed', printZReading: jest.fn() };
        const useCase = buildPrintPosZReadingUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            businessDateInput: new Date('2026-08-07T00:00:00.000Z'),
            locationId: 3,
            payload: {
                client_driver_id: 'imin_native',
                client_result: { success: true, message: 'Printed via iMin' }
            },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.printZReading).not.toHaveBeenCalled();
        expect(result.data.bridge).toEqual(expect.objectContaining({
            ok: true,
            delegated: true,
            driver: 'imin_native'
        }));
    });
});
