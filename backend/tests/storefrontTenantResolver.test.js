import { jest } from '@jest/globals';

const findAllMock = jest.fn();
const findOneMock = jest.fn();
const reconcileMock = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
  StorefrontDiscoveryIndex: {
    findAll: findAllMock,
    findOne: findOneMock
  }
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
  reconcileStorefrontDiscoveryIndex: reconcileMock
}));

let resolveTenantByStoreSlug;
let clearStorefrontTenantResolverCache;

beforeAll(async () => {
  ({
    resolveTenantByStoreSlug,
    clearStorefrontTenantResolverCache
  } = await import('../src/services/storefrontTenantResolver.js'));
});

describe('storefrontTenantResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findOneMock.mockResolvedValue({
      row_count: 1,
      last_updated_at: '2026-03-31T00:00:00.000Z'
    });
    clearStorefrontTenantResolverCache();
  });

  it('resolves tenant from slug using index rows', async () => {
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Acme',
        tenant_company_token: 'secret-token',
        slug: 'acme-store'
      }
    ]);

    const result = await resolveTenantByStoreSlug('acme-store');
    expect(result).toEqual({
      id: 'tenant-1',
      name: 'Acme',
      company_token: 'secret-token'
    });
  });

  it('runs one-time repair reconcile when index is empty', async () => {
    findAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          tenant_id: 'tenant-2',
          tenant_name: 'Bravo',
          tenant_company_token: 'token-2',
          slug: 'bravo'
        }
      ]);
    reconcileMock.mockResolvedValue({ status: 'healthy' });

    const result = await resolveTenantByStoreSlug('bravo');
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: 'tenant-2',
      name: 'Bravo',
      company_token: 'token-2'
    });
  });
});
