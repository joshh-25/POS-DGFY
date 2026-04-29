import { jest } from '@jest/globals';

const findAllMock = jest.fn();
const findOneMock = jest.fn();
const tenantFindOneMock = jest.fn();
const reconcileMock = jest.fn();
const loggerInfoMock = jest.fn();
const loggerWarnMock = jest.fn();
const getStorefrontDiscoveryCacheVersionMock = jest.fn(() => 1);
const getStorefrontDiscoverySharedSignatureMock = jest.fn(async () => '1:1');

jest.unstable_mockModule('../src/models/index.js', () => ({
  StorefrontDiscoveryIndex: {
    findAll: findAllMock,
    findOne: findOneMock
  },
  Tenant: {
    findOne: tenantFindOneMock
  }
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
  reconcileStorefrontDiscoveryIndex: reconcileMock
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryCacheState.js', () => ({
  getStorefrontDiscoveryCacheVersion: getStorefrontDiscoveryCacheVersionMock
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryFreshnessService.js', () => ({
  getStorefrontDiscoverySharedSignature: getStorefrontDiscoverySharedSignatureMock
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: loggerInfoMock,
    warn: loggerWarnMock
  }
}));

let storefrontDiscoveryRepository;

const loadRepository = async () => {
  jest.resetModules();
  ({ storefrontDiscoveryRepository } = await import('../src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js'));
  return storefrontDiscoveryRepository;
};

const makeEntry = (overrides = {}) => ({
  tenant_id: overrides.tenant_id || 'tenant-1',
  tenant_name: overrides.tenant_name || 'Alpha Foods',
  slug: overrides.slug || 'alpha-foods',
  storefront_open: overrides.storefront_open !== false,
  location_id: overrides.location_id || 11,
  location_name: overrides.location_name || 'Main',
  address_line: overrides.address_line || 'Iloilo City',
  latitude: overrides.latitude ?? 10.72,
  longitude: overrides.longitude ?? 122.56,
  delivery_radius_km: 6,
  estimated_wait_minutes: 15,
  supports_delivery: true,
  supports_pickup: true,
  supports_dine_in: true,
  store_delivery_fee: 25,
  catalog_count: 42,
  storefront_cover_image_url: overrides.storefront_cover_image_url ?? '/uploads/storefront-assets/tenant-1/cover.png',
  storefront_profile_image_url: overrides.storefront_profile_image_url ?? '/uploads/storefront-assets/tenant-1/profile.png',
  storefront_ui_v2_enabled: overrides.storefront_ui_v2_enabled ?? false,
  storefront_categories: overrides.storefront_categories ?? ['General'],
  storefront_gallery_images: overrides.storefront_gallery_images ?? [],
  storefront_delivery_partners: overrides.storefront_delivery_partners ?? [],
  storefront_follow_enabled: overrides.storefront_follow_enabled ?? false,
  storefront_share_enabled: overrides.storefront_share_enabled ?? false,
  storefront_review_summary: overrides.storefront_review_summary ?? null,
  search_snapshot_version: overrides.search_snapshot_version ?? 1,
  active_location_snapshot: overrides.active_location_snapshot || [
    {
      location_id: 11,
      name: 'Main',
      address_line: 'Iloilo City',
      latitude: 10.72,
      longitude: 122.56,
      is_open: true,
      is_active: true,
      is_primary_storefront: true,
      supports_delivery: true,
      supports_pickup: true,
      supports_dine_in: true
    }
  ],
  item_search_snapshot: overrides.item_search_snapshot || []
});

describe('storefrontDiscoveryRepository (index-backed search + metadata)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStorefrontDiscoveryCacheVersionMock.mockReturnValue(1);
    getStorefrontDiscoverySharedSignatureMock.mockResolvedValue('1:1');
    findOneMock.mockResolvedValue({
      row_count: 1,
      last_updated_at: '2026-03-31T00:00:00.000Z'
    });
    tenantFindOneMock.mockResolvedValue(null);
    delete process.env.STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY;
  });

  it('returns discovery rows from landlord index and never exposes company token', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({ tenant_id: 'tenant-1', slug: 'acme-store', catalog_count: 42 })
    ]);

    const result = await repository.listDiscovery({ limit: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      tenant_id: 'tenant-1',
      slug: 'acme-store',
      catalog_count: 42
    }));
    expect(result.rows[0]).not.toHaveProperty('company_token');
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('falls back to legacy-safe attributes when storefront branding columns are missing', async () => {
    const repository = await loadRepository();
    findAllMock
      .mockRejectedValueOnce({
        code: 'ER_BAD_FIELD_ERROR',
        message: "Unknown column 'storefront_cover_image_url' in 'field list'"
      })
      .mockResolvedValueOnce([
        makeEntry({
          tenant_id: 'tenant-1',
          storefront_cover_image_url: '',
          storefront_profile_image_url: ''
        })
      ]);

    const result = await repository.listDiscovery({ limit: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].storefront_cover_image_url).toBeNull();
    expect(result.rows[0].storefront_profile_image_url).toBeNull();
    expect(findAllMock).toHaveBeenCalledTimes(2);
    expect(findAllMock.mock.calls[1][0]).toEqual(expect.objectContaining({
      attributes: expect.arrayContaining(['tenant_id', 'active_location_snapshot', 'item_search_snapshot'])
    }));
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[StorefrontDiscovery] Legacy discovery-index schema detected; using temporary branding-column fallback',
      expect.objectContaining({
        operation: 'findAll_visible'
      })
    );
  });

  it('triggers auto-repair reconciliation when index is empty', async () => {
    const repository = await loadRepository();
    findAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEntry({ tenant_id: 'tenant-1' })]);
    reconcileMock.mockResolvedValue({ status: 'healthy' });

    const result = await repository.listDiscovery({});
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(1);
  });

  it('gets storefront profile by slug from index', async () => {
    const repository = await loadRepository();
    findOneMock.mockResolvedValue(makeEntry({
      tenant_id: 'tenant-2',
      tenant_name: 'Bravo',
      slug: 'bravo-store',
      location_id: 2,
      latitude: 10.71,
      longitude: 122.57
    }));

    const result = await repository.getStorefrontBySlug('bravo-store');
    expect(result).toEqual(expect.objectContaining({
      tenant_id: 'tenant-2',
      slug: 'bravo-store'
    }));
  });

  it('uses materialized profile content from discovery index without tenant settings fallback', async () => {
    const repository = await loadRepository();
    findOneMock.mockResolvedValue({
      ...makeEntry({
        tenant_id: 'tenant-2',
        tenant_name: 'Bravo',
        slug: 'bravo-store',
        location_id: 2,
        latitude: 10.71,
        longitude: 122.57
      }),
      storefront_tagline: 'Grilled to perfection',
      storefront_about: 'Materialized about section',
      storefront_phone: '09171234567',
      storefront_email: 'hello@example.com',
      storefront_hours: '10:00 AM - 10:00 PM',
      storefront_why_choose_us: ['Fresh daily'],
      storefront_social_links: { facebook: 'https://facebook.com/bravo' },
      storefront_review_highlights: [{ reviewer_name: 'A', rating: 5, comment: 'Great' }],
      storefront_promo: { title: '10% OFF', active: true },
      storefront_ui_v2_enabled: true,
      storefront_categories: ['BBQ', 'Street Food'],
      storefront_gallery_images: [{ path: 'storefront-assets/t2/gallery-1.png', caption: 'Hero shot' }],
      storefront_delivery_partners: [{ partner: 'grab', label: 'Grab', url: '' }],
      storefront_follow_enabled: true,
      storefront_share_enabled: true,
      storefront_review_summary: { score: 4.8, total_count: 127, star_distribution: { 5: 115, 4: 8 } }
    });

    const result = await repository.getStorefrontBySlug('bravo-store');
    expect(result).toEqual(expect.objectContaining({
      tenant_id: 'tenant-2',
      slug: 'bravo-store',
      storefront_tagline: 'Grilled to perfection',
      storefront_about: 'Materialized about section',
      storefront_phone: '09171234567',
      storefront_email: 'hello@example.com',
      storefront_hours: '10:00 AM - 10:00 PM',
      storefront_why_choose_us: ['Fresh daily'],
      storefront_social_links: { facebook: 'https://facebook.com/bravo' },
      storefront_review_highlights: [{ reviewer_name: 'A', rating: 5, comment: 'Great' }],
      storefront_promo: { title: '10% OFF', active: true },
      storefront_ui_v2_enabled: true,
      storefront_categories: ['BBQ', 'Street Food'],
      storefront_gallery_images: expect.arrayContaining([
        expect.objectContaining({ path: 'storefront-assets/t2/gallery-1.png', caption: 'Hero shot' })
      ]),
      storefront_delivery_partners: expect.arrayContaining([{ partner: 'grab', label: 'Grab', url: '' }]),
      storefront_follow_enabled: true,
      storefront_share_enabled: true,
      storefront_review_summary: expect.objectContaining({ score: 4.8, total_count: 127 })
    }));
    expect(tenantFindOneMock).not.toHaveBeenCalled();
  });

  it('falls back on profile lookup when storefront branding columns are missing', async () => {
    const repository = await loadRepository();
    findOneMock
      .mockRejectedValueOnce({
        code: 'ER_BAD_FIELD_ERROR',
        message: "Unknown column 'storefront_profile_image_url' in 'field list'"
      })
      .mockResolvedValueOnce(makeEntry({
        tenant_id: 'tenant-2',
        tenant_name: 'Bravo',
        slug: 'bravo-store',
        storefront_cover_image_url: '',
        storefront_profile_image_url: ''
      }));

    const result = await repository.getStorefrontBySlug('bravo-store');
    expect(result).toEqual(expect.objectContaining({
      tenant_id: 'tenant-2',
      slug: 'bravo-store',
      storefront_cover_image_url: null,
      storefront_profile_image_url: null
    }));
    expect(findOneMock).toHaveBeenCalledTimes(2);
    expect(findOneMock.mock.calls[1][0]).toEqual(expect.objectContaining({
      attributes: expect.arrayContaining(['tenant_id', 'active_location_snapshot', 'item_search_snapshot'])
    }));
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[StorefrontDiscovery] Legacy discovery-index schema detected; using temporary branding-column fallback',
      expect.objectContaining({
        operation: 'findOne_by_slug'
      })
    );
  });

  it('sanitizes unsafe storefront asset URLs coming from discovery index rows', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-unsafe',
        storefront_cover_image_url: 'javascript:alert(1)',
        storefront_profile_image_url: '/uploads/storefront-assets/tenant-unsafe/profile.png'
      })
    ]);

    const result = await repository.listDiscovery({ limit: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].storefront_cover_image_url).toBeNull();
    expect(result.rows[0].storefront_profile_image_url).toBe('/uploads/storefront-assets/tenant-unsafe/profile.png');
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[StorefrontDiscoveryRepository] Sanitized unsafe storefront asset URL from discovery index row',
      expect.objectContaining({
        signal_code: 'storefront_asset_index_sanitized',
        tenant_id: 'tenant-unsafe',
        asset_type: 'cover'
      })
    );
  });

  it('sanitizes unsafe delivery partner URLs from discovery index profile payload', async () => {
    const repository = await loadRepository();
    findOneMock.mockResolvedValue(makeEntry({
      tenant_id: 'tenant-safe-links',
      slug: 'safe-links',
      storefront_delivery_partners: [
        { partner: 'grab', label: 'Grab', url: 'javascript:alert(1)' },
        { partner: 'custom', label: 'Courier', url: 'https://courier.example.com/track' }
      ]
    }));

    const result = await repository.getStorefrontBySlug('safe-links');
    expect(result.storefront_delivery_partners).toEqual(expect.arrayContaining([
      expect.objectContaining({ partner: 'grab', label: 'Grab', url: '' }),
      expect.objectContaining({ partner: 'custom', label: 'Courier', url: 'https://courier.example.com/track' })
    ]));
  });

  it('uses union + badges by default when both store and item matches exist', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        tenant_name: 'Demo Supermart',
        slug: 'demo-supermart',
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Demo Chicken',
            text: 'demo chicken',
            matching_location_ids: [11],
            in_stock_location_ids: [11]
          }
        ]
      })
    ]);

    const result = await repository.listDiscovery({ search: 'demo' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].match_reasons).toEqual(expect.arrayContaining(['store', 'item']));
    expect(result.rows[0].matching_item_count).toBe(1);
    expect(result.applied_filters).toEqual(expect.objectContaining({
      result_mode: 'union',
      stock_filter: 'in_stock_only'
    }));
  });

  it('excludes out-of-stock-only item matches by default when there is no store-field match', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Calamansi Juice',
            text: 'calamansi juice',
            matching_location_ids: [11],
            in_stock_location_ids: []
          }
        ]
      })
    ]);

    const result = await repository.listDiscovery({ search: 'calamansi' });
    expect(result.rows).toHaveLength(0);
  });

  it('includes out-of-stock item matches when stock_filter=include_out_of_stock', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Calamansi Juice',
            text: 'calamansi juice',
            matching_location_ids: [11],
            in_stock_location_ids: []
          }
        ]
      })
    ]);

    const result = await repository.listDiscovery({ search: 'calamansi', stock_filter: 'include_out_of_stock' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].match_reasons).toEqual(['item']);
    expect(result.rows[0].has_in_stock_match).toBe(false);
  });

  it('supports result_mode=item_only and result_mode=store_only', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Calamansi Juice',
            text: 'calamansi juice',
            matching_location_ids: [11],
            in_stock_location_ids: [11]
          }
        ]
      }),
      makeEntry({
        tenant_id: 'tenant-2',
        tenant_name: 'Calamansi Market',
        slug: 'calamansi-market',
        item_search_snapshot: []
      })
    ]);

    const itemOnly = await repository.listDiscovery({ search: 'calamansi', result_mode: 'item_only' });
    expect(itemOnly.rows.map((row) => row.tenant_id)).toEqual(['tenant-1']);

    const storeOnly = await repository.listDiscovery({ search: 'calamansi', result_mode: 'store_only' });
    expect(storeOnly.rows.map((row) => row.tenant_id)).toEqual(['tenant-2']);
  });

  it('uses nearest matching branch for distance and nearest_matching_location_id', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        active_location_snapshot: [
          {
            location_id: 11,
            name: 'Main',
            address_line: 'Far',
            latitude: 10.75,
            longitude: 122.60,
            is_open: true,
            is_active: true,
            is_primary_storefront: true,
            supports_delivery: true,
            supports_pickup: true,
            supports_dine_in: true
          },
          {
            location_id: 12,
            name: 'Branch',
            address_line: 'Near',
            latitude: 10.721,
            longitude: 122.562,
            is_open: true,
            is_active: true,
            is_primary_storefront: false,
            supports_delivery: true,
            supports_pickup: true,
            supports_dine_in: true
          }
        ],
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Calamansi Juice',
            text: 'calamansi juice',
            matching_location_ids: [11, 12],
            in_stock_location_ids: [11, 12]
          }
        ]
      })
    ]);

    const result = await repository.listDiscovery({
      search: 'calamansi',
      latitude: 10.7202,
      longitude: 122.5621,
      pin_scope: 'nearest_matching_branch'
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].nearest_matching_location_id).toBe(12);
    expect(result.rows[0].distance_km).toBeLessThan(1);
  });

  it('can suppress match metadata when include_match_meta=false', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Calamansi Juice',
            text: 'calamansi juice',
            matching_location_ids: [11],
            in_stock_location_ids: [11]
          }
        ]
      })
    ]);

    const result = await repository.listDiscovery({ search: 'calamansi', include_match_meta: false });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).not.toHaveProperty('match_reasons');
    expect(result.applied_filters.include_match_meta).toBe(false);
  });

  it('degrades to store-field-only matching when snapshot version is unsupported', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        search_snapshot_version: 2,
        item_search_snapshot: [
          {
            item_id: 1,
            item_name: 'Calamansi Juice',
            text: 'calamansi juice',
            matching_location_ids: [11],
            in_stock_location_ids: [11]
          }
        ]
      })
    ]);

    const itemDriven = await repository.listDiscovery({ search: 'calamansi', result_mode: 'union' });
    expect(itemDriven.rows).toHaveLength(0);

    const storeDriven = await repository.listDiscovery({ search: 'alpha', result_mode: 'union' });
    expect(storeDriven.rows).toHaveLength(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[StorefrontDiscovery] Snapshot compatibility fallback applied',
      expect.objectContaining({
        affected_tenant_count: 1,
        affected_tenants: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: 'tenant-1',
            slug: 'alpha',
            reason_codes: expect.arrayContaining(['unsupported_snapshot_version'])
          })
        ])
      })
    );
  });

  it('degrades to store-field-only matching when critical snapshots are missing', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      makeEntry({
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        search_snapshot_version: 1,
        catalog_count: 5,
        item_search_snapshot: null
      })
    ]);

    const result = await repository.listDiscovery({ search: 'calamansi', result_mode: 'union' });
    expect(result.rows).toHaveLength(0);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[StorefrontDiscovery] Snapshot compatibility fallback applied',
      expect.objectContaining({
        affected_tenants: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: 'tenant-1',
            reason_codes: expect.arrayContaining(['empty_item_search_snapshot'])
          })
        ])
      })
    );
  });
});
