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
});
