/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosReportsToolbar from '../components/PosReportsToolbar.jsx';
import { buildPosReportsActiveFilters } from '../components/posReportsActiveFilters.js';

const baseProps = {
  onSearchQueryChange: vi.fn(),
  onOpenFilters: vi.fn(),
  onOpenDateFilter: vi.fn(),
  onPrint: vi.fn(),
  onExport: vi.fn(),
  onRemoveFilter: vi.fn(),
  onClearAllFilters: vi.fn()
};

describe('POS reports active filter toolbar', () => {
  afterEach(() => cleanup());

  it('counts only active criteria and does not mistake the default report range for an applied date filter', () => {
    const defaultRangeChips = buildPosReportsActiveFilters({
      dateRange: { dateFrom: '2026-08-01', dateTo: '2026-09-22' },
      granularity: 'daily',
      defaultGranularity: 'daily'
    });
    const appliedChips = buildPosReportsActiveFilters({
      dateFilterApplied: true,
      dateRange: { dateFrom: '2026-08-28', dateTo: '2026-08-28' },
      granularity: 'daily',
      defaultGranularity: 'daily',
      cashierLabel: 'Len2',
      paymentLabel: 'Cash',
      searchQuery: '  NF-000125  '
    });

    expect(defaultRangeChips).toEqual([]);
    expect(appliedChips.map(({ key }) => key)).toEqual(['date', 'cashier', 'payment', 'search']);
    expect(appliedChips.map(({ label }) => label)).toEqual([
      'Date: Aug 28, 2026',
      'Cashier: Len2',
      'Payment: Cash',
      'Search: NF-000125'
    ]);
  });

  it('keeps the badge count equal to the visible removable chips and supports clearing one or all', () => {
    const activeFilterChips = buildPosReportsActiveFilters({
      dateFilterApplied: true,
      dateRange: { dateFrom: '2026-08-28', dateTo: '2026-08-28' },
      granularity: 'daily',
      defaultGranularity: 'daily',
      cashierLabel: 'Len2',
      paymentLabel: 'Cash'
    });
    const onRemoveFilter = vi.fn();
    const onClearAllFilters = vi.fn();

    render(<PosReportsToolbar {...baseProps} activeFilterChips={activeFilterChips} onRemoveFilter={onRemoveFilter} onClearAllFilters={onClearAllFilters} />);

    const filterButton = screen.getByRole('button', { name: 'Filter, 3 filters applied' });
    expect(filterButton.className).toContain('relative');
    expect(filterButton.querySelector('.dgfy-pos-filter-count-badge')?.className).toContain('ml-2');
    expect(filterButton.textContent).toContain('3');

    const appliedFilters = within(screen.getByRole('group', { name: 'Applied report filters' }));
    expect(appliedFilters.getAllByRole('button')).toHaveLength(4);
    fireEvent.click(appliedFilters.getByRole('button', { name: 'Remove filter: Payment: Cash' }));
    expect(onRemoveFilter).toHaveBeenCalledWith('payment');
    fireEvent.click(appliedFilters.getByRole('button', { name: 'Clear all report filters' }));
    expect(onClearAllFilters).toHaveBeenCalledTimes(1);
  });

  it('hides the count and clear action when there are no applied filters', () => {
    render(<PosReportsToolbar {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Applied report filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all report filters' })).toBeNull();
  });

  it('keeps compact accessible filter controls beside search at mobile widths', () => {
    render(<PosReportsToolbar {...baseProps} />);

    const search = screen.getByRole('searchbox', { name: 'Search reports' });
    const searchRow = search.parentElement.parentElement;
    const filterButton = screen.getByRole('button', { name: 'Filter' });
    const dateFilterButton = screen.getByRole('button', { name: 'Filter by Date' });

    expect(search.className).toContain('h-10');
    expect(search.className).toContain('pl-9');
    expect(search.className).toContain('text-sm');
    expect(search.className).toContain('placeholder:text-slate-500');
    expect(search.parentElement.querySelector('svg')?.getAttribute('class')).toContain('h-4 w-4');
    expect(search.parentElement.querySelector('svg')?.getAttribute('class')).toContain('text-slate-400');
    expect(filterButton.parentElement.parentElement).toBe(searchRow);
    expect(dateFilterButton.parentElement.parentElement).toBe(searchRow);
    expect(filterButton.className).toContain('h-11');
    expect(filterButton.className).toContain('w-11');
    expect(dateFilterButton.className).toContain('h-11');
    expect(dateFilterButton.className).toContain('w-11');
    expect(screen.getByText('Filter').className).toContain('lg:not-sr-only');
    expect(screen.getByText('Filter by Date').className).toContain('lg:not-sr-only');
  });
});
