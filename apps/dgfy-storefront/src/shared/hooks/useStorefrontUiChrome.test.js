/** @vitest-environment jsdom */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStorefrontUiChrome } from './useStorefrontUiChrome.js';

const baseProps = {
  appBasePath: '/',
  isAccountDrawerOpen: false,
  isCheckoutOpen: false,
  isFnbOrderSubpage: false,
  isGuestTrackingDrawerOpen: false,
  isStandaloneAccountPage: false,
  orderSuccessAnimationTimerRef: { current: null },
  serviceWorkerUrl: '/service-worker.js',
  setViewportWidth: vi.fn()
};

describe('useStorefrontUiChrome', () => {
  afterEach(() => {
    cleanup();
    document.body.removeAttribute('style');
  });

  it('preserves the clicked storefront position while the cart locks body scrolling', () => {
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });

    const { rerender } = renderHook(
      ({ isCheckoutOpen }) => useStorefrontUiChrome({ ...baseProps, isCheckoutOpen }),
      { initialProps: { isCheckoutOpen: true } }
    );

    expect(document.body.style.overflow).toBe('visible');
    expect(document.body.style.height).toBe('auto');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-420px');
    expect(document.body.style.width).toBe('100%');
    expect(document.body.style.transition).toBe('');
    expect(document.body.style.willChange).toBe('');

    rerender({ isCheckoutOpen: false });

    expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: 'auto' });
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.width).toBe('');

    scrollTo.mockRestore();
    vi.useRealTimers();
  });

});
