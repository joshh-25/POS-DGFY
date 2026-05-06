import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    buildListPosTransactionsUseCase,
    buildGetPosTransactionByIdUseCase,
    buildGetDailyZReadingUseCase,
    buildListPosCatalogUseCase,
    buildScanPosBarcodeUseCase,
    buildListPosCatalogOverridesUseCase,
    buildUpdatePosCatalogOverrideUseCase,
    buildUploadPosCatalogImageUseCase,
    buildUpdateOnlineOrderStatusUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
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

    it('scanPosBarcode resolves a package barcode into a suggested POS line after eligibility passes', async () => {
        const resolveCatalogScan = jest.fn().mockResolvedValue({
            status: 'resolved',
            barcode: {
                item_barcode_id: 44,
                code: 'CASE-6',
                normalized_code: 'CASE-6',
                scope: 'package',
                packaging_level: 'case',
                quantity_multiplier: 6
            },
            item: {
                item_id: 10,
                name: 'Bottled Juice',
                category: 'product',
                status: 'active',
                pos_visible: true,
                current_stock: 24,
                default_sale_price: 35,
                pos_readiness: { missing_requirements: [] }
            }
        });
        const useCase = buildScanPosBarcodeUseCase({
            posRepository: { resolveCatalogScan },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 3 })
        });

        const result = await dbStore.run({
            tenantId: 'barcode-pos-test',
            tenantComplianceModeState: 'non_compliant_active',
            tenantComplianceModeChoiceRequired: false,
            tenantComplianceProfile: {}
        }, () => useCase({
            payload: { code: 'case-6', location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('resolved');
        expect(result.data.suggested_line).toEqual(expect.objectContaining({
            item_id: 10,
            quantity: 6,
            source: 'barcode_scan'
        }));
        expect(result.data.suggested_line.scan_metadata).toEqual(expect.objectContaining({
            barcode_id: 44,
            code: 'CASE-6',
            quantity_multiplier: 6,
            location_id: 3
        }));
    });

    it('scanPosBarcode keeps service rows stock-exempt while still requiring POS eligibility', async () => {
        const useCase = buildScanPosBarcodeUseCase({
            posRepository: {
                resolveCatalogScan: jest.fn().mockResolvedValue({
                    status: 'resolved',
                    barcode: {
                        item_barcode_id: 50,
                        code: 'SVC-HAIRCUT',
                        normalized_code: 'SVC-HAIRCUT',
                        scope: 'service',
                        packaging_level: 'service',
                        quantity_multiplier: 1
                    },
                    item: {
                        item_id: 20,
                        name: 'Haircut',
                        category: 'service',
                        status: 'active',
                        pos_visible: true,
                        current_stock: 0,
                        default_sale_price: 150,
                        serviceDetail: { visible_in_pos: true },
                        pos_readiness: { missing_requirements: [] }
                    }
                })
            },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 8 })
        });

        const result = await dbStore.run({
            tenantId: 'barcode-pos-service-test',
            tenantComplianceModeState: 'non_compliant_active',
            tenantComplianceModeChoiceRequired: false,
            tenantComplianceProfile: {}
        }, () => useCase({
            payload: { code: 'svc-haircut', location_id: 8 },
            user: { user_id: 16 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('resolved');
        expect(result.data.suggested_line.item_id).toBe(20);
    });

    it('scanPosBarcode returns an explicit unauthorized-location blocked reason', async () => {
        const resolveCatalogScan = jest.fn();
        const useCase = buildScanPosBarcodeUseCase({
            posRepository: { resolveCatalogScan },
            resolveLocationScope: jest.fn().mockRejectedValue(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'User is not allowed to operate this location.',
                {
                    statusCode: 403,
                    details: { reason_code: 'POS_LOCATION_ACCESS_DENIED' }
                }
            ))
        });

        const result = await useCase({
            payload: { code: '012345678905', location_id: 99 },
            user: { user_id: 17 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'blocked',
            reason_code: 'UNAUTHORIZED_LOCATION'
        }));
        expect(resolveCatalogScan).not.toHaveBeenCalled();
    });

    it('scanPosBarcode blocks barcodes that are not scoped for POS', async () => {
        const useCase = buildScanPosBarcodeUseCase({
            posRepository: {
                resolveCatalogScan: jest.fn().mockResolvedValue({
                    status: 'blocked',
                    reason_code: 'BARCODE_SCOPE_NOT_POS'
                })
            },
            resolveLocationScope: jest.fn().mockResolvedValue({
                location_id: 1,
                location: { location_id: 1 }
            })
        });

        const result = await dbStore.run({
            tenantId: 'barcode-pos-scope-test',
            tenantComplianceModeState: 'non_compliant_active',
            tenantComplianceModeChoiceRequired: false,
            tenantComplianceProfile: {}
        }, () => useCase({
            payload: { code: 'INV-ONLY', location_id: 1 },
            user: { user_id: 18, tenantId: 'barcode-pos-scope-test' }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'blocked',
            reason_code: 'BARCODE_SCOPE_NOT_POS'
        }));
    });

    it('scanPosBarcode routes service booking ticket scans outside POS cart entry', async () => {
        const resolveCatalogScan = jest.fn();
        const resolveLocationScope = jest.fn();
        const useCase = buildScanPosBarcodeUseCase({
            posRepository: { resolveCatalogScan },
            resolveLocationScope
        });

        const result = await useCase({
            payload: {
                code: JSON.stringify({ type: 'service_booking', reference: 'SB-456' }),
                location_id: 1
            },
            user: { user_id: 19 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'routed',
            kind: 'service_booking',
            reason_code: 'SERVICE_BOOKING_SCAN_ROUTED',
            booking_reference: 'SB-456'
        }));
        expect(result.data).not.toHaveProperty('suggested_line');
        expect(resolveLocationScope).not.toHaveBeenCalled();
        expect(resolveCatalogScan).not.toHaveBeenCalled();
    });

    it('scanPosBarcode gives ticket-scope barcodes a non-cartable ticket reason', async () => {
        const useCase = buildScanPosBarcodeUseCase({
            posRepository: {
                resolveCatalogScan: jest.fn().mockResolvedValue({
                    status: 'blocked',
                    reason_code: 'BARCODE_SCOPE_NOT_POS',
                    blocked_scopes: ['ticket']
                })
            },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 1 })
        });

        const result = await dbStore.run({
            tenantId: 'barcode-pos-ticket-scope-test',
            tenantComplianceModeState: 'non_compliant_active',
            tenantComplianceModeChoiceRequired: false,
            tenantComplianceProfile: {}
        }, () => useCase({
            payload: { code: 'TICKET-ONLY', location_id: 1 },
            user: { user_id: 20 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'blocked',
            reason_code: 'TICKET_SCAN_NOT_CARTABLE'
        }));
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
                    checks: { pos_visible: true, has_sale_price: false },
                    missing_requirements: [{ code: 'SALE_PRICE_MISSING', label: 'Set a sale price' }]
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
                    { code: 'SALE_PRICE_MISSING', label: 'Set a sale price' }
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

    it('uploadPosCatalogImage preserves an existing hidden POS visibility flag', async () => {
        const tempPath = path.join(os.tmpdir(), `pos-image-${Date.now()}.png`);
        await fs.writeFile(tempPath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]));

        const updateCatalogImage = jest.fn().mockResolvedValue({
            item_id: 204,
            pos_visible: false,
            pos_image_url: '/uploads/pos.png'
        });
        const useCase = buildUploadPosCatalogImageUseCase({
            posRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 204,
                    category: 'product',
                    product_type: 'finished_goods'
                }),
                findCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 204,
                    pos_visible: false,
                    pos_image_path: null
                }),
                updateCatalogImage
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({ path: 'uploads/pos.png', url: '/uploads/pos.png' }),
                remove: jest.fn()
            }
        });

        const result = await useCase({
            itemId: 204,
            file: {
                path: tempPath,
                mimetype: 'image/png',
                originalname: 'menu.png',
                size: 12
            },
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(result.success).toBe(true);
        expect(updateCatalogImage).toHaveBeenCalledWith(204, {
            path: 'uploads/pos.png',
            url: '/uploads/pos.png'
        }, {
            keepVisible: false
        });

        await fs.rm(tempPath, { force: true });
    });

    it('uploadPosCatalogImage removes a newly stored file when the catalog update fails', async () => {
        const tempPath = path.join(os.tmpdir(), `pos-image-fail-${Date.now()}.png`);
        await fs.writeFile(tempPath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]));

        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUploadPosCatalogImageUseCase({
            posRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 205,
                    category: 'product',
                    product_type: 'finished_goods'
                }),
                findCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 205,
                    pos_visible: true,
                    pos_image_path: 'pos-catalog/tenant/old.png'
                }),
                updateCatalogImage: jest.fn().mockRejectedValue(new Error('database unavailable'))
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'pos-catalog/tenant/new.png',
                    url: '/uploads/pos-catalog/tenant/new.png'
                }),
                remove
            }
        });

        const result = await useCase({
            itemId: 205,
            file: {
                path: tempPath,
                mimetype: 'image/png',
                originalname: 'menu.png',
                size: 12
            },
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(result.success).toBe(false);
        expect(remove).toHaveBeenCalledWith({ path: 'pos-catalog/tenant/new.png' });
        expect(remove).not.toHaveBeenCalledWith({ path: 'pos-catalog/tenant/old.png' });

        await fs.rm(tempPath, { force: true });
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
            location_id: 3,
            lines: [
                {
                    line_id: 8,
                    item_id: 100,
                    category: 'service',
                    quantity: 1,
                    item: { item_id: 100, name: 'Installation' }
                },
                {
                    line_id: 9,
                    item_id: 101,
                    quantity: 2,
                    item: { item_id: 101, category: 'product', name: 'Starter Kit' }
                }
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
        expect(stockMovementService.createStockMovement).toHaveBeenCalledTimes(1);
        expect(stockMovementService.createStockMovement).toHaveBeenCalledWith(
            expect.objectContaining({
                item_id: 101,
                quantity: 2,
                movement_type: 'goods_issue',
                location_id: 3,
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
