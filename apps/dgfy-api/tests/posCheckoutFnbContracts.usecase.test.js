import { jest } from '@jest/globals';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dbStore from '../src/utils/dbStore.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { hashFiscalEvidence } from '../src/modules/pos/domain/fiscalEvidenceContract.js';

const mockGetAllSettingsUseCase = jest.fn(async () => ({
    success: true,
    data: {
        fnb_restaurant_service_charge: {
            value: JSON.stringify({
                enabled: true,
                label: 'Restaurant service charge',
                rate: 10,
                taxable: true
            })
        }
    }
}));

const mockAssertComplianceOperationAllowed = jest.fn(async () => ({
    success: true,
    data: {
        decision: { allowed: true },
        receipt_contract: {
            document_type: 'non_fiscal_slip',
            label: 'NON-FISCAL SLIP',
            document_context: 'non_fiscal'
        }
    }
}));

const mockResolveMovementLocation = jest.fn(async ({ requestedLocationId }) => ({
    location_id: requestedLocationId || 3,
    name: 'Main'
}));
const mockResolveIdentityStatus = jest.fn(async () => ({
    identity_mode: 'dgfy_membership',
    membership_id: 44
}));

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: {
        POS_CHECKOUT: 'pos.checkout',
        POS_TERMINAL_OPERATION: 'pos.terminal.operation'
    }
}));

jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
    resolveMovementLocation: mockResolveMovementLocation
}));

jest.unstable_mockModule('../src/services/locationInventoryService.js', () => ({
    isMultiLocationInventoryEnabled: jest.fn(async () => true),
    listActiveLocations: jest.fn(async () => []),
    resolveDefaultActiveLocation: jest.fn(async () => ({ location_id: 3, name: 'Main' })),
    assertLocationAccess: jest.fn(async () => true),
    resolveMovementLocation: mockResolveMovementLocation,
    resolveTransferLocations: jest.fn(async ({ sourceLocationId, destinationLocationId }) => ({
        sourceLocation: { location_id: sourceLocationId || 3, name: 'Source' },
        destinationLocation: { location_id: destinationLocationId || 4, name: 'Destination' }
    }))
}));

let buildCheckoutPosUseCase;
let buildRecordFiscalPrintEventUseCase;
let buildVoidPosTransactionUseCase;
let buildGetPosTransactionByIdUseCase;
let buildGenerateESalesReportUseCase;
let buildListESalesReportsUseCase;
let buildVerifyFiscalEventLedgerUseCase;
let buildUpdateESalesReportStatusUseCase;
let buildUpsertFiscalTerminalRegistrationUseCase;

beforeAll(async () => {
    ({
        buildCheckoutPosUseCase,
        buildRecordFiscalPrintEventUseCase,
        buildVoidPosTransactionUseCase,
        buildGetPosTransactionByIdUseCase,
        buildGenerateESalesReportUseCase,
        buildListESalesReportsUseCase,
        buildVerifyFiscalEventLedgerUseCase,
        buildUpdateESalesReportStatusUseCase,
        buildUpsertFiscalTerminalRegistrationUseCase
    } = await import('../src/modules/pos/usecases/posUseCases.js'));
});

describe('POS historical parked-sale settlement', () => {
    const buildHistoricalRepository = ({ checkoutLine, parkedLine, item, inventoryDeductedAt = null }) => {
        let createdTransaction = null;
        const parkedSale = {
            pos_parked_sale_id: 2201,
            status: 'claimed',
            claimed_by: 12,
            claimed_terminal_id: 'TERM-01',
            shift_id: 901,
            location_id: 3,
            inventory_deducted_at: inventoryDeductedAt,
            snapshot: { lines: [parkedLine] }
        };
        return {
            parkedSale,
            createdTransaction: () => createdTransaction,
            repository: {
                getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
                findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
                getParkedSaleById: jest.fn().mockResolvedValue(parkedSale),
                findSellableItemsByIds: jest.fn().mockResolvedValue([]),
                findParkedSaleItemsByIds: jest.fn().mockResolvedValue(item ? [item] : []),
                listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
                findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
                getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift()),
                nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-PARKED-HISTORICAL-001'),
                getFnbTableById: jest.fn(),
                createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                    createdTransaction = { pos_transaction_id: 2201, ...header, lines };
                    return 2201;
                }),
                createFnbServiceChargeSnapshot: jest.fn(),
                settleFnbCheck: jest.fn(),
                createAuditLog: jest.fn().mockResolvedValue(null),
                incrementPersistentCounter: jest.fn().mockResolvedValue(1),
                getTransactionById: jest.fn(async () => createdTransaction)
            },
            checkoutLine,
            parkedLine
        };
    };

    it('charges the parked price and records a note-only settlement when the item is no longer sellable', async () => {
        const parkedLine = {
            line_key: 'parked-line-1',
            item_id: 71,
            item_name: 'Old Burger',
            sku_code: 'BURGER-OLD',
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            checkoutLine: {
                // Resume/draft hydration may rebuild the client line reference;
                // the saved item, price, quantity, and configuration still match.
                line_ref: 'rebuilt-line-ref-1',
                item_id: 71,
                quantity: 1,
                sale_price: 100,
                parked_snapshot_line: true
            },
            item: {
                item_id: 71,
                name: 'Burger (archived)',
                sku_code: 'BURGER-OLD',
                category: 'product',
                status: 'inactive',
                pos_visible: false,
                pos_location_available: false,
                current_stock: 0,
                cost_per_unit: 40,
                default_sale_price: 150,
                fifo_enabled: false,
                vat_type: 'vatable'
            }
        });
        const inventoryCommandService = { createStockMovement: jest.fn() };
        const completeClaimedPosParkedSaleUseCase = jest.fn().mockResolvedValue({ status: 'completed' });
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService,
            completeClaimedPosParkedSaleUseCase
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'parked-historical-settlement-1',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(true);
        expect(harness.repository.findSellableItemsByIds).toHaveBeenCalledWith([71], expect.any(Object));
        expect(harness.repository.findParkedSaleItemsByIds).toHaveBeenCalledWith([71], expect.any(Object));
        expect(harness.createdTransaction().lines[0]).toEqual(expect.objectContaining({
            item_id: 71,
            item_name: 'Old Burger',
            item_name_snapshot: 'Old Burger',
            sale_price: 100,
            stock_effect_type: 'stock_exempt',
            stock_exempt_reason: 'historical_parked_sale'
        }));
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
        expect(harness.repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_parked_sale_snapshot_settlement',
            changes: expect.objectContaining({
                parked_sale_id: 2201,
                policy: 'original_parked_snapshot_price'
            })
        }), expect.any(Object));
        expect(completeClaimedPosParkedSaleUseCase).toHaveBeenCalledWith(expect.objectContaining({
            parkedSaleId: 2201,
            transactionId: 2201
        }));
    });

    it('rejects a changed line that tries to claim the historical-price marker', async () => {
        const parkedLine = {
            line_key: 'parked-line-2',
            item_id: 72,
            item_name: 'Coffee',
            quantity: 1,
            sale_price: 100,
            line_modifiers: []
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            checkoutLine: {
                line_ref: 'parked-line-2',
                item_id: 72,
                quantity: 2,
                sale_price: 100,
                parked_snapshot_line: true
            },
            item: {
                item_id: 72,
                name: 'Coffee',
                category: 'product',
                current_stock: 10,
                default_sale_price: 150,
                fifo_enabled: false,
                vat_type: 'vatable'
            }
        });
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService: { createStockMovement: jest.fn() },
            completeClaimedPosParkedSaleUseCase: jest.fn()
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'parked-historical-marker-tamper',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('PARKED_SALE_SNAPSHOT_LINE_MISMATCH');
        expect(harness.repository.findSellableItemsByIds).toHaveBeenCalledWith([72], expect.any(Object));
    });

    it('settles from the parked snapshot when the catalog row is physically missing and the marker is omitted', async () => {
        const parkedLine = {
            line_key: 'parked-line-missing',
            item_id: 73,
            item_name: 'Discontinued Combo',
            quantity: 1,
            base_sale_price: 125,
            sale_price: 125,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            checkoutLine: {
                // Legacy/stale clients may omit the marker after resuming a
                // parked sale. The matching snapshot line is still payable.
                line_ref: 'rebuilt-line-ref-missing',
                item_id: 73,
                quantity: 1,
                sale_price: 125
            },
            item: null
        });
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService: { createStockMovement: jest.fn() },
            completeClaimedPosParkedSaleUseCase: jest.fn().mockResolvedValue({ status: 'completed' })
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'parked-historical-missing-row',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(true);
        expect(harness.createdTransaction().lines[0]).toEqual(expect.objectContaining({
            item_id: 73,
            item_name: 'Discontinued Combo',
            sale_price: 125,
            stock_effect_type: 'stock_exempt',
            stock_exempt_reason: 'historical_parked_sale'
        }));
    });

    it('rejects an added line when the original parked item is physically missing', async () => {
        const parkedLine = {
            line_key: 'parked-line-missing-addition',
            item_id: 731,
            item_name: 'Discontinued Combo',
            quantity: 1,
            base_sale_price: 125,
            sale_price: 125,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            checkoutLine: {
                line_ref: 'parked-line-missing-addition',
                item_id: 731,
                quantity: 1,
                sale_price: 125,
                parked_snapshot_line: true
            },
            item: null
        });
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService: { createStockMovement: jest.fn() },
            completeClaimedPosParkedSaleUseCase: jest.fn()
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'parked-missing-added-line',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [
                    harness.checkoutLine,
                    {
                        line_ref: 'new-missing-item-line',
                        item_id: 731,
                        quantity: 1,
                        sale_price: 125
                    }
                ]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'PARKED_SALE_ADDED_LINE_UNAVAILABLE'
        }));
    });

    it('issues only the added quantity when an unchanged-price parked line increases quantity', async () => {
        const parkedLine = {
            line_key: 'parked-line-added-quantity',
            item_id: 74,
            item_name: 'Coffee',
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            inventoryDeductedAt: new Date(),
            checkoutLine: {
                line_ref: 'parked-line-added-quantity',
                item_id: 74,
                quantity: 2,
                sale_price: 100,
                parked_snapshot_line: true
            },
            item: {
                item_id: 74,
                name: 'Coffee',
                category: 'product',
                status: 'active',
                pos_visible: true,
                pos_location_available: true,
                current_stock: 1,
                default_sale_price: 100,
                fifo_enabled: false,
                vat_type: 'vatable'
            }
        });
        const inventoryCommandService = {
            validateStockIssueAvailability: jest.fn(),
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 991 })
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService,
            completeClaimedPosParkedSaleUseCase: jest.fn().mockResolvedValue({ status: 'completed' })
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'parked-added-quantity-1',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(true);
        expect(harness.createdTransaction().lines[0]).toEqual(expect.objectContaining({
            quantity: 2,
            sale_price: 100,
            inventory_preissued: true
        }));
        expect(inventoryCommandService.issueStockForPosSale).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 74,
            quantity: 1,
            movement_type: 'goods_issue',
            location_id: 3
        }), 12, expect.any(Object));
    });

    it('allows checkout after a reasoned parked-line deletion and reconciles reserved stock', async () => {
        const parkedLine = {
            line_key: 'parked-line-deleted',
            item_id: 75,
            item_name: 'Old Coffee',
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const replacementItem = {
            item_id: 76,
            name: 'New Coffee',
            category: 'product',
            status: 'active',
            pos_visible: true,
            pos_location_available: true,
            current_stock: 5,
            default_sale_price: 150,
            fifo_enabled: false,
            vat_type: 'vatable'
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            inventoryDeductedAt: new Date(),
            checkoutLine: {
                line_ref: 'new-line-76',
                item_id: 76,
                quantity: 1,
                sale_price: 150
            },
            item: replacementItem
        });
        harness.repository.findSellableItemsByIds.mockResolvedValue([replacementItem]);
        const inventoryCommandService = {
            reverseParkedSaleGoodsIssue: jest.fn().mockResolvedValue([{ item_id: 75 }]),
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 992 })
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService,
            completeClaimedPosParkedSaleUseCase: jest.fn().mockResolvedValue({ status: 'completed' })
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'parked-deletion-checkout-1',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                removed_line_reasons: [{
                    line_ref: 'parked-line-deleted',
                    item_id: 75,
                    reason: 'Customer removed item'
                }],
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(true);
        expect(inventoryCommandService.reverseParkedSaleGoodsIssue).toHaveBeenCalledWith({
            parked_sale_id: 2201,
            reason: 'Parked-sale line deletion reconciliation for parked sale 2201'
        }, 12, expect.any(Object));
        expect(inventoryCommandService.issueStockForPosSale).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 76,
            quantity: 1,
            movement_type: 'goods_issue'
        }), 12, expect.any(Object));
    });

    it('does not reverse parked inventory twice during a re-park reconciliation', async () => {
        const parkedLine = {
            line_key: 'parked-line-repark-deleted',
            item_id: 79,
            item_name: 'Deleted Coffee',
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const replacementItem = {
            item_id: 80,
            name: 'Replacement Coffee',
            category: 'product',
            status: 'active',
            pos_visible: true,
            pos_location_available: true,
            current_stock: 5,
            default_sale_price: 150,
            fifo_enabled: false,
            vat_type: 'vatable'
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            inventoryDeductedAt: new Date(),
            checkoutLine: {
                line_ref: 'replacement-line-80',
                item_id: 80,
                quantity: 1,
                sale_price: 150
            },
            item: replacementItem
        });
        harness.repository.findSellableItemsByIds.mockResolvedValue([replacementItem]);
        const inventoryCommandService = {
            validateStockIssueAvailability: jest.fn(),
            reverseParkedSaleGoodsIssue: jest.fn().mockResolvedValue([{ item_id: 79 }]),
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 993 })
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService,
            completeClaimedPosParkedSaleUseCase: jest.fn()
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            inventoryEffectsOnly: true,
            validateInventoryAvailability: true,
            payload: {
                idempotency_key: 'parked-repark-reconcile-1',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                parked_sale_inventory_reconciled: true,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                removed_line_reasons: [{
                    line_ref: 'parked-line-repark-deleted',
                    item_id: 79,
                    reason: 'Customer removed item'
                }],
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(true);
        expect(inventoryCommandService.reverseParkedSaleGoodsIssue).not.toHaveBeenCalled();
        expect(result.data.inventory_effects).toEqual([
            expect.objectContaining({ item_id: 80, quantity: 1, location_id: 3 })
        ]);
    });

    it('re-issues a retained available original line after the old revision is reversed', async () => {
        const parkedLine = {
            line_key: 'parked-line-repark-retained',
            item_id: 81,
            item_name: 'Retained Coffee',
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            vat_type: 'vatable',
            line_modifiers: []
        };
        const currentItem = {
            item_id: 81,
            name: 'Retained Coffee',
            category: 'product',
            status: 'active',
            pos_visible: true,
            pos_location_available: true,
            current_stock: 10,
            default_sale_price: 100,
            fifo_enabled: false,
            vat_type: 'vatable'
        };
        const harness = buildHistoricalRepository({
            parkedLine,
            inventoryDeductedAt: new Date(),
            checkoutLine: {
                line_ref: 'parked-line-repark-retained',
                item_id: 81,
                quantity: 1,
                sale_price: 100,
                parked_snapshot_line: true
            },
            item: currentItem
        });
        const inventoryCommandService = {
            validateStockIssueAvailability: jest.fn(),
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 994 })
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository: harness.repository,
            inventoryCommandService,
            completeClaimedPosParkedSaleUseCase: jest.fn()
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            inventoryEffectsOnly: true,
            validateInventoryAvailability: true,
            payload: {
                idempotency_key: 'parked-repark-retained-1',
                terminal_id: 'TERM-01',
                location_id: 3,
                shift_id: 901,
                parked_sale_id: 2201,
                parked_sale_inventory_reconciled: true,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [harness.checkoutLine]
            }
        }));

        expect(result.success).toBe(true);
        expect(result.data.inventory_effects).toEqual([
            expect.objectContaining({ item_id: 81, quantity: 1, location_id: 3 })
        ]);
    });
});

const buildCheckoutContractUseCase = (dependencies) => buildCheckoutPosUseCase({
    ...dependencies,
    resolveIdentityStatus: mockResolveIdentityStatus
});

const createTransaction = () => {
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => {
            transaction.finished = true;
        }),
        rollback: jest.fn(async () => {
            transaction.finished = true;
        })
    };
    return transaction;
};

const runInTenantContext = async (callback) => {
    const transaction = createTransaction();
    const sequelize = {
        transaction: jest.fn().mockResolvedValue(transaction)
    };
    return dbStore.run({
        tenantId: 'tenant-fnb-checkout-contract',
        tenantComplianceModeState: 'non_compliant_active',
        tenantComplianceModeChoiceRequired: false,
        tenantComplianceProfile: {},
        sequelize
    }, async () => callback({ sequelize, transaction }));
};

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const approvedVoidExecution = (transactionId, approvedBy) => ({
    action_type: 'pos_void',
    status: 'approved',
    entity_id: transactionId,
    approval_request_id: 5000 + transactionId,
    requested_by: approvedBy === 12 ? 99 : 12,
    approved_by: approvedBy
});

const createOpenShift = ({
    shiftId = 901,
    cashierId = 12,
    terminalId = 'TERM-01',
    locationId = 3
} = {}) => ({
    pos_terminal_shift_id: shiftId,
    cashier_id: cashierId,
    terminal_id: terminalId,
    location_id: locationId,
    status: 'open',
    opened_at: '2026-06-17T08:00:00.000Z',
    business_date: '2026-06-17',
    opening_float_amount: 100
});

const activeTerminalRegistry = [{
    terminal_id: 'TERM-01',
    label: 'Term 01',
    is_active: true,
    location_id: 3
}];

const terminalIdentityPolicy = () => ({
    mode: 'warn',
    active_registry: activeTerminalRegistry
});

const buildFnbGuardRepository = ({ check, lines, includeCheckoutDependencies = false }) => {
    let createdTransaction = null;
    const repository = {
        getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createTransactionWithLines: jest.fn(),
        getFnbCheckForCheckout: jest.fn().mockResolvedValue({
            check,
            lines: (Array.isArray(lines) ? lines : []).filter((line) => line?.status !== 'voided')
        }),
        bindFnbCheckLocation: jest.fn().mockResolvedValue(check),
        ...(includeCheckoutDependencies ? {
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Burger',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 10,
                cost_per_unit: 30,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: false
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-FNB-GUARD-001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines: transactionLines }) => {
                createdTransaction = { pos_transaction_id: 901, ...header, lines: transactionLines };
                return 901;
            }),
            createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
            createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue({ kitchen_ticket: { kitchen_ticket_id: 901 } }),
            settleFnbCheck: jest.fn().mockResolvedValue({ check_id: check.check_id, status: 'paid' }),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        } : {})
    };
    return {
        repository,
        inventoryCommandService: { createStockMovement: jest.fn().mockResolvedValue({ movement_id: 901 }) },
        getCreatedTransaction: () => createdTransaction
    };
};

describe('POS checkout F&B contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('sells a direct always-available item at zero stock without creating inventory movement', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Always Available Meal',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 0,
                cost_per_unit: 40,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: true
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-ALWAYS-001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 501, ...header, lines };
                return 501;
            }),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'always-available-zero-stock',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [{ item_id: 1, quantity: 2 }]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.lines).toEqual([
            expect.objectContaining({ item_id: 1, quantity: 2 })
        ]);
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('charges only the Employee Credit portion of a mixed split checkout', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Mixed Tender Meal',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 10,
                cost_per_unit: 20,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: true
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-EMPLOYEE-CREDIT-SPLIT-001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 503, ...header, lines };
                return 503;
            }),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const employeeCreditService = {
            prepareDebit: jest.fn().mockResolvedValue({
                accountId: 44,
                userId: null,
                employeeId: 44,
                employeeName: 'Employee 44',
                amount: 60,
                outstandingAfter: 60,
                authorizationReference: 'EC-AUTH-503',
                maskedAccountCode: 'EC-**44'
            }),
            finalizeDebit: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() },
            employeeCreditService
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'mixed-employee-credit-checkout',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'employee_credit',
                payment_handoff_mode: 'internal',
                payment_session_reference: 'PAY-MIXED-503',
                employee_credit: { account_code: 'EC-44' },
                payment_breakdown: [
                    { payment_type: 'employee_credit', count: 1, amount: 60 },
                    { payment_type: 'cash', count: 1, amount: 40 }
                ],
                cash_received: 40,
                change_amount: 0,
                order_method: 'pickup',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        }));

        expect(result.success).toBe(true);
        expect(employeeCreditService.prepareDebit).toHaveBeenCalledWith(expect.objectContaining({
            accountCode: 'EC-44',
            amount: 60
        }));
        expect(employeeCreditService.finalizeDebit).toHaveBeenCalledWith(expect.objectContaining({
            prepared: expect.objectContaining({ amount: 60 }),
            posTransactionId: 503
        }));
        expect(createdTransaction.payment_type).toBe('employee_credit');
        expect(createdTransaction.employee_credit_amount).toBe(60);
        expect(createdTransaction.cash_received).toBe(40);
        expect(createdTransaction.change_amount).toBe(0);
    });

    it.each([
        ['direct PIN approval', false],
        ['trusted split-payment approval', true]
    ])('blocks a cashier from self-approving a manual item discount through %s', async (_label, trusted) => {
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Coffee',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 10,
                cost_per_unit: 20,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: true
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift({ cashierId: 12 })),
            getTerminalShiftById: jest.fn(),
            findActiveDiscountRuleByType: jest.fn().mockResolvedValue({ id: 7, type: 'manual', is_active: true }),
            findActiveDiscountApproverById: jest.fn().mockResolvedValue({
                user_id: 12,
                username: 'Cashier Approver',
                role: 'manager',
                is_active: true,
                can_authorize_discounts: true,
                pos_approval_pin_hash: await bcrypt.hash('1234', 4)
            })
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });
        const payload = {
            idempotency_key: `manual-item-self-approval-${trusted ? 'trusted' : 'pin'}`,
            terminal_id: 'TERM-01',
            location_id: 3,
            document_context: 'non_fiscal',
            payment_type: 'cash',
            order_method: 'pickup',
            lines: [{
                item_id: 1,
                quantity: 1,
                item_discount: {
                    discount_type: 'manual',
                    method: 'percentage',
                    rate: 15,
                    approver_user_id: 12
                },
                ...(trusted ? {} : {
                    item_discount_approval: { approver_user_id: 12, manager_pin: '1234' }
                })
            }]
        };
        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload,
            trustedItemDiscountApprovals: trusted ? [{
                item_id: 1,
                discount_type: 'manual',
                approver_user_id: 12,
                approved_at: '2026-08-25T12:00:00.000Z',
                operator_user_id: 12
            }] : null
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('DISCOUNT_SELF_APPROVAL_BLOCKED');
    });

    it('persists an approved item-only discount and keeps global discount separate', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Coffee',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 10,
                cost_per_unit: 20,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: true
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            findActiveDiscountRuleByType: jest.fn().mockResolvedValue({ id: 7, type: 'manual', is_active: true }),
            findActiveDiscountEmployeeById: jest.fn().mockResolvedValue({
                employee_id: 44,
                employee_code: 'EMP-044',
                full_name: 'Staff Customer',
                email: 'staff.customer@example.test'
            }),
            findActiveDiscountApproverById: jest.fn().mockResolvedValue({
                user_id: 99,
                username: 'Manager',
                role: 'manager',
                is_active: true,
                can_authorize_discounts: true,
                pos_approval_pin_hash: await bcrypt.hash('1234', 4)
            }),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-ITEM-DISCOUNT-001'),
            createAuditLog: jest.fn().mockResolvedValue(null),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 502, ...header, lines };
                return 502;
            }),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'coffee-item-discount',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                discount_amount: 23.5,
                item_discount_amount: 15,
                discount_mode: 'amount',
                discount_approval: {
                    discount_type: 'employee',
                    approver_user_id: 99,
                    employee_directory_id: 44,
                    manager_pin: '1234'
                },
                governed_discount: {
                    type: 'employee',
                    label: 'Employee Discount',
                    method: 'percentage',
                    rate: 10,
                    employee_directory_id: 44,
                    employee_name: 'Staff Customer'
                },
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    item_discount: { method: 'percentage', rate: 15 },
                    item_discount_approval: { approver_user_id: 99, manager_pin: '1234' }
                }]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.discount_amount).toBe(23.5);
        expect(createdTransaction.lines[0].line_subtotal).toBe(76.5);
        expect(createdTransaction.lines[0].item_discount_snapshot).toEqual(expect.objectContaining({
            discount_amount: 15,
            rate: 15,
            approver_user_id: 99
        }));
    });

    it('keeps the global order note separate from the item note snapshot', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Always Available Meal',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 0,
                cost_per_unit: 40,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: true
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-NOTES-001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 502, ...header, lines };
                return 502;
            }),
            createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue({ kitchen_order_id: 71 }),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-global-and-item-notes',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_table_label_snapshot: 'T-04',
                special_instructions: 'Less ice for the table',
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    course: 'main',
                    special_instructions: 'No onions on this item'
                }]
            }
        }));

        expect(result.success).toBe(true);
        expect(JSON.parse(createdTransaction.special_instructions)).toEqual(expect.objectContaining({
            note: 'Less ice for the table'
        }));
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            fnb_special_instructions: 'No onions on this item'
        }));
    });

    it('persists fiscal buyer fields and a server-owned fiscal document snapshot for fiscal invoices', async () => {
        mockGetAllSettingsUseCase.mockResolvedValueOnce({
            success: true,
            data: {
                pos_registered_name: { value: 'DGFY Retail Corp.' },
                pos_business_name: { value: 'DGFY Store' },
                pos_business_style: { value: 'Retail' },
                pos_taxpayer_type: { value: 'VAT' },
                pos_tin_branch: { value: '123-456-789-00000' },
                pos_address: { value: 'Makati City' },
                pos_ptu_number: { value: 'PTU-2026-001' },
                pos_min_number: { value: 'MIN-001' },
                pos_accreditation_number: { value: 'ACC-001' },
                pos_software_name: { value: 'SKU Inventory Manager' },
                pos_software_version: { value: '2026.06' },
                pos_software_serial_number: { value: 'SKU-SN-001' }
            }
        });
        mockAssertComplianceOperationAllowed.mockResolvedValueOnce({
            success: true,
            data: {
                decision: {
                    allowed: true,
                    receipt_contract: {
                        document_type: 'fiscal_invoice',
                        label: 'FISCAL INVOICE',
                        document_context: 'fiscal'
                    }
                }
            }
        });
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Taxable Item',
                sku_code: 'SKU-TAXABLE-1',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 5,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable'
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            getVerifiedFiscalTerminalRegistration: jest.fn().mockResolvedValue({
                pos_fiscal_terminal_registration_id: 44,
                terminal_id: 'TERM-01',
                min_number: 'MIN-001',
                machine_serial_number: 'MSN-001',
                ptu_number: 'PTU-2026-001',
                receipt_printer_binding: 'PRN-01',
                cash_drawer_binding: 'CD-01'
            }),
            createFiscalEvent: jest.fn().mockResolvedValue({ event_hash: 'fiscal-event-hash' }),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = {
                    pos_transaction_id: 177,
                    ...header,
                    lines
                };
                return 177;
            }),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = {
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 1 })
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fiscal-checkout-rmo-snapshot',
                terminal_id: 'term-01',
                location_id: 3,
                document_context: 'fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                buyer_name: 'Acme Buyer Inc.',
                buyer_tin: '987-654-321-00000',
                buyer_business_style: 'Wholesale',
                buyer_address: 'Quezon City',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        }));

        expect(result).toMatchObject({ success: true });
        expect(createdTransaction).toEqual(expect.objectContaining({
            document_type: 'fiscal_invoice',
            document_context: 'fiscal',
            buyer_tin: '987-654-321-00000',
            buyer_business_style: 'Wholesale',
            buyer_address: 'Quezon City',
            fiscal_document_template_version: 'rmo-24-2023-prep-v1',
            fiscal_document_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
        }));
        expect(createdTransaction.fiscal_document_snapshot).toEqual(expect.objectContaining({
            template_version: 'rmo-24-2023-prep-v1',
            document: expect.objectContaining({
                invoice_number: 'INV-000001',
                document_type: 'fiscal_invoice',
                document_context: 'fiscal'
            }),
            seller: expect.objectContaining({
                registered_name: 'DGFY Retail Corp.',
                tin_branch: '123-456-789-00000',
                ptu_number: 'PTU-2026-001',
                min_number: 'MIN-001',
                software_name: 'SKU Inventory Manager'
            }),
            buyer: expect.objectContaining({
                name: 'Acme Buyer Inc.',
                tin: '987-654-321-00000',
                business_style: 'Wholesale',
                address: 'Quezon City'
            }),
            totals: expect.objectContaining({
                total_amount: 100,
                payment_type: 'cash'
            }),
            lines: [expect.objectContaining({
                item_name: 'Taxable Item',
                quantity: 1,
                vat_type: 'vatable'
            })]
        }));
        expect(posRepository.createFiscalEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'checkout_issued',
            invoice_number: 'INV-000001',
            terminal_id: 'TERM-01'
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(inventoryCommandService.issueStockForPosSale).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 1,
            quantity: 1,
            movement_type: 'goods_issue',
            location_id: 3,
            reference_type: 'POS',
            reference_id: '177'
        }), 12, expect.any(Object));
        // Mode-switch hardening (issue #178 phase 5): the item's name and SKU
        // are snapshotted on the line at sale time, independent of the live
        // item row, so a later rename/delete can never retro-change this
        // historical transaction.
        expect(createdTransaction.lines).toEqual([expect.objectContaining({
            item_id: 1,
            item_name_snapshot: 'Taxable Item',
            sku_snapshot: 'SKU-TAXABLE-1'
        })]);
    });

    it('returns the persisted receipt contract on idempotent replay instead of inferring from invoice prefix or current policy', async () => {
        mockAssertComplianceOperationAllowed.mockResolvedValueOnce({
            success: true,
            data: {
                decision: {
                    allowed: true,
                    receipt_contract: {
                        document_type: 'fiscal_invoice',
                        label: 'FISCAL INVOICE',
                        document_context: 'fiscal'
                    }
                }
            }
        });
        const existingTransaction = {
            pos_transaction_id: 188,
            invoice_number: 'INV-LEGACY-NON-FISCAL',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal',
            idempotency_key: 'replay-explicit-contract',
            request_hash: hashPayload({
                terminal_id: 'TERM-01',
                location_id: 3,
                operator_session_id: null,
                order_method: 'pickup',
                payment_type: 'cash',
                service_fee_amount: null,
                fnb_check_id: null,
                fnb_table_id: null,
                fnb_table_label_snapshot: null,
                fnb_guest_count: null,
                fnb_server_id: null,
                restaurant_service_charge: {
                    enabled: false,
                    amount: null,
                    label: 'Restaurant service charge',
                    rate: 0,
                    taxable: false,
                    source: 'settings'
                },
                discount_profile_name: null,
                discount_rate: null,
                discount_amount: 0,
                customer_name: null,
                customer_email: null,
                customer_phone: null,
                buyer_name: null,
                buyer_tin: null,
                buyer_business_style: null,
                buyer_address: null,
                special_instructions: null,
                discount_beneficiary: null,
                governed_discount: null,
                lines: [{
                    sequence: 0,
                    line_ref: null,
                    item_id: 1,
                    quantity: 1,
                    sale_price: null,
                    price_override_reason: null,
                    course: null,
                    line_modifiers: [],
                    special_instructions: null,
                    kitchen_station_id: null,
                    scan_metadata: null
                }]
            }),
            status: 'completed',
            lines: []
        };
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            getVerifiedFiscalTerminalRegistration: jest.fn().mockResolvedValue({
                pos_fiscal_terminal_registration_id: 44,
                terminal_id: 'TERM-01',
                min_number: 'MIN-001',
                machine_serial_number: 'MSN-001',
                ptu_number: 'PTU-2026-001'
            }),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(existingTransaction)
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'replay-explicit-contract',
                terminal_id: 'term-01',
                location_id: 3,
                document_context: 'fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        }));

        expect(result.success).toBe(true);
        expect(result.data.idempotent_replay).toBe(true);
        expect(result.data.receipt_contract).toEqual({
            version: '2026.04.08',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal',
            label: 'NON-FISCAL SLIP'
        });
        expect(result.data.transaction).toEqual(expect.objectContaining({
            invoice_number: 'INV-LEGACY-NON-FISCAL',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal'
        }));
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('blocks checkout when the cashier has no open shift', async () => {
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findOpenTerminalShift: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Shift Blocked Item',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 5,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable'
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            createTransactionWithLines: jest.fn()
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'checkout-without-open-shift',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.message).toBe('You cannot use the POS because the shift is closed.');
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_SHIFT_CLOSED'
        }));
        expect(posRepository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('validates modifiers from configured groups, taxes taxable restaurant service charge, and deducts recipe ingredients', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Burger',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 0,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable',
                fnbModifierGroups: [{
                    modifier_group_id: 7,
                    name: 'Cheese',
                    display_name: 'Cheese',
                    min_select: 1,
                    max_select: 1,
                    required: true,
                    FnbItemModifierGroup: { is_required_override: null },
                    options: [{
                        modifier_option_id: 9,
                        name: 'Cheddar',
                        price_delta: 20,
                        sku_item_id: 6,
                        is_active: true,
                        allergen_notes: ['milk']
                    }]
                }]
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                product_id: 1,
                ingredient_id: 5,
                quantity_required: 200,
                unit_of_measure: 'g',
                ingredient: {
                    item_id: 5,
                    name: 'Ground beef',
                    current_stock: 10,
                    unit_of_measure: 'kg',
                    category: 'raw_material'
                }
            }]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = {
                    pos_transaction_id: 77,
                    ...header,
                    lines
                };
                return 77;
            }),
            createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
            createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue({ kitchen_ticket: { kitchen_ticket_id: 90 } }),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn().mockResolvedValue({ movement_id: 1 })
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-checkout-contract-1',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_guest_count: 2,
                lines: [{
                    item_id: 1,
                    quantity: 2,
                    course: 'main',
                    line_modifiers: [{
                        modifier_group_id: 7,
                        modifier_option_id: 9
                    }]
                }]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.subtotal_amount).toBe(240);
        expect(createdTransaction.service_fee_amount).toBe(0);
        expect(createdTransaction.restaurant_service_charge_amount).toBe(24);
        expect(createdTransaction.restaurant_service_charge_taxable).toBe(true);
        expect(createdTransaction.total_amount).toBe(264);
        expect(createdTransaction).toEqual(expect.objectContaining({
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal',
            buyer_tin: null,
            buyer_business_style: null,
            buyer_address: null,
            fiscal_document_template_version: null,
            fiscal_document_hash: null,
            fiscal_document_snapshot: null
        }));
        expect(createdTransaction.vatable_sales).toBe(235.7143);
        expect(createdTransaction.vat_amount).toBe(28.2857);
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            sale_price: 120,
            line_subtotal: 240,
            fnb_modifiers_snapshot: [{
                modifier_group_id: 7,
                modifier_option_id: 9,
                group_name: 'Cheese',
                group_kind: 'modifier',
                parent_modifier_option_id: null,
                option_name: 'Cheddar',
                price_delta: 20,
                quantity: 1,
                extended_price_delta: 20,
                sku_item_id: 6,
                location_id: 3,
                allergen_notes: ['milk']
            }]
        }));
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledTimes(2);
        expect(posRepository.listProductCompositionsForItems).toHaveBeenCalledWith([1], expect.objectContaining({
            transaction: expect.any(Object),
            lock: true,
            locationId: 3
        }));
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 5,
            quantity: 0.4,
            movement_type: 'goods_issue',
            location_id: 3,
            reference_type: 'POS',
            reference_id: '77'
        }), 12, expect.any(Object));
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 6,
            quantity: 2,
            movement_type: 'goods_issue',
            location_id: 3,
            reference_type: 'POS',
            reference_id: '77'
        }), 12, expect.any(Object));
        expect(posRepository.createFnbKitchenOrderForTransaction).toHaveBeenCalledWith(expect.objectContaining({
            pos_transaction_id: 77,
            order_method: 'dine_in',
            guest_count: 2,
            lines: [expect.objectContaining({
                item_id: 1,
                fnb_course_snapshot: 'main',
                fnb_modifiers_snapshot: [expect.objectContaining({ modifier_option_id: 9 })]
            })],
            recipe_movements: [expect.objectContaining({
                product_item_id: 1,
                ingredient_item_id: 5,
                quantity: 0.4,
                location_id: 3
            })]
        }), expect.objectContaining({ transaction: expect.any(Object) }));
    });

    it('fails F&B recipe checkout before commit when selected location lacks ingredient stock', async () => {
        let transactionRef = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Burger',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 0,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable',
                fnbModifierGroups: []
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                product_id: 1,
                ingredient_id: 5,
                quantity_required: 0.2,
                ingredient: {
                    item_id: 5,
                    name: 'Ground beef',
                    current_stock: 0,
                    category: 'raw_material'
                }
            }]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn(),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn(),
            getTransactionById: jest.fn()
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(({ transaction }) => {
            transactionRef = transaction;
            return useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: {
                    idempotency_key: 'fnb-checkout-contract-location-insufficient',
                    terminal_id: 'TERM-01',
                    location_id: 3,
                    document_context: 'non_fiscal',
                    payment_type: 'cash',
                    order_method: 'dine_in',
                    lines: [{
                        item_id: 1,
                        quantity: 2,
                        course: 'main'
                    }]
                }
            });
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.message).toContain('Insufficient ingredient stock');
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'FNB_RECIPE_INGREDIENT_SHORTFALL',
            product_item_id: 1,
            ingredient_item_id: 5,
            requested: 0.4,
            location_id: 3
        }));
        expect(posRepository.listProductCompositionsForItems).toHaveBeenCalledWith([1], expect.objectContaining({
            locationId: 3
        }));
        expect(posRepository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
        expect(transactionRef.rollback).toHaveBeenCalledTimes(1);
        expect(transactionRef.commit).not.toHaveBeenCalled();
    });

    it('rejects F&B POS recipes when recipe and ingredient UOMs are incompatible', async () => {
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Burger',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 0,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable',
                fnbModifierGroups: []
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                product_id: 1,
                ingredient_id: 5,
                quantity_required: 1,
                unit_of_measure: 'serving',
                ingredient: {
                    item_id: 5,
                    name: 'Ground beef',
                    current_stock: 10,
                    unit_of_measure: 'kg',
                    category: 'raw_material'
                }
            }]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn(),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn(),
            getTransactionById: jest.fn()
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-checkout-contract-uom-incompatible',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    course: 'main'
                }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'FNB_RECIPE_UOM_INCOMPATIBLE',
            product_item_id: 1,
            ingredient_item_id: 5,
            recipe_uom: 'serving',
            ingredient_uom: 'kg'
        }));
        expect(posRepository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('keeps pure service POS lines stock-exempt while physical add-on lines deduct at the checkout location', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([
                {
                    item_id: 10,
                    name: 'Consultation',
                    category: 'service',
                    unit_of_measure: 'session',
                    current_stock: 0,
                    cost_per_unit: 0,
                    default_sale_price: 500,
                    vat_type: 'vatable'
                },
                {
                    item_id: 11,
                    name: 'Aftercare Kit',
                    category: 'product',
                    unit_of_measure: 'kit',
                    current_stock: 5,
                    cost_per_unit: 100,
                    default_sale_price: 180,
                    vat_type: 'vatable'
                }
            ]),
            listProductCompositionsForItems: jest.fn(),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000002'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = {
                    pos_transaction_id: 78,
                    ...header,
                    lines
                };
                return 78;
            }),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn().mockResolvedValue({ movement_id: 2 })
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'pos-service-plus-addon-contract',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [
                    { item_id: 10, quantity: 1 },
                    { item_id: 11, quantity: 2 }
                ]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.lines).toHaveLength(2);
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            item_id: 10,
            cost_snapshot: null
        }));
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledTimes(1);
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 11,
            quantity: 2,
            movement_type: 'goods_issue',
            location_id: 3,
            reference_type: 'POS',
            reference_id: '78'
        }), 12, expect.any(Object));
    });

    it('validates service add-on pricing and persists the selected option snapshot', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 10,
                name: 'Laundry Basket',
                category: 'service',
                unit_of_measure: 'service',
                current_stock: 0,
                cost_per_unit: 0,
                default_sale_price: 5000,
                vat_type: 'vatable'
            }]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-SERVICE-OPTION-001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 91, ...header, lines };
                return 91;
            }),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = { createStockMovement: jest.fn() };
        const calculateServiceQuoteUseCase = {
            calculateQuote: jest.fn().mockResolvedValue({
                success: true,
                data: {
                    quote: {
                        options_price_adjustment_centavos: 2000,
                        selected_options: [{
                            option_id: 301,
                            group_id: 30,
                            group_name: 'Laundry extras',
                            name: 'Additional detergent',
                            price_adjustment_centavos: 2000,
                            duration_adjustment_minutes: 0
                        }]
                    }
                }
            })
        };
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService,
            calculateServiceQuoteUseCase
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'pos-service-option-contract',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [{ item_id: 10, quantity: 1, sale_price: 5020, selected_option_ids: [301] }]
            }
        }));

        expect(result.success).toBe(true);
        expect(calculateServiceQuoteUseCase.calculateQuote).toHaveBeenCalledWith(expect.objectContaining({
            serviceItemId: 10,
            selectedOptionIds: [301],
            quantity: 1,
            transaction: expect.any(Object)
        }));
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            item_id: 10,
            sale_price: 5020,
            fnb_modifiers_snapshot: [expect.objectContaining({
                service_option_id: 301,
                option_name: 'Additional detergent',
                price_delta: 20
            })]
        }));
    });

    it('persists Always Available as an explicit POS-only stock exemption without inventory movement', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 12,
                name: 'Unlimited Admission',
                category: 'product',
                product_type: 'finished_goods',
                unit_of_measure: 'ticket',
                current_stock: 0,
                cost_per_unit: 20,
                default_sale_price: 250,
                vat_type: 'vatable',
                pos_always_available: true
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000004'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 80, ...header, lines };
                return 80;
            }),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = { createStockMovement: jest.fn() };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'pos-always-available-contract',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [{ item_id: 12, quantity: 2 }]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            item_id: 12,
            stock_effect_type: 'stock_exempt',
            stock_exempt_reason: 'pos_always_available',
            // Movement-exempt, but a real physical good's cost is still captured
            // for COGS — only a true service line gets a null cost_snapshot.
            cost_snapshot: 20
        }));
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('still deducts recipe ingredients for an untracked/always-available finished item (bug 2)', async () => {
        // The finished item's own stock effect is exempt (untracked), but the
        // real-world ingredients it's built from still get physically consumed -
        // the stock_exempt skip must not also suppress recipe movements.
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Special of the Day',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 0,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable',
                pos_always_available: true,
                fnbModifierGroups: []
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                product_id: 1,
                ingredient_id: 5,
                quantity_required: 200,
                unit_of_measure: 'g',
                ingredient: {
                    item_id: 5,
                    name: 'Ground beef',
                    current_stock: 10,
                    unit_of_measure: 'kg',
                    category: 'raw_material'
                }
            }]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000005'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = { pos_transaction_id: 81, ...header, lines };
                return 81;
            }),
            createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
            createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue({ kitchen_ticket: { kitchen_ticket_id: 92 } }),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn().mockResolvedValue({ movement_id: 2 })
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'untracked-recipe-checkout-contract',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: 1, quantity: 2, course: 'main' }]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            item_id: 1,
            stock_effect_type: 'stock_exempt',
            stock_exempt_reason: 'pos_always_available'
        }));
        // The finished item itself gets no movement, but the ingredient does.
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledTimes(1);
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 5,
            quantity: 0.4,
            movement_type: 'goods_issue',
            location_id: 3
        }), 12, expect.any(Object));
    });

    it('rejects a toggle-mode line when the operator has marked it unavailable', async () => {
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 30,
                name: 'Chef Special',
                category: 'product',
                unit_of_measure: 'serving',
                current_stock: 0,
                cost_per_unit: 30,
                default_sale_price: 150,
                vat_type: 'vatable',
                tracking_mode: 'toggle',
                tracking_toggle_available: false,
                fnbModifierGroups: []
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn(),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(),
            createFnbServiceChargeSnapshot: jest.fn(),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn(),
            getTransactionById: jest.fn()
        };
        const inventoryCommandService = { createStockMovement: jest.fn() };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'toggle-unavailable-checkout-contract',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: 30, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.message).toContain('unavailable');
        expect(posRepository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('does not validate or deduct accidental recipe compositions for pure service F&B lines', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 20,
                name: 'Table Reservation Fee',
                category: 'service',
                unit_of_measure: 'booking',
                current_stock: 0,
                cost_per_unit: 0,
                default_sale_price: 150,
                vat_type: 'vatable',
                fnbModifierGroups: []
            }]),
            listProductCompositionsForItems: jest.fn().mockRejectedValue(new Error('service compositions should not be queried')),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000003'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = {
                    pos_transaction_id: 79,
                    ...header,
                    lines
                };
                return 79;
            }),
            createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
            createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue({ kitchen_ticket: { kitchen_ticket_id: 91 } }),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-service-composition-ignore-contract',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_guest_count: 1,
                lines: [{
                    item_id: 20,
                    quantity: 1,
                    course: 'other'
                }]
            }
        }));

        expect(result.success).toBe(true);
        expect(posRepository.listProductCompositionsForItems).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            item_id: 20,
            cost_snapshot: null
        }));
        expect(posRepository.createFnbKitchenOrderForTransaction).toHaveBeenCalledTimes(1);
    });

    it('fails F&B POS checkout when kitchen order persistence is unavailable', async () => {
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Burger',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 10,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable',
                fnbModifierGroups: []
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
            findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000004'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn().mockResolvedValue(80),
            createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
            createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue(null),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn()
        };
        const inventoryCommandService = {
            createStockMovement: jest.fn()
        };
        const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-checkout-kitchen-unavailable',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_guest_count: 1,
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    course: 'main'
                }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE'
        }));
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('rejects a second checkout for an already-paid F&B check before creating a POS transaction', async () => {
        const { repository, inventoryCommandService } = buildFnbGuardRepository({
            check: { check_id: 700, status: 'paid', pos_transaction_id: 880 },
            lines: [{ check_line_id: 1, item_id: 1, quantity: 1, course: 'main' }]
        });
        const useCase = buildCheckoutContractUseCase({ posRepository: repository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-paid-check-retry',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                fnb_check_id: 700,
                lines: [{ item_id: 1, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'FNB_CHECK_ALREADY_SETTLED',
            pos_transaction_id: 880
        }));
        expect(repository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('rejects checkout when the persisted F&B check lines differ from the submitted cart', async () => {
        const { repository, inventoryCommandService } = buildFnbGuardRepository({
            check: { check_id: 701, status: 'open', pos_transaction_id: null },
            lines: [{ check_line_id: 1, item_id: 1, quantity: 2, course: 'main' }]
        });
        const useCase = buildCheckoutContractUseCase({ posRepository: repository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-changed-lines-retry',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                fnb_check_id: 701,
                lines: [{ item_id: 1, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'FNB_CHECK_LINES_CHANGED',
            check_id: 701
        }));
        expect(repository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('allows a newly opened empty check to take its initial POS cart lines', async () => {
        const { repository, inventoryCommandService, getCreatedTransaction } = buildFnbGuardRepository({
            check: { check_id: 705, status: 'open', pos_transaction_id: null, location_id: 3 },
            lines: [],
            includeCheckoutDependencies: true
        });
        const useCase = buildCheckoutContractUseCase({ posRepository: repository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-empty-check-initial-cart',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_check_id: 705,
                lines: [{ item_id: 1, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(true);
        expect(getCreatedTransaction().lines).toHaveLength(1);
        expect(repository.createFnbKitchenOrderForTransaction).toHaveBeenCalledWith(expect.objectContaining({
            check_id: 705,
            lines: [expect.objectContaining({ item_id: 1, quantity: 1 })]
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(repository.settleFnbCheck).toHaveBeenCalledWith(
            { checkId: 705, posTransactionId: 901 },
            expect.objectContaining({ transaction: expect.any(Object), lock: true })
        );
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledTimes(1);
    });

    it('settles the branch-bound check once and excludes voided lines from the sale and kitchen ticket', async () => {
        const { repository, inventoryCommandService, getCreatedTransaction } = buildFnbGuardRepository({
            check: { check_id: 702, status: 'sent_to_kitchen', pos_transaction_id: null, location_id: 3 },
            lines: [
                { check_line_id: 1, item_id: 1, quantity: 1, course: 'main', status: 'sent' },
                { check_line_id: 2, item_id: 1, quantity: 4, course: 'dessert', status: 'voided' }
            ],
            includeCheckoutDependencies: true
        });
        const useCase = buildCheckoutContractUseCase({ posRepository: repository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-voided-line-safe-checkout',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_check_id: 702,
                lines: [{ item_id: 1, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(true);
        expect(getCreatedTransaction().lines).toHaveLength(1);
        expect(repository.createFnbKitchenOrderForTransaction).toHaveBeenCalledWith(expect.objectContaining({
            check_id: 702,
            lines: [expect.objectContaining({ item_id: 1, quantity: 1 })]
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(repository.settleFnbCheck).toHaveBeenCalledTimes(1);
        expect(inventoryCommandService.createStockMovement).toHaveBeenCalledTimes(1);
    });

    it('rejects a check owned by another branch before checkout writes', async () => {
        const { repository, inventoryCommandService } = buildFnbGuardRepository({
            check: { check_id: 703, status: 'open', pos_transaction_id: null, location_id: 4 },
            lines: [{ check_line_id: 1, item_id: 1, quantity: 1, course: 'main' }]
        });
        repository.bindFnbCheckLocation.mockResolvedValue(false);
        const useCase = buildCheckoutContractUseCase({ posRepository: repository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-cross-branch-checkout',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                fnb_check_id: 703,
                lines: [{ item_id: 1, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('FNB_CHECK_LOCATION_MISMATCH');
        expect(repository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('does not allow a partially paid check to be collected as a new sale', async () => {
        const { repository, inventoryCommandService } = buildFnbGuardRepository({
            check: { check_id: 704, status: 'partially_paid', pos_transaction_id: null },
            lines: [{ check_line_id: 1, item_id: 1, quantity: 1, course: 'main' }]
        });
        const useCase = buildCheckoutContractUseCase({ posRepository: repository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-partial-payment-retry',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                fnb_check_id: 704,
                lines: [{ item_id: 1, quantity: 1, course: 'main' }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('FNB_PARTIAL_PAYMENT_REQUIRES_BALANCE_SETTLEMENT');
        expect(repository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
    });

    it('records original and reprint fiscal print events with chained fiscal events', async () => {
        const fiscalSnapshot = {
            template_version: 'fiscal-receipt-v1',
            source_timezone: 'Asia/Manila',
            issued_at: '2026-10-03T12:00:00.000Z',
            document: {
                invoice_number: 'INV-000001',
                document_type: 'fiscal_invoice',
                document_context: 'fiscal'
            },
            seller: {
                taxpayer_type: 'VAT_REGISTERED',
                software_name: 'DGFY POS'
            },
            terminal: { terminal_id: 'TERM-01' },
            buyer: { name: null },
            totals: {
                subtotal_amount: 100,
                vatable_sales: 89.29,
                vat_amount: 10.71,
                vat_exempt_sales: 0,
                zero_rated_sales: 0,
                discount_amount: 0,
                total_amount: 100,
                payment_type: 'cash'
            },
            payment_breakdown: [{ payment_type: 'cash', amount: 100 }],
            lines: [{ line_id: '1', item_id: 1, quantity: 1, line_total: 100 }]
        };
        const fiscalTransaction = {
            pos_transaction_id: 177,
            invoice_number: 'INV-000001',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal',
            status: 'completed',
            terminal_id: 'TERM-01',
            fiscal_document_hash: hashFiscalEvidence(fiscalSnapshot),
            fiscal_document_snapshot: fiscalSnapshot,
            fiscal_lifecycle_state: 'original',
            fiscal_reprint_count: 0
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(fiscalTransaction),
            countFiscalPrintEvents: jest.fn()
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(1),
            createFiscalPrintEvent: jest.fn(async (payload) => payload),
            createFiscalEvent: jest.fn(async (payload) => ({ ...payload, event_hash: `${payload.event_type}-hash` })),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...fiscalTransaction, ...payload }))
        };
        const useCase = buildRecordFiscalPrintEventUseCase({ posRepository });

        const first = await runInTenantContext(() => useCase({
            posTransactionId: 177,
            payload: {},
            user: { user_id: 12 }
        }));
        const second = await runInTenantContext(() => useCase({
            posTransactionId: 177,
            payload: { reason: 'Customer requested copy' },
            user: { user_id: 12 }
        }));

        expect(first.success).toBe(true);
        expect(first.data.print_type).toBe('original');
        expect(second.success).toBe(true);
        expect(second.data.print_type).toBe('reprint');
        expect(posRepository.createFiscalEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'print_reprint',
            invoice_number: 'INV-000001'
        }), expect.objectContaining({ transaction: expect.any(Object) }));
    });

    it('submits a void request to Back Office without changing transaction or stock before approval', async () => {
        const transactionRow = {
            pos_transaction_id: 176,
            invoice_number: 'INV-REQUEST-001',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const updateTransactionLifecycle = jest.fn();
        const createPosTransactionAdjustment = jest.fn();
        const createBusinessAdminApprovalRequest = jest.fn(async (payload) => ({
            business_admin_approval_request_id: 777,
            ...payload
        }));
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901 })),
            findPendingBusinessAdminApprovalRequest: jest.fn().mockResolvedValue(null),
            createBusinessAdminApprovalRequest,
            createAuditLog: jest.fn().mockResolvedValue(null),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{ movement_id: 1, item_id: 4, quantity: -1 }]),
            updateTransactionLifecycle,
            createPosTransactionAdjustment
        };
        const returnStockForVoidedSale = jest.fn();
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale }
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 176,
            payload: {
                reason: 'Duplicate sale entered by cashier',
                shift_id: 901,
                terminal_id: 'TERM-01'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            pending: true,
            approval_request: { status: 'pending', business_admin_approval_request_id: 777 }
        });
        expect(createBusinessAdminApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({
            action_type: 'pos_void',
            entity_type: 'pos_transaction',
            entity_id: 176,
            reason: 'Duplicate sale entered by cashier',
            payload: expect.objectContaining({ transaction_id: 176, requested_by: 12 })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
        expect(createPosTransactionAdjustment).not.toHaveBeenCalled();
        expect(returnStockForVoidedSale).not.toHaveBeenCalled();
        expect(posRepository.listStockMovementsForPosTransaction).not.toHaveBeenCalled();
    });

    it('voids a fiscal transaction through lifecycle state and fiscal event evidence after approval', async () => {
        const fiscalTransaction = {
            pos_transaction_id: 177,
            invoice_number: 'INV-000001',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal',
            status: 'completed',
            terminal_id: 'TERM-01',
            fiscal_document_hash: 'a'.repeat(64),
            fiscal_lifecycle_state: 'original'
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(fiscalTransaction),
            getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({
                shiftId: 901,
                terminalId: 'TERM-CURRENT',
                locationId: 9
            })),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{
                movement_id: 901,
                item_id: 1,
                quantity: -2,
                location_id: 3
            }]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            createFiscalEvent: jest.fn().mockResolvedValue({ event_hash: 'void-event-hash' }),
            createAuditLog: jest.fn().mockResolvedValue(null),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            createPosTransactionAdjustment: jest.fn(async (payload) => ({
                ...payload,
                adjustment_reference: payload.adjustment_reference
            })),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...fiscalTransaction, ...payload }))
        };
        const inventoryCommandService = {
            returnStockForVoidedSale: jest.fn().mockResolvedValue({ movement_id: 902 })
        };
        const useCase = buildVoidPosTransactionUseCase({ posRepository, inventoryCommandService });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 177,
            payload: {
                reason: 'Customer returned all items',
                shift_id: 901,
                terminal_id: 'TERM-CURRENT'
            },
            user: { user_id: 12 },
            approvalExecution: approvedVoidExecution(177, 12)
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction).toEqual(expect.objectContaining({
            status: 'voided',
            fiscal_lifecycle_state: 'voided',
            fiscal_void_event_hash: 'void-event-hash'
        }));
        expect(inventoryCommandService.returnStockForVoidedSale).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 1,
            quantity: 2,
            movement_type: 'return',
            location_id: 3,
            reference_type: 'POS',
            reference_id: '177'
        }), 12, expect.any(Object));
        expect(result.data.stock_reversals).toEqual([expect.objectContaining({
            original_movement_id: 901,
            reversal_movement_id: 902
        })]);
        expect(posRepository.createFiscalEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'void',
            invoice_number: 'INV-000001'
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(posRepository.createPosTransactionAdjustment).toHaveBeenCalledWith(expect.objectContaining({
            adjustment_reference: 'POS-VOID-177',
            adjustment_type: 'void',
            original_shift_id: null,
            actor_shift_id: 901,
            status: 'succeeded',
            reason: 'Customer returned all items'
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(posRepository.getTerminalShiftById).not.toHaveBeenCalled();
    });

    it('allows an administrator to void without a shift while preserving the original cashier shift attribution', async () => {
        const transactionRow = {
            pos_transaction_id: 178,
            invoice_number: 'INV-000002',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const createAuditLog = jest.fn().mockResolvedValue(null);
        const getTerminalShiftById = jest.fn();
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            getTerminalShiftById,
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            createAuditLog,
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            createPosTransactionAdjustment: jest.fn(async (payload) => ({
                ...payload,
                adjustment_reference: payload.adjustment_reference
            })),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...transactionRow, ...payload }))
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 178,
            payload: {
                reason: 'Admin correction after cashier close',
                terminal_id: 'TERM-01'
            },
            user: { user_id: 99, role: 'admin' },
            approvalExecution: approvedVoidExecution(178, 99)
        }));

        expect(result.success).toBe(true);
        expect(result.data.authorization_mode).toBe('back_office_approval');
        expect(result.data.transaction_shift_id).toBe(901);
        expect(getTerminalShiftById).not.toHaveBeenCalled();
        expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 99,
            shift_id: 901,
            changes: expect.objectContaining({
                transaction_shift_id: 901,
                actor_shift_id: null,
                original_cashier_id: 12,
                authorization_mode: 'back_office_approval',
                adjustment_reference: 'POS-VOID-178'
            })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(posRepository.createPosTransactionAdjustment).toHaveBeenCalledWith(expect.objectContaining({
            adjustment_reference: 'POS-VOID-178',
            original_cashier_id: 12,
            original_shift_id: 901,
            actor_user_id: 99,
            actor_shift_id: null,
            actor_terminal_id: 'TERM-01',
            actor_location_id: null,
            adjustment_type: 'void',
            status: 'succeeded',
            metadata: expect.objectContaining({
                evidence_scope: 'internal_void_only',
                payment_status_before_void: 'paid'
            })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
    });

    it('atomically records an automatic cash refund when the void has an owned open shift', async () => {
        const transactionRow = {
            pos_transaction_id: 17901,
            invoice_number: 'INV-AUTO-CASH-REFUND-001',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid',
            payment_breakdown: [{ payment_type: 'cash', amount: 125 }]
        };
        const cashRefundPosTransactionUseCase = jest.fn(async ({ transaction, payload }) => ({
            success: true,
            data: {
                transaction: { ...transactionRow, status: 'voided', payment_status: 'refunded' },
                adjustment: {
                    pos_transaction_adjustment_id: 9011,
                    adjustment_type: 'cash_refund',
                    status: 'succeeded',
                    amount: 125
                },
                cash_drawer_event: {
                    pos_cash_drawer_event_id: 9012,
                    event_type: 'cash_out',
                    amount: 125
                },
                financial_outcome: {
                    internal_void: 'succeeded',
                    refund_required: false,
                    refund_state: 'completed',
                    refund_method: 'cash',
                    tender_ownership: 'merchant_owned',
                    next_action: 'none',
                    reason_code: 'CASH_REFUND_COMPLETED',
                    refund_amount: 125,
                    currency: 'PHP'
                },
                payload
            }
        }));
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901, cashierId: 12 })),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...transactionRow, ...payload })),
            createPosTransactionAdjustment: jest.fn(async (payload) => ({
                ...payload,
                pos_transaction_adjustment_id: 9010
            })),
            createAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            cashRefundPosTransactionUseCase
        });

        const result = await runInTenantContext(({ transaction }) => useCase({
            posTransactionId: 17901,
            payload: {
                reason: 'Customer requested cash reversal',
                auto_refund: true,
                shift_id: 901,
                terminal_id: 'TERM-01',
                terminal_location_id: 3,
                idempotency_key: 'auto-cash-refund-17901'
            },
            user: {
                user_id: 12,
                role: 'cashier',
                permissions: ['pos:cash_drawer_adjust']
            },
            approvalExecution: approvedVoidExecution(17901, 12)
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            cash_refund: expect.objectContaining({ completed: true }),
            financial_outcome: expect.objectContaining({
                refund_state: 'completed',
                refund_required: false
            }),
            transaction: expect.objectContaining({ payment_status: 'refunded' })
        }));
        expect(cashRefundPosTransactionUseCase).toHaveBeenCalledWith(expect.objectContaining({
            posTransactionId: 17901,
            payload: expect.objectContaining({
                shift_id: 901,
                reason: 'Customer requested cash reversal'
            }),
            transaction: expect.any(Object)
        }));
        expect(result.data.cash_refund.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'cash_refund',
            amount: 125
        }));
    });

    it('voids for an administrator without a shift and marks the cash refund pending', async () => {
        const transactionRow = {
            pos_transaction_id: 17902,
            invoice_number: 'INV-AUTO-CASH-REFUND-002',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const cashRefundPosTransactionUseCase = jest.fn();
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...transactionRow, ...payload })),
            createPosTransactionAdjustment: jest.fn(async (payload) => ({ ...payload, pos_transaction_adjustment_id: 9020 })),
            createAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            cashRefundPosTransactionUseCase
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 17902,
            payload: {
                reason: 'Administrator correction after close',
                auto_refund: true,
                terminal_id: 'TERM-01',
                terminal_location_id: 3,
                idempotency_key: 'auto-cash-refund-17902'
            },
            user: { user_id: 99, role: 'admin' }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            refund_pending: true,
            refund_pending_reason: 'POS_REFUND_SHIFT_REQUIRED',
            financial_outcome: expect.objectContaining({
                refund_required: true,
                next_action: 'record_cash_refund_with_cash_drawer_event'
            })
        }));
        expect(cashRefundPosTransactionUseCase).not.toHaveBeenCalled();
    });

    it('allows an administrator to execute a void directly without creating an approval request', async () => {
        const transactionRow = {
            pos_transaction_id: 1790,
            invoice_number: 'INV-ADMIN-BYPASS-001',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const createBusinessAdminApprovalRequest = jest.fn();
        const pendingApprovalRequest = {
            business_admin_approval_request_id: 7790,
            status: 'pending',
            requested_by: 99
        };
        const updateBusinessAdminApprovalRequest = jest.fn(async (id, payload) => ({
            ...pendingApprovalRequest,
            business_admin_approval_request_id: id,
            ...payload
        }));
        const createAuditLog = jest.fn().mockResolvedValue(null);
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901, cashierId: 99 })),
            findPendingBusinessAdminApprovalRequest: jest.fn().mockResolvedValue(pendingApprovalRequest),
            createBusinessAdminApprovalRequest,
            updateBusinessAdminApprovalRequest,
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...transactionRow, ...payload })),
            createPosTransactionAdjustment: jest.fn(async (payload) => ({
                ...payload,
                adjustment_reference: payload.adjustment_reference
            })),
            createAuditLog
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 1790,
            payload: {
                reason: 'Administrator correction',
                shift_id: 901,
                terminal_id: 'TERM-01',
                terminal_location_id: 3
            },
            user: { user_id: 99, role: 'admin' }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            authorization_mode: 'admin_bypass',
            transaction: expect.objectContaining({ status: 'voided' })
        }));
        expect(createBusinessAdminApprovalRequest).not.toHaveBeenCalled();
        expect(posRepository.findPendingBusinessAdminApprovalRequest).toHaveBeenCalledWith({
            actionType: 'pos_void',
            entityType: 'pos_transaction',
            entityId: 1790
        }, expect.objectContaining({ transaction: expect.any(Object), lock: true }));
        expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_transaction_voided',
            changes: expect.objectContaining({
                authorization_mode: 'admin_bypass',
                approval_request_id: null,
                superseded_approval_request_id: 7790,
                approved_by: null
            })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(updateBusinessAdminApprovalRequest).toHaveBeenCalledWith(7790, expect.objectContaining({
            status: 'cancelled'
        }), expect.objectContaining({ transaction: expect.any(Object), lock: true }));
    });

    it('executes a cashier void with an authorized refund passcode and records the approver', async () => {
        const transactionRow = {
            pos_transaction_id: 1791,
            invoice_number: 'INV-REFUND-PASSCODE-001',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const createAuditLog = jest.fn().mockResolvedValue(null);
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901, cashierId: 12 })),
            listActivePosRefundPasscodeApprovers: jest.fn().mockResolvedValue([{
                user_id: 99,
                username: 'Manager One',
                role: 'manager',
                is_active: true,
                pos_approval_pin_hash: await bcrypt.hash('2468', 4)
            }]),
            findPendingBusinessAdminApprovalRequest: jest.fn().mockResolvedValue(null),
            createBusinessAdminApprovalRequest: jest.fn(),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle: jest.fn(async (id, payload) => ({ ...transactionRow, ...payload })),
            createPosTransactionAdjustment: jest.fn(async (payload) => ({
                ...payload,
                adjustment_reference: payload.adjustment_reference
            })),
            createAuditLog
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 1791,
            payload: {
                reason: 'Customer refund approved',
                refund_passcode: '2468',
                shift_id: 901,
                terminal_id: 'TERM-01'
            },
            user: { user_id: 12, role: 'cashier' }
        }));

        expect(result.success).toBe(true);
        expect(result.data.authorization_mode).toBe('refund_passcode');
        expect(result.data.transaction).toEqual(expect.objectContaining({ status: 'voided' }));
        expect(posRepository.createBusinessAdminApprovalRequest).not.toHaveBeenCalled();
        expect(posRepository.createPosTransactionAdjustment).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                authorization_mode: 'refund_passcode',
                refund_passcode_approver_id: 99
            })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
        expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_transaction_voided',
            changes: expect.objectContaining({
                authorization_mode: 'refund_passcode',
                refund_passcode_approver_id: 99
            })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
    });

    it('rejects an administrator void when the transaction is outside the registered terminal location', async () => {
        const updateTransactionLifecycle = jest.fn();
        const transactionRow = {
            pos_transaction_id: 179,
            invoice_number: 'INV-000003',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            updateTransactionLifecycle,
            createAuditLog: jest.fn(),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 179,
            payload: {
                reason: 'Admin correction from another location',
                terminal_id: 'TERM-01',
                terminal_location_id: 9
            },
            user: { user_id: 99, role: 'admin' },
            approvalExecution: approvedVoidExecution(179, 99)
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_TRANSACTION_LOCATION_MISMATCH',
            transaction_location_id: 3,
            terminal_location_id: 9
        }));
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
    });

    it('rejects conflicting existing void evidence before changing the transaction', async () => {
        const updateTransactionLifecycle = jest.fn();
        const createPosTransactionAdjustment = jest.fn();
        const transactionRow = {
            pos_transaction_id: 180,
            invoice_number: 'INV-000004',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue({
                adjustment_reference: 'POS-VOID-180',
                request_hash: 'different-request',
                status: 'succeeded'
            }),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle,
            createPosTransactionAdjustment,
            createAuditLog: jest.fn()
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            posTransactionId: 180,
            payload: {
                reason: 'Admin correction',
                terminal_id: 'TERM-01'
            },
            user: { user_id: 99, role: 'admin' },
            approvalExecution: approvedVoidExecution(180, 99)
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(result.error.message).toBe('POS void evidence already exists for a different request');
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
        expect(createPosTransactionAdjustment).not.toHaveBeenCalled();
    });

    it('rolls back the internal void when adjustment evidence cannot be persisted', async () => {
        const updateTransactionLifecycle = jest.fn(async (id, payload) => ({
            pos_transaction_id: id,
            status: payload.status
        }));
        const createAuditLog = jest.fn();
        const transactionRow = {
            pos_transaction_id: 181,
            invoice_number: 'INV-000005',
            document_type: 'non_fiscal_slip',
            status: 'completed',
            terminal_id: 'TERM-01',
            location_id: 3,
            cashier_id: 12,
            shift_id: 901,
            total_amount: 125,
            payment_type: 'cash',
            payment_status: 'unpaid'
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle,
            createPosTransactionAdjustment: jest.fn().mockRejectedValue(new Error('adjustment insert failed')),
            createAuditLog
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });
        let tenantTransaction;

        const result = await runInTenantContext((context) => {
            tenantTransaction = context.transaction;
            return useCase({
                posTransactionId: 181,
                payload: {
                    reason: 'Evidence persistence failure',
                    shift_id: 901,
                    terminal_id: 'TERM-01'
                },
                user: { user_id: 12, role: 'cashier' },
                approvalExecution: approvedVoidExecution(181, 12)
            });
        });

        expect(result.success).toBe(false);
        expect(tenantTransaction.rollback).toHaveBeenCalledTimes(1);
        expect(tenantTransaction.commit).not.toHaveBeenCalled();
        expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('still requires an open shift when a non-administrator voids a transaction', async () => {
        const useCase = buildVoidPosTransactionUseCase({ posRepository: {} });

        const result = await useCase({
            posTransactionId: 178,
            payload: { reason: 'Cashier correction' },
            user: { user_id: 12, role: 'cashier' }
        });

        expect(result.success).toBe(false);
        expect(result.error.message).toBe('An active shift is required to request a POS void');
    });

    it('rolls back an approved void when stock-ledger lookup is unavailable', async () => {
        const transactionRow = {
            pos_transaction_id: 183,
            invoice_number: 'INV-VOID-LOOKUP-GAP',
            status: 'completed',
            location_id: 3,
            total_amount: 50,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const updateTransactionLifecycle = jest.fn();
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle
        };
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale: jest.fn() }
        });
        let tenantTransaction;

        const result = await runInTenantContext((context) => {
            tenantTransaction = context.transaction;
            return useCase({
                posTransactionId: 183,
                payload: { reason: 'Ledger capability unavailable' },
                user: { user_id: 99, role: 'admin' },
                approvalExecution: approvedVoidExecution(183, 99)
            });
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details.reason_code).toBe('POS_VOID_STOCK_MOVEMENT_LOOKUP_UNAVAILABLE');
        expect(tenantTransaction.rollback).toHaveBeenCalledTimes(1);
        expect(tenantTransaction.commit).not.toHaveBeenCalled();
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
    });

    it('rolls back an approved void when completed parked-sale linkage cannot be checked', async () => {
        const transactionRow = {
            pos_transaction_id: 185,
            invoice_number: 'INV-VOID-PARKED-LOOKUP-GAP',
            status: 'completed',
            location_id: 3,
            total_amount: 50,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const updateTransactionLifecycle = jest.fn();
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([]),
            updateTransactionLifecycle
        };
        const useCase = buildVoidPosTransactionUseCase({ posRepository });
        let tenantTransaction;

        const result = await runInTenantContext((context) => {
            tenantTransaction = context.transaction;
            return useCase({
                posTransactionId: 185,
                payload: { reason: 'Cannot inspect parked sale linkage' },
                user: { user_id: 99, role: 'admin' },
                approvalExecution: approvedVoidExecution(185, 99)
            });
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details.reason_code).toBe('POS_VOID_PARKED_SALE_LOOKUP_UNAVAILABLE');
        expect(tenantTransaction.rollback).toHaveBeenCalledTimes(1);
        expect(tenantTransaction.commit).not.toHaveBeenCalled();
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
    });

    it('rejects a malformed goods-issue ledger row instead of skipping its stock restoration', async () => {
        const transactionRow = {
            pos_transaction_id: 186,
            invoice_number: 'INV-VOID-BAD-LEDGER-ROW',
            status: 'completed',
            location_id: 3,
            total_amount: 50,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const updateTransactionLifecycle = jest.fn();
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{
                movement_id: 2601,
                item_id: 52,
                quantity: 0,
                location_id: 3
            }]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle
        };
        const returnStockForVoidedSale = jest.fn();
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale }
        });
        let tenantTransaction;

        const result = await runInTenantContext((context) => {
            tenantTransaction = context.transaction;
            return useCase({
                posTransactionId: 186,
                payload: { reason: 'Invalid issue ledger row' },
                user: { user_id: 99, role: 'admin' },
                approvalExecution: approvedVoidExecution(186, 99)
            });
        });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_VOID_STOCK_MOVEMENT_INVALID');
        expect(returnStockForVoidedSale).not.toHaveBeenCalled();
        expect(tenantTransaction.rollback).toHaveBeenCalledTimes(1);
        expect(tenantTransaction.commit).not.toHaveBeenCalled();
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
    });

    it('rolls back an approved void when inventory does not confirm the return movement', async () => {
        const transactionRow = {
            pos_transaction_id: 184,
            invoice_number: 'INV-VOID-RETURN-GAP',
            status: 'completed',
            location_id: 3,
            total_amount: 50,
            payment_type: 'cash',
            payment_status: 'paid'
        };
        const updateTransactionLifecycle = jest.fn();
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue(transactionRow),
            findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
            listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{
                movement_id: 2401,
                item_id: 51,
                quantity: -1,
                location_id: 3
            }]),
            findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
            updateTransactionLifecycle
        };
        const returnStockForVoidedSale = jest.fn().mockResolvedValue(null);
        const useCase = buildVoidPosTransactionUseCase({
            posRepository,
            inventoryCommandService: { returnStockForVoidedSale }
        });
        let tenantTransaction;

        const result = await runInTenantContext((context) => {
            tenantTransaction = context.transaction;
            return useCase({
                posTransactionId: 184,
                payload: { reason: 'Inventory return was not persisted' },
                user: { user_id: 99, role: 'admin' },
                approvalExecution: approvedVoidExecution(184, 99)
            });
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details.reason_code).toBe('POS_VOID_STOCK_REVERSAL_NOT_PERSISTED');
        expect(returnStockForVoidedSale).toHaveBeenCalledTimes(1);
        expect(tenantTransaction.rollback).toHaveBeenCalledTimes(1);
        expect(tenantTransaction.commit).not.toHaveBeenCalled();
        expect(updateTransactionLifecycle).not.toHaveBeenCalled();
    });

    it('projects sanitized void adjustment evidence and the latest financial outcome on transaction reads', async () => {
        const financialOutcome = {
            internal_void: 'succeeded',
            refund_required: true,
            refund_strategy: 'cash_refund',
            next_action: 'cash_drawer_refund',
            reason_code: 'PAID_CASH_REQUIRES_REFUND'
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue({
                pos_transaction_id: 182,
                status: 'voided',
                cashier_id: 12,
                shift_id: 901
            }),
            listPosTransactionAdjustmentsForTransaction: jest.fn().mockResolvedValue([{
                pos_transaction_adjustment_id: 1,
                adjustment_reference: 'POS-VOID-182',
                pos_transaction_id: 182,
                original_cashier_id: 12,
                originalCashier: { username: 'Cashier One' },
                original_shift_id: 901,
                actor_user_id: 99,
                actorUser: { username: 'Admin One' },
                actor_shift_id: null,
                adjustment_type: 'void',
                tender_type: 'cash',
                amount: '125.0000',
                currency: 'PHP',
                status: 'succeeded',
                reason: 'Admin correction',
                request_hash: 'SECRET-MUST-NOT-RETURN',
                metadata: {
                    financial_outcome: financialOutcome,
                    internal_only_value: 'SECRET-MUST-NOT-RETURN'
                }
            }]),
            findPosPaymentSessionByCompletedTransactionId: jest.fn().mockResolvedValue({
                pos_payment_session_id: 51,
                session_reference: 'PPS-51',
                status: 'completed',
                total_amount: '125.0000',
                paid_amount: '125.0000',
                idempotency_key: 'INTERNAL-MUST-NOT-RETURN'
            }),
            listPosPaymentAllocationsForSession: jest.fn().mockResolvedValue([{
                pos_payment_allocation_id: 61,
                allocation_reference: 'PPA-61',
                status: 'successful',
                payment_method: 'cash',
                payment_handoff_mode: 'external',
                applied_amount: '75.0000',
                reversed_amount: '0.0000',
                reversal_status: 'none',
                request_hash: 'INTERNAL-MUST-NOT-RETURN'
            }]),
            getReceiptPrintStatuses: jest.fn().mockResolvedValue({})
        };
        const useCase = buildGetPosTransactionByIdUseCase({ posRepository });

        const result = await useCase({ posTransactionId: 182 });

        expect(result.success).toBe(true);
        expect(posRepository.listPosTransactionAdjustmentsForTransaction).toHaveBeenCalledWith(182);
        expect(result.data.adjustments).toEqual([expect.objectContaining({
            adjustment_reference: 'POS-VOID-182',
            original_cashier_id: 12,
            original_cashier_name: 'Cashier One',
            original_shift_id: 901,
            actor_user_id: 99,
            actor_name: 'Admin One',
            actor_shift_id: null,
            adjustment_type: 'void',
            amount: '125.0000',
            financial_outcome: financialOutcome
        })]);
        expect(result.data.financial_outcome).toEqual(financialOutcome);
        expect(result.data.payment_session).toEqual({
            pos_payment_session_id: 51,
            session_reference: 'PPS-51',
            status: 'completed',
            total_amount: '125.0000',
            paid_amount: '125.0000'
        });
        expect(result.data.payment_allocations).toEqual([expect.objectContaining({
            pos_payment_allocation_id: 61,
            allocation_reference: 'PPA-61',
            payment_method: 'cash',
            reversal_status: 'none'
        })]);
        expect(result.data.payment_allocations[0].request_hash).toBeUndefined();
        expect(result.data.adjustments[0].request_hash).toBeUndefined();
        expect(result.data.adjustments[0].internal_only_value).toBeUndefined();
        expect(result.data.adjustments[0].metadata).toBeUndefined();
    });

    it('projects financial outcome when the tenant database returns adjustment metadata as JSON text', async () => {
        const financialOutcome = {
            internal_void: 'succeeded',
            refund_required: true,
            refund_state: 'manual_review_required',
            refund_method: 'cash',
            next_action: 'record_cash_refund_with_cash_drawer_event',
            reason_code: 'CASH_REFUND_REQUIRED',
            refund_amount: 150,
            currency: 'PHP'
        };
        const posRepository = {
            getTransactionById: jest.fn().mockResolvedValue({
                pos_transaction_id: 183,
                status: 'voided',
                cashier_id: 12,
                shift_id: 901
            }),
            listPosTransactionAdjustmentsForTransaction: jest.fn().mockResolvedValue([{
                pos_transaction_adjustment_id: 2,
                adjustment_reference: 'POS-VOID-183',
                pos_transaction_id: 183,
                adjustment_type: 'void',
                tender_type: 'cash',
                amount: '150.0000',
                currency: 'PHP',
                status: 'succeeded',
                reason: 'Admin correction',
                metadata: JSON.stringify({
                    evidence_scope: 'internal_void_only',
                    financial_outcome: financialOutcome,
                    internal_only_value: 'SECRET-MUST-NOT-RETURN'
                })
            }]),
            getReceiptPrintStatuses: jest.fn().mockResolvedValue({})
        };
        const useCase = buildGetPosTransactionByIdUseCase({ posRepository });

        const result = await useCase({ posTransactionId: 183 });

        expect(result.success).toBe(true);
        expect(result.data.financial_outcome).toEqual(financialOutcome);
        expect(result.data.adjustments[0].financial_outcome).toEqual(financialOutcome);
        expect(result.data.adjustments[0].internal_only_value).toBeUndefined();
        expect(result.data.adjustments[0].metadata).toBeUndefined();
    });

    it('generates an eSales report package with hash and fiscal ledger event', async () => {
        const posRepository = {
            listFiscalTransactionsForMonth: jest.fn().mockResolvedValue([{
                pos_transaction_id: 177,
                invoice_number: 'INV-000001',
                created_at: '2026-06-01T00:00:00.000Z',
                terminal_id: 'TERM-01',
                buyer_tin: '987-654-321-00000',
                vatable_sales: 89.2857,
                vat_amount: 10.7143,
                vat_exempt_sales: 0,
                zero_rated_sales: 0,
                total_amount: 101,
                status: 'completed',
                fiscal_document_hash: 'a'.repeat(64),
                fiscal_document_snapshot: { terminal: { min_number: 'MIN-001' } }
            }]),
            upsertESalesReport: jest.fn(async (payload) => ({ pos_esales_report_id: 1, ...payload })),
            createFiscalEvent: jest.fn(async (payload) => ({ ...payload, event_hash: 'esales-event-hash' }))
        };
        const useCase = buildGenerateESalesReportUseCase({ posRepository });

        const result = await runInTenantContext(() => useCase({
            payload: { report_month: '2026-06' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.report.payload_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.data.report.payload.summary.transaction_count).toBe(1);
        expect(result.data.report.payload.summary.net_total_amount).toBe(101);
        expect(result.data.report.payload.summary.voided_transaction_count).toBe(0);
        expect(posRepository.createFiscalEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'esales_export'
        }), expect.objectContaining({ transaction: expect.any(Object) }));
    });

    it('lists and updates eSales acknowledgement status with fiscal event evidence', async () => {
        const posRepository = {
            listESalesReports: jest.fn().mockResolvedValue([{ pos_esales_report_id: 1, report_month: '2026-06' }]),
            findESalesReportById: jest.fn().mockResolvedValue({
                pos_esales_report_id: 1,
                report_month: '2026-06',
                payload_hash: 'b'.repeat(64),
                submitted_by: null,
                submitted_at: null
            }),
            updateESalesReportStatus: jest.fn(async (id, payload) => ({
                pos_esales_report_id: id,
                report_month: '2026-06',
                payload_hash: 'b'.repeat(64),
                ...payload
            })),
            createFiscalEvent: jest.fn(async (payload) => ({ ...payload, event_hash: 'status-event-hash' }))
        };
        const listUseCase = buildListESalesReportsUseCase({ posRepository });
        const updateUseCase = buildUpdateESalesReportStatusUseCase({ posRepository });

        const listed = await listUseCase();
        const updated = await runInTenantContext(() => updateUseCase({
            reportId: 1,
            payload: {
                status: 'submitted',
                status_evidence_ref: 'ACK-001',
                status_note: 'Submitted through eSales portal'
            },
            user: { user_id: 12 }
        }));

        expect(listed.success).toBe(true);
        expect(listed.data.reports).toHaveLength(1);
        expect(updated.success).toBe(true);
        expect(updated.data.report).toEqual(expect.objectContaining({
            status: 'submitted',
            status_evidence_ref: 'ACK-001',
            submitted_by: 12
        }));
        expect(posRepository.createFiscalEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'esales_export',
            payload: expect.objectContaining({
                status: 'submitted',
                status_evidence_ref: 'ACK-001'
            })
        }), expect.objectContaining({ transaction: expect.any(Object) }));
    });

    it('requires fiscal terminal identity before marking a terminal verified', async () => {
        const posRepository = {
            upsertFiscalTerminalRegistration: jest.fn(),
            createFiscalEvent: jest.fn()
        };
        const useCase = buildUpsertFiscalTerminalRegistrationUseCase({ posRepository });

        const result = await runInTenantContext(() => useCase({
            payload: {
                terminal_id: 'TERM-01',
                accreditation_status: 'verified'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('FISCAL_TERMINAL_VERIFICATION_INCOMPLETE');
        expect(posRepository.upsertFiscalTerminalRegistration).not.toHaveBeenCalled();
    });

    it('verifies fiscal event ledger sequence and hash continuity', async () => {        const eventOnePayload = { invoice_number: 'INV-1' };
        const eventOneHash = '3a0b431e485464a7b77bc7a33a5bc5ecf9e8a0b7f28b5542ee2fdfd8a796a4b8';
        const posRepository = {
            listFiscalEvents: jest.fn().mockResolvedValue([
                {
                    pos_fiscal_event_id: 1,
                    event_sequence: 1,
                    event_type: 'checkout_issued',
                    pos_transaction_id: 10,
                    invoice_number: 'INV-1',
                    terminal_id: 'TERM-01',
                    previous_event_hash: null,
                    event_hash: eventOneHash,
                    payload: eventOnePayload,
                    occurred_at: '2026-06-01T00:00:00.000Z'
                },
                {
                    pos_fiscal_event_id: 2,
                    event_sequence: 3,
                    event_type: 'print_original',
                    pos_transaction_id: 10,
                    invoice_number: 'INV-1',
                    terminal_id: 'TERM-01',
                    previous_event_hash: 'wrong-hash',
                    event_hash: 'wrong-event-hash',
                    payload: { print_sequence: 1 },
                    occurred_at: '2026-06-01T00:01:00.000Z'
                }
            ])
        };
        const useCase = buildVerifyFiscalEventLedgerUseCase({ posRepository });

        const result = await useCase();

        expect(result.success).toBe(true);
        expect(result.data.ready).toBe(false);
        expect(result.data.checked_event_count).toBe(2);
        expect(result.data.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            'FISCAL_EVENT_SEQUENCE_GAP',
            'FISCAL_EVENT_PREVIOUS_HASH_MISMATCH',
            'FISCAL_EVENT_HASH_MISMATCH'
        ]));
    });

    describe('#1952 POS stock-change catalog invalidation', () => {
        const buildDirectSaleRepository = () => {
            let createdTransaction = null;
            const posRepository = {
                getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
                findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
                findSellableItemsByIds: jest.fn().mockResolvedValue([{
                    item_id: 11,
                    name: 'Aftercare Kit',
                    category: 'product',
                    unit_of_measure: 'kit',
                    current_stock: 13,
                    cost_per_unit: 100,
                    default_sale_price: 180,
                    vat_type: 'vatable'
                }]),
                listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
                findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
                getTerminalShiftById: jest.fn(),
                nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-1952-DIRECT'),
                getFnbTableById: jest.fn(),
                createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                    createdTransaction = { pos_transaction_id: 1952, ...header, lines };
                    return 1952;
                }),
                createFnbServiceChargeSnapshot: jest.fn(),
                settleFnbCheck: jest.fn(),
                createAuditLog: jest.fn().mockResolvedValue(null),
                incrementPersistentCounter: jest.fn().mockResolvedValue(1),
                getTransactionById: jest.fn(async () => createdTransaction)
            };
            const payload = {
                idempotency_key: 'pos-1952-direct-sale',
                terminal_id: 'TERM-01',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'pickup',
                lines: [{ item_id: 11, quantity: 1 }]
            };
            return { posRepository, payload };
        };

        it('publishes pos_sale_stock_changed with the finished item after a direct sale commits', async () => {
            const { posRepository, payload } = buildDirectSaleRepository();
            const inventoryCommandService = {
                createStockMovement: jest.fn().mockResolvedValue({ movement_id: 7101 })
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService, publishCatalogChange });

            const result = await runInTenantContext(() => useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload
            }));

            expect(result.success).toBe(true);
            expect(inventoryCommandService.createStockMovement).toHaveBeenCalledWith(
                expect.objectContaining({ item_id: 11, quantity: 1 }),
                12,
                expect.any(Object)
            );
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
            expect(publishCatalogChange).toHaveBeenCalledWith({
                tenantId: 'tenant-fnb-checkout-contract',
                reason: 'pos_sale_stock_changed',
                itemIds: [11]
            });
        });

        it('publishes recipe ingredient and modifier IDs (not the finished item) for an F&B sale', async () => {
            let createdTransaction = null;
            const posRepository = {
                getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
                findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
                findSellableItemsByIds: jest.fn().mockResolvedValue([{
                    item_id: 1,
                    name: 'Burger',
                    category: 'product',
                    unit_of_measure: 'pc',
                    current_stock: 0,
                    cost_per_unit: 50,
                    default_sale_price: 100,
                    vat_type: 'vatable',
                    fnbModifierGroups: [{
                        modifier_group_id: 7,
                        name: 'Cheese',
                        display_name: 'Cheese',
                        min_select: 1,
                        max_select: 1,
                        required: true,
                        FnbItemModifierGroup: { is_required_override: null },
                        options: [{
                            modifier_option_id: 9,
                            name: 'Cheddar',
                            price_delta: 20,
                            sku_item_id: 6,
                            is_active: true,
                            allergen_notes: ['milk']
                        }]
                    }]
                }]),
                listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                    product_id: 1,
                    ingredient_id: 5,
                    quantity_required: 200,
                    unit_of_measure: 'g',
                    ingredient: {
                        item_id: 5,
                        name: 'Ground beef',
                        current_stock: 10,
                        unit_of_measure: 'kg',
                        category: 'raw_material'
                    }
                }]),
                findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
                getTerminalShiftById: jest.fn(),
                nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-1952-RECIPE'),
                getFnbTableById: jest.fn(),
                createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                    createdTransaction = { pos_transaction_id: 1953, ...header, lines };
                    return 1953;
                }),
                createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
                createFnbKitchenOrderForTransaction: jest.fn().mockResolvedValue({ kitchen_ticket: { kitchen_ticket_id: 91 } }),
                settleFnbCheck: jest.fn(),
                createAuditLog: jest.fn().mockResolvedValue(null),
                incrementPersistentCounter: jest.fn().mockResolvedValue(1),
                getTransactionById: jest.fn(async () => createdTransaction)
            };
            const inventoryCommandService = {
                createStockMovement: jest.fn().mockResolvedValue({ movement_id: 7102 })
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService, publishCatalogChange });

            const result = await runInTenantContext(() => useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: {
                    idempotency_key: 'pos-1952-recipe-sale',
                    terminal_id: 'TERM-01',
                    location_id: 3,
                    document_context: 'non_fiscal',
                    payment_type: 'cash',
                    order_method: 'dine_in',
                    fnb_guest_count: 2,
                    lines: [{
                        item_id: 1,
                        quantity: 2,
                        course: 'main',
                        line_modifiers: [{ modifier_group_id: 7, modifier_option_id: 9 }]
                    }]
                }
            }));

            expect(result.success).toBe(true);
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
            expect(publishCatalogChange).toHaveBeenCalledWith({
                tenantId: 'tenant-fnb-checkout-contract',
                reason: 'pos_sale_stock_changed',
                itemIds: [5, 6]
            });
        });

        it('publishes nothing when every line is stock-exempt', async () => {
            let createdTransaction = null;
            const posRepository = {
                getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
                findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
                findSellableItemsByIds: jest.fn().mockResolvedValue([{
                    item_id: 1,
                    name: 'Always Available Meal',
                    category: 'product',
                    unit_of_measure: 'serving',
                    current_stock: 0,
                    cost_per_unit: 40,
                    default_sale_price: 100,
                    vat_type: 'vatable',
                    pos_always_available: true
                }]),
                listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
                findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
                getTerminalShiftById: jest.fn(),
                nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-1952-EXEMPT'),
                getFnbTableById: jest.fn(),
                createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                    createdTransaction = { pos_transaction_id: 1954, ...header, lines };
                    return 1954;
                }),
                createFnbServiceChargeSnapshot: jest.fn(),
                settleFnbCheck: jest.fn(),
                createAuditLog: jest.fn().mockResolvedValue(null),
                incrementPersistentCounter: jest.fn().mockResolvedValue(1),
                getTransactionById: jest.fn(async () => createdTransaction)
            };
            const inventoryCommandService = {
                createStockMovement: jest.fn()
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService, publishCatalogChange });

            const result = await runInTenantContext(() => useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: {
                    idempotency_key: 'pos-1952-exempt-sale',
                    terminal_id: 'TERM-01',
                    location_id: 3,
                    document_context: 'non_fiscal',
                    payment_type: 'cash',
                    order_method: 'pickup',
                    lines: [{ item_id: 1, quantity: 2 }]
                }
            }));

            expect(result.success).toBe(true);
            expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
            expect(publishCatalogChange).not.toHaveBeenCalled();
        });

        it('does not fail a committed sale when the publisher rejects', async () => {
            const { posRepository, payload } = buildDirectSaleRepository();
            const inventoryCommandService = {
                createStockMovement: jest.fn().mockResolvedValue({ movement_id: 7103 })
            };
            const publishCatalogChange = jest.fn().mockRejectedValue(new Error('redis down'));
            const useCase = buildCheckoutContractUseCase({
                posRepository,
                inventoryCommandService,
                publishCatalogChange
            });

            const result = await runInTenantContext(() => useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: { ...payload, idempotency_key: 'pos-1952-publisher-failure' }
            }));

            expect(result.success).toBe(true);
            expect(result.data.idempotent_replay).toBe(false);
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
        });

        it('defers publication with afterCommit for caller-owned checkout transactions', async () => {
            const { posRepository, payload } = buildDirectSaleRepository();
            const inventoryCommandService = {
                createStockMovement: jest.fn().mockResolvedValue({ movement_id: 7104 })
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService, publishCatalogChange });
            const callerTransaction = {
                LOCK: { UPDATE: 'UPDATE' },
                finished: false,
                commit: jest.fn(),
                rollback: jest.fn(),
                afterCommit: jest.fn()
            };

            const result = await runInTenantContext(() => useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: { ...payload, idempotency_key: 'pos-1952-caller-owned' },
                transaction: callerTransaction
            }));

            expect(result.success).toBe(true);
            expect(callerTransaction.commit).not.toHaveBeenCalled();
            expect(callerTransaction.afterCommit).toHaveBeenCalledTimes(1);
            expect(publishCatalogChange).not.toHaveBeenCalled();

            await callerTransaction.afterCommit.mock.calls[0][0]();
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
            expect(publishCatalogChange).toHaveBeenCalledWith({
                tenantId: 'tenant-fnb-checkout-contract',
                reason: 'pos_sale_stock_changed',
                itemIds: [11]
            });
        });

        it('publishes nothing on idempotent checkout replay', async () => {
            const existingTransaction = {
                pos_transaction_id: 188,
                invoice_number: 'INV-LEGACY-NON-FISCAL',
                document_type: 'non_fiscal_slip',
                document_context: 'non_fiscal',
                idempotency_key: 'pos-1952-replay',
                request_hash: hashPayload({
                    terminal_id: 'TERM-01',
                    location_id: 3,
                    operator_session_id: null,
                    order_method: 'pickup',
                    payment_type: 'cash',
                    service_fee_amount: null,
                    fnb_check_id: null,
                    fnb_table_id: null,
                    fnb_table_label_snapshot: null,
                    fnb_guest_count: null,
                    fnb_server_id: null,
                    restaurant_service_charge: {
                        enabled: false,
                        amount: null,
                        label: 'Restaurant service charge',
                        rate: 0,
                        taxable: false,
                        source: 'settings'
                    },
                    discount_profile_name: null,
                    discount_rate: null,
                    discount_amount: 0,
                    customer_name: null,
                    customer_email: null,
                    customer_phone: null,
                    buyer_name: null,
                    buyer_tin: null,
                    buyer_business_style: null,
                    buyer_address: null,
                    special_instructions: null,
                    discount_beneficiary: null,
                    governed_discount: null,
                    lines: [{
                        sequence: 0,
                        line_ref: null,
                        item_id: 1,
                        quantity: 1,
                        sale_price: null,
                        price_override_reason: null,
                        course: null,
                        line_modifiers: [],
                        special_instructions: null,
                        kitchen_station_id: null,
                        scan_metadata: null
                    }]
                }),
                status: 'completed',
                lines: []
            };
            const posRepository = {
                getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
                findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(existingTransaction)
            };
            const inventoryCommandService = {
                createStockMovement: jest.fn()
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildCheckoutContractUseCase({ posRepository, inventoryCommandService, publishCatalogChange });

            const result = await runInTenantContext(() => useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: {
                    idempotency_key: 'pos-1952-replay',
                    terminal_id: 'term-01',
                    location_id: 3,
                    document_context: 'non_fiscal',
                    payment_type: 'cash',
                    order_method: 'pickup',
                    lines: [{ item_id: 1, quantity: 1 }]
                }
            }));

            expect(result.success).toBe(true);
            expect(result.data.idempotent_replay).toBe(true);
            expect(inventoryCommandService.createStockMovement).not.toHaveBeenCalled();
            expect(publishCatalogChange).not.toHaveBeenCalled();
        });

        it('publishes pos_void_stock_changed with reversed IDs after a void commits', async () => {
            const transactionRow = {
                pos_transaction_id: 1977,
                invoice_number: 'INV-1952-VOID',
                document_type: 'non_fiscal_slip',
                status: 'completed',
                terminal_id: 'TERM-01',
                location_id: 3,
                cashier_id: 12,
                shift_id: 901,
                total_amount: 180,
                payment_type: 'cash',
                payment_status: 'paid'
            };
            const posRepository = {
                getTransactionById: jest.fn().mockResolvedValue(transactionRow),
                getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901 })),
                listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{
                    movement_id: 9601,
                    item_id: 11,
                    quantity: -1,
                    location_id: 3
                }]),
                findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
                createAuditLog: jest.fn().mockResolvedValue(null),
                findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
                createPosTransactionAdjustment: jest.fn(async (adjustment) => ({ ...adjustment })),
                updateTransactionLifecycle: jest.fn(async (id, lifecycle) => ({ ...transactionRow, ...lifecycle }))
            };
            const inventoryCommandService = {
                returnStockForVoidedSale: jest.fn().mockResolvedValue({ movement_id: 9602 })
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildVoidPosTransactionUseCase({ posRepository, inventoryCommandService, publishCatalogChange });

            const result = await runInTenantContext(() => useCase({
                posTransactionId: 1977,
                payload: {
                    reason: 'Customer changed mind',
                    shift_id: 901,
                    terminal_id: 'TERM-01'
                },
                user: { user_id: 12 },
                approvalExecution: approvedVoidExecution(1977, 12)
            }));

            expect(result.success).toBe(true);
            expect(inventoryCommandService.returnStockForVoidedSale).toHaveBeenCalledWith(
                expect.objectContaining({ item_id: 11, quantity: 1 }),
                12,
                expect.any(Object)
            );
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
            expect(publishCatalogChange).toHaveBeenCalledWith({
                tenantId: 'tenant-fnb-checkout-contract',
                reason: 'pos_void_stock_changed',
                itemIds: [11]
            });
        });

        it('reverses and publishes exactly once across an idempotent void replay', async () => {
            const transactionRow = {
                pos_transaction_id: 1978,
                invoice_number: 'INV-1952-VOID-REPLAY',
                document_type: 'non_fiscal_slip',
                status: 'completed',
                terminal_id: 'TERM-01',
                location_id: 3,
                cashier_id: 12,
                shift_id: 901,
                total_amount: 180,
                payment_type: 'cash',
                payment_status: 'paid'
            };
            let persistedAdjustment = null;
            const posRepository = {
                getTransactionById: jest.fn().mockResolvedValue(transactionRow),
                getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901 })),
                listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{
                    movement_id: 9701,
                    item_id: 11,
                    quantity: -1,
                    location_id: 3
                }]),
                findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
                createAuditLog: jest.fn().mockResolvedValue(null),
                findPosTransactionAdjustmentByIdempotencyKey: jest.fn(async () => persistedAdjustment),
                createPosTransactionAdjustment: jest.fn(async (adjustment) => {
                    persistedAdjustment = { ...adjustment };
                    return persistedAdjustment;
                }),
                updateTransactionLifecycle: jest.fn(async (id, lifecycle) => ({ ...transactionRow, ...lifecycle }))
            };
            const inventoryCommandService = {
                returnStockForVoidedSale: jest.fn().mockResolvedValue({ movement_id: 9702 })
            };
            const publishCatalogChange = jest.fn().mockResolvedValue(true);
            const useCase = buildVoidPosTransactionUseCase({ posRepository, inventoryCommandService, publishCatalogChange });
            const voidInput = () => ({
                posTransactionId: 1978,
                payload: {
                    reason: 'Duplicate void tap',
                    shift_id: 901,
                    terminal_id: 'TERM-01'
                },
                user: { user_id: 12 },
                approvalExecution: approvedVoidExecution(1978, 12)
            });

            const first = await runInTenantContext(() => useCase(voidInput()));
            const second = await runInTenantContext(() => useCase(voidInput()));

            expect(first.success).toBe(true);
            expect(second.success).toBe(true);
            expect(second.data.idempotent_replay).toBe(true);
            expect(inventoryCommandService.returnStockForVoidedSale).toHaveBeenCalledTimes(1);
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
        });

        it('does not fail a committed void when the publisher rejects', async () => {
            const transactionRow = {
                pos_transaction_id: 1979,
                invoice_number: 'INV-1952-VOID-FAILURE',
                document_type: 'non_fiscal_slip',
                status: 'completed',
                terminal_id: 'TERM-01',
                location_id: 3,
                cashier_id: 12,
                shift_id: 901,
                total_amount: 180,
                payment_type: 'cash',
                payment_status: 'paid'
            };
            const posRepository = {
                getTransactionById: jest.fn().mockResolvedValue(transactionRow),
                getTerminalShiftById: jest.fn().mockResolvedValue(createOpenShift({ shiftId: 901 })),
                listStockMovementsForPosTransaction: jest.fn().mockResolvedValue([{
                    movement_id: 9801,
                    item_id: 11,
                    quantity: -1,
                    location_id: 3
                }]),
                findParkedSaleByCompletedTransactionId: jest.fn().mockResolvedValue(null),
                createAuditLog: jest.fn().mockResolvedValue(null),
                findPosTransactionAdjustmentByIdempotencyKey: jest.fn().mockResolvedValue(null),
                createPosTransactionAdjustment: jest.fn(async (adjustment) => ({ ...adjustment })),
                updateTransactionLifecycle: jest.fn(async (id, lifecycle) => ({ ...transactionRow, ...lifecycle }))
            };
            const inventoryCommandService = {
                returnStockForVoidedSale: jest.fn().mockResolvedValue({ movement_id: 9802 })
            };
            const publishCatalogChange = jest.fn().mockRejectedValue(new Error('redis down'));
            const useCase = buildVoidPosTransactionUseCase({ posRepository, inventoryCommandService, publishCatalogChange });

            const result = await runInTenantContext(() => useCase({
                posTransactionId: 1979,
                payload: {
                    reason: 'Publisher outage during void',
                    shift_id: 901,
                    terminal_id: 'TERM-01'
                },
                user: { user_id: 12 },
                approvalExecution: approvedVoidExecution(1979, 12)
            }));

            expect(result.success).toBe(true);
            expect(publishCatalogChange).toHaveBeenCalledTimes(1);
        });
    });
});
