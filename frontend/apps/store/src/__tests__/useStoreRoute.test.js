/* @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGetStoreRoute = vi.fn();

vi.mock('../services/routeCalculatorService.js', () => ({
  getStoreRoute: (...args) => mockGetStoreRoute(...args)
}));

const { useStoreRoute } = await import('../shared/hooks/useStoreRoute.js');

const ORIGIN = { latitude: 10.698, longitude: 122.5645 };
const DESTINATION = { latitude: 10.7202, longitude: 122.5621 };

describe('useStoreRoute', () => {
  afterEach(() => {
    mockGetStoreRoute.mockReset();
  });

  it('does nothing when disabled or coordinates are missing', () => {
    const { result } = renderHook(() => useStoreRoute({ origin: ORIGIN, destination: null, enabled: true }));
    expect(result.current).toEqual({ distanceKm: null, durationMinutes: null, geometry: null, loading: false, error: '' });
    expect(mockGetStoreRoute).not.toHaveBeenCalled();
  });

  it('fetches the route and maps distance/duration into km/minutes', async () => {
    mockGetStoreRoute.mockResolvedValue({
      distance_meters: 3220.846,
      duration_seconds: 333,
      geometry: { type: 'LineString', coordinates: [[122.5645, 10.698], [122.5621, 10.7202]] }
    });

    const { result } = renderHook(() => useStoreRoute({ origin: ORIGIN, destination: DESTINATION, enabled: true }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.distanceKm).toBeCloseTo(3.220846, 5);
    expect(result.current.durationMinutes).toBe(6);
    expect(result.current.geometry).toEqual({ type: 'LineString', coordinates: [[122.5645, 10.698], [122.5621, 10.7202]] });
    expect(result.current.error).toBe('');
  });

  it('degrades gracefully to an error state instead of throwing when the backend is unavailable', async () => {
    mockGetStoreRoute.mockRejectedValue(new Error('Route calculator is temporarily unavailable.'));

    const { result } = renderHook(() => useStoreRoute({ origin: ORIGIN, destination: DESTINATION, enabled: true }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Route calculator is temporarily unavailable.');
    expect(result.current.distanceKm).toBeNull();
  });

  it('does not re-fetch when origin/destination round to the same coordinates', async () => {
    mockGetStoreRoute.mockResolvedValue({ distance_meters: 1000, duration_seconds: 60, geometry: null });

    const { result, rerender } = renderHook(
      ({ origin, destination }) => useStoreRoute({ origin, destination, enabled: true }),
      { initialProps: { origin: ORIGIN, destination: DESTINATION } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetStoreRoute).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ origin: { ...ORIGIN }, destination: { ...DESTINATION } });
    });

    expect(mockGetStoreRoute).toHaveBeenCalledTimes(1);
  });
});
