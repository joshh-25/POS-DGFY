import { jest } from '@jest/globals';
import {
    buildGetPosReportsOverviewUseCase,
    buildGetPosReportBreakdownUseCase,
    buildExportPosReportsUseCase,
    buildExportProcurementCsvUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import logger from '../src/config/logger.js';
import dbStore from '../src/utils/dbStore.js';

describe('POS reports usecases', () => {
    it('rejects an unsupported report breakdown before reaching the repository', async () => {
        const getReportBreakdown = jest.fn();
        const useCase = buildGetPosReportBreakdownUseCase({
            posRepository: { getReportBreakdown }
        });

        const result = await useCase({
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                breakdown: 'daily'
            },
            user: { user_id: 4 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(getReportBreakdown).not.toHaveBeenCalled();
    });

    it('prevents a cashier from selecting another cashier in a breakdown request', async () => {
        const getReportBreakdown = jest.fn();
        const useCase = buildGetPosReportBreakdownUseCase({
            posRepository: { getReportBreakdown }
        });

        const result = await useCase({
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                breakdown: 'items',
                cashier_id: 99
            },
            user: { user_id: 42, role: 'cashier' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.statusCode).toBe(403);
        expect(getReportBreakdown).not.toHaveBeenCalled();
    });

    it('buildGetPosReportsOverviewUseCase rejects a non-object query', async () => {
        const useCase = buildGetPosReportsOverviewUseCase({
            posRepository: { getReportsOverview: jest.fn() }
        });

        const result = await useCase({ query: 'bad-query', user: { user_id: 4 } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('buildGetPosReportsOverviewUseCase requires an authenticated user', async () => {
        const useCase = buildGetPosReportsOverviewUseCase({
            posRepository: { getReportsOverview: jest.fn() }
        });

        const result = await useCase({
            query: { date_from: '2026-07-01', date_to: '2026-07-06' },
            user: null
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
    });

    it('scopes cashier report queries to the authenticated cashier', async () => {
        const getReportsOverview = jest.fn();
        const useCase = buildGetPosReportsOverviewUseCase({
            posRepository: { getReportsOverview }
        });

        const result = await useCase({
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                cashier_id: 99
            },
            user: { user_id: 42, role: 'cashier' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.statusCode).toBe(403);
        expect(getReportsOverview).not.toHaveBeenCalled();
    });

    it('logs bounded register variance diagnostics without returning them to the report client', async () => {
        const data = { daily_report: {}, cashier_lifecycle: {} };
        Object.defineProperty(data, '_internal_register_variance_diagnostics', {
            value: {
                variance_mismatch_count: 1,
                variance_mismatch_samples: [{
                    shift_id: 147,
                    location_id: 12,
                    stored_variance_amount: 150,
                    derived_variance_amount: -4063,
                    delta: 4213
                }],
                private_payload: 'must not be logged'
            },
            enumerable: false
        });
        const getReportsOverview = jest.fn().mockResolvedValue(data);
        const useCase = buildGetPosReportsOverviewUseCase({ posRepository: { getReportsOverview } });
        const originalGet = dbStore.get.bind(dbStore);
        const dbStoreGet = jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'TenantLocation'
                ? { findByPk: jest.fn().mockResolvedValue({ location_id: 12, is_active: true }) }
                : originalGet(name)
        ));
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

        try {
            const result = await useCase({
                query: { date_from: '2026-09-18', date_to: '2026-09-18', location_id: 12 },
                user: { user_id: 4, is_master_admin: true }
            });

            expect(result.success).toBe(true);
            expect(warn).toHaveBeenCalledWith('[POS][RegisterReconciliationVarianceMismatch]', {
                mismatch_count: 1,
                samples: [{
                    shift_id: 147,
                    location_id: 12,
                    stored_variance_amount: 150,
                    derived_variance_amount: -4063,
                    delta: 4213
                }]
            });
            expect(result.data).not.toHaveProperty('_internal_register_variance_diagnostics');
            expect(JSON.stringify(result.data)).not.toContain('must not be logged');
        } finally {
            dbStoreGet.mockRestore();
            warn.mockRestore();
        }
    });

    it('buildExportPosReportsUseCase rejects a non-object query', async () => {
        const useCase = buildExportPosReportsUseCase({
            posRepository: { exportReports: jest.fn() }
        });

        const result = await useCase({ query: 'bad-query', user: { user_id: 4 } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('buildExportPosReportsUseCase requires an authenticated user', async () => {
        const useCase = buildExportPosReportsUseCase({
            posRepository: { exportReports: jest.fn() }
        });

        const result = await useCase({
            query: { date_from: '2026-07-01', date_to: '2026-07-06' },
            user: undefined
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
    });

    it('exports complete item-sales breakdown rows through the breakdown use case', async () => {
        const getReportBreakdownUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: {
                range: { date_from: '2026-09-01', date_to: '2026-09-30', timezone: 'Asia/Manila' },
                summary: {
                    gross_sales: 150,
                    discounts: 0,
                    net_sales: 150,
                    refunds_voids: 0,
                    vatable_sales: 150,
                    vat: 18,
                    service_fees: 0,
                    cogs: 30,
                    profit: 120,
                    total_transactions: 2,
                    total_items_sold: 3
                },
                rows: [{
                    item_key: 'item:21',
                    item_id: 21,
                    item_name: 'Coffee, "Large"',
                    sku: 'COF-21',
                    category_name: 'Drinks',
                    quantity: 3,
                    orders: 2,
                    gross_sales: 150,
                    discounts: 0,
                    net_sales: 150,
                    refunds_voids: 0,
                    cogs: 30,
                    profit: 120,
                    profit_margin: 80,
                    average_unit_price: 50,
                    sales_share: 100
                }]
            }
        });

        const useCase = buildExportPosReportsUseCase({
            posRepository: {},
            getReportBreakdownUseCase
        });
        const result = await useCase({
            query: {
                section: 'item_sales',
                date_from: '2026-09-01',
                date_to: '2026-09-30',
                page: 4,
                limit: 1,
                location_id: 12,
                cashier_id: 9,
                payment_type: 'cash',
                source: 'in_store',
                category_id: 4,
                sort_by: 'sku',
                sort_direction: 'asc'
            },
            user: { user_id: 4 }
        });

        expect(result.success).toBe(true);
        expect(getReportBreakdownUseCase).toHaveBeenCalledWith(expect.objectContaining({
            query: expect.objectContaining({
                breakdown: 'items',
                export_all: true,
                page: 1,
                limit: 1,
                location_id: 12,
                cashier_id: 9,
                payment_type: 'cash',
                source: 'in_store',
                category_id: 4,
                sort_by: 'sku',
                sort_direction: 'asc'
            }),
            user: { user_id: 4 }
        }));
        expect(result.data.filename).toBe('pos-item_sales-report-2026-09-01_to_2026-09-30.csv');
        expect(result.data.content).toContain('"Report","Item Sales"');
        expect(result.data.content).toContain('"Date From","2026-09-01"');
        expect(result.data.content).toContain('"Timezone","Asia/Manila"');
        expect(result.data.content).toContain('"Metric","Value"');
        expect(result.data.content).toContain('"Gross Sales","150"');
        expect(result.data.content).toContain('"Profit","120"');
        expect(result.data.content).toContain('Item Key');
        expect(result.data.content).toContain('"Coffee, ""Large"""');
    });

    it.each([
        ['hourly', 'hourly', 'Bucket Start (Asia/Manila)'],
        ['category_sales', 'categories', 'Category Key']
    ])('exports the %s section with its fixed detail header', async (section, breakdown, header) => {
        const getReportBreakdownUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: {
                range: { date_from: '2026-09-01', date_to: '2026-09-01', timezone: 'Asia/Manila' },
                summary: { net_sales: 0 },
                rows: []
            }
        });
        const useCase = buildExportPosReportsUseCase({ posRepository: {}, getReportBreakdownUseCase });

        const result = await useCase({
            query: { section, date_from: '2026-09-01', date_to: '2026-09-01' },
            user: { user_id: 4 }
        });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain(`"Report","${section === 'hourly' ? 'Hourly Sales' : 'Sales by Category'}"`);
        expect(result.data.content).toContain(`"${header}"`);
        expect(getReportBreakdownUseCase).toHaveBeenCalledWith(expect.objectContaining({
            query: expect.objectContaining({ breakdown, export_all: true, page: 1 })
        }));
    });

    it('exports refunds and voids as signed negative adjustments in breakdown CSVs', async () => {
        const getReportBreakdownUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: {
                range: { date_from: '2026-09-01', date_to: '2026-09-01', timezone: 'Asia/Manila' },
                summary: {
                    gross_sales: 80,
                    discounts: 0,
                    net_sales: 0,
                    refunds_voids: 80,
                    vatable_sales: 0,
                    vat: 0,
                    service_fees: 0,
                    cogs: 67,
                    profit: -67,
                    total_transactions: 1,
                    total_items_sold: 1
                },
                rows: [{
                    bucket_start_local: '2026-09-01 16:00:00',
                    bucket_end_local: '2026-09-01 16:59:59',
                    transaction_count: 1,
                    item_quantity: 1,
                    gross_sales: 80,
                    discounts: 0,
                    net_sales: 0,
                    refunds_voids: 80,
                    vat: 0,
                    service_fees: 0,
                    cogs: 67,
                    profit: -67,
                    profit_margin: -83.75
                }]
            }
        });
        const useCase = buildExportPosReportsUseCase({ posRepository: {}, getReportBreakdownUseCase });

        const result = await useCase({
            query: { section: 'hourly', date_from: '2026-09-01', date_to: '2026-09-01' },
            user: { user_id: 4 }
        });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain('"Refunds/Voids","-80"');
        expect(result.data.content).toContain('"2026-09-01 16:00:00","2026-09-01 16:59:59","1","1","80","0","0","-80"');
    });

    it('exports invoice VAT fields and all split payment methods', async () => {
        const getReportsOverviewUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: {
                daily_report: {
                    summary: {
                        gross_sales: 110,
                        discounts: 0,
                        vatable_sales: 98.2143,
                        vat: 11.7857,
                        net_sales: 110,
                        total_transactions: 1
                    },
                    discount_breakdown: [],
                    cashier_summary: [],
                    transaction_rows: [{
                        invoice_number: 'NFS-000140',
                        created_at: '2026-09-21T07:42:44.000Z',
                        cashier_name: 'Admin',
                        payment_type: 'cash',
                        payment_methods: ['gcash', 'cash'],
                        status: 'completed',
                        total_amount: 110,
                        gross_sales: 110,
                        discount_amount: 0,
                        vatable_sales: 98.2143,
                        vat_amount: 11.7857,
                        net_sales: 110
                    }]
                },
                cashier_lifecycle: {}
            }
        });
        const useCase = buildExportPosReportsUseCase({
            posRepository: {},
            getReportsOverviewUseCase
        });

        const result = await useCase({ query: { section: 'daily' }, user: { user_id: 4 } });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain(
            '"Invoice","Datetime (Asia/Manila)","Cashier","Payment","Status","Total","Gross Sales","Discount","VAT Sales","VAT","Net Sales"'
        );
        expect(result.data.content).toContain(
            '"NFS-000140","2026-09-21 15:42:44 (Asia/Manila)","Admin","GCash + Cash","completed","110","110","0","98.2143","11.7857","110"'
        );
        expect(getReportsOverviewUseCase).toHaveBeenCalledWith({
            query: { section: 'daily' },
            user: { user_id: 4 }
        });
    });

    it('exports register reconciliation as one row with a singular shift identifier', async () => {
        const getReportsOverviewUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: {
                daily_report: { summary: {}, discount_breakdown: [], cashier_summary: [], transaction_rows: [] },
                cashier_lifecycle: {
                    registers: [{
                        shift_id: 147,
                        opening_cashier_name: 'Admin',
                        opening_float_amount: 0,
                        cash_sales_amount: 0,
                        cash_in_total: 0,
                        cash_out_total: 0,
                        expected_cash_amount: 75994.83,
                        closing_cash_amount: 71931.83,
                        variance_amount: -4063,
                        attribution_notice: 'Register totals belong to the drawer lifecycle.'
                    }]
                }
            }
        });
        const useCase = buildExportPosReportsUseCase({ posRepository: {}, getReportsOverviewUseCase });

        const result = await useCase({ query: { section: 'registers' }, user: { user_id: 4 } });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain(
            '"Register Shift","Opening Cashier","Opening Float","Cash Sales","Cash In","Cash Out","Expected Cash","Closing Cash","Variance","Notice"'
        );
        expect(result.data.content).toContain('"RS-147","Admin","0","0","0","0","75994.83","71931.83","-4063"');
        expect(result.data.content).not.toContain('Shift IDs');
        expect(result.data.content).not.toContain('147|');
    });

    describe('buildExportProcurementCsvUseCase', () => {
        it('rejects a non-object query', async () => {
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders: jest.fn() },
                resolveLocationScope: jest.fn()
            });

            const result = await useCase({ query: 'bad-query', user: { user_id: 4 } });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
            expect(result.error.statusCode).toBe(400);
        });

        it('requires an authenticated user', async () => {
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders: jest.fn() },
                resolveLocationScope: jest.fn()
            });

            const result = await useCase({ query: {}, user: undefined });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
            expect(result.error.statusCode).toBe(401);
        });

        it('rejects a non-numeric location_id', async () => {
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders: jest.fn() },
                resolveLocationScope: jest.fn()
            });

            const result = await useCase({ query: { location_id: 'abc' }, user: { user_id: 4 } });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
            expect(result.error.statusCode).toBe(422);
        });

        it('returns a header-only CSV when there are no pending orders', async () => {
            const listIncomingOnlineOrders = jest.fn().mockResolvedValue([]);
            const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 4 });
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders },
                resolveLocationScope
            });

            const result = await useCase({ query: {}, user: { user_id: 4 } });

            expect(result.success).toBe(true);
            expect(result.data.content_type).toBe('text/csv; charset=utf-8');
            expect(result.data.content).toBe(
                '"Order #","Order Date (Asia/Manila)","Location","Status","Customer Name","Customer Phone","Delivery Address","SKU","Item Name","Quantity","Unit"'
            );
            expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: 4, limit: 500 });
        });

        // RF-1 (PR #1504 review): an unscoped request must never reach the repository with a raw
        // null/all-locations query -- it has to resolve through resolvePosReadLocationScope first,
        // same as the sibling buildListOnlineOrderHistoryUseCase read path.
        it('resolves an unscoped request to the caller\'s own authorized location scope', async () => {
            const listIncomingOnlineOrders = jest.fn().mockResolvedValue([]);
            const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 9 });
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders },
                resolveLocationScope
            });

            await useCase({ query: {}, user: { user_id: 4 } });

            expect(resolveLocationScope).toHaveBeenCalledWith({
                requestedLocationId: undefined,
                userId: 4,
                operationLabel: 'POS procurement export read'
            });
            expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: 9, limit: 500 });
        });

        it('resolves a requested location_id through the scope resolver before calling the repository', async () => {
            const listIncomingOnlineOrders = jest.fn().mockResolvedValue([]);
            const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 7 });
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders },
                resolveLocationScope
            });

            await useCase({ query: { location_id: 7 }, user: { user_id: 4 } });

            expect(resolveLocationScope).toHaveBeenCalledWith({
                requestedLocationId: 7,
                userId: 4,
                operationLabel: 'POS procurement export read'
            });
            expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: 7, limit: 500 });
        });

        // RF-1: a VIEW_POS user requesting a location they have no grant for must be rejected --
        // never falls back to an unscoped/all-locations export, and never reaches the repository.
        it('rejects a request for a location the caller is not authorized for', async () => {
            const listIncomingOnlineOrders = jest.fn();
            const deniedError = Object.assign(
                new Error('You do not have location access to perform POS procurement export read at location 99.'),
                { statusCode: 403 }
            );
            const resolveLocationScope = jest.fn().mockRejectedValue(deniedError);
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders },
                resolveLocationScope
            });

            const result = await useCase({ query: { location_id: 99 }, user: { user_id: 4 } });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
            expect(result.error.statusCode).toBe(403);
            expect(listIncomingOnlineOrders).not.toHaveBeenCalled();
        });

        it('flattens multi-line-item orders into one CSV row per line, falling back to Guest Buyer for guest checkouts', async () => {
            const orders = [
                {
                    invoice_number: 'INV-001',
                    pos_transaction_id: 1,
                    created_at: '2026-09-01T08:00:00.000Z',
                    location: { name: 'Main Branch' },
                    fulfillment_status: 'confirmed',
                    customer_name: 'Juan Dela Cruz',
                    customer_phone: '09171234567',
                    delivery_address: '123 Rizal St',
                    lines: [
                        { item: { sku_code: 'SKU-1', name: 'Rice 5kg', unit_of_measure: 'sack' }, quantity: 2 },
                        { item: { sku_code: 'SKU-2', name: 'Cooking Oil', unit_of_measure: 'bottle' }, quantity: 3 }
                    ]
                },
                {
                    invoice_number: null,
                    pos_transaction_id: 2,
                    created_at: '2026-09-01T09:00:00.000Z',
                    location: { name: 'Second Branch' },
                    fulfillment_status: 'placed',
                    customer_name: null,
                    customer_phone: '',
                    delivery_address: '',
                    lines: [
                        { item: { sku_code: 'SKU-3', name: 'Bottled Water', unit_of_measure: 'case' }, quantity: 1 }
                    ]
                }
            ];
            const listIncomingOnlineOrders = jest.fn().mockResolvedValue(orders);
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders },
                resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 4 })
            });

            const result = await useCase({ query: {}, user: { user_id: 4 } });

            expect(result.success).toBe(true);
            const rows = result.data.content.split('\n');
            expect(rows).toHaveLength(4); // header + 2 lines from order 1 + 1 line from order 2
            expect(rows[0]).toContain('Order Date (Asia/Manila)');
            expect(rows[1]).toBe('"INV-001","2026-09-01 16:00:00 (Asia/Manila)","Main Branch","confirmed","Juan Dela Cruz","09171234567","123 Rizal St","SKU-1","Rice 5kg","2","sack"');
            expect(rows[2]).toBe('"INV-001","2026-09-01 16:00:00 (Asia/Manila)","Main Branch","confirmed","Juan Dela Cruz","09171234567","123 Rizal St","SKU-2","Cooking Oil","3","bottle"');
            expect(rows[3]).toBe('"2","2026-09-01 17:00:00 (Asia/Manila)","Second Branch","placed","Guest Buyer","","","SKU-3","Bottled Water","1","case"');
            expect(result.data.filename).toMatch(/^pos-procurement-export-\d{4}-\d{2}-\d{2}\.csv$/);
        });
    });
});
