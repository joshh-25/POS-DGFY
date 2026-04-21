import { jest } from '@jest/globals';
import {
    buildListPosTransactionsUseCase,
    buildGetPosTransactionByIdUseCase,
    buildGetDailyZReadingUseCase,
    buildListPosCatalogUseCase,
    buildListPosCatalogOverridesUseCase,
    buildUpdatePosCatalogOverrideUseCase,
    buildUpdateOnlineOrderStatusUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

describe('pos use-cases application result contract', () => {
    it('listPosTransactions validates query shape', async () => {
        const useCase = buildListPosTransactionsUseCase({
            posRepository: { listTransactions: jest.fn() }
        });

        const result = await useCase({ query: 'bad-query' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('getPosTransactionById validates positive integer id', async () => {
        const useCase = buildGetPosTransactionByIdUseCase({
            posRepository: { getTransactionById: jest.fn() }
        });

        const result = await useCase({ posTransactionId: 'abc' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    });

    it('getDailyZReading validates YYYY-MM-DD date format', async () => {
        const useCase = buildGetDailyZReadingUseCase({
            posRepository: { getZReadingSummary: jest.fn() }
        });

        const result = await useCase({ businessDateInput: 'invalid-date' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    });

    it('listPosCatalog wraps successful repository response', async () => {
        const listCatalog = jest.fn().mockResolvedValue([
            {
                item_id: 1,
                name: 'Sample',
                pos_visible: true,
                current_stock: 5,
                toJSON: () => ({ item_id: 1, name: 'Sample', pos_visible: true, current_stock: 5 })
            }
        ]);
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 9 });
        const useCase = buildListPosCatalogUseCase({
            posRepository: { listCatalog },
            resolveLocationScope
        });

        const result = await useCase({
            query: { search: 'sam' },
            user: { user_id: 15 }
        });
        expect(resolveLocationScope).toHaveBeenCalledWith({
            requestedLocationId: undefined,
            userId: 15,
            operationLabel: 'POS catalog read'
        });
        expect(listCatalog).toHaveBeenCalledWith({
            search: 'sam',
            limit: 100,
            folder_id: undefined,
            location_id: 9
        });
        expect(result).toEqual({
            success: true,
            data: [{ item_id: 1, name: 'Sample', pos_visible: true, current_stock: 5 }],
            error: null,
            message: null
        });
    });

    it('listPosCatalog forwards optional folder filter', async () => {
        const listCatalog = jest.fn().mockResolvedValue([]);
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 12 });
        const useCase = buildListPosCatalogUseCase({
            posRepository: { listCatalog },
            resolveLocationScope
        });

        const result = await useCase({
            query: { search: '', limit: 50, folder_id: 12, location_id: 12 },
            user: { user_id: 21 }
        });
        expect(listCatalog).toHaveBeenCalledWith({
            search: '',
            limit: 50,
            folder_id: 12,
            location_id: 12
        });
        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
    });

    it('listPosCatalog returns POS-visible items including out-of-stock rows', async () => {
        const listCatalog = jest.fn().mockResolvedValue([
            { item_id: 1, name: 'Visible In Stock', pos_visible: true, current_stock: 3 },
            { item_id: 2, name: 'Visible Out Of Stock', pos_visible: true, current_stock: 0 },
            { item_id: 3, name: 'Hidden In POS', pos_visible: false, current_stock: 10 },
            { item_id: 4, name: 'Implicit Visible In Stock', current_stock: 1 }
        ]);
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 5 });
        const useCase = buildListPosCatalogUseCase({
            posRepository: { listCatalog },
            resolveLocationScope
        });

        const result = await useCase({
            query: {},
            user: { user_id: 33 }
        });
        expect(result.success).toBe(true);
        expect(result.data).toEqual([
            { item_id: 1, name: 'Visible In Stock', pos_visible: true, current_stock: 3 },
            { item_id: 2, name: 'Visible Out Of Stock', pos_visible: true, current_stock: 0 },
            { item_id: 4, name: 'Implicit Visible In Stock', current_stock: 1 }
        ]);
    });

    it('listPosCatalog requires an authenticated user for location fail-closed enforcement', async () => {
        const listCatalog = jest.fn();
        const useCase = buildListPosCatalogUseCase({
            posRepository: { listCatalog }
        });

        const result = await useCase({ query: {} });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
        expect(listCatalog).not.toHaveBeenCalled();
    });

    it('listPosCatalogOverrides preserves normalized pos_readiness metadata contract', async () => {
        const listCatalogOverrides = jest.fn().mockResolvedValue([
            {
                item_id: 9,
                name: 'Milk Tea Large',
                pos_visible: true,
                pos_readiness: {
                    ready: false,
                    state: 'needs_attention',
                    score: 75,
                    checks: { pos_visible: true, has_menu_image: false },
                    missing_requirements: [{ code: 'POS_IMAGE_MISSING', label: 'Upload POS menu image' }]
                }
            }
        ]);

        const useCase = buildListPosCatalogOverridesUseCase({
            posRepository: { listCatalogOverrides }
        });

        const result = await useCase({ query: { search: 'milk' } });
        expect(listCatalogOverrides).toHaveBeenCalledWith({ search: 'milk', limit: 200 });
        expect(result.success).toBe(true);
        expect(result.data).toEqual([
            expect.objectContaining({
                item_id: 9,
                pos_readiness: expect.objectContaining({
                    ready: false,
                    missing_requirements: expect.any(Array)
                })
            })
        ]);
    });

    it('updatePosCatalogOverride requires items:edit permission', async () => {
        const getItemById = jest.fn().mockResolvedValue({ item_id: 101 });
        const upsertCatalogOverride = jest.fn().mockResolvedValue({ item_id: 101, pos_visible: true });
        const useCase = buildUpdatePosCatalogOverrideUseCase({
            posRepository: { getItemById, upsertCatalogOverride }
        });

        const deniedResult = await useCase({
            itemId: 101,
            payload: { pos_visible: true },
            user: { is_master_admin: false, permissions: ['settings:edit'] }
        });

        expect(deniedResult.success).toBe(false);
        expect(deniedResult.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(upsertCatalogOverride).not.toHaveBeenCalled();

        const allowedResult = await useCase({
            itemId: 101,
            payload: { pos_visible: true },
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(allowedResult.success).toBe(true);
        expect(getItemById).toHaveBeenCalledWith(101);
        expect(upsertCatalogOverride).toHaveBeenCalledWith(101, { pos_visible: true });
    });

    it('updatePosCatalogOverride blocks enabling pos visibility when readiness is incomplete', async () => {
        const getItemById = jest.fn().mockResolvedValue({ item_id: 202 });
        const getCatalogReadinessByItemId = jest.fn().mockResolvedValue({
            item_id: 202,
            pos_readiness: {
                ready: false,
                missing_requirements: [
                    { code: 'POS_IMAGE_MISSING', label: 'Upload POS menu image' }
                ]
            }
        });
        const upsertCatalogOverride = jest.fn();
        const useCase = buildUpdatePosCatalogOverrideUseCase({
            posRepository: { getItemById, getCatalogReadinessByItemId, upsertCatalogOverride }
        });

        const result = await useCase({
            itemId: 202,
            payload: { pos_visible: true },
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details).toMatchObject({
            reason_code: 'POS_READINESS_INCOMPLETE',
            missing_requirements: expect.any(Array)
        });
        expect(upsertCatalogOverride).not.toHaveBeenCalled();
    });

    it('updatePosCatalogOverride allows disabling pos visibility even when readiness is incomplete', async () => {
        const getItemById = jest.fn().mockResolvedValue({ item_id: 203 });
        const getCatalogReadinessByItemId = jest.fn();
        const upsertCatalogOverride = jest.fn().mockResolvedValue({ item_id: 203, pos_visible: false });
        const useCase = buildUpdatePosCatalogOverrideUseCase({
            posRepository: { getItemById, getCatalogReadinessByItemId, upsertCatalogOverride }
        });

        const result = await useCase({
            itemId: 203,
            payload: { pos_visible: false },
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(result.success).toBe(true);
        expect(getCatalogReadinessByItemId).not.toHaveBeenCalled();
        expect(upsertCatalogOverride).toHaveBeenCalledWith(203, { pos_visible: false });
    });

    it('updateOnlineOrderStatus deducts inventory when online order transitions to completed', async () => {
        const transaction = {
            finished: false,
            LOCK: { UPDATE: 'UPDATE' },
            commit: jest.fn(async () => { transaction.finished = true; }),
            rollback: jest.fn(async () => { transaction.finished = true; })
        };
        const fakeSequelize = {
            transaction: jest.fn().mockResolvedValue(transaction)
        };

        const existingOrder = {
            pos_transaction_id: 55,
            invoice_number: 'INV-000055',
            tracking_pin: 'SK-AB12CD',
            order_source: 'online_store',
            order_method: 'pickup',
            fulfillment_status: 'ready_for_pickup',
            lines: [
                { line_id: 9, item_id: 101, quantity: 2 }
            ]
        };
        const updatedOrder = {
            ...existingOrder,
            fulfillment_status: 'completed'
        };

        const posRepository = {
            getOrderByIdForLifecycle: jest
                .fn()
                .mockResolvedValueOnce(existingOrder)
                .mockResolvedValueOnce(updatedOrder),
            updateOrderById: jest.fn().mockResolvedValue(updatedOrder)
        };
        const stockMovementService = {
            createStockMovement: jest.fn().mockResolvedValue({ movement_id: 1 })
        };

        const useCase = buildUpdateOnlineOrderStatusUseCase({
            posRepository,
            stockMovementService
        });

        const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
            posTransactionId: 55,
            payload: { fulfillment_status: 'completed' },
            user: { user_id: 7 }
        }));

        expect(result.success).toBe(true);
        expect(stockMovementService.createStockMovement).toHaveBeenCalledWith(
            expect.objectContaining({
                item_id: 101,
                quantity: 2,
                movement_type: 'goods_issue',
                reference_type: 'POS',
                reference_id: 'ONLINE:55:9'
            }),
            7,
            transaction
        );
        expect(posRepository.updateOrderById).toHaveBeenCalledWith(
            55,
            { fulfillment_status: 'completed', cashier_id: 7 },
            expect.objectContaining({ transaction, lock: true })
        );
    });

    it('updateOnlineOrderStatus does not re-apply stock movement for already completed orders', async () => {
        const transaction = {
            finished: false,
            LOCK: { UPDATE: 'UPDATE' },
            commit: jest.fn(async () => { transaction.finished = true; }),
            rollback: jest.fn(async () => { transaction.finished = true; })
        };
        const fakeSequelize = {
            transaction: jest.fn().mockResolvedValue(transaction)
        };

        const completedOrder = {
            pos_transaction_id: 56,
            order_source: 'online_store',
            order_method: 'delivery',
            fulfillment_status: 'completed',
            lines: [{ line_id: 10, item_id: 102, quantity: 1 }]
        };

        const posRepository = {
            getOrderByIdForLifecycle: jest
                .fn()
                .mockResolvedValueOnce(completedOrder)
                .mockResolvedValueOnce(completedOrder),
            updateOrderById: jest.fn().mockResolvedValue(completedOrder)
        };
        const stockMovementService = {
            createStockMovement: jest.fn()
        };

        const useCase = buildUpdateOnlineOrderStatusUseCase({
            posRepository,
            stockMovementService
        });

        const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
            posTransactionId: 56,
            payload: { fulfillment_status: 'completed' },
            user: { user_id: 8 }
        }));

        expect(result.success).toBe(true);
        expect(stockMovementService.createStockMovement).not.toHaveBeenCalled();
    });
});
