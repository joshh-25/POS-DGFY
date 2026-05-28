import { jest } from '@jest/globals';
import {
  buildStoreCartQuoteUseCase,
  buildStoreCheckoutUseCase
} from '../src/modules/store/usecases/storeUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const createTransaction = () => {
  const transaction = {
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async () => {
      transaction.finished = true;
    }),
    rollback: jest.fn(async () => {
      transaction.finished = true;
    })
  };
  return transaction;
};

const customerAccessSettings = [
  { setting_key: 'customer_access_mode', setting_value: '"transaction"' },
  { setting_key: 'tenant_onboarding_progress', setting_value: '{"classification_snapshot":{"payload":{"legitimacy":{"registration_status":"registered"}}}}' }
];
const tenantId = '11111111-1111-4111-8111-111111111111';

const buildRepository = (items, overrides = {}) => ({
  beginTransaction: jest.fn(async () => createTransaction()),
  findLocationById: jest.fn().mockResolvedValue({
    location_id: 4,
    name: 'Main',
    is_active: true,
    is_open: true,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: true,
    allow_out_of_stock_sales: true
  }),
  getSettingsByKeys: jest.fn().mockResolvedValue(customerAccessSettings),
  findSellableItemsByIds: jest.fn().mockResolvedValue(items),
  listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
  findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
  isTrackingPinTaken: jest.fn().mockResolvedValue(false),
  nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000001'),
  createOnlineTransactionWithLines: jest.fn().mockResolvedValue(501),
  getOrderById: jest.fn().mockResolvedValue({
    pos_transaction_id: 501,
    tracking_pin: 'SK-ABC123',
    invoice_number: 'INV-000001',
    order_source: 'online_store',
    order_method: 'pickup',
    fulfillment_status: 'placed',
    status: 'completed',
    total_amount: 116.15,
    lines: []
  }),
  createFnbKitchenOrderForOnlineTransaction: jest.fn().mockResolvedValue({ kitchen_ticket: { kitchen_ticket_id: 9 } }),
  ...overrides
});

const burgerItem = {
  item_id: 20,
  name: 'Burger',
  category: 'finished_good',
  unit_of_measure: 'each',
  current_stock: 10,
  default_sale_price: 100,
  cost_per_unit: 40,
  vat_type: 'vatable',
  fnbModifierGroups: [{
    modifier_group_id: 5,
    name: 'Cheese',
    display_name: 'Cheese',
    min_select: 0,
    max_select: 1,
    is_active: true,
    options: [{
      modifier_option_id: 8,
      name: 'Cheddar',
      price_delta: 15,
      is_active: true,
      allergen_notes: ['milk']
    }]
  }]
};

describe('storefront F&B modifier checkout contract', () => {
  it('computes quote totals from database-backed F&B modifier deltas and snapshots selected options', async () => {
    const repository = buildRepository([burgerItem]);
    const useCase = buildStoreCartQuoteUseCase({ storeRepository: repository });

    const result = await useCase({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 2,
          line_modifiers: [{
            modifier_group_id: 5,
            modifier_option_id: 8
          }]
        }]
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.subtotal_amount).toBe(230);
    expect(result.data.service_fee_amount).toBe(2.3);
    expect(result.data.total_amount).toBe(232.3);
    expect(result.data.lines[0]).toEqual(expect.objectContaining({
      sale_price: 115,
      line_subtotal: 230,
      fnb_modifiers_snapshot: [expect.objectContaining({
        modifier_group_id: 5,
        modifier_option_id: 8,
        option_name: 'Cheddar',
        price_delta: 15
      })]
    }));
  });

  it('marks guest checkout with a new email as eligible for DGFY account signup', async () => {
    const repository = buildRepository([burgerItem], {
      findCustomerByEmail: jest.fn().mockResolvedValue(null),
      getOrderById: jest.fn().mockResolvedValue({
        pos_transaction_id: 501,
        tracking_pin: 'SK-ABC123',
        invoice_number: 'INV-000001',
        order_source: 'online_store',
        order_method: 'pickup',
        fulfillment_status: 'placed',
        status: 'completed',
        customer_name: 'Ana Guest',
        customer_phone: '09170000000',
        customer_email: 'guest@example.test',
        store_customer_id: null,
        total_amount: 101,
        lines: []
      })
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        idempotency_key: 'guest-new-email-checkout',
        customer_name: 'Ana Guest',
        customer_phone: '09170000000',
        customer_email: 'guest@example.test',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(true);
    expect(repository.findCustomerByEmail).toHaveBeenCalledWith('guest@example.test', expect.any(Object));
    expect(result.data.account_action).toEqual(expect.objectContaining({
      type: 'offer_signup',
      allow_image_download: true,
      show_signup: true,
      claim_token: expect.any(String)
    }));
  });

  it('marks authenticated DGFY customer checkout as linked without signup prompt', async () => {
    const repository = buildRepository([burgerItem], {
      findCustomerByEmail: jest.fn(),
      getOrderById: jest.fn().mockResolvedValue({
        pos_transaction_id: 502,
        tracking_pin: 'SK-LINKED',
        invoice_number: 'INV-000002',
        order_source: 'online_store',
        order_method: 'pickup',
        fulfillment_status: 'placed',
        status: 'completed',
        customer_name: 'Ada Byron Lovelace',
        customer_phone: '+639123456789',
        customer_email: 'ada@example.test',
        store_customer_id: 55,
        total_amount: 101,
        lines: []
      })
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      storeCustomer: {
        customer_id: 55,
        dgfy_account_id: 'dgfy-1',
        name: 'Ada Byron Lovelace',
        email: 'ada@example.test',
        phone: '+639123456789'
      },
      payload: {
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        idempotency_key: 'authenticated-checkout',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(true);
    expect(repository.findCustomerByEmail).not.toHaveBeenCalled();
    expect(repository.createOnlineTransactionWithLines.mock.calls[0][0].header.store_customer_id).toBe(55);
    expect(result.data.account_action).toEqual(expect.objectContaining({
      type: 'linked_authenticated',
      allow_image_download: true,
      show_signup: false,
      claim_token: null
    }));
  });

  it('rejects selected modifier options that are not published for the menu item', async () => {
    const repository = buildRepository([burgerItem]);
    const useCase = buildStoreCartQuoteUseCase({ storeRepository: repository });

    const result = await useCase({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 1,
          line_modifiers: [{
            modifier_group_id: 5,
            modifier_option_id: 999
          }]
        }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
  });

  it('rejects F&B recipe quote before checkout when selected location lacks ingredient stock', async () => {
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 0
    }], {
      listProductCompositionsForItems: jest.fn().mockResolvedValue([{
        product_id: 20,
        ingredient_id: 51,
        quantity_required: 0.25,
        unit_of_measure: 'kg',
        ingredient: {
          item_id: 51,
          name: 'Ground beef',
          current_stock: 0.2,
          unit_of_measure: 'kg',
          category: 'raw_material'
        }
      }])
    });
    const useCase = buildStoreCartQuoteUseCase({ storeRepository: repository });

    const result = await useCase({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.message).toContain('Insufficient ingredient stock');
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'FNB_RECIPE_INGREDIENT_SHORTFALL',
      product_item_id: 20,
      ingredient_item_id: 51,
      available: 0.2,
      requested: 0.25,
      location_id: 4
    }));
    expect(repository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
  });

  it('rejects F&B recipe checkout before creating the online order', async () => {
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 0
    }], {
      listProductCompositionsForItems: jest.fn().mockResolvedValue([{
        product_id: 20,
        ingredient_id: 51,
        quantity_required: 0.25,
        unit_of_measure: 'kg',
        ingredient: {
          item_id: 51,
          name: 'Ground beef',
          current_stock: 0,
          unit_of_measure: 'kg',
          category: 'raw_material'
        }
      }])
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-fnb-shortfall',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'FNB_RECIPE_INGREDIENT_SHORTFALL',
      ingredient_item_id: 51,
      requested: 0.25,
      location_id: 4
    }));
    expect(repository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
  });

  it('creates a kitchen ticket record for accepted Storefront F&B checkout', async () => {
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 0
    }], {
      listProductCompositionsForItems: jest.fn().mockResolvedValue([{
        product_id: 20,
        ingredient_id: 51,
        quantity_required: 0.25,
        unit_of_measure: 'kg',
        ingredient: {
          item_id: 51,
          name: 'Ground beef',
          current_stock: 2,
          unit_of_measure: 'kg',
          category: 'raw_material'
        }
      }])
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-fnb-kitchen-ticket',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 1,
          course: 'main',
          line_modifiers: [{
            modifier_group_id: 5,
            modifier_option_id: 8
          }]
        }]
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    expect(repository.createFnbKitchenOrderForOnlineTransaction).toHaveBeenCalledWith(expect.objectContaining({
      pos_transaction_id: 501,
      order_method: 'pickup',
      location_id: 4,
      lines: [expect.objectContaining({
        item_id: 20,
        fnb_course_snapshot: 'main',
        fnb_modifiers_snapshot: [expect.objectContaining({ modifier_option_id: 8 })]
      })],
      recipe_movements: [expect.objectContaining({
        product_item_id: 20,
        ingredient_item_id: 51,
        quantity: 0.25,
        location_id: 4
      })]
    }), expect.objectContaining({
      transaction: expect.any(Object)
    }));
  });

  it('replays an accepted F&B Storefront checkout without rechecking depleted ingredients', async () => {
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 0
    }], {
      listProductCompositionsForItems: jest.fn()
        .mockResolvedValueOnce([{
          product_id: 20,
          ingredient_id: 51,
          quantity_required: 0.5,
          unit_of_measure: 'kg',
          ingredient: {
            item_id: 51,
            name: 'Ground beef',
            current_stock: 2,
            unit_of_measure: 'kg',
            category: 'raw_material'
          }
        }])
        .mockResolvedValueOnce([{
          product_id: 20,
          ingredient_id: 51,
          quantity_required: 0.25,
          unit_of_measure: 'kg',
          ingredient: {
            item_id: 51,
            name: 'Ground beef',
            current_stock: 0,
            unit_of_measure: 'kg',
            category: 'raw_material'
          }
        }]),
      findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null)
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });
    const payload = {
      idempotency_key: 'store-fnb-replay-after-consumption',
      location_id: 4,
      order_method: 'pickup',
      payment_type: 'cash',
      customer_name: 'Ana',
      customer_phone: '09170000000',
      lines: [{ item_id: 20, quantity: 1 }]
    };

    const first = await useCase({ tenantId, payload });
    const requestHash = repository.createOnlineTransactionWithLines.mock.calls[0][0].header.request_hash;
    repository.findTransactionByIdempotencyKey.mockResolvedValue({
      pos_transaction_id: 501,
      tracking_pin: 'SK-ABC123',
      invoice_number: 'INV-000001',
      order_source: 'online_store',
      order_method: 'pickup',
      fulfillment_status: 'placed',
      status: 'completed',
      total_amount: 116.15,
      request_hash: requestHash,
      lines: []
    });

    const replay = await useCase({ tenantId, payload });

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);
    expect(replay.data.idempotent_replay).toBe(true);
    expect(repository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    expect(repository.createFnbKitchenOrderForOnlineTransaction).toHaveBeenCalledTimes(1);
  });

  it('fails accepted F&B Storefront checkout when kitchen order persistence is unavailable', async () => {
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 0
    }], {
      listProductCompositionsForItems: jest.fn().mockResolvedValue([{
        product_id: 20,
        ingredient_id: 51,
        quantity_required: 0.25,
        unit_of_measure: 'kg',
        ingredient: {
          item_id: 51,
          name: 'Ground beef',
          current_stock: 2,
          unit_of_measure: 'kg',
          category: 'raw_material'
        }
      }]),
      createFnbKitchenOrderForOnlineTransaction: jest.fn().mockResolvedValue(null)
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-fnb-kitchen-unavailable',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE'
    }));
  });

  it('allows scheduled checkout inside configured storefront hours', async () => {
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: '9:00 AM - 6:00 PM daily' }
      ])
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-inside',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-05-25T10:30:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(true);
  });

  it('rejects scheduled checkout outside configured storefront hours', async () => {
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: '9:00 AM - 6:00 PM daily' }
      ])
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-outside',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-05-25T20:00:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.message).toBe('scheduled_for is outside store business hours');
  });

  it('does not block scheduled checkout when storefront hours are malformed', async () => {
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: 'open by appointment' }
      ])
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-malformed',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-05-25T20:00:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(true);
  });

  it('supports overnight storefront hours windows', async () => {
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: '10:00 PM - 2:00 AM daily' }
      ])
    });
    const useCase = buildStoreCheckoutUseCase({ storeRepository: repository });

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-overnight',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-05-25T23:30:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(true);
  });
});
