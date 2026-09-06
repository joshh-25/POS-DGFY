// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStorefrontRouteRuntime } from './useStorefrontRouteRuntime.js';

describe('useStorefrontRouteRuntime', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/tenant-store/tinda-han/order?location_id=1');
  });

  it('hydrates all route values from the current storefront URL', () => {
    const { result } = renderHook(() => useStorefrontRouteRuntime());

    expect(result.current.routeSlug).toBe('tinda-han');
    expect(result.current.routeSubpage).toBe('order');
    expect(result.current.routeServiceItemId).toBeNull();
    expect(result.current.routeItemId).toBeNull();
  });

  it('keeps route setters available for navigation hooks', () => {
    const { result } = renderHook(() => useStorefrontRouteRuntime());

    act(() => result.current.setRouteSubpage('track'));
    act(() => result.current.setRouteSlug('other-store'));

    expect(result.current.routeSubpage).toBe('track');
    expect(result.current.routeSlug).toBe('other-store');
  });

  it('does not probe the platform host for custom-domain context', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderHook(() => useStorefrontRouteRuntime());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

