import { afterEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildCancelPosParkedSaleUseCase,
    buildClaimPosParkedSaleUseCase,
    buildCompleteClaimedPosParkedSaleUseCase,
    buildCreatePosParkedSaleUseCase,
    buildListPosParkedSalesUseCase,
    buildReparkPosParkedSaleUseCase
} from '../src/modules/pos/usecases/parkedSaleUseCases.js';

const basePayload = () => ({
    idempotency_key: 'park-request-001',
    shift_id: 41,
    terminal_id: 'counter-01',
    location_id: 3,
    snapshot: {
        customer_name: 'Walk-in',
        lines: [{
            item_id: 7,
            quantity: 2,
            sale_price: 125.5,
            manager_pin: '1234',
            metadata: { access_token: 'do-not-store', note: 'no secret' }
        }]
    },
    subtotal_amount: 251,
    total_amount: 251
});

const buildTransaction = () => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; })
    };
    return transaction;
};

const buildHarness = ({ shift = {}, parkedSale = null, parkedSales = [] } = {}) => {
    const transaction = buildTransaction();
    let currentParkedSale = parkedSale;
    const posRepository = {
        getTerminalShiftById: jest.fn().mockResolvedValue({
            pos_terminal_shift_id: 41,
            status: 'open',
            cashier_id: 15,
            terminal_id: 'COUNTER-01',
            location_id: 3,
            ...shift
        }),
        findParkedSaleByIdempotencyKey: jest.fn().mockResolvedValue(parkedSale),
        createParkedSale: jest.fn(async (payload) => {
            currentParkedSale = {
                pos_parked_sale_id: 101,
                created_at: new Date().toISOString(),
                ...payload
            };
            return currentParkedSale;
        }),
        findPendingBusinessAdminApprovalRequest: jest.fn().mockResolvedValue(null),
        createBusinessAdminApprovalRequest: jest.fn(async (payload) => ({
            business_admin_approval_request_id: 501,
            ...payload
        })),
        getParkedSaleById: jest.fn(async () => currentParkedSale),
        findSellableItemsByIds: jest.fn().mockResolvedValue([]),
        updateParkedSale: jest.fn(async (id, payload) => {
            currentParkedSale = {
                ...(currentParkedSale || { pos_parked_sale_id: id, shift_id: 41, cashier_id: 15, location_id: 3, status: 'parked' }),
                ...payload
            };
            return currentParkedSale;
        }),
        listParkedSales: jest.fn().mockResolvedValue(parkedSales),
        createAuditLog: jest.fn().mockResolvedValue(undefined)
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
    return {
        posRepository,
        sequelize,
        transaction,
        resolveInventoryEffects: jest.fn().mockResolvedValue([]),
        inventoryCommandService: {
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 808 }),
            reverseParkedSaleGoodsIssue: jest.fn().mockResolvedValue([])
        }
    };
};

const runInTenant = (sequelize, callback) => dbStore.run({ sequelize }, callback);

afterEach(() => jest.restoreAllMocks());

describe('parked sale use cases', () => {
    it('parks an immutable snapshot and scrubs secrets before persistence', async () => {
        const harness = buildHarness();
        const resolveInventoryEffects = jest.fn().mockResolvedValue([{ item_id: 7, quantity: 2, location_id: 3 }]);
        const inventoryCommandService = {
            issueStockForPosSale: jest.fn().mockResolvedValue({ movement_id: 808 }),
            reverseParkedSaleGoodsIssue: jest.fn()
        };
        const useCase = buildCreatePosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects,
            inventoryCommandService
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: basePayload(),
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('parked');
        expect(result.data.idempotent_replay).toBe(false);
        expect(result.data.snapshot.lines[0]).not.toHaveProperty('manager_pin');
        expect(result.data.snapshot.lines[0].metadata).not.toHaveProperty('access_token');
        expect(harness.posRepository.createParkedSale).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'parked',
                shift_id: 41,
                cashier_id: 15,
                terminal_id: 'COUNTER-01',
                location_id: 3,
                line_count: 1,
                quantity_total: 2
            }),
            expect.objectContaining({ transaction: harness.transaction })
        );
        expect(inventoryCommandService.issueStockForPosSale).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 7,
            quantity: 2,
            movement_type: 'goods_issue',
            reference_type: 'POS_PARKED_SALE',
            reference_id: 'PARKED:101:1:1'
        }), 15, harness.transaction);
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            inventory_effects: [{ item_id: 7, quantity: 2, location_id: 3 }],
            inventory_deducted_at: expect.any(Date)
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
        expect(harness.transaction.commit).toHaveBeenCalledTimes(1);
        expect(harness.transaction.rollback).not.toHaveBeenCalled();
    });

    it('rolls back when inventory planning returns a malformed effect', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: jest.fn().mockResolvedValue([
                { item_id: 7, quantity: 2, location_id: null }
            ]),
            inventoryCommandService: harness.inventoryCommandService
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: basePayload(),
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'PARKED_SALE_INVENTORY_EFFECT_INVALID',
            effect_index: 0
        }));
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
        expect(harness.transaction.commit).not.toHaveBeenCalled();
        expect(harness.inventoryCommandService.issueStockForPosSale).not.toHaveBeenCalled();
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });

    it('replays the same idempotent park request without creating a duplicate', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: harness.resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });
        const first = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));
        const stored = first.data;
        harness.posRepository.findParkedSaleByIdempotencyKey.mockResolvedValue(stored);
        harness.posRepository.createParkedSale.mockClear();

        const replay = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));

        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(harness.posRepository.createParkedSale).not.toHaveBeenCalled();
    });

    it('parses MariaDB JSON text when listing parked sales', async () => {
        const snapshot = {
            order_method: 'dine_in',
            lines: [{ item_id: 7, item_name: 'Burger Meal', quantity: 1, sale_price: 150 }]
        };
        const harness = buildHarness({ parkedSales: [{
            pos_parked_sale_id: 101,
            park_reference: 'PARK-298577B413F6',
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            snapshot: JSON.stringify(snapshot),
            line_count: 0
        }] });
        const useCase = buildListPosParkedSalesUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            query: { shift_id: 41, location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.parked_sales[0]).toEqual(expect.objectContaining({
            line_count: 1,
            snapshot
        }));
    });

    it('lists the shared location queue for another cashier', async () => {
        const harness = buildHarness({
            parkedSales: [{
                pos_parked_sale_id: 101,
                status: 'parked',
                shift_id: 41,
                cashier_id: 15,
                location_id: 3,
                snapshot: JSON.stringify({ lines: [{ item_id: 7, quantity: 1 }] })
            }]
        });
        const useCase = buildListPosParkedSalesUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            query: { shift_id: 41, location_id: 3 },
            user: { user_id: 22 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.parked_sales).toHaveLength(1);
        expect(harness.posRepository.listParkedSales).toHaveBeenCalledWith(expect.objectContaining({
            locationId: 3,
            sharedLocation: true,
            statuses: ['parked', 'claimed', 'cancel_pending']
        }));
    });

    it('returns parsed MariaDB JSON text after claiming a parked sale', async () => {
        const snapshot = {
            lines: [{ item_id: 9, item_name: 'Chicken Frankie Roll', quantity: 1, sale_price: 150 }]
        };
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            snapshot: JSON.stringify(JSON.stringify(snapshot)),
            line_count: 1
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildClaimPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'claimed',
            line_count: 1,
            snapshot
        }));
    });

    it('rejects an idempotency key reused with a different snapshot', async () => {
        const harness = buildHarness({ parkedSale: { request_hash: 'different-hash' } });
        const useCase = buildCreatePosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: harness.resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: basePayload(),
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PARKED_SALE_IDEMPOTENCY_CONFLICT' }));
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('denies a cashier from another location from claiming a parked sale', async () => {
        const harness = buildHarness({ shift: { cashier_id: 22, location_id: 9 }, parkedSale: {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3
        } });
        const useCase = buildClaimPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 22 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PARKED_SALE_LOCATION_MISMATCH' }));
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });

    it('re-parks a sale after a reasoned original-line deletion and records the reason', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 1,
            inventory_deducted_at: new Date(),
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01',
            snapshot: {
                lines: [{
                    line_key: 'parked-line-1',
                    item_id: 7,
                    quantity: 1,
                    base_sale_price: 100,
                    sale_price: 100,
                    line_modifiers: []
                }]
            }
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildReparkPosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: harness.resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 1;
        payload.snapshot.lines = [{
            line_key: 'new-line-1',
            item_id: 8,
            quantity: 1,
            base_sale_price: 120,
            sale_price: 120,
            line_modifiers: []
        }];
        payload.removed_line_reasons = [{
            line_ref: 'parked-line-1',
            item_id: 7,
            reason: 'Customer removed item'
        }];

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload,
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(harness.posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_parked_sale_reparked',
            changes: expect.objectContaining({
                removed_line_reasons: [{
                    line_ref: 'parked-line-1',
                    item_id: 7,
                    reason: 'Customer removed item'
                }]
            })
        }), expect.objectContaining({ transaction: harness.transaction }));
    });

    it('re-parks a retained deleted catalog line after resume rebuilds its reference', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 1,
            inventory_deducted_at: new Date(),
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01',
            snapshot: {
                lines: [{
                    line_key: 'parked-line-deleted-catalog-item',
                    item_id: 104,
                    quantity: 1,
                    base_sale_price: 435,
                    sale_price: 435,
                    line_modifiers: []
                }]
            }
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildReparkPosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: harness.resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 1;
        payload.snapshot.lines = [{
            line_key: 'rebuilt-line-deleted-catalog-item',
            line_ref: 'rebuilt-ref-deleted-catalog-item',
            item_id: 104,
            quantity: 1,
            base_sale_price: 435,
            sale_price: 435,
            line_modifiers: []
        }];

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload,
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(harness.resolveInventoryEffects).toHaveBeenCalledWith(expect.objectContaining({
            parkedSaleId: 101,
            snapshot: expect.objectContaining({
                lines: [expect.objectContaining({
                    item_id: 104,
                    line_key: 'rebuilt-line-deleted-catalog-item'
                })]
            }),
            previousSnapshot: expect.objectContaining({
                lines: [expect.objectContaining({ item_id: 104 })]
            })
        }));
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            revision: 2,
            status: 'parked'
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
        expect(harness.inventoryCommandService.reverseParkedSaleGoodsIssue).toHaveBeenCalledWith({
            parked_sale_id: 101,
            reason: 'Re-park inventory reconciliation for parked sale 101'
        }, 15, harness.transaction);
    });

    it('allows another cashier in the same location to resume and own a parked sale', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            origin_shift_id: 41,
            origin_cashier_id: 15,
            location_id: 3,
            terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({
            shift: {
                cashier_id: 22,
                pos_terminal_shift_id: 42,
                terminal_id: 'COUNTER-02'
            },
            parkedSale
        });
        const useCase = buildClaimPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 42, terminal_id: 'COUNTER-02', location_id: 3 },
            user: { user_id: 22 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'claimed',
            cashier_id: 22,
            shift_id: 42,
            terminal_id: 'COUNTER-02',
            origin_cashier_id: 15,
            origin_shift_id: 41,
            claimed_by: 22
        }));
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            cashier_id: 22,
            shift_id: 42,
            terminal_id: 'COUNTER-02',
            claimed_by: 22,
            status: 'claimed'
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
    });

    it('requests Back Office cancellation approval with an auditable reason and leaves stock pending', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildCancelPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', reason: 'Customer changed order' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.pending).toBe(true);
        expect(result.data.parked_sale.status).toBe('cancel_pending');
        expect(result.data.approval_request).toEqual(expect.objectContaining({
            action_type: 'pos_parked_sale_cancel',
            reason: 'Customer changed order',
            status: 'pending'
        }));
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(
            101,
            expect.objectContaining({
                status: 'cancel_pending'
            }),
            expect.objectContaining({ transaction: harness.transaction, lock: true })
        );
        expect(harness.posRepository.createBusinessAdminApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({
            action_type: 'pos_parked_sale_cancel',
            reason: 'Customer changed order',
            status: 'pending'
        }), expect.objectContaining({ transaction: harness.transaction }));
    });

    it('updates the same claimed parked sale and increments its revision', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            park_reference: 'PARK-ABC123',
            status: 'claimed',
            revision: 2,
            inventory_deducted_at: new Date(),
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({ parkedSale });
        const resolveInventoryEffects = jest.fn().mockResolvedValue([{ item_id: 8, quantity: 1, location_id: 3 }]);
        const useCase = buildReparkPosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 2;

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload,
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            pos_parked_sale_id: 101,
            park_reference: 'PARK-ABC123',
            status: 'parked',
            revision: 3
        }));
        expect(harness.posRepository.createParkedSale).not.toHaveBeenCalled();
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            revision: 3,
            status: 'parked',
            claimed_by: null,
            line_count: 1
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
        expect(harness.inventoryCommandService.reverseParkedSaleGoodsIssue).toHaveBeenCalledWith({
            parked_sale_id: 101,
            reason: 'Re-park inventory reconciliation for parked sale 101'
        }, 15, harness.transaction);
        expect(harness.inventoryCommandService.issueStockForPosSale).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 8,
            quantity: 1,
            reference_type: 'POS_PARKED_SALE',
            reference_id: 'PARKED:101:3:1'
        }), 15, harness.transaction);
    });

    it('rejects a stale re-park revision without overwriting the parked sale', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 3,
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildReparkPosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: harness.resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 2;

        const result = await runInTenant(harness.sequelize, () => useCase({ parkedSaleId: 101, payload, user: { user_id: 15 } }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PARKED_SALE_REVISION_CONFLICT' }));
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });

    it('rejects re-parking when an original parked line is removed', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 1,
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01',
            snapshot: {
                lines: [{
                    line_key: 'parked-line-1',
                    item_id: 7,
                    quantity: 1,
                    base_sale_price: 100,
                    sale_price: 100,
                    line_modifiers: []
                }]
            }
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildReparkPosParkedSaleUseCase({
            posRepository: harness.posRepository,
            resolveInventoryEffects: harness.resolveInventoryEffects,
            inventoryCommandService: harness.inventoryCommandService
        });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 1;
        payload.snapshot.lines = [{
            line_key: 'replacement-line',
            item_id: 8,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            line_modifiers: []
        }];

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload,
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'PARKED_SALE_ORIGINAL_LINE_REMOVED'
        }));
        expect(harness.inventoryCommandService.reverseParkedSaleGoodsIssue).not.toHaveBeenCalled();
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });

    it('completes a claimed parked sale inside the checkout transaction', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 1,
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildCompleteClaimedPosParkedSaleUseCase({ posRepository: harness.posRepository });

        await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 },
            user: { user_id: 15 },
            transactionId: 9001,
            transaction: harness.transaction
        }));

        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            status: 'completed',
            completed_transaction_id: 9001
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
    });

    it('keeps cancellation restricted to the current parked-sale owner', async () => {
        const harness = buildHarness({
            shift: { cashier_id: 22, pos_terminal_shift_id: 42 },
            parkedSale: {
                pos_parked_sale_id: 101,
                status: 'parked',
                shift_id: 41,
                cashier_id: 15,
                location_id: 3
            }
        });
        const useCase = buildCancelPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 42, terminal_id: 'COUNTER-01', location_id: 3, reason: 'Customer cancelled order' },
            user: { user_id: 22 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PARKED_SALE_SCOPE_DENIED' }));
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });
});
