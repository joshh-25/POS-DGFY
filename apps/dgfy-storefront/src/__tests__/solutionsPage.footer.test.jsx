/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SolutionsPage } from '../discovery/pages/SolutionsPage.jsx';

describe('Solutions page footer', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses the compact shared footer without navigation columns', () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    render(
      <SolutionsPage
        logoSrc="/logo.svg"
        onExploreClick={vi.fn()}
        isMobileViewport={false}
      />
    );

    const footer = screen.getByRole('contentinfo');
    expect(footer.id).toBe('solutions-contact-anchor');
    expect(within(footer).queryByText('Company', { exact: true })).toBeNull();
    expect(within(footer).queryByText('Explore', { exact: true })).toBeNull();
    expect(within(footer).queryByText('For Business', { exact: true })).toBeNull();
    expect(within(footer).queryByText('Contact', { exact: true })).toBeNull();
    expect(within(footer).getByAltText('DGFY logo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Register Your Business' })).toBeTruthy();
  });
});
