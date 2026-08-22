import { jest } from '@jest/globals';
import {
  buildStoreCheckoutUseCase,
  buildCancelStoreOrderUseCase
} from '../src/modules/store/usecases/storeUseCases.js';

const makeTransaction = () => ({
  finished: false,
  LOCK: { UPDATE: 'UPDATE' },
  commit: jest.fn(async function commit() { this.finished = true; }),
  rollback: jest.fn(async function rollback() { this.finished = true; })
});

describe('storefront inventory reservation integration', () => {
  it('reserves direct online stock inside the checkout transaction', async () => {
    const transaction = makeTransaction();
    const reservationService = {
      reserveOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'active' })
    };
    const repository = {
      beginTransaction: jest.fn().mockResolvedValue(transaction),
      findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findLocationById: jest.fn().mockResolvedValue({
        location_id: 4,
        name: 'Main',
        is_active: true,
        is_open: true,
        supports_pickup: true,
        supports_delivery: true,
        supports_dine_in: true,
        allow_out_of_stock_sales: false
      }),
      getSettingsByKeys: jest.fn().mockResolvedValue([
        { setting_key: 'customer_access_mode', setting_value: '"transaction"' },
        { setting_key: 'tenant_onboarding_progress', setting_value: '{"classification_snapshot":{"payload":{"legitimacy":{"registration_status":"registered"}}}}' }
      ]),
      findSellableItemsByIds: jest.fn().mockResolvedValue([{
        item_id: 20,
        name: 'Burger',
        category: 'finished_good',
        unit_of_measure: 'each',
        current_stock: 5,
        default_sale_price: 100,
        cost_per_unit: 40,
        vat_type: 'vatable'
      }]),
      listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
      isTrackingPinTaken: jest.fn().mockResolvedValue(false),
      nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000001'),
      createOnlineTransactionWithLines: jest.fn().mockResolvedValue(700),
      getOrderById: jest.fn().mockResolvedValue({
        pos_transaction_id: 700,
        tracking_pin: 'SK-RESERVE1',
        invoice_number: 'INV-000001',
        order_source: 'online_store',
        order_method: 'pickup',
        fulfillment_status: 'placed',
        status: 'completed',
        total_amount: 200,
        lines: []
      })
    };
    const useCase = buildStoreCheckoutUseCase({
      storeRepository: repository,
      revenueSharingEnabled: false,
      inventoryReservationService: reservationService
    });

    const result = await useCase({
      tenantId: '11111111-1111-4111-8111-111111111111',
      storeCustomer: {
        customer_id: 55,
        dgfy_account_id: 'dgfy-55',
        name: 'Customer',
        email: 'customer@example.test',
        phone: '09170000000'
      },
      payload: {
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        idempotency_key: 'reserve-700',
        customer_name: 'Customer',
        customer_phone: '09170000000',
        lines: [{ item_id: 20, quantity: 2 }]
      }
    });

    expect(result.success).toBe(true);
    expect(reservationService.reserveOnlineOrderInventory).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 700,
      locationId: 4,
      transaction,
      effects: [expect.objectContaining({
        item_id: 20,
        quantity: 2,
        effect_type: 'line_item',
        source_line_reference: 'ONLINE:700:20-1'
      })]
    }));
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('releases the hold when an authenticated customer cancels before preparation', async () => {
    const transaction = makeTransaction();
    const reservationService = {
      releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' })
    };
    const order = {
      pos_transaction_id: 701,
      tracking_pin: 'SK-CANCEL',
      store_customer_id: 55,
      fulfillment_status: 'placed'
    };
    const repository = {
      beginTransaction: jest.fn().mockResolvedValue(transaction),
      getOrderByTrackingPin: jest.fn()
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce({ ...order, fulfillment_status: 'cancelled' }),
      updateOrderByTrackingPin: jest.fn().mockResolvedValue({ ...order, fulfillment_status: 'cancelled' })
    };
    const useCase = buildCancelStoreOrderUseCase({
      storeRepository: repository,
      inventoryReservationService: reservationService
    });

    const result = await useCase({
      trackingPin: 'SK-CANCEL',
      tenantId: '11111111-1111-4111-8111-111111111111',
      storeCustomer: { customer_id: 55 },
      payload: {}
    });

    expect(result.success).toBe(true);
    expect(reservationService.releaseOnlineOrderInventory).toHaveBeenCalledWith({
      sourceId: 701,
      transaction,
      reason: 'cancelled'
    });
  });
});
