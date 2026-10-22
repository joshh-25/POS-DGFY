import { Sequelize } from 'sequelize';
import { jest } from '@jest/globals';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import {
  ONLINE_FULFILLMENT_STATUSES,
  ACTIVE_FULFILLMENT_STATUSES,
  TERMINAL_FULFILLMENT_STATUSES
} from '../src/modules/shared/constants/orderFulfillmentStatuses.js';
import { validateStoreOrderHistoryQuery } from '../src/validators/storeValidator.js';
import { buildListBusinessAdminOrdersUseCase } from '../src/modules/businessAdmin/usecases/businessAdminOrderCenterUseCase.js';

const validateStoreStatus = (status) => {
  const req = { query: { fulfillment_status: status } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  validateStoreOrderHistoryQuery(req, res, next);
  return { req, res, next };
};

describe('online fulfillment vocabulary guard', () => {
  it('matches the persisted enum and derives every non-terminal status', async () => {
    const sequelize = new Sequelize('fulfillment_status_contract', 'root', '', { dialect: 'mysql', logging: false });
    try {
      const models = getTenantModels(sequelize);
      expect(models.PosTransaction.rawAttributes.fulfillment_status.values).toEqual([...ONLINE_FULFILLMENT_STATUSES]);
    } finally {
      await sequelize.close();
    }
    expect(ACTIVE_FULFILLMENT_STATUSES).toEqual(ONLINE_FULFILLMENT_STATUSES.filter((status) => !TERMINAL_FULFILLMENT_STATUSES.includes(status)));
    expect(ACTIVE_FULFILLMENT_STATUSES).toContain('ready_for_rider');
  });

  it.each(ONLINE_FULFILLMENT_STATUSES)('accepts %s in store and business-admin filters', async (status) => {
    const { req, res, next } = validateStoreStatus(status);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedQuery.fulfillment_status).toBe(status);

    const listOrders = jest.fn().mockResolvedValue({ orders: [] });
    const useCase = buildListBusinessAdminOrdersUseCase({
      businessAdminOrderCenterRepository: { listOrders },
      businessAdminOverviewRepository: { listUserLocationGrantIds: jest.fn().mockResolvedValue([7]) }
    });
    const result = await useCase({ query: { fulfillment_status: status }, user: { user_id: 12, role: 'admin' } });
    expect(result.success).toBe(true);
    expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.objectContaining({ fulfillmentStatus: status }) }));
  });
});
