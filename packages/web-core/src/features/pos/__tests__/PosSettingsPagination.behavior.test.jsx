/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalPagination from '@/components/ui/pagination';

afterEach(cleanup);

describe('POS Settings pagination', () => {
  it('renders compact range, page-size, navigation, and go-to controls', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <GlobalPagination
        testId="settings-pagination"
        currentPage={1}
        totalPages={2}
        pageSize={20}
        totalItems={35}
        itemLabel="items"
        pageSizeOptions={[10, 20]}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeLabel="items per page"
        pageInputLabel="Go to items page"
        previousLabel="Previous items page"
        nextLabel="Next items page"
        ariaLabel="items pagination"
      />
    );

    const pagination = screen.getByRole('navigation', { name: 'items pagination' });
    expect(pagination.className).toContain('dgfy-global-pagination');
    const range = screen.getByText('Showing 1–20 of 35 items');
    expect(range).toBeTruthy();
    expect(range.className).toContain('whitespace-nowrap');
    expect(range.className.split(/\s+/)).not.toContain('truncate');
    expect(screen.getByRole('button', { name: 'items per page' })).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Previous items page').disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Next items page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'items per page' }));
    await user.click(screen.getByRole('option', { name: '10 / page' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(10);

    const pageInput = screen.getByRole('textbox', { name: 'Go to items page' });
    await user.clear(pageInput);
    await user.type(pageInput, '2');
    await user.keyboard('{Enter}');
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it('keeps the range at zero and clamps invalid page requests', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <GlobalPagination
        currentPage={9}
        totalPages={1}
        pageSize={5}
        totalItems={0}
        itemLabel="employees"
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeLabel="employees per page"
        pageInputLabel="Go to employees page"
        previousLabel="Previous employees page"
        nextLabel="Next employees page"
      />
    );

    expect(screen.getByText('Showing 0–0 of 0 employees')).toBeTruthy();
    const pageInput = screen.getByRole('textbox', { name: 'Go to employees page' });
    await user.clear(pageInput);
    await user.type(pageInput, '999');
    await user.keyboard('{Enter}');
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
