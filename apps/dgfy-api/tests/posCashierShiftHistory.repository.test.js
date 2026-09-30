import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';

describe('POS cashier shift history repository scope', () => {
    let PosTerminalShift;

    beforeEach(() => {
        PosTerminalShift = {
            findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 })
        };
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosTerminalShift') return PosTerminalShift;
            return { modelName: name };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('uses an allowlisted location IN predicate for company scope', async () => {
        await posRepository.listCashierShiftHistory({
            locationIds: [9, 12, 12],
            dateFrom: '2026-09-01',
            dateTo: '2026-09-28',
            status: 'closed',
            page: 2,
            limit: 50
        });

        const options = PosTerminalShift.findAndCountAll.mock.calls[0][0];
        expect(options.where.location_id).toEqual({ [Op.in]: [9, 12] });
        expect(options.where).not.toHaveProperty('cashier_id');
        expect(options.where.status).toBe('closed');
        expect(options.where.business_date).toEqual(expect.objectContaining({
            [Op.gte]: '2026-09-01',
            [Op.lte]: '2026-09-28'
        }));
        expect(options.limit).toBe(50);
        expect(options.offset).toBe(50);
        expect(options.order).toEqual([
            ['business_date', 'DESC'],
            ['opened_at', 'DESC'],
            ['pos_terminal_shift_id', 'DESC']
        ]);
    });

    it('preserves own-mode cashier and single-location predicates', async () => {
        await posRepository.listCashierShiftHistory({
            cashierId: 7,
            locationId: 9,
            page: 1,
            limit: 10
        });

        const options = PosTerminalShift.findAndCountAll.mock.calls[0][0];
        expect(options.where).toEqual(expect.objectContaining({
            cashier_id: 7,
            location_id: 9
        }));
    });

    it('rejects an unscoped broad query instead of reading the tenant unbounded', async () => {
        await expect(posRepository.listCashierShiftHistory({})).rejects.toThrow(
            'Cashier shift history requires an authenticated cashier or an authorized location scope'
        );
        expect(PosTerminalShift.findAndCountAll).not.toHaveBeenCalled();
    });
});
