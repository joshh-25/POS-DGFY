import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';
import dbStore from '../src/utils/dbStore.js';

const buildModel = () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    count: jest.fn()
});

afterEach(() => jest.restoreAllMocks());

describe('parked sale repository contract', () => {
    it('uses the tenant parked-sale model for idempotency lookup and list scoping', async () => {
        const model = buildModel();
        model.findOne.mockResolvedValue({ pos_parked_sale_id: 9 });
        model.findAll.mockResolvedValue([{ toJSON: () => ({ pos_parked_sale_id: 8 }) }]);
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosParkedSale') return model;
            throw new Error(`Unexpected model ${name}`);
        });

        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const found = await posRepository.findParkedSaleByIdempotencyKey('park-key', { transaction, lock: true });
        const listed = await posRepository.listParkedSales({
            shiftId: 41,
            cashierId: 15,
            locationId: 3,
            statuses: ['parked', 'claimed'],
            limit: 25
        }, { transaction });

        expect(found).toEqual({ pos_parked_sale_id: 9 });
        expect(model.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { idempotency_key: 'park-key' },
            transaction,
            lock: 'UPDATE'
        }));
        expect(listed).toEqual([{ pos_parked_sale_id: 8 }]);
        expect(model.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                shift_id: 41,
                cashier_id: 15,
                location_id: 3,
                status: expect.objectContaining({})
            }),
            limit: 25,
            transaction
        }));
    });

    it('returns the existing row on an idempotent unique-key race', async () => {
        const model = buildModel();
        const uniqueError = new Error('duplicate');
        uniqueError.name = 'SequelizeUniqueConstraintError';
        model.create.mockRejectedValue(uniqueError);
        model.findOne.mockResolvedValue({ toJSON: () => ({ pos_parked_sale_id: 77, status: 'parked' }) });
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosParkedSale') return model;
            throw new Error(`Unexpected model ${name}`);
        });

        const row = await posRepository.createParkedSale({ idempotency_key: 'park-key' }, { transaction: { id: 'tx-1' } });

        expect(row).toEqual({ pos_parked_sale_id: 77, status: 'parked' });
        expect(model.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { idempotency_key: 'park-key' },
            transaction: { id: 'tx-1' }
        }));
    });

    it('updates and counts only active parked-sale lifecycle rows', async () => {
        const model = buildModel();
        const row = {
            update: jest.fn(async () => undefined),
            toJSON: () => ({ pos_parked_sale_id: 77, status: 'cancelled' })
        };
        model.findByPk.mockResolvedValue(row);
        model.count.mockResolvedValue(2);
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosParkedSale') return model;
            throw new Error(`Unexpected model ${name}`);
        });

        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const updated = await posRepository.updateParkedSale(77, { status: 'cancelled' }, { transaction, lock: true });
        const count = await posRepository.countActiveParkedSalesForShift(41, { transaction });

        expect(updated).toEqual({ pos_parked_sale_id: 77, status: 'cancelled' });
        expect(row.update).toHaveBeenCalledWith({ status: 'cancelled' }, { transaction });
        expect(count).toBe(2);
        expect(model.count).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ shift_id: 41, status: expect.objectContaining({}) }),
            transaction
        }));
    });
});
