import { jest } from '@jest/globals';
import {
  normalizeRedirectTemplate,
  resolveExternalRedirectUrl
} from '../src/modules/storefrontDiscovery/domain/externalRedirectPolicy.js';
import {
  buildResolveExternalRedirectUseCase,
  buildSaveExternalListingUseCase
} from '../src/modules/storefrontDiscovery/usecases/externalRedirectUseCases.js';
import {
  buildDeleteExternalStorefrontListingUseCase,
  buildListStorefrontDiscoveryUseCase,
  buildListStorefrontMapPinsUseCase,
  buildUpsertExternalStorefrontListingUseCase
} from '../src/modules/storefrontDiscovery/usecases/storefrontDiscoveryUseCases.js';

describe('external destination policy', () => {
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
