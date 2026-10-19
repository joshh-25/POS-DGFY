/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useStorefrontSettingsController from '../settings/useStorefrontSettingsController.js';

describe('Storefront settings location editor (#2595)', () => {
  it('edits a saved location as its geocoded location plus the street no./unit details', () => {
    const { result } = renderHook(() => useStorefrontSettingsController());

    act(() => result.current.handleEditLocation({
      location_id: 7,
      name: 'Jaro branch',
      address_line: '118, Ground floor, E. Lopez Street, Jaro, Iloilo City',
      address_details: '118, Ground floor',
      latitude: 10.72,
      longitude: 122.56
    }));

    expect(result.current.locationForm.address_line).toBe('E. Lopez Street, Jaro, Iloilo City');
    expect(result.current.locationForm.address_details).toBe('118, Ground floor');
  });

  it('keeps an older location whole and leaves its details empty', () => {
    const { result } = renderHook(() => useStorefrontSettingsController());

    act(() => result.current.handleEditLocation({ location_id: 8, name: 'Oton', address_line: 'Poblacion, Oton, Iloilo', latitude: 10.69, longitude: 122.47 }));

    expect(result.current.locationForm.address_line).toBe('Poblacion, Oton, Iloilo');
    expect(result.current.locationForm.address_details).toBe('');
  });

  it('starts a new location with empty details', () => {
    const { result } = renderHook(() => useStorefrontSettingsController());
    expect(result.current.locationForm.address_details).toBe('');
  });
});
