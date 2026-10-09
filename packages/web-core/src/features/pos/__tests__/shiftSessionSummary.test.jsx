// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShiftSessionSummary from '../components/ShiftSessionSummary.jsx';

afterEach(() => cleanup());

describe('ShiftSessionSummary', () => {
  it('communicates refresh activity and prevents duplicate refresh requests', () => {
    const onRefresh = vi.fn();
    render(<ShiftSessionSummary refreshLoading onRefresh={onRefresh} />);

    const refreshButton = screen.getByRole('button', { name: 'Refresh shift data' });
    expect(refreshButton.disabled).toBe(true);
    expect(refreshButton.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(refreshButton);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('emphasizes View Summary as the primary action and keeps refresh secondary', () => {
    render(<ShiftSessionSummary />);

    const summaryButton = screen.getByRole('button', { name: 'View Summary' });
    const refreshButton = screen.getByRole('button', { name: 'Refresh shift data' });

    expect(summaryButton.classList.contains('!bg-[#1A4E8D]')).toBe(true);
    expect(summaryButton.classList.contains('text-white')).toBe(true);
    expect(refreshButton.classList.contains('!bg-[#1A4E8D]')).toBe(true);
    expect(refreshButton.classList.contains('text-white')).toBe(true);
  });

  it('shows a recoverable alert while retaining the current shift summary', () => {
    render(
      <ShiftSessionSummary
        summaryRows={[{ label: 'Shift ID', value: '#52' }]}
        refreshErrorMessage="Connection timed out."
      />
    );

    expect(screen.getByRole('alert').textContent).toContain('Connection timed out.');
    expect(screen.getByText('#52')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh shift data' })).toBeTruthy();
  });

  it('presents the active register context and the four scannable shift KPIs', () => {
    render(
      <ShiftSessionSummary
        summaryRows={[
          { label: 'Shift ID', value: '#52', group: 'details' },
          { label: 'Cashier', value: 'Tinda', group: 'details' },
          { label: 'Business date', value: '2026-10-08', group: 'details' },
          { label: 'Opened at', value: 'Oct. 8, 2026, 12:25 PM', group: 'details', mobileSpan: 'full' },
          { label: 'Branch', value: 'Len2 Sari-Sari Store', group: 'details' },
          { label: 'Register', value: 'COUNTER-01', group: 'details' },
          { label: 'Opening float', value: 'PHP 500.00', group: 'financial', caption: 'Starting register cash' },
          { label: 'Shift cash sales', value: 'PHP 250.00', group: 'financial' },
          { label: 'Total gross sales', value: 'PHP 300.00', group: 'financial', caption: 'Before discounts and service fees' },
          { label: 'Expected in drawer', value: 'PHP 750.00', group: 'financial', highlight: true }
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Active Shift' })).toBeTruthy();
    expect(screen.getByText('#52')).toBeTruthy();
    expect(screen.getByText('Tinda')).toBeTruthy();
    expect(screen.getByText('2026-10-08')).toBeTruthy();
    expect(screen.getByText('Oct. 8, 2026, 12:25 PM')).toBeTruthy();
    expect(screen.getByText('Len2 Sari-Sari Store')).toBeTruthy();
    const contextGrid = screen.getByText('Cashier').closest('dl');
    const openedAtRow = screen.getByText('Opened at').parentElement;
    expect(contextGrid?.className).toContain('grid-cols-2');
    expect(openedAtRow?.className).toContain('col-span-2');
    expect(screen.getByText('PHP 500.00')).toBeTruthy();
    expect(screen.getByText('PHP 250.00')).toBeTruthy();
    expect(screen.getByText('PHP 300.00')).toBeTruthy();
    expect(screen.getByText('PHP 750.00')).toBeTruthy();
    expect(screen.queryByText('Starting register cash')).toBeNull();
    expect(screen.queryByText('Before discounts and service fees')).toBeNull();
    const summaryButton = screen.getByRole('button', { name: 'View Summary' });
    const refreshButton = screen.getByRole('button', { name: 'Refresh shift data' });
    const actionRow = summaryButton.parentElement;
    expect(actionRow?.className).toContain('items-center');
    expect(actionRow?.className).not.toContain('flex-col');
    expect(summaryButton.className).toContain('flex-1');
    expect(actionRow?.contains(refreshButton)).toBe(true);
    expect(screen.getByRole('heading', { name: 'Cash overview' })).toBeTruthy();
  });
});
