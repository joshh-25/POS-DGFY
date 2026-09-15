import { jest } from '@jest/globals';
import { buildInventoryReservationService } from '../src/modules/inventory/services/inventoryReservationService.js';
import { buildListStoreCatalogUseCase } from '../src/modules/store/usecases/storeUseCases.js';
import { MULTI_LOCATION_OPERATION_MATRIX } from '../src/modules/inventory/services/multiLocationInventoryReadiness.js';

const getInValues = (where = {}) => {
    const inOperator = Object.getOwnPropertySymbols(where).find((symbol) => String(symbol) === 'Symbol(in)');
    const values = inOperator ? where[inOperator] : [];
    return Array.isArray(values) ? values.map((value) => Number(value)) : [];
};

const buildBranchAwareReservationModels = ({ stock = [] } = {}) => {
    const reservations = [];
    const lines = [];
    let nextReservationId = 1;

    const InventoryReservation = {
        update: jest.fn(async () => undefined),
        findOne: jest.fn(async ({ where }) => reservations.find((row) => (
            row.source_type === where.source_type && Number(row.source_id) === Number(where.source_id)
        )) || null),
        create: jest.fn(async (payload) => {
            const row = {
                ...payload,
                inventory_reservation_id: nextReservationId++,
                update: jest.fn(async (changes) => Object.assign(row, changes))
            };
            reservations.push(row);
            return row;
        }),
        _rows: reservations
    };

    const InventoryReservationLine = {
        findAll: jest.fn(async ({ where, include }) => {
            const itemIds = getInValues(where?.item_id);
            const reservationScope = include?.[0]?.where || {};
            const locationId = Number(reservationScope.location_id);
            return lines.filter((line) => {
                const reservation = reservations.find((candidate) => (
                    candidate.inventory_reservation_id === line.inventory_reservation_id
                ));
                return itemIds.includes(Number(line.item_id))
                    && reservation?.source_type === 'online_order'
                    && reservation.status === 'active'
                    && Number(reservation.location_id) === locationId
                    && new Date(reservation.expires_at).getTime() > Date.now();
            });
        }),
        bulkCreate: jest.fn(async (rows) => {
            lines.push(...rows);
            return rows;
        })
    };

    const ItemLocationStock = {
        findAll: jest.fn(async ({ where }) => stock.filter((row) => (
            Number(row.location_id) === Number(where.location_id)
                && getInValues(where.item_id).includes(Number(row.item_id))
        )))
    };

    return { InventoryReservation, InventoryReservationLine, ItemLocationStock };
};

describe('Phase 340 branch isolation acceptance contracts', () => {
    it('keeps online reservations independent per branch and releases/ converts the right hold', async () => {
        const models = buildBranchAwareReservationModels({
            stock: [
                { item_id: 10, location_id: 1, quantity_on_hand: 5 },
                { item_id: 10, location_id: 2, quantity_on_hand: 2 }
            ]
        });
        const service = buildInventoryReservationService({ resolveModels: () => models });

        const mainReservation = await service.reserveOnlineOrderInventory({
            sourceId: 1001,
            locationId: 1,
            effects: [{ item_id: 10, quantity: 4, effect_type: 'line_item' }],
            transaction: { LOCK: { UPDATE: 'UPDATE' } }
        });
        const spacebarReservation = await service.reserveOnlineOrderInventory({
            sourceId: 1002,
            locationId: 2,
            effects: [{ item_id: 10, quantity: 2, effect_type: 'line_item' }],
            transaction: { LOCK: { UPDATE: 'UPDATE' } }
        });

        expect(mainReservation.status).toBe('active');
        expect(spacebarReservation.status).toBe('active');
        await expect(service.reserveOnlineOrderInventory({
            sourceId: 1003,
            locationId: 2,
            effects: [{ item_id: 10, quantity: 1, effect_type: 'line_item' }],
            transaction: { LOCK: { UPDATE: 'UPDATE' } }
        })).rejects.toMatchObject({
            details: expect.objectContaining({
                reason_code: 'ONLINE_STOCK_RESERVATION_SHORTFALL',
                location_id: 2,
                stock_violations: [expect.objectContaining({
                    item_id: 10,
                    available_stock: 0,
                    requested_qty: 1
                })]
            })
        });

        expect(await service.releaseOnlineOrderInventory({
            sourceId: 1001,
            transaction: { LOCK: { UPDATE: 'UPDATE' } },
            reason: 'cancelled'
        })).toEqual(expect.objectContaining({ status: 'released' }));
        expect(await service.convertOnlineOrderInventory({
            sourceId: 1002,
            transaction: { LOCK: { UPDATE: 'UPDATE' } }
        })).toEqual(expect.objectContaining({ status: 'converted' }));

        const replay = await service.reserveOnlineOrderInventory({
            sourceId: 1002,
            locationId: 2,
            effects: [{ item_id: 10, quantity: 2, effect_type: 'line_item' }],
            transaction: { LOCK: { UPDATE: 'UPDATE' } }
        });
        expect(replay.status).toBe('converted');
        expect(models.InventoryReservation.create).toHaveBeenCalledTimes(2);
    });

    it('passes the selected branch through the Storefront catalog contract', async () => {
        const listStoreCatalog = jest.fn().mockResolvedValue([]);
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: { listStoreCatalog },
            resolveWorkflowCapabilitySettings: jest.fn().mockResolvedValue({
                mode: 'retail',
                enabledCapabilities: []
            })
        });

        const result = await useCase({ query: { location_id: 2, limit: 20 } });

        expect(result.success).toBe(true);
        expect(listStoreCatalog).toHaveBeenCalledWith(expect.objectContaining({
            location_id: 2,
            limit: 20
        }));
    });

    it('keeps the operation matrix location-scoped for checkout, reservation, and reversal paths', () => {
        const byId = new Map(MULTI_LOCATION_OPERATION_MATRIX.map((entry) => [entry.id, entry]));
        expect(byId.get('pos_sale_issue')).toEqual(expect.objectContaining({
            destination_location: 'active shift.location_id',
            aggregate_effect: expect.stringContaining('sum of location balances')
        }));
        expect(byId.get('online_order_reservation')).toEqual(expect.objectContaining({
            destination_location: 'order.location_id',
            ledger_effect: expect.stringContaining('order location')
        }));
        expect(byId.get('movement_void_or_sale_reversal')).toEqual(expect.objectContaining({
            location: expect.stringContaining('original movement or transaction location')
        }));
    });
});
