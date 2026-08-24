/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api.js', () => ({ default: apiMock }));

import {
  fetchRegistrationIndustries,
  resetRegistrationIndustriesCache
} from '../registrationIndustryService.js';
import { REGISTRATION_INDUSTRIES_DESCRIBED } from '@sieitzz/shared-constants/registrationIndustries';

describe('registrationIndustryService', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    resetRegistrationIndustriesCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the live catalog from the endpoint on success', async () => {
    const liveIndustries = [{
      key: 'retail',
      label: 'Retail (live)',
      niches: '["Supermarket", "Grocery store"]'
    }];
    apiMock.get.mockResolvedValueOnce({ data: { data: { industries: liveIndustries } } });

    const result = await fetchRegistrationIndustries();

    expect(result).toEqual([{
      ...liveIndustries[0],
      niches: ['Supermarket', 'Grocery store']
    }]);
    expect(apiMock.get).toHaveBeenCalledWith('/registration/industries', { skipTenantAuthHeaders: true });
  });

  it('uses an empty niches array for malformed live catalog values', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { data: { industries: [{ key: 'retail', niches: '{"not":"an array"}' }] } }
    });

    await expect(fetchRegistrationIndustries()).resolves.toEqual([
      { key: 'retail', niches: [] }
    ]);
  });

  it('falls back to the local catalog constant, never blocking, when the request fails', async () => {
    apiMock.get.mockRejectedValueOnce(new Error('network unreachable'));

    const result = await fetchRegistrationIndustries();

    expect(result).toEqual(REGISTRATION_INDUSTRIES_DESCRIBED);
  });

  it('falls back to the local catalog constant when the endpoint returns an empty list', async () => {
    apiMock.get.mockResolvedValueOnce({ data: { data: { industries: [] } } });

    const result = await fetchRegistrationIndustries();

    expect(result).toEqual(REGISTRATION_INDUSTRIES_DESCRIBED);
  });

  it('caches the resolved catalog and does not refetch on a second call', async () => {
    apiMock.get.mockResolvedValueOnce({ data: { data: { industries: [{ key: 'retail' }] } } });

    await fetchRegistrationIndustries();
    await fetchRegistrationIndustries();

    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it('refetches after resetRegistrationIndustriesCache()', async () => {
    apiMock.get.mockResolvedValue({ data: { data: { industries: [{ key: 'retail' }] } } });

    await fetchRegistrationIndustries();
    resetRegistrationIndustriesCache();
    await fetchRegistrationIndustries();

    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });
});
