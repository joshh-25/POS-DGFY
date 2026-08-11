import { jest } from '@jest/globals';
import {
  buildStoreCartQuoteUseCase,
  buildStoreCheckoutUseCase
} from '../src/modules/store/usecases/storeUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { generateStoreGuestCheckoutProof } from '../src/modules/store/utils/storeJwtToken.js';

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

const buildCartQuoteUseCase = (repository) => buildStoreCartQuoteUseCase({
  storeRepository: repository,
  revenueSharingEnabled: false
});

const buildCheckoutUseCase = (repository) => {
  const useCase = buildStoreCheckoutUseCase({
    storeRepository: repository,
    revenueSharingEnabled: false
  });

  return async ({ tenantId: requestTenantId, payload, storeCustomer, ...options }) => {
    if (storeCustomer) {
      return useCase({ tenantId: requestTenantId, payload, storeCustomer, ...options });
    }

    const email = payload?.customer_email || 'guest@example.test';
    return useCase({
      tenantId: requestTenantId,
      payload: {
        ...payload,
        customer_email: email,
        guest_checkout_proof: generateStoreGuestCheckoutProof({
          tenantId: requestTenantId,
          email,
          idempotencyKey: payload?.idempotency_key
        })
      },
      ...options
    });
  };
};

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
  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes quote totals from database-backed F&B modifier deltas and snapshots selected options', async () => {
    const repository = buildRepository([burgerItem]);
    const useCase = buildCartQuoteUseCase(repository);

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
            modifier_option_id: 8,
            quantity: 3
          }]
        }]
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.subtotal_amount).toBe(290);
    expect(result.data.service_fee_amount).toBe(2.9);
    expect(result.data.total_amount).toBe(292.9);
    expect(result.data.lines[0]).toEqual(expect.objectContaining({
      sale_price: 145,
      line_subtotal: 290,
      fnb_modifiers_snapshot: [expect.objectContaining({
        modifier_group_id: 5,
        modifier_option_id: 8,
        option_name: 'Cheddar',
        price_delta: 15,
        quantity: 3,
        extended_price_delta: 45
      })]
    }));
  });

  it('preflights linked modifier stock using the selected location and line quantity', async () => {
    const item = {
      ...burgerItem,
      fnbModifierGroups: [{
        ...burgerItem.fnbModifierGroups[0],
        options: [{ ...burgerItem.fnbModifierGroups[0].options[0], sku_item_id: 90 }]
      }]
    };
    const repository = buildRepository([item], {
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
      getLocationStocksByItemIds: jest.fn().mockResolvedValue([{ item_id: 90, quantity_on_hand: 1 }])
    });

    const result = await buildCartQuoteUseCase(repository)({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 2,
          line_modifiers: [{ modifier_group_id: 5, modifier_option_id: 8 }]
        }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'FNB_MODIFIER_STOCK_SHORTFALL',
      stock_violations: [expect.objectContaining({ sku_item_id: 90, available_stock: 1, requested_qty: 2 })]
    }));
    expect(repository.getLocationStocksByItemIds).toHaveBeenCalledWith([90], 4, expect.any(Object));
  });

  it('rejects an empty selection when an assigned modifier group is required', async () => {
    const requiredBurger = {
      ...burgerItem,
      fnbModifierGroups: [{
        ...burgerItem.fnbModifierGroups[0],
        required: true,
        min_select: 1
      }]
    };
    const result = await buildCartQuoteUseCase(buildRepository([requiredBurger]))({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{ item_id: 20, quantity: 1, line_modifiers: [] }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('requires at least 1 option');
  });

  it('enforces required conditional groups only when the parent option is selected', async () => {
    const conditionalBurger = { ...burgerItem, fnbModifierGroups: [burgerItem.fnbModifierGroups[0], {
      modifier_group_id: 6, name: 'Sauce', required: true, min_select: 1, max_select: 1,
      parent_modifier_option_id: 8, is_active: true,
      options: [{ modifier_option_id: 9, name: 'Garlic', price_delta: 5, is_active: true }]
    }] };
    const useCase = buildCartQuoteUseCase(buildRepository([conditionalBurger]));
    const withoutParent = await useCase({ payload: { location_id: 4, order_method: 'pickup', customer_name: 'Ana', customer_phone: '09170000000', lines: [{ item_id: 20, quantity: 1, line_modifiers: [] }] } });
    expect(withoutParent.success).toBe(true);
    const withParentOnly = await useCase({ payload: { location_id: 4, order_method: 'pickup', customer_name: 'Ana', customer_phone: '09170000000', lines: [{ item_id: 20, quantity: 1, line_modifiers: [{ modifier_group_id: 5, modifier_option_id: 8 }] }] } });
    expect(withParentOnly.success).toBe(false);
    expect(withParentOnly.error.message).toContain('requires at least 1 option');
  });

  it.each([
    ['hidden from Storefront', { visible_in_storefront: false }],
    ['globally sold out', { is_sold_out: true }],
    ['sold out at the selected location', { locationAvailability: [{ location_id: 4, is_available: true, is_sold_out: true }] }]
  ])('rejects a modifier option that is %s', async (_label, optionState) => {
    const unavailableBurger = {
      ...burgerItem,
      fnbModifierGroups: [{
        ...burgerItem.fnbModifierGroups[0],
        options: [{ ...burgerItem.fnbModifierGroups[0].options[0], ...optionState }]
      }]
    };
    const result = await buildCartQuoteUseCase(buildRepository([unavailableBurger]))({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 1,
          line_modifiers: [{ modifier_group_id: 5, modifier_option_id: 8 }]
        }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('Modifier option is not available');
  });

  it('blocks product quote outside configured storefront business hours', async () => {
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        {
          setting_key: 'storefront_hours',
          setting_value: JSON.stringify({
            mode: 'weekly',
            timezone: 'Asia/Manila',
            weekly: {
              sun: { enabled: false, open: '09:00', close: '18:00' },
              mon: { enabled: false, open: '09:00', close: '18:00' },
              tue: { enabled: true, open: '09:00', close: '18:00' },
              wed: { enabled: true, open: '09:00', close: '18:00' },
              thu: { enabled: true, open: '09:00', close: '18:00' },
              fri: { enabled: true, open: '09:00', close: '18:00' },
              sat: { enabled: true, open: '09:00', close: '18:00' }
            }
          })
        }
      ])
    });
    const useCase = buildCartQuoteUseCase(repository);

    const result = await useCase({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        scheduled_for: '2026-06-01T10:00:00+08:00',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.details.reason_code).toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
    expect(repository.findSellableItemsByIds).not.toHaveBeenCalled();
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
    const useCase = buildCheckoutUseCase(repository);

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
    const useCase = buildCheckoutUseCase(repository);

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
    const useCase = buildCartQuoteUseCase(repository);

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
    const useCase = buildCartQuoteUseCase(repository);

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
    const useCase = buildCheckoutUseCase(repository);

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
    const useCase = buildCheckoutUseCase(repository);

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

  it('persists stock_effect_type/stock_exempt_reason and skips the stock check for an untracked item (bug 1 + bug 2)', async () => {
    // Before this fix, storefront checkout never set these fields at all (every
    // online line silently persisted the model default 'inventory_issue',
    // contradicting actual behavior), and pos_always_available was ignored
    // entirely on this surface, so a zero-stock always-available item would be
    // wrongly rejected here even though POS would sell it fine.
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 0,
      pos_always_available: true,
      fnbModifierGroups: []
    }]);
    const useCase = buildCheckoutUseCase(repository);

    const result = await useCase({
      tenantId,
      storeCustomer: {
        customer_id: 55,
        dgfy_account_id: 'dgfy-1',
        name: 'Ana',
        email: 'ana@example.test',
        phone: '09170000000'
      },
      payload: {
        idempotency_key: 'store-untracked-checkout',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        lines: [{ item_id: 20, quantity: 3 }]
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createOnlineTransactionWithLines).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({
        item_id: 20,
        stock_effect_type: 'stock_exempt',
        stock_exempt_reason: 'pos_always_available',
        cost_snapshot: 40
      })]
    }), expect.objectContaining({ transaction: expect.any(Object) }));
  });

  it('rejects checkout for a toggle-mode item the operator has marked unavailable', async () => {
    const repository = buildRepository([{
      ...burgerItem,
      current_stock: 5,
      tracking_mode: 'toggle',
      tracking_toggle_available: false,
      fnbModifierGroups: []
    }]);
    const useCase = buildCheckoutUseCase(repository);

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-toggle-unavailable-checkout',
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
    expect(result.error.message).toContain('unavailable');
    expect(repository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
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
    const useCase = buildCheckoutUseCase(repository);
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
    const useCase = buildCheckoutUseCase(repository);

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
    const useCase = buildCheckoutUseCase(repository);

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
    const useCase = buildCheckoutUseCase(repository);

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
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'OUTSIDE_STOREFRONT_BUSINESS_HOURS'
    }));
  });

  it('rejects immediate checkout outside structured storefront business hours', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-25T20:00:00+08:00'));
    const structuredHours = {
      mode: 'weekly',
      timezone: 'Asia/Manila',
      weekly: {
        sun: { enabled: false, open: '09:00', close: '18:00' },
        mon: { enabled: true, open: '09:00', close: '18:00' },
        tue: { enabled: true, open: '09:00', close: '18:00' },
        wed: { enabled: true, open: '09:00', close: '18:00' },
        thu: { enabled: true, open: '09:00', close: '18:00' },
        fri: { enabled: true, open: '09:00', close: '18:00' },
        sat: { enabled: true, open: '09:00', close: '18:00' }
      },
      display: 'Mon-Sat 9:00 AM - 6:00 PM'
    };
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: JSON.stringify(structuredHours) }
      ])
    });
    const useCase = buildCheckoutUseCase(repository);

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-immediate-outside',
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
    expect(result.error.message).toBe('Storefront is outside business hours and not accepting orders');
    jest.useRealTimers();
  });

  it('accepts scheduled checkout inside either split storefront business-hours interval', async () => {
    const splitHours = {
      mode: 'weekly',
      timezone: 'Asia/Manila',
      weekly: {
        sun: { enabled: false, open: '09:00', close: '18:00' },
        mon: {
          enabled: true,
          open: '06:00',
          close: '12:00',
          intervals: [
            { open: '06:00', close: '12:00' },
            { open: '13:00', close: '20:00' }
          ]
        },
        tue: { enabled: true, open: '09:00', close: '18:00' },
        wed: { enabled: true, open: '09:00', close: '18:00' },
        thu: { enabled: true, open: '09:00', close: '18:00' },
        fri: { enabled: true, open: '09:00', close: '18:00' },
        sat: { enabled: true, open: '09:00', close: '18:00' }
      },
      display: 'Mon 6:00 AM - 12:00 PM, 1:00 PM - 8:00 PM'
    };
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: JSON.stringify(splitHours) }
      ])
    });
    const useCase = buildCheckoutUseCase(repository);

    const morning = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-split-morning',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-06-01T07:30:00+08:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });
    const afternoon = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-split-afternoon',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-06-01T13:30:00+08:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(morning.error?.details?.reason_code).not.toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
    expect(afternoon.error?.details?.reason_code).not.toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
  });

  it('rejects scheduled checkout in the closed gap between split storefront business-hours intervals', async () => {
    const splitHours = {
      mode: 'weekly',
      timezone: 'Asia/Manila',
      weekly: {
        sun: { enabled: false, open: '09:00', close: '18:00' },
        mon: {
          enabled: true,
          open: '06:00',
          close: '12:00',
          intervals: [
            { open: '06:00', close: '12:00' },
            { open: '13:00', close: '20:00' }
          ]
        },
        tue: { enabled: true, open: '09:00', close: '18:00' },
        wed: { enabled: true, open: '09:00', close: '18:00' },
        thu: { enabled: true, open: '09:00', close: '18:00' },
        fri: { enabled: true, open: '09:00', close: '18:00' },
        sat: { enabled: true, open: '09:00', close: '18:00' }
      },
      display: 'Mon 6:00 AM - 12:00 PM, 1:00 PM - 8:00 PM'
    };
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: JSON.stringify(splitHours) }
      ])
    });
    const useCase = buildCheckoutUseCase(repository);

    const result = await useCase({
      tenantId,
      payload: {
        idempotency_key: 'store-hours-split-gap',
        location_id: 4,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        scheduled_for: '2026-06-01T12:30:00+08:00',
        lines: [{ item_id: 20, quantity: 1 }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.details.reason_code).toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
  });

  it('does not block scheduled checkout when storefront hours are malformed', async () => {
    const repository = buildRepository([burgerItem], {
      getSettingsByKeys: jest.fn().mockResolvedValue([
        ...customerAccessSettings,
        { setting_key: 'storefront_hours', setting_value: 'open by appointment' }
      ])
    });
    const useCase = buildCheckoutUseCase(repository);

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
    const useCase = buildCheckoutUseCase(repository);

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
