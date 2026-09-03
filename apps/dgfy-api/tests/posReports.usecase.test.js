import { jest } from '@jest/globals';
import {
    buildGetPosReportsOverviewUseCase,
    buildExportPosReportsUseCase,
    buildExportProcurementCsvUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('POS reports usecases', () => {
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

    describe('buildExportProcurementCsvUseCase', () => {
        it('rejects a non-object query', async () => {
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders: jest.fn() }
            });

            const result = await useCase({ query: 'bad-query', user: { user_id: 4 } });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
            expect(result.error.statusCode).toBe(400);
        });

        it('requires an authenticated user', async () => {
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders: jest.fn() }
            });

            const result = await useCase({ query: {}, user: undefined });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
            expect(result.error.statusCode).toBe(401);
        });

        it('rejects a non-numeric location_id', async () => {
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders: jest.fn() }
            });

            const result = await useCase({ query: { location_id: 'abc' }, user: { user_id: 4 } });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
            expect(result.error.statusCode).toBe(422);
        });

        it('returns a header-only CSV when there are no pending orders', async () => {
            const listIncomingOnlineOrders = jest.fn().mockResolvedValue([]);
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders }
            });

            const result = await useCase({ query: {}, user: { user_id: 4 } });

            expect(result.success).toBe(true);
            expect(result.data.content_type).toBe('text/csv; charset=utf-8');
            expect(result.data.content).toBe(
                '"Order #","Order Date","Location","Status","Customer Name","Customer Phone","Delivery Address","SKU","Item Name","Quantity","Unit"'
            );
            expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: null, limit: 500 });
        });

        it('passes location_id through to the repository call', async () => {
            const listIncomingOnlineOrders = jest.fn().mockResolvedValue([]);
            const useCase = buildExportProcurementCsvUseCase({
                posRepository: { listIncomingOnlineOrders }
            });

            await useCase({ query: { location_id: 7 }, user: { user_id: 4 } });

            expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: 7, limit: 500 });
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
                posRepository: { listIncomingOnlineOrders }
            });

            const result = await useCase({ query: {}, user: { user_id: 4 } });

            expect(result.success).toBe(true);
            const rows = result.data.content.split('\n');
            expect(rows).toHaveLength(4); // header + 2 lines from order 1 + 1 line from order 2
            expect(rows[1]).toBe('"INV-001","2026-09-01T08:00:00.000Z","Main Branch","confirmed","Juan Dela Cruz","09171234567","123 Rizal St","SKU-1","Rice 5kg","2","sack"');
            expect(rows[2]).toBe('"INV-001","2026-09-01T08:00:00.000Z","Main Branch","confirmed","Juan Dela Cruz","09171234567","123 Rizal St","SKU-2","Cooking Oil","3","bottle"');
            expect(rows[3]).toBe('"2","2026-09-01T09:00:00.000Z","Second Branch","placed","Guest Buyer","","","SKU-3","Bottled Water","1","case"');
            expect(result.data.filename).toMatch(/^pos-procurement-export-\d{4}-\d{2}-\d{2}\.csv$/);
        });
    });
});
