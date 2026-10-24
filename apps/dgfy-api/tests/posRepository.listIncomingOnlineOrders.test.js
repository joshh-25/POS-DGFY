import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';
import { ACTIVE_FULFILLMENT_STATUSES, TERMINAL_FULFILLMENT_STATUSES } from '../src/modules/shared/constants/orderFulfillmentStatuses.js';

describe('incoming online order visibility', () => {
  afterEach(() => jest.restoreAllMocks());

  it('queries every active status and preserves location scope', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    jest.spyOn(dbStore, 'get').mockImplementation((name) => name === 'PosTransaction' ? { findAll } : {});
    await posRepository.listIncomingOnlineOrders({ locationId: 7 });
    const where = findAll.mock.calls[0][0].where;
    expect(where.order_source).toBe('online_store');
    expect(where.location_id).toBe(7);
    expect(where.fulfillment_status[Op.in]).toEqual(ACTIVE_FULFILLMENT_STATUSES);
    expect(where.fulfillment_status[Op.in]).toContain('ready_for_rider');
    TERMINAL_FULFILLMENT_STATUSES.forEach((status) => expect(where.fulfillment_status[Op.in]).not.toContain(status));
  });
});
