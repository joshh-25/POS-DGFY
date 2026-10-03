/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosReportsFilterPanel from '../components/PosReportsFilterPanel.jsx';

const baseProps = {
  open: true,
  dateRange: { dateFrom: '2026-09-18', dateTo: '2026-09-18' },
  defaultDateRange: { dateFrom: '2026-09-18', dateTo: '2026-09-18' },
  granularity: 'daily',
  defaultGranularity: 'daily',
  cashierId: '',
  cashiers: [
    { cashier_id: 11, cashier_name: 'Ana Cashier' },
    { cashier_id: 12, cashier_name: 'Ben Cashier' }
  ],
  paymentType: '',
  paymentOptions: [
    { value: '', label: 'All payments' },
    { value: 'cash', label: 'Cash' },
    { value: 'gcash', label: 'GCash' }
  ],
  source: '',
  sourceOptions: [
    { value: '', label: 'All sources' },
    { value: 'in_store', label: 'In-Store' },
    { value: 'delivery', label: 'Delivery' }
  ],
  deliveryProvider: '',
  deliveryProviderOptions: [
    { value: '', label: 'All delivery providers' },
    { value: 'foodpanda', label: 'Foodpanda' },
    { value: 'grab', label: 'Grab' },
    { value: 'other', label: 'Other' }
  ],
  categoryId: '',
  categories: [
    { folder_id: 101, name: 'Beverages' },
    { folder_id: 102, name: 'Meals' }
  ],
  onClose: vi.fn()
};
const defaultViewportWidth = window.innerWidth;
const defaultViewportHeight = window.innerHeight;
const defaultMatchMedia = window.matchMedia;

describe('POS reports filter modal', () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: defaultViewportWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: defaultViewportHeight });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: defaultMatchMedia });
  });

  it('keeps button selections staged until Apply Filters', () => {
    const onApplyFilters = vi.fn();
    render(<PosReportsFilterPanel {...baseProps} onApplyFilters={onApplyFilters} />);

    expect(screen.getByRole('dialog', { name: 'Filter' })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Date range', { exact: true })).toBeNull();
    expect(screen.queryByText('Range', { exact: true })).toBeNull();

    const paymentGroup = screen.getByRole('group', { name: 'Payment Type' });
    expect(paymentGroup.className).toContain('grid-cols-4');
    expect(paymentGroup.querySelector('button')?.className).toContain('h-8');
    expect(paymentGroup.querySelector('button')?.className).toContain('min-w-0');
    const deliveryProviderGroup = within(screen.getByRole('group', { name: 'Delivery Provider' }));
    expect(deliveryProviderGroup.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Grab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Meals' }));
    const cashierSearch = screen.getByTestId('pos-reports-filter-cashier-search');
    const cashierToggle = screen.getByTestId('pos-reports-filter-cashier-dropdown-toggle');
    expect(cashierToggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.change(cashierSearch, { target: { value: 'Ben' } });
    expect(cashierToggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByTestId('pos-reports-filter-cashier-option-12'));
    expect(cashierToggle.getAttribute('aria-expanded')).toBe('false');
    expect(cashierSearch.value).toBe('Ben Cashier');

    expect(onApplyFilters).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({
      paymentType: 'cash',
      deliveryProvider: 'grab',
      source: 'delivery',
      categoryId: 102,
      cashierId: '12'
    }));
    expect(onApplyFilters.mock.calls[0][0]).not.toHaveProperty('dateRange');
    expect(onApplyFilters.mock.calls[0][0]).not.toHaveProperty('granularity');
  });

  it('exposes accessible pressed state for selected options and dismisses through the close action', () => {
    const onClose = vi.fn();
    render(<PosReportsFilterPanel {...baseProps} onClose={onClose} />);

    const paymentSection = screen.getByText('Payment Type', { exact: true }).closest('section');
    const paymentGroup = within(paymentSection);
    expect(paymentGroup.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')).toBe('true');
    expect(paymentGroup.getByRole('button', { name: 'Cash' }).getAttribute('aria-pressed')).toBe('false');
    const deliveryProviderSection = screen.getByText('Delivery Provider', { exact: true }).closest('section');
    expect(within(deliveryProviderSection).getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the shared History dialog shell and closes on overlay input', () => {
    const onClose = vi.fn();
    render(<PosReportsFilterPanel {...baseProps} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Filter' }).getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('[data-dialog-overlay="true"]')).toBeTruthy();

    fireEvent.click(document.querySelector('[data-dialog-overlay="true"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a bounded, independently scrollable content area on a short viewport', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    });

    render(<PosReportsFilterPanel {...baseProps} />);

    const panel = screen.getByRole('dialog', { name: 'Filter' });
    const content = panel.children[1];
    expect(panel.style.maxHeight).toBe('');
    expect(panel.className).toContain('dgfy-pos-history-mobile-sheet');
    expect(content.className).toContain('min-h-0');
    expect(screen.getByTestId('pos-reports-filter-scroll-body').className).toContain('overflow-y-auto');
    expect(panel.querySelector('header').className).toContain('shrink-0');
    expect(panel.querySelector('footer').className).toContain('shrink-0');
  });

  it('gives a constrained desktop dialog a definite height so the body can scroll', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    });

    render(<PosReportsFilterPanel {...baseProps} />);

    const panel = screen.getByRole('dialog', { name: 'Filter' });
    expect(panel.style.maxHeight).toBe('384px');
    expect(panel.style.height).toBe('384px');
    expect(panel.querySelector('.dgfy-pos-history-dialog-body').className).toContain('overflow-y-auto');
  });

  it('shows a floating scrollbar before the Cashier picker is opened', () => {
    render(<PosReportsFilterPanel {...baseProps} />);

    const scrollbar = screen.getByRole('scrollbar', { name: 'Filter dialog scroll' });
    expect(scrollbar).toBeTruthy();
    expect(scrollbar.getAttribute('aria-controls')).toBe('pos-reports-filter-scroll-body');
    expect(screen.getByTestId('pos-reports-filter-scroll-body').className).toContain('dgfy-pos-filter-dialog-scroll-body');
    expect(screen.getByTestId('pos-reports-filter-cashier-dropdown-toggle').getAttribute('aria-expanded')).toBe('false');
  });
});
