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
      findAll: jest.fn()
    };

    mockDbStore.get.mockImplementation((name) => {
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'TenantLocation') return TenantLocation;
      if (name === 'Item') return Item;
      return null;
    });

    await onboardingRepository.getStatus({ storeNameBaseline: 'Tenant One' });

    expect(Item.findAll).not.toHaveBeenCalled();
  });

  it('reports priced starter item readiness without requiring positive stock', async () => {
    const progress = {
      step_payloads: {
        bulk_items: { created_item_ids: [1] }
      }
    };
    const SystemSetting = {
      findAll: jest.fn().mockResolvedValue([
        {
          setting_key: 'tenant_onboarding_progress',
          setting_value: JSON.stringify(progress)
        }
      ]),
      findOne: jest.fn(({ where }) => {
        if (where?.setting_key === 'ops_workflow_mode') {
          return Promise.resolve({ setting_value: 'food_manufacturing' });
        }
        return Promise.resolve(null);
      })
    };
    const TenantLocation = {
      count: jest.fn().mockResolvedValue(1)
    };
    const Item = {
      rawAttributes: {
        item_id: { fieldName: 'item_id', field: 'item_id' },
        name: { fieldName: 'name', field: 'name' },
        sku_code: { fieldName: 'sku_code', field: 'sku_code' },
        category: { fieldName: 'category', field: 'category' },
        product_type: { fieldName: 'product_type', field: 'product_type' },
        mode_item_preset: { fieldName: 'mode_item_preset', field: 'mode_item_preset' },
        status: { fieldName: 'status', field: 'status' },
        default_sale_price: { fieldName: 'default_sale_price', field: 'default_sale_price' },
        current_stock: { fieldName: 'current_stock', field: 'current_stock' }
      },
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 1,
            name: 'Starter',
            category: 'product',
            product_type: 'finished_goods',
            mode_item_preset: 'finished_product',
            status: 'active',
            default_sale_price: 25,
            current_stock: 0
          })
        }
      ])
    };

    mockDbStore.get.mockImplementation((name) => {
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'TenantLocation') return TenantLocation;
      if (name === 'Item') return Item;
      return null;
    });

    const result = await onboardingRepository.getStatus({ storeNameBaseline: 'Tenant One' });
    const checklist = result.tenant_onboarding_progress.checklist_snapshot;
    expect(checklist.checklist.has_priced_starter_item).toBe(true);
    expect(checklist.missing_requirements).toEqual([]);
  });

  it('does not count internal Food Manufacturing presets as onboarding completion starters', async () => {
    const SystemSetting = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(({ where }) => {
        if (where?.setting_key === 'ops_workflow_mode') {
          return Promise.resolve({ setting_value: 'food_manufacturing' });
        }
        return Promise.resolve(null);
      })
    };
    const TenantLocation = {
      count: jest.fn().mockResolvedValue(1)
    };
    const Item = {
      rawAttributes: {
        item_id: { fieldName: 'item_id', field: 'item_id' },
        name: { fieldName: 'name', field: 'name' },
        sku_code: { fieldName: 'sku_code', field: 'sku_code' },
        category: { fieldName: 'category', field: 'category' },
        product_type: { fieldName: 'product_type', field: 'product_type' },
        mode_item_preset: { fieldName: 'mode_item_preset', field: 'mode_item_preset' },
        status: { fieldName: 'status', field: 'status' },
        default_sale_price: { fieldName: 'default_sale_price', field: 'default_sale_price' },
        current_stock: { fieldName: 'current_stock', field: 'current_stock' }
      },
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 1,
            name: 'Flour',
            category: 'raw_material',
            mode_item_preset: 'raw_material',
            status: 'active',
            default_sale_price: 25,
            current_stock: 0
          })
        }
      ])
    };

    mockDbStore.get.mockImplementation((name) => {
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'TenantLocation') return TenantLocation;
      if (name === 'Item') return Item;
      return null;
    });

    const result = await onboardingRepository.getStatus({ storeNameBaseline: 'Tenant One' });
    const checklist = result.tenant_onboarding_progress.checklist_snapshot;
    expect(checklist.checklist.has_priced_starter_item).toBe(false);
    expect(checklist.missing_requirements).toContain('has_priced_starter_item');
  });
});
