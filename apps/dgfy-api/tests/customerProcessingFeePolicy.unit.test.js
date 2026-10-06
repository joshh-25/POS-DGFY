import { describe, expect, jest, test } from '@jest/globals';

const {
  buildCustomerProcessingFeeBreakdown,
  calculateCustomerProcessingFee,
  normalizeCustomerProcessingFeePolicy
} = await import('../src/modules/tenantRevenue/domain/customerProcessingFeePolicy.js');
const { buildStoreCartQuoteUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '44444444-4444-4444-8444-444444444444';

const customerPolicy = (overrides = {}) => ({
  mode: 'percentage',
  fixed_centavos: 0,
  rate_bps: 300,
  label: 'Item processing fee',
  ...overrides
});

describe('item processing fee policy', () => {
  test('calculates a percentage on the discounted item subtotal and snapshots the rule', () => {
    const policy = normalizeCustomerProcessingFeePolicy(customerPolicy());
    expect(calculateCustomerProcessingFee({ policy, baseAmountCentavos: 100000 })).toBe(3000);
    expect(buildCustomerProcessingFeeBreakdown({
      policy,
      baseAmountCentavos: 100000,
      amountCentavos: 3000,
      policyVersion: 4,
      calculatedAt: '2026-10-06T00:00:00.000Z'
    })).toEqual({
      mode: 'percentage',
      fixed_centavos: 0,
      rate_bps: 300,
      label: 'Item processing fee',
      base_amount_centavos: 100000,
      amount_centavos: 3000,
      policy_version: 4,
      calculated_at: '2026-10-06T00:00:00.000Z'
    });
  });

  test('supports a fixed customer fee and rejects mixed mode values', () => {
    const policy = normalizeCustomerProcessingFeePolicy({
      mode: 'fixed',
      fixed_centavos: 2500,
      rate_bps: 0,
      label: 'Handling fee'
    });
    expect(calculateCustomerProcessingFee({ policy, baseAmountCentavos: 100000 })).toBe(2500);
    expect(() => normalizeCustomerProcessingFeePolicy(customerPolicy({ fixed_centavos: 1 }))).toThrow();
  });

  test('cart quote uses the owner policy and returns the customer fee in the payable total', async () => {
    const repository = {
      findLocationById: jest.fn().mockResolvedValue({
        location_id: 3,
        name: 'Main',
        address_line: 'Address',
        latitude: 10,
        longitude: 122,
        delivery_radius_km: 50,
        is_open: true,
        is_active: true,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        allow_out_of_stock_sales: false,
        current_wait_time_minutes: 0
      }),
      getSettingsByKeys: jest.fn().mockResolvedValue([
        { setting_key: 'customer_access_mode', setting_value: 'transaction' },
        {
          setting_key: 'tenant_onboarding_progress',
          setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
          })
        },
        { setting_key: 'store_delivery_fee', setting_value: '0' },
        { setting_key: 'pos_open_status', setting_value: 'true' }
      ]),
      findSellableItemsByIds: jest.fn().mockResolvedValue([{
        item_id: 40,
        name: 'Widget',
        current_stock: 100,
        default_sale_price: 1000,
        cost_per_unit: 10,
        unit_of_measure: 'pc',
        vat_type: 'vatable'
      }])
    };
    const quote = buildStoreCartQuoteUseCase({
      storeRepository: repository,
      tenantRevenueRepository: {
        findEffectiveFeePolicy: jest.fn().mockResolvedValue({
          version: 4,
          customer_processing_fee_policy: customerPolicy()
        })
      }
    });

    const result = await dbStore.run({ tenantId: TENANT_ID }, () => quote({
      payload: {
        location_id: 3,
        order_method: 'pickup',
        payment_type: 'cash',
        lines: [{ item_id: 40, quantity: 1 }]
      }
    }));

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      subtotal_amount: 1000,
      customer_processing_fee_amount: 30,
      customer_processing_fee_label: 'Item processing fee',
      total_amount: 1030
    });
  });
});
