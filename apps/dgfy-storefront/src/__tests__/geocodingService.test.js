import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../services/requestJson.js';
import { reverseGeocodeDeliveryCoordinates, searchDeliveryAddresses } from '../services/geocodingService.js';
import { reverseGeocodeDeliveryPin } from '../features/locations/utils/pinnedDeliveryAddress.js';

vi.mock('../services/requestJson.js', () => ({ requestJson: vi.fn() }));

const urlOf = (call) => new URL(call[0], 'http://storefront.test');

beforeEach(() => {
  requestJson.mockReset();
});

describe('#759 searchDeliveryAddresses -- forward geocoding through dgfy-api', () => {
  it('queries /api/v1/storefront/address-search with the trimmed query, limit and location bias', async () => {
    requestJson.mockResolvedValue({ results: [] });
    await searchDeliveryAddresses({ query: '  Jaro Plaza ', bias: { latitude: 10.72, longitude: 122.56 } });

    const url = urlOf(requestJson.mock.calls[0]);
    expect(url.pathname).toBe('/api/v1/storefront/address-search');
    expect(url.searchParams.get('query')).toBe('Jaro Plaza');
    expect(url.searchParams.get('limit')).toBe('6');
    expect(url.searchParams.get('lat')).toBe('10.72');
    expect(url.searchParams.get('lon')).toBe('122.56');
  });

  it('omits the bias pair when it is incomplete (the API rejects a single axis)', async () => {
    requestJson.mockResolvedValue({ results: [] });
    await searchDeliveryAddresses({ query: 'Jaro', bias: { latitude: 10.72, longitude: null } });

    const url = urlOf(requestJson.mock.calls[0]);
    expect(url.searchParams.has('lat')).toBe(false);
    expect(url.searchParams.has('lon')).toBe(false);
  });

  it('does not call the API below the 2-character minimum', async () => {
    await expect(searchDeliveryAddresses({ query: ' J ' })).resolves.toEqual([]);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('normalizes results and drops ones without an address or valid coordinates', async () => {
    requestJson.mockResolvedValue({
      results: [
        { address_line: 'Jaro Plaza, Jaro, Iloilo City', latitude: '10.7246', longitude: 122.5585, precision: 'street' },
        { address_line: '52 Rizal Street, Jaro, Iloilo City', latitude: 10.72, longitude: 122.56, precision: 'street', components: { housenumber: '52' } },
        { address_line: '', latitude: 10.7, longitude: 122.5 },
        { address_line: 'No coordinates', latitude: null, longitude: 122.5 }
      ]
    });

    await expect(searchDeliveryAddresses({ query: 'Jaro' })).resolves.toEqual([
      { addressLine: 'Jaro Plaza, Jaro, Iloilo City', latitude: 10.7246, longitude: 122.5585, precision: 'street', houseNumber: null },
      // #2594: the house number the search resolved rides along to prefill the details field.
      { addressLine: '52 Rizal Street, Jaro, Iloilo City', latitude: 10.72, longitude: 122.56, precision: 'street', houseNumber: '52' }
    ]);
  });
});

describe('#506 reverse geocoding goes through dgfy-api, never a browser-side third party', () => {
  it('queries /api/v1/storefront/reverse-geocode with lat/lon and returns the address line', async () => {
    requestJson.mockResolvedValue({ address_line: 'Diversion Road, Mandurriao, Iloilo City', precision: 'street' });
    await expect(reverseGeocodeDeliveryCoordinates({ latitude: 10.72, longitude: 122.54 }))
      .resolves.toBe('Diversion Road, Mandurriao, Iloilo City');

    const url = urlOf(requestJson.mock.calls[0]);
    expect(url.pathname).toBe('/api/v1/storefront/reverse-geocode');
    expect(url.searchParams.get('lat')).toBe('10.72');
    expect(url.searchParams.get('lon')).toBe('122.54');
    expect(String(requestJson.mock.calls[0][0])).not.toMatch(/nominatim/i);
  });

  it('treats the API coordinate-only fallback as "no address" so callers keep their own wording', async () => {
    requestJson.mockResolvedValue({ address_line: 'Pinned location (10.720000, 122.540000)', precision: 'coordinate_only' });
    await expect(reverseGeocodeDeliveryCoordinates({ latitude: 10.72, longitude: 122.54 })).resolves.toBe('');
  });

  it('reverseGeocodeDeliveryPin falls back to the pinned-coordinate wording when the API fails', async () => {
    requestJson.mockRejectedValue(new Error('Request failed before reaching API.'));
    await expect(reverseGeocodeDeliveryPin({ latitude: 10.72, longitude: 122.54 }))
      .resolves.toBe('Pinned map location (10.720000, 122.540000)');
  });

  it('reverseGeocodeDeliveryPin rethrows an aborted request instead of reporting a fallback', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    requestJson.mockRejectedValue(abort);
    await expect(reverseGeocodeDeliveryPin({ latitude: 10.72, longitude: 122.54 })).rejects.toBe(abort);
  });
});
