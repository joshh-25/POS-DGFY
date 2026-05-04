import { jest } from '@jest/globals';

const mockDbStore = {
  getStore: jest.fn(),
  get: jest.fn()
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: mockDbStore
}));

let onboardingRepository;

beforeAll(async () => {
  const mod = await import('../src/modules/onboarding/repositories/onboardingRepository.js');
  onboardingRepository = mod.onboardingRepository;
});

describe('onboardingRepository schema compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbStore.getStore.mockReturnValue({ tenantName: 'Tenant One' });
  });

  it('does not query missing item columns during checklist computation', async () => {
    const SystemSetting = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null)
    };
    const TenantLocation = {
      count: jest.fn().mockResolvedValue(1)
    };
    const Item = {
      rawAttributes: {
        item_id: { fieldName: 'item_id', field: 'item_id' },
        status: { fieldName: 'status', field: 'status' },
        deleted_at: { fieldName: 'deleted_at', field: 'deleted_at' }
      },
      count: jest.fn().mockResolvedValue(1)
    };

    mockDbStore.get.mockImplementation((name) => {
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'TenantLocation') return TenantLocation;
      if (name === 'Item') return Item;
      return null;
    });

    await onboardingRepository.getStatus({ storeNameBaseline: 'Tenant One' });

    expect(Item.count).toHaveBeenCalledTimes(1);
    const where = Item.count.mock.calls[0][0].where;
    expect(where).toEqual({
      deleted_at: null,
      status: 'active'
    });
    expect(where.is_active).toBeUndefined();
    expect(where.pos_visible).toBeUndefined();
  });

  it('derives deterministic advisory classification snapshot from business_classification payload', async () => {
    const progress = {
      step_payloads: {
        business_classification: {
          legitimacy: {
            registration_status: 'registered',
            requires_official_receipt: true
          },
          location_presence: {
            branch_count: 3
          },
          operations_staff: {
            pos_user_count: 10,
            needs_rbac: true
          },
          order_booking: {
            order_modes: ['scheduled'],
            fulfillment_methods: ['platform_delivery']
          },
          online_visibility: {
            mode: 'transaction'
          },
          growth_intent: {
            estimated_monthly_sales: 500000
          }
        }
      }
    };
    const SystemSetting = {
      findAll: jest.fn().mockResolvedValue([
        {
          setting_key: 'tenant_onboarding_progress',
          setting_value: JSON.stringify(progress)
        }
      ]),
      findOne: jest.fn().mockResolvedValue(null)
    };
    const TenantLocation = {
      count: jest.fn().mockResolvedValue(1)
    };
    const Item = {
      rawAttributes: {
        item_id: { fieldName: 'item_id', field: 'item_id' }
      },
      count: jest.fn().mockResolvedValue(1)
    };

    mockDbStore.get.mockImplementation((name) => {
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'TenantLocation') return TenantLocation;
      if (name === 'Item') return Item;
      return null;
    });

    const result = await onboardingRepository.getStatus({ storeNameBaseline: 'Tenant One' });
    const snapshot = result.tenant_onboarding_progress.classification_snapshot;
    expect(snapshot.visibility_mode).toBe('transaction');
    expect(snapshot.monetization_tier).toBe('tier_3');
    expect(snapshot.workflow_mode_recommendation).toBe('food_manufacturing');
    expect(snapshot.customer_access_mode).toBe('transaction');
    expect(snapshot.inventory_display_mode).toBe('availability');
    expect(snapshot.compliance_path_hint).toBe('regulated_ready');
  });
});
