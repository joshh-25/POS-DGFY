import { jest } from '@jest/globals';
import crypto from 'crypto';
import dbStore from '../src/utils/dbStore.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

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
        buildGenerateESalesReportUseCase,
        buildListESalesReportsUseCase,
        buildVerifyFiscalEventLedgerUseCase,
        buildUpdateESalesReportStatusUseCase,
        buildUpsertFiscalTerminalRegistrationUseCase
    } = await import('../src/modules/pos/usecases/posUseCases.js'));
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
        const useCase = buildCheckoutPosUseCase({ posRepository, inventoryCommandService });

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

    it('records original and reprint fiscal print events with chained fiscal events', async () => {
        const fiscalTransaction = {
            pos_transaction_id: 177,
            invoice_number: 'INV-000001',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal',
            status: 'completed',
            terminal_id: 'TERM-01',
            fiscal_document_hash: 'a'.repeat(64),
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

    it('voids a fiscal transaction through lifecycle state and fiscal event evidence', async () => {
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
            createFiscalEvent: jest.fn().mockResolvedValue({ event_hash: 'void-event-hash' }),
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
            user: { user_id: 12 }
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
        expect(posRepository.getTerminalShiftById).toHaveBeenCalledWith(901, expect.objectContaining({
            transaction: expect.any(Object),
            lock: true
        }));
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

    it('verifies fiscal event ledger sequence and hash continuity', async () => {
        const eventOnePayload = { invoice_number: 'INV-1' };
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
});
