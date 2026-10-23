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

  it('uses a scrollbar-hidden single-line mobile rail for Shift sections', () => {
    render(
      <PosLineTabNavigation
        tabs={tabs}
        activeTab="location"
        onTabChange={vi.fn()}
        ariaLabel="Shift sections"
        hideScrollbar
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Shift sections' });
    const locationTab = screen.getByRole('tab', { name: 'Shift Location' });

    expect(tablist.parentElement.className).toContain('overflow-x-auto');
    expect(tablist.parentElement.className).not.toContain('overflow-x-hidden');
    expect(tablist.parentElement.className).toContain('border-b');
    expect(tablist.parentElement.className).toContain('border-slate-200');
    expect(tablist.parentElement.className).toContain('overflow-y-hidden');
    expect(tablist.parentElement.className).toContain('[scrollbar-width:none]');
    expect(tablist.parentElement.className).toContain('[&::-webkit-scrollbar]:hidden');
    expect(tablist.className).toContain('-mb-px');
    expect(tablist.className).toContain('flex min-w-full items-end');
    expect(tablist.className).not.toContain('grid-cols-2');
    expect(locationTab.className).toContain('min-w-max flex-1 justify-center px-2 whitespace-nowrap');
    expect(locationTab.querySelectorAll('span')[0].textContent).toBe('Location');
    expect(locationTab.querySelectorAll('span')[0].className).toContain('min-[1024px]:hidden');
    expect(locationTab.getAttribute('aria-label')).toBe('Shift Location');
    expect(locationTab.className).toContain('border-[#1A4E8D]');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('fills the available row when labels fit and preserves one-row scrolling otherwise', () => {
    render(
      <PosLineTabNavigation
        tabs={tabs}
        activeTab="location"
        onTabChange={vi.fn()}
        ariaLabel="Other sections"
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Other sections' });
    const firstTab = screen.getByRole('tab', { name: 'Shift Location' });

    expect(tablist.className).toContain('min-w-full');
    expect(tablist.parentElement.className).toContain('overflow-x-auto');
    expect(firstTab.className).toContain('min-w-max flex-1 justify-center');
    expect(firstTab.className).toContain('whitespace-nowrap');
  });
});
