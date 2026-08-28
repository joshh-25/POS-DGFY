/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StoreCatalogEmptyStates } from '../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { StorefrontBranchSwitchFeedback } from '../shared/components/storefront/StorefrontBranchSwitchFeedback.jsx';

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
