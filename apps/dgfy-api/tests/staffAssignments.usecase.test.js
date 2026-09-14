import { describe, expect, it, afterEach, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildGetStaffAssignmentsUseCase } from '../src/modules/staff/usecases/staffCapabilityUseCases.js';

describe('staff assignment delivery-job projection', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns only the additive public-safe delivery_jobs projection for assigned capability', async () => {
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return { findByPk: jest.fn().mockResolvedValue({ user_id: 7, is_master_admin: true }) };
      if (name === 'DeliveryPersonnel') return { findOne: jest.fn().mockResolvedValue({ delivery_personnel_id: 21 }) };
      throw new Error(`unexpected model ${name}`);
    });
    const repository = {
      findDeliveryPersonnelForUser: jest.fn().mockResolvedValue({ delivery_personnel_id: 21 }),
      listRunsFromPersonnel: jest.fn().mockResolvedValue([]),
      listAssignedOrders: jest.fn().mockResolvedValue([]),
      listAssignedDeliveryJobs: jest.fn().mockResolvedValue([{
        delivery_job_id: 17,
        pos_transaction_id: 44,
        delivery_run_id: null,
        provider: 'manual',
        status: 'assigned',
        delivery_personnel_id: 21,
        assigned_at: '2026-09-14T00:00:00.000Z',
        provider_payload: { secret: 'must not escape' },
        transaction: {
          pos_transaction_id: 44,
          invoice_number: 'INV-44',
          location_id: 9,
          customer_name: 'Customer',
          delivery_address: 'Address',
          total_amount: '100.00',
          fulfillment_status: 'out_for_delivery',
          order_method: 'delivery',
          order_source: 'online_store'
        }
      }])
    };
    const result = await buildGetStaffAssignmentsUseCase({ repository })({
      user: { user_id: 7, permissions: ['delivery_runs:act'] },
      locationId: 9
    });
    expect(result.success).toBe(true);
    expect(result.data.delivery_jobs).toHaveLength(1);
    expect(result.data.delivery_jobs[0]).toMatchObject({ delivery_job_id: 17, delivery_run_id: null, order: { invoice_number: 'INV-44' } });
    expect(result.data.delivery_jobs[0]).not.toHaveProperty('provider_payload');
    expect(repository.listAssignedDeliveryJobs).toHaveBeenCalledWith({ deliveryPersonnelId: 21, locationId: 9 });
  });

  it('does not broaden delivery-job discovery when location is absent', async () => {
    const repository = {
      findDeliveryPersonnelForUser: jest.fn().mockResolvedValue({ delivery_personnel_id: 21 }),
      listRunsFromPersonnel: jest.fn().mockResolvedValue([]),
      listAssignedOrders: jest.fn(),
      listAssignedDeliveryJobs: jest.fn()
    };
    const result = await buildGetStaffAssignmentsUseCase({ repository })({
      user: { user_id: 7, permissions: ['delivery_runs:act'] }
    });
    expect(result.success).toBe(true);
    expect(result.data.delivery_jobs).toEqual([]);
    expect(repository.listAssignedDeliveryJobs).not.toHaveBeenCalled();
  });
});
