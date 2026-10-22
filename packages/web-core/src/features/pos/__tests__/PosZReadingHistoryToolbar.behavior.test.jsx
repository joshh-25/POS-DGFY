/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosZReadingHistoryToolbar from '../components/PosZReadingHistoryToolbar.jsx';

afterEach(() => cleanup());

const baseProps = {
  onSearchQueryChange: vi.fn(),
  onApplyFilters: vi.fn(),
  onRemoveFilter: vi.fn(),
  onClearAllFilters: vi.fn(),
  onOpenDateFilter: vi.fn(),
  onPrint: vi.fn(),
  onExport: vi.fn()
};

describe('POS Z-reading history toolbar', () => {
  it('keeps search, general filters, date filtering, and export actions accessible', () => {
    render(<PosZReadingHistoryToolbar {...baseProps} />);

    expect(screen.getByRole('searchbox', { name: 'Search Z-reading history' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filter by Date' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy();
  });

  it('applies terminal and cashier filters together and keeps their removable chips outside the scroll rail', () => {
    const onApplyFilters = vi.fn();
    const onRemoveFilter = vi.fn();
    const onClearAllFilters = vi.fn();
    render(
      <PosZReadingHistoryToolbar
        {...baseProps}
        filters={{ terminalId: 'COUNTER-01', closedBy: 'Len2' }}
        terminalOptions={[
          { key: 'all-terminals', value: '', label: 'All terminals' },
          { key: 'counter-01', value: 'COUNTER-01', label: 'COUNTER-01' },
          { key: 'counter-02', value: 'COUNTER-02', label: 'COUNTER-02' }
        ]}
        cashierOptions={[{ key: 'len2', value: 'Len2', label: 'Len2' }]}
        activeFilterChips={[
          { key: 'terminal', label: 'Terminal: COUNTER-01' },
          { key: 'closed-by', label: 'Closed by: Len2' }
        ]}
        onApplyFilters={onApplyFilters}
        onRemoveFilter={onRemoveFilter}
        onClearAllFilters={onClearAllFilters}
      />
    );

    expect(screen.getByRole('button', { name: 'Filter, 2 filters applied' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filter, 2 filters applied' }));
    const filterDialog = screen.getByRole('dialog', { name: 'Filter Z-readings' });
    expect(filterDialog.className).toContain('h-auto');
    expect(filterDialog.className.split(/\s+/)).not.toContain('h-[min(90vh,48rem)]');
    expect(screen.getByRole('button', { name: 'COUNTER-01' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'COUNTER-02' }));
    expect(screen.getByRole('searchbox', { name: 'Search Cashier' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(onApplyFilters).toHaveBeenCalledWith({ terminalId: 'COUNTER-02', closedBy: 'Len2' });

    const clearAll = screen.getByRole('button', { name: 'Clear all Z-reading history filters' });
    expect(clearAll.parentElement?.querySelector('.dgfy-pos-applied-filter-scroll')?.contains(clearAll)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Closed by: Len2' }));
    expect(onRemoveFilter).toHaveBeenCalledWith('closed-by');
    fireEvent.click(clearAll);
    expect(onClearAllFilters).toHaveBeenCalledTimes(1);
  });
});
