// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GlobalPagination from '../pagination.jsx';

describe('GlobalPagination', () => {
  it('renders the shared POS layout and emits page controls', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <GlobalPagination
        testId="global-pagination"
        currentPage={1}
        totalPages={2}
        totalItems={35}
        pageSize={20}
        itemLabel="items"
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    );

    const pagination = screen.getByTestId('global-pagination');
    expect(pagination.className).toContain('dgfy-global-pagination');
    expect(pagination.querySelector('.dgfy-global-pagination__summary-text')?.className).toContain('text-xs');
    expect(pagination.querySelector('.dgfy-global-pagination__mobile-go-to-label')?.className).toContain('text-xs');
    expect(pagination.querySelector('.dgfy-global-pagination__page-size')).toBeTruthy();
    expect(pagination.querySelector('.dgfy-global-pagination__previous')).toBeTruthy();
    expect(pagination.querySelector('.dgfy-global-pagination__status')?.className).toContain('text-xs');
    expect(pagination.querySelector('.dgfy-global-pagination__mobile-go-to-label')?.textContent).toBe('Go to Page');
    expect(pagination.querySelector('.dgfy-global-pagination__next')).toBeTruthy();

    expect(screen.getByText('Showing 1–20 of 35 items')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    const pageSizeButton = screen.getByTestId('global-pagination-page-size');
    expect(pageSizeButton.getAttribute('aria-haspopup')).toBe('listbox');
    fireEvent.click(pageSizeButton);
    expect(screen.getByRole('option', { name: '20 / page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous page' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Next page' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole('option', { name: '40 / page' }));
    expect(onPageSizeChange).toHaveBeenLastCalledWith(40);

    const goToInput = screen.getByRole('textbox', { name: 'Go to page' });
    expect(goToInput.className).toContain('text-xs');
    fireEvent.change(goToInput, { target: { value: '2' } });
    fireEvent.submit(goToInput.closest('form'));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });
});
