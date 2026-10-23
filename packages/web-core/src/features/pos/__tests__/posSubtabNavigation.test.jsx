// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosSubtabNavigation from '../components/PosSubtabNavigation.jsx';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('PosSubtabNavigation', () => {
    it('insets desktop tabs from the horizontal clipping edge so rounded corners remain visible', () => {
        render(
            <PosSubtabNavigation
                tabs={[
                    { id: 'daily_check', label: 'Daily Sales Check', icon: ({ ...props }) => <svg {...props} /> },
                    { id: 'history', label: 'History', icon: ({ ...props }) => <svg {...props} /> },
                    { id: 'orders', label: 'Branch Orders' }
                ]}
                activeTab="daily_check"
                onTabChange={vi.fn()}
                ariaLabel="Admin shift location sections"
                idPrefix="pos-admin-shift-location"
                panelId="pos-admin-shift-location-panel"
                desktopColumns={3}
            />
        );

        const tablist = screen.getByRole('tablist', { name: 'Admin shift location sections' });
        const tabGrid = tablist.firstElementChild;
        const firstTab = screen.getByRole('tab', { name: 'Daily Sales Check' });

        expect(tablist.className).toContain('overflow-x-auto');
        expect(tablist.className).toContain('sm:-mt-2');
        expect(tabGrid.className).toContain('gap-2');
        expect(tabGrid.className).toContain('min-[1200px]:grid-cols-3');
        expect(tabGrid.className).toContain('min-[1200px]:px-1');
        expect(firstTab.className).toContain('rounded-lg');
        expect(firstTab.className).toContain('justify-center');
        expect(firstTab.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        expect(firstTab.getAttribute('aria-selected')).toBe('true');
    });

    it('keeps Shift admin subtabs in one horizontal mobile row and retains the desktop grid', () => {
        render(
            <PosSubtabNavigation
                tabs={[
                    { id: 'terminals', label: 'Branch Terminals', mobileLabel: 'Terminals' },
                    { id: 'shift_monitor', label: 'Shift Monitor', mobileLabel: 'Monitor' },
                    { id: 'orders', label: 'Branch Orders (7)', mobileLabel: 'Orders (7)' }
                ]}
                activeTab="terminals"
                onTabChange={vi.fn()}
                ariaLabel="Admin shift location sections"
                idPrefix="pos-admin-shift-location"
                panelId="pos-admin-shift-location-panel"
                desktopColumns={3}
                compactMobile
            />
        );

        const tablist = screen.getByRole('tablist', { name: 'Admin shift location sections' });
        const firstTab = screen.getByRole('tab', { name: 'Branch Terminals' });

        expect(tablist.className).toContain('overflow-x-auto');
        expect(tablist.className).toContain('pt-2');
        expect(tablist.className.split(/\s+/)).toContain('-mt-2');
        expect(tablist.className).toContain('sm:-mt-4');
        expect(tablist.firstElementChild.className).toContain('flex min-w-max');
        expect(tablist.firstElementChild.className).not.toContain('grid grid-cols-3');
        expect(tablist.firstElementChild.className).toContain('min-[1200px]:grid-cols-3');
        expect(tablist.firstElementChild.className).toContain('gap-2');
        expect(firstTab.className).toContain('min-w-36');
        expect(firstTab.className).toContain('shrink-0');
        expect(firstTab.className).toContain('whitespace-nowrap');
        expect(firstTab.className).toContain('justify-center');
        expect(firstTab.className).toContain('min-h-9');
        expect(firstTab.querySelectorAll('span')[0].textContent).toBe('Terminals');
        expect(firstTab.getAttribute('aria-label')).toBe('Branch Terminals');
    });

    it('fills the desktop row using the number of visible tabs, not the maximum configured columns', () => {
        render(
            <PosSubtabNavigation
                tabs={[
                    { id: 'daily_check', label: 'Daily Sales Check' },
                    { id: 'history', label: 'History' }
                ]}
                activeTab="daily_check"
                onTabChange={vi.fn()}
                ariaLabel="Z-reading reports"
                desktopColumns={4}
            />
        );

        const tabGrid = screen.getByRole('tablist', { name: 'Z-reading reports' }).firstElementChild;

        expect(tabGrid.className).toContain('min-[1200px]:grid-cols-2');
        expect(tabGrid.className).not.toContain('min-[1200px]:grid-cols-4');
    });

    it('keeps unselected subtabs visibly emphasized with the light DGFY-blue treatment', () => {
        render(
            <PosSubtabNavigation
                tabs={[
                    { id: 'sales', label: 'Sales' },
                    { id: 'hourly', label: 'Hourly Sales' }
                ]}
                activeTab="sales"
                onTabChange={vi.fn()}
                ariaLabel="Sales reports"
            />
        );

        const selectedTab = screen.getByRole('tab', { name: 'Sales' });
        const unselectedTab = screen.getByRole('tab', { name: 'Hourly Sales' });

        expect(selectedTab.getAttribute('aria-selected')).toBe('true');
        expect(selectedTab.className).toContain('bg-[#1A4E8D]');
        expect(unselectedTab.getAttribute('aria-selected')).toBe('false');
        expect(unselectedTab.className).toContain('border-[#9BBBE0]');
        expect(unselectedTab.className).toContain('bg-[#F5F9FF]');
        expect(unselectedTab.className).toContain('text-[#1A4E8D]');
    });

    it('recenters a selected tab again when it is clicked after the user scrolls the rail', () => {
        vi.stubGlobal('requestAnimationFrame', (callback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        render(
            <PosSubtabNavigation
                tabs={[{ id: 'sales', label: 'Sales' }, { id: 'hourly', label: 'Hourly Sales' }]}
                activeTab="sales"
                onTabChange={vi.fn()}
                ariaLabel="Sales reports"
                idPrefix="pos-sales-report"
            />
        );

        const tablist = screen.getByRole('tablist', { name: 'Sales reports' });
        const selectedTab = screen.getByRole('tab', { name: 'Sales' });
        Object.defineProperty(tablist, 'scrollWidth', { configurable: true, value: 900 });
        Object.defineProperty(tablist, 'clientWidth', { configurable: true, value: 300 });
        Object.defineProperty(tablist, 'scrollLeft', { configurable: true, value: 200 });
        tablist.getBoundingClientRect = vi.fn(() => ({ left: 40, width: 300 }));
        tablist.scrollTo = vi.fn();
        selectedTab.getBoundingClientRect = vi.fn(() => ({ left: 250, width: 80 }));

        fireEvent.click(selectedTab);

        expect(tablist.scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
    });
});
