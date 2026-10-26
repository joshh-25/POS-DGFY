import { describe, expect, it, jest } from '@jest/globals';
import { EVENT_SEED_SCHEMA, extractExternalEventSeed, validateExternalEventSeed } from '../src/modules/storefrontDiscovery/domain/externalEventSeedMapping.js';
import { applyExternalEventSeed } from '../src/modules/storefrontDiscovery/usecases/externalEventSeedApply.js';

const uuid = '11111111-2222-4333-8444-555555555555';
const proventusUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const mapviu = (overrides = {}) => ({
  id: uuid, title: 'Synthetic rental', latitude: '11.1', longitude: '122.2',
  status: 'active', moderation_status: 'approved', hide_exact_location: '0',
  distribution_scope: 'both', geocoded_address: 'Example street', description: 'A small rental',
  email: 'person@example.test', phone: '09999999999', price: '999999', ...overrides
});
const synqcore = (overrides = {}) => ({ id: 42, name: 'Synthetic stay', lat: 10.1, lng: 123.1,
  formatted_address: 'Example avenue', email: 'person@example.test', ...overrides });
const proventus = (overrides = {}) => ({
  id: proventusUuid, name: 'Synthetic employer', latitude: '10.7', longitude: '122.5',
  location: 'Example district', description: 'A synthetic company description',
  status: 'active', isActive: 1, email: 'employer@example.test', phone: '09912340000',
  website: 'https://facebook.example.test/company', logo: 'https://proventous.example.test/logo.png',
  industry: 'Synthetic industry', businessType: 'Synthetic corporation', jobOpenings: 1,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', ...overrides
});
const synqcoreRoomsFor = (properties) => properties.map((property, index) => ({
  room_id: 4200 + index, property_id: property.id, room_lat: 11.1 + index, room_lng: 122.2 + index
}));
const extract = (s = [synqcore()], m = [[mapviu()]], rooms = synqcoreRoomsFor(s)) => extractExternalEventSeed({
  synqcoreExport: { properties: s }, synqcoreRoomsExport: { rooms },
  mapviuExports: m.map((rows) => [{ type: 'table', name: 'properties', data: rows }])
});

describe('external event seed allow-list', () => {
  it('retains only approved public fields, deduplicates UUIDs and truncates descriptions', () => {
    const result = extract([synqcore()], [[mapviu({ description: 'a'.repeat(180) })], [mapviu()]]);
    expect(result.listings).toHaveLength(2);
    expect(Object.keys(result.listings[1]).sort()).toEqual([
      'address_line', 'description', 'external_provider', 'external_reference_id',
      'latitude', 'longitude', 'slug', 'title'
    ]);
    expect(result.listings[1].slug).toBe(`mapviu-${uuid}`);
    expect(result.listings[1].description).toHaveLength(120);
    expect(JSON.stringify(result)).not.toMatch(/person@|099999|price|999999/);
  });

  it('skips missing coordinates, hidden or unpublished rows, tests and contact-bearing titles', () => {
    const rows = [
      mapviu({ id: '11111111-2222-4333-8444-555555555550', latitude: 0, longitude: 0 }),
      mapviu({ id: '11111111-2222-4333-8444-555555555551', hide_exact_location: '1' }),
      mapviu({ id: '11111111-2222-4333-8444-555555555552', status: 'draft' }),
      mapviu({ id: '11111111-2222-4333-8444-555555555553', moderation_status: 'pending' }),
      mapviu({ id: '11111111-2222-4333-8444-555555555554', distribution_scope: 'client' }),
      mapviu({ id: '11111111-2222-4333-8444-555555555555', title: 'Test property' }),
      mapviu({ id: '11111111-2222-4333-8444-555555555556', title: 'person@example.invalid' })
    ];
    const properties = [synqcore({ lat: null }), synqcore({ id: 43, name: 'Test Stays' })];
    const result = extract(properties, [rows], [
      { room_id: 4200, property_id: 42, room_lat: null, room_lng: null },
      { room_id: 4201, property_id: 43, room_lat: 10.1, room_lng: 123.1 }
    ]);
    expect(result.listings).toHaveLength(0);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      'no_coordinates', 'test_record', 'no_coordinates', 'hidden_location',
      'not_active', 'not_approved', 'client_only_scope', 'test_record', 'pii_in_title'
    ]);
  });

  it('uses the lowest room ID per property while preserving the property slug and pin coordinates', () => {
    const result = extractExternalEventSeed({
      synqcoreExport: { properties: [synqcore({ id: 100018, lat: null, lng: null })] },
      synqcoreRoomsExport: { rooms: [
        { property_id: 100018, room_id: 100319, room_lat: 10.7, room_lng: 122.56 },
        { property_id: 100018, room_id: 100315, room_lat: 10.7, room_lng: 122.56 },
        { property_id: 100018, room_id: 100316, room_lat: 10.7, room_lng: 122.56 }
      ] }
    });

    expect(result.listings).toEqual([expect.objectContaining({
      slug: 'synqcore-100018', external_reference_id: '100315',
      latitude: 10.7, longitude: 122.56
    })]);
    expect(validateExternalEventSeed({
      schema: EVENT_SEED_SCHEMA, generated_at: '2026-10-23T00:00:00Z', sources: [],
      listings: result.listings, skipped: []
    })).toBeDefined();
  });

  it('does not fall back to a property ID when its room mapping is missing', () => {
    const result = extractExternalEventSeed({
      synqcoreExport: { properties: [synqcore({ id: 100018 })] },
      synqcoreRoomsExport: { rooms: [] }
    });
    expect(result.listings).toEqual([]);
    expect(result.skipped).toEqual([{ provider: 'synqcore', reference: '100018', reason: 'missing_room_id' }]);
    expect(() => extractExternalEventSeed({ synqcoreExport: { properties: [synqcore()] } }))
      .toThrow('SynqCore room coordinates export is required');
  });

  it('validates minimal schema and performs no writes in dry-run mode', async () => {
    const seed = { schema: EVENT_SEED_SCHEMA, generated_at: '2026-10-23T00:00:00Z',
      sources: [{ provider: 'mapviu', file: 'synthetic.json', exported_at: null }], listings: extract().listings, skipped: [] };
    expect(validateExternalEventSeed(seed)).toBe(seed);
    const repository = { getSite: jest.fn(async (provider) => ({ enabled: provider === 'synqcore' })), saveListing: jest.fn() };
    const result = await applyExternalEventSeed({ seed, repository });
    expect(result).toEqual(expect.objectContaining({ dryRun: true, missingSites: ['mapviu'] }));
    expect(repository.saveListing).not.toHaveBeenCalled();
    expect(() => validateExternalEventSeed({ ...seed, listings: [{ ...seed.listings[0], guest_email: 'secret' }] })).toThrow('Unexpected listing fields');
  });

  it('applies enabled rows through the existing save use case and reports disabled sites', async () => {
    const seed = { schema: EVENT_SEED_SCHEMA, generated_at: '2026-10-23T00:00:00Z',
      sources: [{ provider: 'mapviu', file: 'synthetic.json', exported_at: null }], listings: extract().listings, skipped: [] };
    const repository = {
      getSite: jest.fn(async (provider) => ({ enabled: provider === 'synqcore' })),
      saveListing: jest.fn(async () => ({ status: 'created' }))
    };
    const result = await applyExternalEventSeed({ seed, repository, apply: true });
    expect(result).toEqual(expect.objectContaining({ created: 1, failed: 1, missingSites: ['mapviu'] }));
    expect(repository.saveListing).toHaveBeenCalledTimes(1);
    expect(repository.saveListing.mock.calls[0][0].payload).toEqual(expect.objectContaining({
      external_record_origin: 'event_seed'
    }));
    expect(repository.saveListing.mock.calls[0][0].payload).not.toHaveProperty('is_visible');
  });

  it('extracts Proventus companies into the eight-field public allow-list', () => {
    const privateFields = {
      email: 'private-employer@example.test', phone: '09987654321',
      website: 'https://facebook.example.test/private-company',
      logo: 'https://proventous.example.test/storage/private-logo.png',
      industry: 'private-industry-marker', businessType: 'private-business-marker',
      jobOpenings: 8372619, createdAt: 'private-created-marker', updatedAt: 'private-updated-marker'
    };
    const { listings, skipped } = extractExternalEventSeed({
      proventusExports: [proventus({ ...privateFields, description: 'd'.repeat(140) })]
    });

    expect(skipped).toEqual([]);
    expect(listings).toHaveLength(1);
    expect(Object.keys(listings[0]).sort()).toEqual([
      'address_line', 'description', 'external_provider', 'external_reference_id',
      'latitude', 'longitude', 'slug', 'title'
    ]);
    expect(listings[0]).toEqual({
      slug: `proventus-${proventusUuid}`, external_provider: 'proventus',
      external_reference_id: proventusUuid, title: 'Synthetic employer',
      latitude: 10.7, longitude: 122.5, address_line: 'Example district', description: 'd'.repeat(120)
    });
    const serialized = JSON.stringify(listings);
    for (const value of Object.values(privateFields)) expect(serialized).not.toContain(String(value));
  });

  it('deduplicates Proventus IDs and applies skip reasons in the documented order', () => {
    const duplicateId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const companies = [
      proventus({ id: duplicateId, name: 'First synthetic employer' }),
      proventus({ id: duplicateId.toUpperCase(), name: 'Second synthetic employer' }),
      proventus({ id: 'not-a-uuid', name: 'Test employer' }),
      proventus({ id: 'cccccccc-dddd-4eee-8fff-000000000001', name: 'Test person@example.test' }),
      proventus({ id: 'cccccccc-dddd-4eee-8fff-000000000002', name: 'person@example.invalid' }),
      proventus({ id: 'cccccccc-dddd-4eee-8fff-000000000003', status: 'draft', latitude: null, longitude: null }),
      proventus({ id: 'cccccccc-dddd-4eee-8fff-000000000004', isActive: 0 }),
      proventus({ id: 'cccccccc-dddd-4eee-8fff-000000000005', latitude: null, longitude: null })
    ];
    const result = extractExternalEventSeed({ proventusExports: companies });

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].title).toBe('First synthetic employer');
    expect(result.skipped.map(({ reason }) => reason)).toEqual([
      'invalid_reference', 'test_record', 'pii_in_title', 'not_active', 'not_active', 'no_coordinates'
    ]);
  });

  it('accepts Proventus company envelopes and validates Proventus listings strictly', () => {
    const listings = extractExternalEventSeed({ proventusExports: { companies: [proventus()] } }).listings;
    expect(listings).toHaveLength(1);
    const seed = {
      schema: EVENT_SEED_SCHEMA, generated_at: '2026-10-23T00:00:00Z',
      sources: [{ provider: 'proventus', file: 'synthetic.json', exported_at: null }],
      listings, skipped: []
    };
    expect(validateExternalEventSeed(seed)).toBe(seed);
    expect(() => validateExternalEventSeed({ ...seed, listings: [{
      ...listings[0], external_provider: 'unknown', slug: `unknown-${proventusUuid}`
    }] })).toThrow('Invalid listing');
    expect(() => validateExternalEventSeed({ ...seed, listings: [{ ...listings[0], extra: 'unexpected' }] }))
      .toThrow('Unexpected listing fields');
    expect(() => extractExternalEventSeed({})).toThrow('At least one external event source is required');
    expect(() => extractExternalEventSeed({ synqcoreExport: {} }))
      .toThrow('SynqCore properties array is required');
    expect(() => extractExternalEventSeed({ mapviuExports: [] }))
      .toThrow('At least one MapViu export is required');
    expect(() => extractExternalEventSeed({ proventusExports: { companies: 'invalid' } }))
      .toThrow('Proventous companies array is required');
  });

  it('dry-runs, saves, and reports disabled Proventus sites through the existing apply use case', async () => {
    const listings = extractExternalEventSeed({ proventusExports: [proventus()] }).listings;
    const seed = {
      schema: EVENT_SEED_SCHEMA, generated_at: '2026-10-23T00:00:00Z',
      sources: [{ provider: 'proventus', file: 'synthetic.json', exported_at: null }],
      listings, skipped: []
    };
    const repository = {
      getSite: jest.fn(async () => ({ enabled: true })),
      saveListing: jest.fn(async () => ({ status: 'created' }))
    };
    const dryRun = await applyExternalEventSeed({ seed, repository });
    expect(dryRun).toEqual(expect.objectContaining({ dryRun: true, missingSites: [] }));
    expect(repository.saveListing).not.toHaveBeenCalled();

    const applied = await applyExternalEventSeed({ seed, repository, apply: true });
    expect(applied).toEqual(expect.objectContaining({ created: 1, failed: 0, missingSites: [] }));
    expect(repository.saveListing.mock.calls[0][0].payload).toEqual(expect.objectContaining({
      external_provider: 'proventus', external_record_origin: 'event_seed'
    }));
    expect(repository.saveListing.mock.calls[0][0].payload).not.toHaveProperty('is_visible');

    repository.getSite.mockResolvedValue({ enabled: false });
    const disabled = await applyExternalEventSeed({ seed, repository, apply: true });
    expect(disabled).toEqual(expect.objectContaining({ failed: 1, missingSites: ['proventus'] }));
    expect(repository.saveListing).toHaveBeenCalledTimes(1);
  });
});
