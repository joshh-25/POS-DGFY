import { jest } from '@jest/globals';
import { EVENT_SEED_SCHEMA, extractExternalEventSeed, validateExternalEventSeed } from '../src/modules/storefrontDiscovery/domain/externalEventSeedMapping.js';
import { applyExternalEventSeed } from '../src/modules/storefrontDiscovery/usecases/externalEventSeedApply.js';

const uuid = '11111111-2222-4333-8444-555555555555';
const mapviu = (overrides = {}) => ({
  id: uuid, title: 'Synthetic rental', latitude: '11.1', longitude: '122.2',
  status: 'active', moderation_status: 'approved', hide_exact_location: '0',
  distribution_scope: 'both', geocoded_address: 'Example street', description: 'A small rental',
  email: 'person@example.test', phone: '09999999999', price: '999999', ...overrides
});
const synqcore = (overrides = {}) => ({ id: 42, name: 'Synthetic stay', lat: 10.1, lng: 123.1,
  formatted_address: 'Example avenue', email: 'person@example.test', ...overrides });
const extract = (s = [synqcore()], m = [[mapviu()]]) => extractExternalEventSeed({
  synqcoreExport: { properties: s }, mapviuExports: m.map((rows) => [{ type: 'table', name: 'properties', data: rows }])
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
    const result = extract([synqcore({ lat: null }), synqcore({ id: 43, name: 'Test Stays' })], [rows]);
    expect(result.listings).toHaveLength(0);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      'no_coordinates', 'test_record', 'no_coordinates', 'hidden_location',
      'not_active', 'not_approved', 'client_only_scope', 'test_record', 'pii_in_title'
    ]);
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
      external_record_origin: 'event_seed', is_visible: true
    }));
  });
});
