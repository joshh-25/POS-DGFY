import { jest } from '@jest/globals';
import {
  normalizeRedirectTemplate,
  resolveExternalRedirectUrl,
  resolveExternalListingCategories
} from '../src/modules/storefrontDiscovery/domain/externalRedirectPolicy.js';
import {
  buildListExternalAdminUseCase,
  buildResolveExternalRedirectUseCase,
  buildSaveExternalSiteUseCase,
  buildSetExternalSiteVisibilityUseCase,
  buildSetExternalListingVisibilityUseCase,
  buildSaveExternalListingUseCase
} from '../src/modules/storefrontDiscovery/usecases/externalRedirectUseCases.js';
import { getExternalListingEditableFields } from '../src/modules/storefrontDiscovery/repositories/externalRedirectRepository.js';
import {
  buildDeleteExternalStorefrontListingUseCase,
  buildListStorefrontDiscoveryUseCase,
  buildListStorefrontMapPinsUseCase,
  buildUpsertExternalStorefrontListingUseCase
} from '../src/modules/storefrontDiscovery/usecases/storefrontDiscoveryUseCases.js';

describe('external destination policy', () => {
  it.each([
    ['proventus', 'Job'],
    ['eytitu', 'Taxi'],
    ['mapviu', 'Real Estate'],
    ['synqcore', 'Hotel']
  ])('derives the %s external listing category', (externalProvider, category) => {
    expect(resolveExternalListingCategories({
      entityType: 'external_listing',
      externalProvider,
      categories: []
    })).toEqual([category]);
  });

  it('preserves explicit categories and leaves native or unknown-provider rows unchanged', () => {
    expect(resolveExternalListingCategories({
      entityType: 'external_listing',
      externalProvider: 'synqcore',
      categories: ['Boutique Stay']
    })).toEqual(['Boutique Stay']);
    expect(resolveExternalListingCategories({
      entityType: 'dgfy_native',
      externalProvider: 'synqcore',
      categories: []
    })).toEqual([]);
    expect(resolveExternalListingCategories({
      entityType: 'external_listing',
      externalProvider: 'unknown',
      categories: []
    })).toEqual([]);
  });

  it('requires a public HTTPS template with one partner ID slot', () => {
    expect(normalizeRedirectTemplate('https://mapviu.ph/inquire?id={id}')).toEqual({
      url_template: 'https://mapviu.ph/inquire?id={id}', allowed_hostname: 'mapviu.ph'
    });
    for (const input of [
      'http://mapviu.ph/inquire?id={id}',
      'https://mapviu.ph/inquire',
      'https://mapviu.ph/{id}/{id}',
      'https://127.0.0.1/{id}',
      'https://user:pass@mapviu.ph/{id}',
      'https://mapviu.ph:8443/{id}'
    ]) expect(normalizeRedirectTemplate(input)).toBeNull();
  });

  it('encodes the partner ID and refuses a changed host', () => {
    expect(resolveExternalRedirectUrl({
      template: 'https://mapviu.ph/inquire?id={id}',
      allowedHostname: 'mapviu.ph', referenceId: '55&next=https://evil.example'
    })).toBe('https://mapviu.ph/inquire?id=55%26next%3Dhttps%3A%2F%2Fevil.example');
    expect(resolveExternalRedirectUrl({
      template: 'https://evil.example/{id}', allowedHostname: 'mapviu.ph', referenceId: '55'
    })).toBeNull();
  });
});

describe('external listing redirect', () => {
  const listing = { slug: 'hotel-123', entity_type: 'external_listing', is_visible: true, external_provider: 'synqcore', external_reference_id: '123' };

  it('resolves the current Admin template for a stable DGFY link', async () => {
    const repository = {
      getVisibleListing: jest.fn(async () => listing),
      getSite: jest.fn(async () => ({ enabled: true, url_template: 'https://synqcore.ph/book?id={id}', allowed_hostname: 'synqcore.ph' }))
    };
    const resolve = buildResolveExternalRedirectUseCase({ repository });
    expect((await resolve({ slug: 'hotel-123' })).data.destination).toBe('https://synqcore.ph/book?id=123');
    repository.getSite.mockResolvedValue({ enabled: true, url_template: 'https://synqcore.ph/stays/{id}', allowed_hostname: 'synqcore.ph' });
    expect((await resolve({ slug: 'hotel-123' })).data.destination).toBe('https://synqcore.ph/stays/123');
  });

  it('fails closed for a hidden record or disabled destination', async () => {
    const repository = { getVisibleListing: jest.fn(async () => null), getSite: jest.fn() };
    const resolve = buildResolveExternalRedirectUseCase({ repository });
    expect((await resolve({ slug: 'hotel-123' })).success).toBe(false);
    expect(repository.getSite).not.toHaveBeenCalled();
    repository.getVisibleListing.mockResolvedValue(listing);
    repository.getSite.mockResolvedValue({ enabled: false });
    expect((await resolve({ slug: 'hotel-123' })).success).toBe(false);
    repository.getSite.mockResolvedValue({ enabled: true, show_on_map: false });
    expect((await resolve({ slug: 'hotel-123' })).success).toBe(false);
    repository.getSite.mockResolvedValue({ enabled: true, show_on_map: true, url_template: 'https://synqcore.ph/book?id={id}', allowed_hostname: 'synqcore.ph' });
    expect((await resolve({ slug: 'hotel-123' })).success).toBe(true);
    repository.getSite.mockResolvedValue({ enabled: true, url_template: 'https://synqcore.ph/book?id={id}', allowed_hostname: 'synqcore.ph' });
    expect((await resolve({ slug: 'hotel-123' })).success).toBe(true);
  });

  it('publishes a stable DGFY link without leaking the partner record ID', async () => {
    const row = { ...listing, tenant_name: 'Sample hotel', latitude: 10.7, longitude: 122.5 };
    const storefrontDiscoveryRepository = { listDiscovery: jest.fn(async () => ({ rows: [row], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })) };
    const list = buildListStorefrontDiscoveryUseCase({ storefrontDiscoveryRepository });
    const listed = await list();
    expect(listed.data.stores[0].storefront_url).toBe('/e/hotel-123');
    expect(listed.data.stores[0]).not.toHaveProperty('external_reference_id');
    const pins = await buildListStorefrontMapPinsUseCase({ storefrontDiscoveryRepository })({ query: {} });
    expect(pins.data.pins[0]).toEqual(expect.objectContaining({ storefront_url: '/e/hotel-123', external_provider: 'synqcore' }));
  });

  it('keeps existing externally curated URLs working', async () => {
    const storefrontDiscoveryRepository = { listDiscovery: jest.fn(async () => ({
      rows: [{ ...listing, external_storefront_url: 'https://synqcore.ph/old/123' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    })) };
    const listed = await buildListStorefrontDiscoveryUseCase({ storefrontDiscoveryRepository })();
    expect(listed.data.stores[0].storefront_url).toBe('https://synqcore.ph/old/123');
  });

  it('returns type visibility and pin counts without extra Admin site fields', async () => {
    const listAdmin = buildListExternalAdminUseCase({
      repository: {
        listSites: jest.fn(async () => [{
          site_key: 'proventus', url_template: 'https://proventus.ph/company/{id}',
          enabled: true, show_on_map: false, allowed_hostname: 'proventus.ph', updated_by_admin_id: 'private'
        }]),
        listListings: jest.fn(async () => [
          { slug: 'job-1', external_provider: 'proventus', is_visible: true },
          { slug: 'job-2', external_provider: 'proventus', is_visible: false },
          { slug: 'ignored', external_provider: 'other', is_visible: true }
        ])
      }
    });

    const result = await listAdmin();

    expect(result.data.sites[0]).toEqual({
      site_key: 'proventus',
      display_name: 'Proventous',
      type_label: 'Job',
      url_template: 'https://proventus.ph/company/{id}',
      enabled: true,
      show_on_map: false,
      pin_count: 2,
      visible_pin_count: 0
    });
    expect(result.data.sites[0]).not.toHaveProperty('category');
    expect(result.data.sites[0]).not.toHaveProperty('allowed_hostname');
    expect(result.data.sites[0]).not.toHaveProperty('updated_by_admin_id');
    expect(result.data.sites[1]).toEqual(expect.objectContaining({
      site_key: 'eytitu', show_on_map: true, pin_count: 0, visible_pin_count: 0
    }));
  });

  it('validates and saves partner type visibility', async () => {
    const repository = { setSiteVisibility: jest.fn(async () => ({ status: 'updated' })) };
    const setVisibility = buildSetExternalSiteVisibilityUseCase({ repository });

    expect((await setVisibility({ siteKey: 'unknown', payload: { show_on_map: false } })).error.code).toBe('VALIDATION_FAILED');
    expect((await setVisibility({ siteKey: 'proventus', payload: { show_on_map: 'false' } })).error.code).toBe('VALIDATION_FAILED');
    expect(repository.setSiteVisibility).not.toHaveBeenCalled();

    repository.setSiteVisibility.mockResolvedValueOnce({ status: 'not_found' });
    const unconfigured = await setVisibility({ siteKey: 'proventus', payload: { show_on_map: false } });
    expect(unconfigured.error.statusCode).toBe(404);
    expect(unconfigured.error.message).toBe("Configure this partner's destination first");

    repository.setSiteVisibility.mockClear();
    const updated = await setVisibility({ siteKey: 'Proventus', payload: { show_on_map: false }, admin: { id: 'admin-1' } });
    expect(updated.data).toEqual({ site_key: 'proventus', show_on_map: false, status: 'updated' });
    expect(repository.setSiteVisibility).toHaveBeenCalledTimes(1);
    expect(repository.setSiteVisibility).toHaveBeenLastCalledWith({ siteKey: 'proventus', showOnMap: false, admin: { id: 'admin-1' } });
  });

  it('validates and saves per-pin visibility for managed listings', async () => {
    const repository = { setListingVisibility: jest.fn(async () => ({ status: 'updated' })) };
    const setVisibility = buildSetExternalListingVisibilityUseCase({ repository });

    expect((await setVisibility({ slug: 'Bad Slug', payload: { is_visible: false } })).error.code).toBe('VALIDATION_FAILED');
    expect((await setVisibility({ slug: 'job-1', payload: { is_visible: 0 } })).error.code).toBe('VALIDATION_FAILED');
    expect(repository.setListingVisibility).not.toHaveBeenCalled();

    repository.setListingVisibility.mockResolvedValueOnce({ status: 'not_found' });
    expect((await setVisibility({ slug: 'unknown-pin', payload: { is_visible: false } })).error.statusCode).toBe(404);
    repository.setListingVisibility.mockClear();
    const updated = await setVisibility({ slug: 'JOB-1', payload: { is_visible: false }, admin: { id: 'admin-1' } });
    expect(updated.data).toEqual({ slug: 'job-1', is_visible: false, status: 'updated' });
    expect(repository.setListingVisibility).toHaveBeenCalledTimes(1);
    expect(repository.setListingVisibility).toHaveBeenLastCalledWith({ slug: 'job-1', isVisible: false, admin: { id: 'admin-1' } });
  });

  it('keeps the type visibility field out of destination saves and preserves pin visibility on partial updates', async () => {
    const repository = {
      saveSite: jest.fn(async ({ siteKey, config }) => ({ site_key: siteKey, ...config })),
      getSite: jest.fn(async () => ({ enabled: true })),
      saveListing: jest.fn(async () => ({ status: 'updated' }))
    };
    const saveSite = buildSaveExternalSiteUseCase({ repository });
    await saveSite({ siteKey: 'mapviu', payload: { url_template: 'https://mapviu.ph/item/{id}', enabled: false } });
    expect(repository.saveSite.mock.calls[0][0].config).not.toHaveProperty('show_on_map');

    const saveListing = buildSaveExternalListingUseCase({ repository });
    await saveListing({ slug: 'mapviu-1', payload: {
      title: 'Sample listing', external_provider: 'mapviu', external_reference_id: '1',
      external_record_origin: 'manual', latitude: 10, longitude: 122
    } });
    expect(repository.saveListing.mock.calls[0][0].payload.is_visible).toBeUndefined();
    expect(getExternalListingEditableFields({}).includes('is_visible')).toBe(false);
    expect(getExternalListingEditableFields({ is_visible: false })).toContain('is_visible');
  });

  it('rejects missing coordinates and duplicate partner records', async () => {
    const repository = { getSite: jest.fn(async () => ({ enabled: true })), saveListing: jest.fn(async () => ({ status: 'duplicate' })) };
    const save = buildSaveExternalListingUseCase({ repository });
    const payload = { title: 'Sample hotel', external_provider: 'synqcore', external_reference_id: '123', external_record_origin: 'event_seed', latitude: '', longitude: 122.5 };
    expect((await save({ slug: 'hotel-123', payload })).success).toBe(false);
    expect(repository.saveListing).not.toHaveBeenCalled();
    expect((await save({ slug: 'hotel-123', payload: { ...payload, latitude: 10.7 } })).error.code).toBe('CONFLICT');
  });

  it('keeps the older write path from changing Admin-managed pins', async () => {
    const repository = {
      upsertExternalListing: jest.fn(async () => ({ status: 'managed_conflict' })),
      deleteExternalListingBySlug: jest.fn(async () => ({ status: 'managed_conflict' }))
    };
    const update = buildUpsertExternalStorefrontListingUseCase({ storefrontDiscoveryRepository: repository });
    const remove = buildDeleteExternalStorefrontListingUseCase({ storefrontDiscoveryRepository: repository });
    const changed = await update({ slug: 'hotel-123', payload: { tenant_name: 'Sample hotel', external_storefront_url: 'https://synqcore.ph/123' } });
    const deleted = await remove({ slug: 'hotel-123' });
    expect(changed.error.code).toBe('CONFLICT');
    expect(deleted.error.code).toBe('CONFLICT');
  });
});
