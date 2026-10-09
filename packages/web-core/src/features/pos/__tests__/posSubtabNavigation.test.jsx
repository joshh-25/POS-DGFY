// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosSubtabNavigation from '../components/PosSubtabNavigation.jsx';

afterEach(() => cleanup());

describe('PosSubtabNavigation', () => {
    it('insets desktop tabs from the horizontal clipping edge so rounded corners remain visible', () => {
        render(
            <PosSubtabNavigation
                tabs={[
                    { id: 'terminals', label: 'Branch Terminals' },
                    { id: 'shift_monitor', label: 'Shift Monitor' },
                    { id: 'orders', label: 'Branch Orders' }
                ]}
                activeTab="terminals"
                onTabChange={vi.fn()}
                ariaLabel="Admin shift location sections"
                idPrefix="pos-admin-shift-location"
                panelId="pos-admin-shift-location-panel"
                desktopColumns={3}
            />
        );

        const tablist = screen.getByRole('tablist', { name: 'Admin shift location sections' });
        const tabGrid = tablist.firstElementChild;
        const firstTab = screen.getByRole('tab', { name: 'Branch Terminals' });

        expect(tablist.className).toContain('overflow-x-auto');
        expect(tabGrid.className).toContain('min-[1024px]:px-1');
        expect(firstTab.className).toContain('rounded-lg');
        expect(firstTab.getAttribute('aria-selected')).toBe('true');
    });

    it('uses a centered, full-width three-column grid for Shift admin subtabs', () => {
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
                mobileGridColumns={3}
                compactMobile
            />
        );

        const tablist = screen.getByRole('tablist', { name: 'Admin shift location sections' });
        const firstTab = screen.getByRole('tab', { name: 'Branch Terminals' });

        expect(tablist.className).toContain('overflow-x-auto');
        expect(tablist.className).toContain('pt-2');
        expect(tablist.firstElementChild.className).toContain('grid grid-cols-3 min-w-0 w-full');
        expect(tablist.firstElementChild.className).not.toContain('flex min-w-max');
        expect(firstTab.className).toContain('w-full');
        expect(firstTab.className).toContain('justify-center');
        expect(firstTab.className).toContain('min-h-11');
        expect(firstTab.querySelectorAll('span')[0].textContent).toBe('Terminals');
        expect(firstTab.getAttribute('aria-label')).toBe('Branch Terminals');
    });
});
