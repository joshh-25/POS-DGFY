import { jest } from '@jest/globals';
import { buildDispatchOrderToolRegistry } from '../src/modules/ai/usecases/toolHandlers/dispatchOrderToolRegistry.js';

describe('dispatchOrderToolRegistry', () => {
  it('query_dispatch_orders maps list and pagination payload', async () => {
    const registry = buildDispatchOrderToolRegistry({
      dispatchOrderService: {
        getDispatchOrders: jest.fn().mockResolvedValue({
          dispatchOrders: [
            {
              do_id: 1,
              do_number: 'DO-001',
              status: 'pending',
              recipient_name: 'Store A',
              recipient_type: 'branch',
              dispatch_date: '2026-03-04',
              created_at: '2026-03-04T00:00:00.000Z',
              lines: [{}, {}]
            }
          ],
          pagination: {
            page: 1,
            totalPages: 1,
            totalRecords: 1
          }
        })
      }
    });

    const result = await registry.query_dispatch_orders({ args: { status: 'pending' } });

    expect(result).toEqual({
      count: 1,
      pagination: {
        page: 1,
        totalPages: 1,
        totalRecords: 1
      },
      dispatch_orders: [
        {
          do_id: 1,
          do_number: 'DO-001',
          status: 'pending',
          recipient_name: 'Store A',
          recipient_type: 'branch',
          dispatch_date: '2026-03-04',
          lines_count: 2,
          created_at: '2026-03-04T00:00:00.000Z'
        }
      ]
    });
  });

  it('get_dispatch_order_details maps line remaining quantities and movement timestamp fallback', async () => {
    const registry = buildDispatchOrderToolRegistry({
      dispatchOrderService: {
        getDispatchOrderById: jest.fn().mockResolvedValue({
          do_id: 5,
          do_number: 'DO-005',
          status: 'confirmed',
          recipient_name: 'Store B',
          recipient_type: 'branch',
          dispatch_date: '2026-03-05',
          notes: 'Priority',
          lines: [
            {
              line_id: 10,
              item_id: 200,
              qty_ordered: '10',
              qty_dispatched: '12',
              qty_voided: '1',
              item: { name: 'Sugar', unit_of_measure: 'kg' }
            }
          ],
          movements: [
            {
              movement_id: 901,
              movement_type: 'dispatch',
              quantity: 4,
              reference_id: 5,
              timestamp: '2026-03-05T08:00:00.000Z'
            }
          ]
        })
      }
    });

    const result = await registry.get_dispatch_order_details({ args: { do_id: 5 } });

    expect(result.lines[0]).toEqual({
      line_id: 10,
      item_id: 200,
      item_name: 'Sugar',
      qty_ordered: '10',
      qty_dispatched: '12',
      qty_voided: '1',
      qty_remaining: 0,
      unit_of_measure: 'kg'
    });
    expect(result.movements[0].created_at).toBe('2026-03-05T08:00:00.000Z');
  });

  it('create/confirm/dispatch/cancel handlers call service with acting user id', async () => {
    const dispatchOrderService = {
      createDispatchOrder: jest.fn().mockResolvedValue({ do_id: 3, do_number: 'DO-003', status: 'draft' }),
      confirmDispatchOrder: jest.fn().mockResolvedValue({ do_id: 3, do_number: 'DO-003', status: 'confirmed' }),
      dispatchLines: jest.fn().mockResolvedValue({ do_id: 3, do_number: 'DO-003', status: 'dispatched' }),
      cancelDispatchOrder: jest.fn().mockResolvedValue({ do_id: 3, do_number: 'DO-003', status: 'cancelled' })
    };

    const registry = buildDispatchOrderToolRegistry({ dispatchOrderService });
    const user = { user_id: 88 };

    const created = await registry.create_dispatch_order({
      args: {
        recipient_name: 'Store C',
        recipient_type: 'branch',
        dispatch_date: '2026-03-06',
        reference_jo: null,
        notes: 'rush',
        lines: [{ item_id: 1, qty_ordered: 5 }]
      },
      user
    });
    const confirmed = await registry.confirm_dispatch_order({ args: { do_id: 3 }, user });
    const dispatched = await registry.dispatch_items({ args: { do_id: 3, lines: [{ line_id: 1, qty: 5 }] }, user });
    const cancelled = await registry.cancel_dispatch_order({ args: { do_id: 3, reason: 'rejected' }, user });

    expect(dispatchOrderService.createDispatchOrder).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_name: 'Store C' }),
      88
    );
    expect(dispatchOrderService.confirmDispatchOrder).toHaveBeenCalledWith(3, 88);
    expect(dispatchOrderService.dispatchLines).toHaveBeenCalledWith(3, [{ line_id: 1, qty: 5 }], 88);
    expect(dispatchOrderService.cancelDispatchOrder).toHaveBeenCalledWith(3, 88, 'rejected');

    expect(created.status).toBe('draft');
    expect(confirmed.status).toBe('confirmed');
    expect(dispatched.status).toBe('dispatched');
    expect(cancelled.status).toBe('cancelled');
  });
});
