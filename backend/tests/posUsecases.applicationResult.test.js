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
    buildUpdateBulkPosCatalogOverridesUseCase,
    buildUploadPosCatalogImageUseCase,
    buildUploadBulkPosCatalogImagesUseCase,
    buildUpdateOnlineOrderStatusUseCase,
    buildOpenTerminalShiftUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { buildPosReadiness } from '../src/modules/shared/utils/catalogSetupPolicy.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

const PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D
]);
const JPEG_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);

const writeTempUpload = async ({ prefix, bytes = PNG_BYTES }) => {
    const tempPath = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fs.writeFile(tempPath, bytes);
    return tempPath;
};

const pathExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const createBulkPosRepository = ({ items = [], existing = null, readiness = null, updateError = null } = {}) => ({
    findItemsBySkuCodes: jest.fn().mockResolvedValue(items),
    findCatalogOverrideByItemId: jest.fn().mockResolvedValue(existing),
    getCatalogReadinessByItemId: jest.fn().mockResolvedValue(readiness || {
        pos_readiness: {
            ready: true,
            checks: { has_sale_price: true },
            missing_requirements: []
        }
    }),
    updateCatalogImage: updateError
        ? jest.fn().mockRejectedValue(updateError)
        : jest.fn().mockResolvedValue({ item_id: 1, pos_image_url: '/uploads/image.png' })
});

const editableUser = { is_master_admin: false, permissions: ['items:edit'] };
const posOperator = { user_id: 15, is_active: true, permissions: ['pos:view', 'pos:transact'] };

const runWithTenantComplianceContext = (callback) => dbStore.run({
    tenantId: 'tenant-1',
    tenantComplianceId: 'tenant-1',
    tenantComplianceModeState: 'non_compliant_active',
    tenantCompliancePolicyVersion: 'test'
}, callback);

const createShiftOpenRepository = ({ registryEntry = { terminal_id: 'COUNTER-01', location_id: 3 } } = {}) => ({
    getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue({
        mode: 'warn',
        binding_enforced: false,
        active_registry: registryEntry ? [registryEntry] : []
    }),
    findOperationReplayByKey: jest.fn().mockResolvedValue(null),
    createOperationReplay: jest.fn().mockResolvedValue(null),
    findOpenTerminalShift: jest.fn().mockResolvedValue(null),
    createTerminalShift: jest.fn().mockResolvedValue({
        pos_terminal_shift_id: 101,
        terminal_id: 'COUNTER-01',
        location_id: 3,
        cashier_id: 15,
        opening_float_amount: 500,
        status: 'open'
    }),
    getTerminalShiftById: jest.fn().mockResolvedValue({
        pos_terminal_shift_id: 101,
        terminal_id: 'COUNTER-01',
        location_id: 3,
        cashier_id: 15,
        opening_float_amount: 500,
        status: 'open'
    })
});

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

    it('opens a shift from an active logical terminal without a pairing cookie', async () => {
        const posRepository = createShiftOpenRepository();
        const resolveIdentityStatus = jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 });
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 3 });
        const useCase = buildOpenTerminalShiftUseCase({
            posRepository,
            resolveIdentityStatus,
            resolveLocationScope
        });

        const result = await runWithTenantComplianceContext(() => useCase({
            payload: {
                terminal_id: 'COUNTER-01',
                location_id: 3,
                opening_float_amount: 500
            },
            user: posOperator
        }));

        expect(result.success).toBe(true);
        expect(resolveIdentityStatus).toHaveBeenCalledWith({ tenantId: 'tenant-1', user: posOperator });
        expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({
            requestedLocationId: 3,
            userId: 15,
            operationLabel: 'POS shift open'
        }));
        expect(posRepository.createTerminalShift).toHaveBeenCalledWith(expect.objectContaining({
            terminal_id: 'COUNTER-01',
            location_id: 3,
            cashier_id: 15,
            status: 'open'
        }));
    });

    it('blocks shift open for inactive or unknown logical terminals', async () => {
        const useCase = buildOpenTerminalShiftUseCase({
            posRepository: createShiftOpenRepository({ registryEntry: null }),
            resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership' }),
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 3 })
        });

        const result = await runWithTenantComplianceContext(() => useCase({
            payload: {
                terminal_id: 'COUNTER-01',
                location_id: 3,
                opening_float_amount: 500
            },
            user: posOperator
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details.terminal_identity_policy.reason_code).toBe('TERMINAL_REGISTRY_REQUIRED');
    });

    it('blocks shift open when the terminal has no location or the operator lacks the location grant', async () => {
        const missingLocationUseCase = buildOpenTerminalShiftUseCase({
            posRepository: createShiftOpenRepository({ registryEntry: { terminal_id: 'COUNTER-01', location_id: null } }),
            resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership' }),
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: null })
        });

        const missingLocationResult = await runWithTenantComplianceContext(() => missingLocationUseCase({
            payload: {
                terminal_id: 'COUNTER-01',
                location_id: 3,
                opening_float_amount: 500
            },
            user: posOperator
        }));

        expect(missingLocationResult.success).toBe(false);
        expect(missingLocationResult.error.statusCode).toBe(422);

        const deniedLocationUseCase = buildOpenTerminalShiftUseCase({
            posRepository: createShiftOpenRepository(),
            resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership' }),
            resolveLocationScope: jest.fn().mockRejectedValue(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Location access denied',
                { statusCode: 403, details: { reason_code: 'LOCATION_SCOPE_DENIED' } }
            ))
        });

        const deniedLocationResult = await runWithTenantComplianceContext(() => deniedLocationUseCase({
            payload: {
                terminal_id: 'COUNTER-01',
                location_id: 3,
                opening_float_amount: 500
            },
            user: posOperator
        }));

        expect(deniedLocationResult.success).toBe(false);
        expect(deniedLocationResult.error.statusCode).toBe(403);
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

    it('buildPosReadiness blocks stock-bearing out-of-stock rows with STOCK_UNAVAILABLE', () => {
        const readiness = buildPosReadiness({
            item: {
                item_id: 301,
                category: 'product',
                product_type: 'finished_goods',
                status: 'active',
                default_sale_price: 120,
                current_stock: 0
            },
            override: { pos_visible: true }
        });

        expect(readiness.ready).toBe(false);
        expect(readiness.missing_requirements).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'STOCK_UNAVAILABLE' })
        ]));
    });

    it('buildPosReadiness keeps service rows stock-exempt when otherwise ready', () => {
        const readiness = buildPosReadiness({
            item: {
                item_id: 302,
                category: 'service',
                mode_item_preset: 'service',
                status: 'active',
                default_sale_price: 500,
                current_stock: 0
            },
            override: { pos_visible: true }
        });

        expect(readiness.ready).toBe(true);
        expect(readiness.missing_requirements).toEqual([]);
    });

    it('updateBulkPosCatalogOverrides returns mixed updated and blocked results', async () => {
        const upsertCatalogOverride = jest.fn().mockResolvedValue({ item_id: 401, pos_visible: true });
        const getCatalogReadinessByItemId = jest.fn()
            .mockResolvedValueOnce({
                item_id: 401,
                pos_readiness: { ready: true, missing_requirements: [] }
            })
            .mockResolvedValueOnce({
                item_id: 402,
                pos_readiness: {
                    ready: false,
                    missing_requirements: [{ code: 'STOCK_UNAVAILABLE', label: 'Add available stock' }]
                }
            })
            .mockResolvedValueOnce(null);
        const useCase = buildUpdateBulkPosCatalogOverridesUseCase({
            posRepository: { getCatalogReadinessByItemId, upsertCatalogOverride }
        });

        const result = await useCase({
            payload: { item_ids: [401, 402, 999], pos_visible: true },
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toEqual({
            updated: 1,
            blocked: 1,
            not_found: 1,
            failed: 0
        });
        expect(result.data.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ item_id: 401, status: 'updated' }),
            expect.objectContaining({ item_id: 402, status: 'blocked' }),
            expect.objectContaining({ item_id: 999, status: 'not_found' })
        ]));
        expect(upsertCatalogOverride).toHaveBeenCalledTimes(1);
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

    it('uploadBulkPosCatalogImages returns per-file unmatched and duplicate filename statuses', async () => {
        const firstDuplicate = path.join(os.tmpdir(), `bulk-pos-dup-a-${Date.now()}.png`);
        const secondDuplicate = path.join(os.tmpdir(), `bulk-pos-dup-b-${Date.now()}.png`);
        const unmatched = path.join(os.tmpdir(), `bulk-pos-unmatched-${Date.now()}.png`);
        await Promise.all([firstDuplicate, secondDuplicate, unmatched].map((filePath) => fs.writeFile(filePath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]))));
        const useCase = buildUploadBulkPosCatalogImagesUseCase({
            posRepository: {
                findItemsBySkuCodes: jest.fn().mockResolvedValue([]),
                findCatalogOverrideByItemId: jest.fn(),
                getCatalogReadinessByItemId: jest.fn(),
                updateCatalogImage: jest.fn()
            },
            imageStorage: {
                store: jest.fn(),
                remove: jest.fn()
            }
        });

        const result = await useCase({
            files: [
                { path: firstDuplicate, mimetype: 'image/png', originalname: 'DUP-001.png', size: 12 },
                { path: secondDuplicate, mimetype: 'image/png', originalname: 'DUP-001.jpg', size: 12 },
                { path: unmatched, mimetype: 'image/png', originalname: 'NO-SKU.png', size: 12 }
            ],
            user: { is_master_admin: false, permissions: ['items:edit'] }
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toMatchObject({
            duplicate_filename: 2,
            unmatched: 1,
            uploaded: 0
        });
        expect(result.data.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ filename: 'DUP-001.png', status: 'duplicate_filename' }),
            expect.objectContaining({ filename: 'DUP-001.jpg', status: 'duplicate_filename' }),
            expect.objectContaining({ filename: 'NO-SKU.png', status: 'unmatched' })
        ]));
    });

    it('uploadBulkPosCatalogImages rejects unsupported MIME per file and removes temp upload', async () => {
        const tempPath = await writeTempUpload({
            prefix: 'bulk-pos-unsupported',
            bytes: Buffer.from('not an image', 'utf8')
        });
        const store = jest.fn();
        const useCase = buildUploadBulkPosCatalogImagesUseCase({
            posRepository: createBulkPosRepository({
                items: [{ item_id: 701, sku_code: 'POS-701', default_sale_price: 100 }]
            }),
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'text/plain', originalname: 'POS-701.txt', size: 12 }],
            user: editableUser
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.data.results).toEqual([
            expect.objectContaining({ filename: 'POS-701.txt', item_id: 701, status: 'failed' })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadBulkPosCatalogImages rejects MIME/signature mismatch per file and removes temp upload', async () => {
        const tempPath = await writeTempUpload({ prefix: 'bulk-pos-mismatch', bytes: JPEG_BYTES });
        const store = jest.fn();
        const useCase = buildUploadBulkPosCatalogImagesUseCase({
            posRepository: createBulkPosRepository({
                items: [{ item_id: 702, sku_code: 'POS-702', default_sale_price: 100 }]
            }),
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'POS-702.png', size: JPEG_BYTES.length }],
            user: editableUser
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.data.results).toEqual([
            expect.objectContaining({ filename: 'POS-702.png', item_id: 702, status: 'failed' })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadBulkPosCatalogImages rejects oversize images per file and removes temp upload', async () => {
        const tempPath = await writeTempUpload({ prefix: 'bulk-pos-oversize' });
        const store = jest.fn();
        const useCase = buildUploadBulkPosCatalogImagesUseCase({
            posRepository: createBulkPosRepository({
                items: [{ item_id: 703, sku_code: 'POS-703', default_sale_price: 100 }]
            }),
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'POS-703.png', size: 10 * 1024 * 1024 + 1 }],
            user: editableUser
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.data.results).toEqual([
            expect.objectContaining({ filename: 'POS-703.png', item_id: 703, status: 'failed' })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadBulkPosCatalogImages uploads valid files while rejecting invalid batch peers', async () => {
        const validTempPath = await writeTempUpload({ prefix: 'bulk-pos-valid' });
        const invalidTempPath = await writeTempUpload({
            prefix: 'bulk-pos-invalid-peer',
            bytes: Buffer.from('not an image', 'utf8')
        });
        const store = jest.fn().mockResolvedValue({
            path: 'pos-catalog/tenant/pos-704.png',
            url: '/uploads/pos-catalog/tenant/pos-704.png'
        });
        const useCase = buildUploadBulkPosCatalogImagesUseCase({
            posRepository: createBulkPosRepository({
                items: [
                    { item_id: 704, sku_code: 'POS-704', default_sale_price: 100 },
                    { item_id: 705, sku_code: 'POS-705', default_sale_price: 100 }
                ]
            }),
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [
                { path: validTempPath, mimetype: 'image/png', originalname: 'POS-704.png', size: PNG_BYTES.length },
                { path: invalidTempPath, mimetype: 'text/plain', originalname: 'POS-705.txt', size: 12 }
            ],
            user: editableUser
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toMatchObject({ uploaded: 1, failed: 1 });
        expect(result.data.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ filename: 'POS-704.png', item_id: 704, status: 'uploaded' }),
            expect.objectContaining({ filename: 'POS-705.txt', item_id: 705, status: 'failed' })
        ]));
        expect(store).toHaveBeenCalledTimes(1);
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 704,
            tempPath: validTempPath
        }));
        expect(await pathExists(invalidTempPath)).toBe(false);
        await fs.rm(validTempPath, { force: true });
    });

    it('uploadBulkPosCatalogImages removes newly stored files and temp uploads after write failure', async () => {
        const tempPath = await writeTempUpload({ prefix: 'bulk-pos-write-failure' });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUploadBulkPosCatalogImagesUseCase({
            posRepository: createBulkPosRepository({
                items: [{ item_id: 706, sku_code: 'POS-706', default_sale_price: 100 }],
                updateError: new Error('catalog write failed')
            }),
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'pos-catalog/tenant/pos-706.png',
                    url: '/uploads/pos-catalog/tenant/pos-706.png'
                }),
                remove
            }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'POS-706.png', size: PNG_BYTES.length }],
            user: editableUser
        });

        expect(result.success).toBe(true);
        expect(result.data.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.data.results).toEqual([
            expect.objectContaining({
                filename: 'POS-706.png',
                item_id: 706,
                status: 'failed',
                errors: ['catalog write failed']
            })
        ]);
        expect(remove).toHaveBeenCalledWith({ path: 'pos-catalog/tenant/pos-706.png' });
        expect(await pathExists(tempPath)).toBe(false);
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
            fulfillment_status: 'completed',
            storeCustomer: {
                customer_id: 44,
                dgfy_account_id: 'acct-44',
                email: 'customer@example.com',
                phone: '09123456789'
            }
        };

        const posRepository = {
            findOpenTerminalShift: jest.fn().mockResolvedValue({
                shift_id: 10,
                cashier_id: 7,
                location_id: 3,
                status: 'open'
            }),
            getOrderByIdForLifecycle: jest
                .fn()
                .mockResolvedValueOnce(existingOrder)
                .mockResolvedValueOnce(updatedOrder),
            updateOrderById: jest.fn().mockResolvedValue(updatedOrder)
        };
        const inventoryCommandService = {
            issueStockForOnlineFulfillment: jest.fn().mockResolvedValue({ movement_id: 1 })
        };
        const activityRecorder = jest.fn().mockResolvedValue({ activity_id: 90 });

        const useCase = buildUpdateOnlineOrderStatusUseCase({
            posRepository,
            inventoryCommandService,
            activityRecorder
        });

        const result = await dbStore.run({ sequelize: fakeSequelize, tenantId: 'tenant-activity' }, () => useCase({
            posTransactionId: 55,
            payload: { fulfillment_status: 'completed' },
            user: { user_id: 7 }
        }));

        expect(result.success).toBe(true);
        expect(inventoryCommandService.issueStockForOnlineFulfillment).toHaveBeenCalledTimes(1);
        expect(inventoryCommandService.issueStockForOnlineFulfillment).toHaveBeenCalledWith(
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
        expect(activityRecorder).toHaveBeenCalledWith({
            tenantId: 'tenant-activity',
            order: updatedOrder,
            storeCustomer: updatedOrder.storeCustomer
        });
        expect(posRepository.updateOrderById).toHaveBeenCalledWith(
            55,
            { fulfillment_status: 'completed', cashier_id: 7 },
            expect.objectContaining({ transaction, lock: true })
        );
    });

    it('updateOnlineOrderStatus consumes F&B recipe ingredients for online menu items', async () => {
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
            pos_transaction_id: 56,
            invoice_number: 'INV-000056',
            tracking_pin: 'SK-FNB123',
            order_source: 'online_store',
            order_method: 'pickup',
            fulfillment_status: 'ready_for_pickup',
            location_id: 4,
            lines: [{
                line_id: 10,
                item_id: 201,
                quantity: 2,
                item: {
                    item_id: 201,
                    category: 'product',
                    name: 'Burger',
                    unit_of_measure: 'serving'
                }
            }]
        };
        const updatedOrder = {
            ...existingOrder,
            fulfillment_status: 'completed'
        };

        const posRepository = {
            findOpenTerminalShift: jest.fn().mockResolvedValue({
                shift_id: 11,
                cashier_id: 7,
                location_id: 4,
                status: 'open'
            }),
            getOrderByIdForLifecycle: jest
                .fn()
                .mockResolvedValueOnce(existingOrder)
                .mockResolvedValueOnce(updatedOrder),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                product_id: 201,
                ingredient_id: 301,
                quantity_required: 0.25,
                unit_of_measure: 'kg',
                ingredient: {
                    item_id: 301,
                    name: 'Ground beef',
                    current_stock: 5,
                    unit_of_measure: 'kg',
                    category: 'raw_material'
                }
            }]),
            updateOrderById: jest.fn().mockResolvedValue(updatedOrder)
        };
        const inventoryCommandService = {
            issueStockForOnlineFulfillment: jest.fn().mockResolvedValue({ movement_id: 2 })
        };

        const useCase = buildUpdateOnlineOrderStatusUseCase({
            posRepository,
            inventoryCommandService
        });

        const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
            posTransactionId: 56,
            payload: { fulfillment_status: 'completed' },
            user: { user_id: 7 }
        }));

        expect(result.success).toBe(true);
        expect(posRepository.listProductCompositionsForItems).toHaveBeenCalledWith([201], expect.objectContaining({
            transaction,
            lock: true,
            locationId: 4
        }));
        expect(inventoryCommandService.issueStockForOnlineFulfillment).toHaveBeenCalledTimes(1);
        expect(inventoryCommandService.issueStockForOnlineFulfillment).toHaveBeenCalledWith(
            expect.objectContaining({
                item_id: 301,
                quantity: 0.5,
                movement_type: 'goods_issue',
                location_id: 4,
                reference_type: 'POS',
                reference_id: 'ONLINE:56:10:ING:301'
            }),
            7,
            transaction
        );
    });

    it.each([
        ['preparing', 'out_for_delivery'],
        ['out_for_delivery', 'completed']
    ])('updateOnlineOrderStatus commits delivery lifecycle hop %s -> %s', async (currentStatus, targetStatus) => {
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
            pos_transaction_id: 57,
            invoice_number: 'INV-000057',
            tracking_pin: 'SK-DELIV1',
            order_source: 'online_store',
            order_method: 'delivery',
            fulfillment_status: currentStatus,
            location_id: 5,
            lines: []
        };
        const updatedOrder = {
            ...existingOrder,
            fulfillment_status: targetStatus
        };
        const posRepository = {
            findOpenTerminalShift: jest.fn().mockResolvedValue({
                shift_id: 13,
                cashier_id: 9,
                location_id: 5,
                status: 'open'
            }),
            getOrderByIdForLifecycle: jest
                .fn()
                .mockResolvedValueOnce(existingOrder)
                .mockResolvedValueOnce(updatedOrder),
            updateOrderById: jest.fn().mockResolvedValue(updatedOrder)
        };
        const useCase = buildUpdateOnlineOrderStatusUseCase({ posRepository });

        const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
            posTransactionId: 57,
            payload: { fulfillment_status: targetStatus },
            user: { user_id: 9 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.order.fulfillment_status).toBe(targetStatus);
        expect(posRepository.updateOrderById).toHaveBeenCalledWith(
            57,
            { fulfillment_status: targetStatus, cashier_id: 9 },
            expect.objectContaining({ transaction, lock: true })
        );
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
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
            findOpenTerminalShift: jest.fn().mockResolvedValue({
                shift_id: 12,
                cashier_id: 8,
                status: 'open'
            }),
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
