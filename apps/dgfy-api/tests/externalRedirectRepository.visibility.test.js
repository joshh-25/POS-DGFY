import { jest } from '@jest/globals';

const siteFindOneMock = jest.fn();
const listingFindOneMock = jest.fn();
const auditCreateMock = jest.fn();
const transactionMock = jest.fn();
const bumpCacheVersionMock = jest.fn();
const invalidateSignatureMock = jest.fn();
const clearRepositoryCacheMock = jest.fn();
const transaction = { LOCK: { UPDATE: 'UPDATE' } };

jest.unstable_mockModule('../src/models/index.js', () => ({
  ExternalRedirectSite: { findOne: siteFindOneMock },
  PlatformAdminAuditLog: { create: auditCreateMock },
  StorefrontDiscoveryIndex: { findOne: listingFindOneMock },
  sequelize: { transaction: transactionMock }
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
  buildExternalListingSnapshot: jest.fn((payload) => payload)
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryCacheState.js', () => ({
  bumpStorefrontDiscoveryCacheVersion: bumpCacheVersionMock
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryFreshnessService.js', () => ({
  invalidateStorefrontDiscoverySharedSignatureCache: invalidateSignatureMock
}));

jest.unstable_mockModule('../src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js', () => ({
  clearStorefrontDiscoveryRepositoryCache: clearRepositoryCacheMock
}));

let externalRedirectRepository;
let getExternalListingEditableFields;

const loadRepository = async () => {
  jest.resetModules();
  ({ externalRedirectRepository, getExternalListingEditableFields } = await import('../src/modules/storefrontDiscovery/repositories/externalRedirectRepository.js'));
};

const mutableRow = (initial) => {
  const row = { ...initial };
  row.update = jest.fn(async (values) => {
    Object.assign(row, values);
    return row;
  });
  row.toJSON = () => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'update' && key !== 'toJSON'));
  return row;
};

describe('external discovery visibility repository', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback(transaction));
    auditCreateMock.mockResolvedValue({});
    await loadRepository();
  });

  it('locks, audits, and refreshes the cache when a partner type changes', async () => {
    const site = mutableRow({ site_key: 'proventus', show_on_map: true });
    siteFindOneMock.mockResolvedValue(site);

    const result = await externalRedirectRepository.setSiteVisibility({
      siteKey: 'proventus', showOnMap: false, admin: { id: 'admin-1', username: 'operator' }
    });

    expect(siteFindOneMock).toHaveBeenCalledWith({
      where: { site_key: 'proventus' }, transaction, lock: 'UPDATE'
    });
    expect(site.update).toHaveBeenCalledWith({ show_on_map: false, updated_by_admin_id: 'admin-1' }, { transaction });
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'external_redirect_site_visibility_changed',
      before_snapshot: { site_key: 'proventus', show_on_map: true },
      after_snapshot: { site_key: 'proventus', show_on_map: false }
    }), { transaction });
    expect(result.status).toBe('updated');
    expect(bumpCacheVersionMock).toHaveBeenCalledTimes(1);
    expect(invalidateSignatureMock).toHaveBeenCalledTimes(1);
    expect(clearRepositoryCacheMock).toHaveBeenCalledTimes(1);
  });

  it('does not write, audit, or refresh when a partner type is unchanged or unconfigured', async () => {
    const site = mutableRow({ site_key: 'proventus', show_on_map: true });
    siteFindOneMock.mockResolvedValueOnce(site).mockResolvedValueOnce(null);

    expect((await externalRedirectRepository.setSiteVisibility({ siteKey: 'proventus', showOnMap: true })).status).toBe('unchanged');
    expect((await externalRedirectRepository.setSiteVisibility({ siteKey: 'mapviu', showOnMap: false })).status).toBe('not_found');

    expect(site.update).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
    expect(bumpCacheVersionMock).not.toHaveBeenCalled();
  });

  it('locks and audits per-pin visibility without requiring a configured destination', async () => {
    const listing = mutableRow({
      slug: 'job-1', entity_type: 'external_listing', external_provider: 'proventus',
      external_reference_id: 'ref-1', external_record_origin: 'event_seed', is_visible: true
    });
    listingFindOneMock.mockResolvedValue(listing);

    const result = await externalRedirectRepository.setListingVisibility({
      slug: 'job-1', isVisible: false, admin: { id: 'admin-1', username: 'operator' }
    });

    expect(listingFindOneMock).toHaveBeenCalledWith({
      where: { slug: 'job-1', entity_type: 'external_listing' }, transaction, lock: 'UPDATE'
    });
    expect(listing.update).toHaveBeenCalledWith({ is_visible: false }, { transaction });
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'external_discovery_listing_visibility_changed',
      before_snapshot: expect.objectContaining({ is_visible: true }),
      after_snapshot: expect.objectContaining({ is_visible: false })
    }), { transaction });
    expect(result.status).toBe('updated');
    expect(bumpCacheVersionMock).toHaveBeenCalledTimes(1);
  });

  it('does not change non-managed rows and omits is_visible on partial updates', async () => {
    const listing = mutableRow({ slug: 'native-1', entity_type: 'external_listing', external_provider: 'unknown', is_visible: true });
    listingFindOneMock.mockResolvedValue(listing);

    expect((await externalRedirectRepository.setListingVisibility({ slug: 'native-1', isVisible: false })).status).toBe('not_found');
    expect(listing.update).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
    expect(bumpCacheVersionMock).not.toHaveBeenCalled();
    expect(getExternalListingEditableFields({ is_visible: undefined })).not.toContain('is_visible');
    expect(getExternalListingEditableFields({ is_visible: false })).toContain('is_visible');
  });
});
