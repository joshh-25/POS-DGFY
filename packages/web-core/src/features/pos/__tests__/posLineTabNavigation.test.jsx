// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosLineTabNavigation from '../components/PosLineTabNavigation.jsx';

afterEach(() => cleanup());

describe('PosLineTabNavigation', () => {
  const tabs = [
    { id: 'location', label: 'Shift Location', mobileLabel: 'Location' },
    { id: 'session', label: 'Shift Session', mobileLabel: 'Session' },
    { id: 'cash', label: 'Cash Drawer', mobileLabel: 'Cash' },
    { id: 'history', label: 'Cashier History', mobileLabel: 'History' }
  ];

  it('uses full-width centered mobile tabs and a scrollbar-hidden desktop line rail', () => {
    render(
      <PosLineTabNavigation
        tabs={tabs}
        activeTab="location"
        onTabChange={vi.fn()}
        ariaLabel="Shift sections"
        hideScrollbar
        mobileGridColumns={2}
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Shift sections' });
    const locationTab = screen.getByRole('tab', { name: 'Shift Location' });

    expect(tablist.parentElement.className).toContain('overflow-x-hidden');
    expect(tablist.parentElement.className).toContain('border-b');
    expect(tablist.parentElement.className).toContain('border-slate-200');
    expect(tablist.parentElement.className).toContain('overflow-y-hidden');
    expect(tablist.parentElement.className).toContain('[scrollbar-width:none]');
    expect(tablist.parentElement.className).toContain('[&::-webkit-scrollbar]:hidden');
    expect(tablist.className).toContain('-mb-px');
    expect(tablist.className).toContain('grid grid-cols-2 min-w-0 w-full');
    expect(tablist.className).not.toContain('flex min-w-max');
    expect(locationTab.className).toContain('w-full min-w-0 justify-center');
    expect(locationTab.className).toContain('text-center');
    expect(locationTab.querySelectorAll('span')[0].textContent).toBe('Location');
    expect(locationTab.querySelectorAll('span')[0].className).toContain('min-[1024px]:hidden');
    expect(locationTab.getAttribute('aria-label')).toBe('Shift Location');
    expect(locationTab.className).toContain('border-[#1A4E8D]');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('keeps horizontal scrolling as the default for other POS surfaces', () => {
    render(
      <PosLineTabNavigation
        tabs={tabs}
        activeTab="location"
        onTabChange={vi.fn()}
        ariaLabel="Other sections"
      />
    );

    expect(screen.getByRole('tablist', { name: 'Other sections' }).className)
      .toContain('min-w-max');
  });
});
