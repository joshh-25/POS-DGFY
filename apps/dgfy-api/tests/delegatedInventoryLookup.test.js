import { describe, expect, it, jest } from '@jest/globals';
import { manualDelegatedInventoryProvider } from '../src/modules/inventory/integrations/manualDelegatedInventoryProvider.js';
import { buildLookupDelegatedInventoryLevelUseCase } from '../src/modules/inventory/usecases/lookupDelegatedInventoryLevelUseCase.js';
import {
    assertDelegatedInventoryProviderContract,
    DelegatedInventoryProviderContract
} from '../src/modules/inventory/contracts/delegatedInventoryProvider.contract.js';
import { assertStockCommandServiceContract } from '../src/modules/inventory/contracts/stockCommandService.contract.js';
import * as stockCommandService from '../src/modules/inventory/commands/stockCommandService.js';
import { buildReceivePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/receivePurchaseOrderUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

describe('delegated inventory level lookup (Phase 9 external_ims read-side port)', () => {
    it('normalizes provider results and caches successful lookups', async () => {
        const delegatedInventoryProvider = {
            name: 'test_ims',
            lookupStockLevel: jest.fn().mockResolvedValue({
                found: true,
                provider: 'test_ims',
                quantity_on_hand: 42
            })
        };
        const cache = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined)
        };
        const lookup = buildLookupDelegatedInventoryLevelUseCase({ delegatedInventoryProvider, cache });

        const result = await lookup({ skuCode: 'SKU-001' });

        expect(result).toEqual(expect.objectContaining({
            found: true,
            quantity_on_hand: 42,
            sku_code: 'SKU-001'
        }));
        expect(delegatedInventoryProvider.lookupStockLevel).toHaveBeenCalledWith('SKU-001');
        expect(cache.set).toHaveBeenCalledWith(
            'delegated-inventory-level:test_ims:SKU-001',
            expect.any(String),
            60
        );
    });

    it('serves a cached result without calling the provider again', async () => {
        const delegatedInventoryProvider = {
            name: 'test_ims',
            lookupStockLevel: jest.fn()
        };
        const cache = {
            get: jest.fn().mockResolvedValue(JSON.stringify({ found: true, quantity_on_hand: 7, sku_code: 'SKU-002' })),
            set: jest.fn()
        };
        const lookup = buildLookupDelegatedInventoryLevelUseCase({ delegatedInventoryProvider, cache });

        const result = await lookup({ skuCode: 'SKU-002' });

        expect(result).toEqual(expect.objectContaining({ quantity_on_hand: 7 }));
        expect(delegatedInventoryProvider.lookupStockLevel).not.toHaveBeenCalled();
    });

    it('rejects blank/missing skuCode before calling the provider', async () => {
        const delegatedInventoryProvider = {
            name: 'test_ims',
            lookupStockLevel: jest.fn()
        };
        const lookup = buildLookupDelegatedInventoryLevelUseCase({ delegatedInventoryProvider });

        await expect(lookup({ skuCode: '   ' })).rejects.toMatchObject({ statusCode: 422 });
        expect(delegatedInventoryProvider.lookupStockLevel).not.toHaveBeenCalled();
    });

    it('maps provider timeouts to a safe service error, pointing back at the local mirror', async () => {
        const timeoutError = new Error('timed out');
        timeoutError.name = 'AbortError';
        const lookup = buildLookupDelegatedInventoryLevelUseCase({
            delegatedInventoryProvider: {
                name: 'test_ims',
                lookupStockLevel: jest.fn().mockRejectedValue(timeoutError)
            }
        });

        await expect(lookup({ skuCode: 'SKU-003' })).rejects.toMatchObject({
            details: { reason_code: 'DELEGATED_INVENTORY_PROVIDER_TIMEOUT' }
        });
    });

    it('maps other provider failures to a generic unavailable error', async () => {
        const lookup = buildLookupDelegatedInventoryLevelUseCase({
            delegatedInventoryProvider: {
                name: 'test_ims',
                lookupStockLevel: jest.fn().mockRejectedValue(new Error('connection refused'))
            }
        });

        await expect(lookup({ skuCode: 'SKU-004' })).rejects.toMatchObject({
            details: { reason_code: 'DELEGATED_INVENTORY_PROVIDER_UNAVAILABLE' }
        });
    });

    it('the manual/no-op default provider always reports not-found without throwing', async () => {
        expect(() => assertDelegatedInventoryProviderContract(manualDelegatedInventoryProvider)).not.toThrow();

        const result = await manualDelegatedInventoryProvider.lookupStockLevel('SKU-005');

        expect(result).toEqual(expect.objectContaining({
            found: false,
            provider: 'manual_entry',
            quantity_on_hand: null
        }));
    });

    it('assertDelegatedInventoryProviderContract fails loudly for an incomplete provider', () => {
        expect(() => assertDelegatedInventoryProviderContract({})).toThrow(
            `DelegatedInventoryProvider missing required method: ${DelegatedInventoryProviderContract[0]}`
        );
    });
});

describe('stock command service contract (Phase 9 fail-closed proof, ties back to work item 3)', () => {
    it('the real stockCommandService module satisfies its own contract', () => {
        expect(() => assertStockCommandServiceContract(stockCommandService, {
            requiredCommands: ['receivePurchasedStock', 'issueStockForPosSale']
        })).not.toThrow();
    });

    it('assertStockCommandServiceContract fails loudly for a mis-wired (incomplete) service', () => {
        expect(() => assertStockCommandServiceContract({ createStockMovement: () => {} }, {
            requiredCommands: ['receivePurchasedStock']
        })).toThrow('StockCommandService missing required method: receivePurchasedStock');

        expect(() => assertStockCommandServiceContract(null)).toThrow(
            'StockCommandService missing required method: createStockMovement'
        );
    });

    it('a mis-wired purchase-order-receiving container fails closed instead of silently writing locally', async () => {
        // This is the regression this phase closes: buildReceivePurchaseOrderUseCase
        // used to default `inventoryCommandService` to a direct import of
        // receivePurchasedStock from inventory/commands/stockCommandService.js
        // when the caller omitted it. A container that fails to wire the port
        // must now get a loud, typed 409 - never a silent local write.
        const getPurchaseOrderById = jest.fn();
        const useCase = buildReceivePurchaseOrderUseCase({
            purchaseOrderRepository: { getPurchaseOrderById }
        });

        const result = await dbStore.run({}, () => useCase({
            poId: 7,
            userId: 1,
            receiptData: { location_id: 1, line_items: [{ line_item_id: 1, quantity_received: 1 }] }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.details).toMatchObject({ reason_code: 'INVENTORY_COMMAND_PORT_UNWIRED' });
        expect(getPurchaseOrderById).not.toHaveBeenCalled();
    });
});
