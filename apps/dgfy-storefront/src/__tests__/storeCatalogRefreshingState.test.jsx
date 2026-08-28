/** @vitest-environment jsdom */
import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreCatalogEmptyStates } from '../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { StorefrontBranchSwitchFeedback } from '../shared/components/storefront/StorefrontBranchSwitchFeedback.jsx';
import { requestJson } from '../services/requestJson.js';
import { useStoreCatalogLoader } from '../shared/hooks/useStoreCatalogLoader.js';

vi.mock('../services/requestJson.js', () => ({
  requestJson: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn()
  }
}));

const buildLoaderProps = (slug = 'storefront') => ({
  routeSlug: '',
  routeSubpage: '',
  routeServiceItemId: null,
  routeItemId: null,
  isStorePage: true,
  selectedStore: { slug, workflow_mode: 'fnb' },
  setSelectedStore: vi.fn(),
  setRouteSlug: vi.fn(),
  preferredStoreLocationSelection: null,
  voucherCode: ''
});

describe('useStoreCatalogLoader branch refresh state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestJson.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('clears branch feedback when an in-flight catalog request is canceled', () => {
    const { result, rerender, unmount } = renderHook(
      (props) => useStoreCatalogLoader(props),
      { initialProps: buildLoaderProps() }
    );

    act(() => {
      result.current.setStoreLocations([{ location_id: 7, name: 'Second Branch' }]);
    });
    act(() => {
      result.current.handleBranchMenuSelection('7');
    });

    expect(result.current.branchSwitchFeedback).toEqual({ label: 'Second Branch' });

    act(() => {
      rerender(buildLoaderProps('different-storefront'));
      vi.advanceTimersByTime(300);
    });

    expect(result.current.branchSwitchFeedback).toBeNull();
    unmount();
  });
});

describe('StoreCatalogEmptyStates branch refresh state', () => {
  it('shows an in-place loading message while a populated catalog refreshes', () => {
    render(
      <StoreCatalogEmptyStates
        catalogState="loading"
        catalogError=""
        catalogSearch=""
        filteredCatalog={[{ item_id: 1 }]}
        hasCatalogSearchQuery={false}
        isMobileViewport={false}
        isServicesMode={false}
      />
    );

    expect(screen.getByText('Loading branch menu')).toBeTruthy();
    expect(screen.getByText(/latest menu for this branch/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check Again' })).toBeNull();
  });

  it('identifies the branch while its catalog is switching', () => {
    render(<StorefrontBranchSwitchFeedback branchName="Space Bar Festive (2nd Branch)" />);

    const overlay = screen.getByTestId('storefront-branch-switch-overlay');
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.inset).toBe('0px');
    expect(overlay.style.backdropFilter).toBe('blur(4px)');
    expect(overlay.style.pointerEvents).toBe('auto');
    expect(status.style.minWidth).toBe('236px');
    expect(status.style.padding).toBe('14px 18px');
    expect(status.style.fontSize).toBe('14px');
    expect(screen.getByText('Switching to Space Bar Festive (2nd Branch)…')).toBeTruthy();
  });
});
