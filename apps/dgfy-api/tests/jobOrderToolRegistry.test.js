import { jest } from '@jest/globals';
import { buildJobOrderToolRegistry } from '../src/modules/ai/usecases/toolHandlers/jobOrderToolRegistry.js';

describe('jobOrderToolRegistry', () => {
  it('get_job_orders maps service rows into AI payload', async () => {
    const registry = buildJobOrderToolRegistry({
      jobOrderService: {
        getJobOrders: jest.fn().mockResolvedValue([
          {
            jo_id: 9,
            jo_number: 'JO-009',
            quantity_to_produce: 100,
            quantity_produced: 25,
            status: 'in_progress',
            Product: { name: 'Bread' },
            ResponsibleUser: { username: 'manager1' }
          }
        ])
      },
      itemService: {},
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    const result = await registry.get_job_orders({ args: { status: 'in_progress' } });

    expect(result).toEqual({
      count: 1,
      job_orders: [
        {
          jo_id: 9,
          jo_number: 'JO-009',
          product_name: 'Bread',
          quantity_to_produce: 100,
          quantity_produced: 25,
          status: 'in_progress',
          responsible_user: 'manager1'
        }
      ]
    });
  });

  it('create_job_order auto-populates ingredients from product recipe when missing', async () => {
    const createJobOrder = jest.fn().mockResolvedValue({
      jo_id: 12,
      jo_number: 'JO-012',
      quantity_to_produce: 5,
      ingredientsReserved: 2
    });

    const getItemById = jest
      .fn()
      .mockResolvedValueOnce({
        name: 'Cake',
        ingredients: [
          { item_id: 101, quantity: '2', unit_of_measure: 'kg' },
          { item_id: 102, quantity: '0.5', unit_of_measure: 'kg' }
        ]
      })
      .mockResolvedValueOnce({
        name: 'Cake'
      });

    const registry = buildJobOrderToolRegistry({
      jobOrderService: { createJobOrder },
      itemService: { getItemById },
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    const result = await registry.create_job_order({
      args: {
        product_id: 50,
        quantity_to_produce: 5,
        notes: 'rush'
      },
      user: { user_id: 7 }
    });

    expect(createJobOrder).toHaveBeenCalledWith(
      {
        product_id: 50,
        quantity_to_produce: 5,
        notes: 'rush',
        status: 'in_progress',
        ingredients: [
          { item_id: 101, quantity_required: 10, unit_of_measure: 'kg' },
          { item_id: 102, quantity_required: 2.5, unit_of_measure: 'kg' }
        ]
      },
      7
    );

    expect(result.details.Product).toBe('Cake');
    expect(result.jo_number).toBe('JO-012');
  });

  it('complete_job_order calls service and returns completion payload', async () => {
    const completeJobOrder = jest.fn().mockResolvedValue({
      batchId: 44,
      ingredientsConsumed: 3
    });

    const registry = buildJobOrderToolRegistry({
      jobOrderService: { completeJobOrder },
      itemService: {},
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    const result = await registry.complete_job_order({
      args: {
        jo_id: 12,
        quantity_produced: 5,
        expiry_date: '2026-04-01',
        source_location_id: 3,
        destination_location_id: 4
      },
      user: { user_id: 9 }
    });

    expect(completeJobOrder).toHaveBeenCalledWith(12, 9, '2026-04-01', null, 5, null, 3, 4);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        jo_id: 12,
        quantity_produced: 5,
        batch_created: 44,
        ingredients_consumed: 3
      })
    );
  });

  it('complete_job_order rejects missing location fields', async () => {
    const completeJobOrder = jest.fn();
    const registry = buildJobOrderToolRegistry({
      jobOrderService: { completeJobOrder },
      itemService: {},
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    await expect(registry.complete_job_order({
      args: {
        jo_id: 12,
        quantity_produced: 5
      },
      user: { user_id: 9 }
    })).rejects.toMatchObject({
      message: 'source_location_id and destination_location_id are required and must be positive integers',
      statusCode: 422
    });

    expect(completeJobOrder).not.toHaveBeenCalled();
  });

  it('complete_job_order rejects same source and destination location', async () => {
    const completeJobOrder = jest.fn();
    const registry = buildJobOrderToolRegistry({
      jobOrderService: { completeJobOrder },
      itemService: {},
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    await expect(registry.complete_job_order({
      args: {
        jo_id: 12,
        quantity_produced: 5,
        source_location_id: 3,
        destination_location_id: 3
      },
      user: { user_id: 9 }
    })).rejects.toMatchObject({
      message: 'source_location_id and destination_location_id must be different',
      statusCode: 422
    });

    expect(completeJobOrder).not.toHaveBeenCalled();
  });
});
