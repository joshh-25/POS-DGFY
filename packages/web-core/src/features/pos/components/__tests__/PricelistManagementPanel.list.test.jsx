// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricelistManagementPanel from '../PricelistManagementPanel.jsx';

const listPricelists = vi.fn();
const publishPricelist = vi.fn();

vi.mock('@/services/pricelistService.js', () => ({
  listPricelists: (...args) => listPricelists(...args),
  archivePricelist: vi.fn(),
  createPricelist: vi.fn(),
  getPricelist: vi.fn(),
  publishPricelist: (...args) => publishPricelist(...args),
  replacePricelistItems: vi.fn()
}));

vi.mock('@/services/itemService.js', () => ({
  getItems: vi.fn()
}));

vi.mock('../../services/pricelistDraftStore.js', () => ({
  loadPricelistDraft: () => ({ rows: {}, savedAt: null }),
  savePricelistDraft: () => {},
  clearPricelistDraft: () => {}
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
  posToast: { success: vi.fn(), error: vi.fn() }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PricelistManagementPanel -- list presentation', () => {
  it('keeps the empty-state content region flexible so mobile pagination stays at the bottom', async () => {
    listPricelists.mockResolvedValue({
      pricelists: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 }
    });

    render(<PricelistManagementPanel canManage sectionId="empty-pricelists" />);

    expect(await screen.findByText('No pricelists yet. Create one to set per-item prices for a wholesale voucher.')).toBeTruthy();
    expect(screen.getByTestId('pos-pricelists-content').className).toContain('flex-1');
    expect(screen.getByTestId('pos-pricelists-pagination').parentElement).toBe(screen.getByTestId('pos-pricelists-content').parentElement);
  });

  it('renders the card layout, Vouchers-style search, and server pagination', async () => {
    const user = userEvent.setup();
      listPricelists.mockResolvedValue({
      pricelists: [{
        pricelist_id: 401,
        name: 'test 4',
        description: 'Default standard pricing rules',
        status: 'draft',
        created_at: '2026-10-05T00:00:00Z'
      }],
      pagination: { page: 1, limit: 20, total: 21, total_pages: 2 }
    });
    publishPricelist.mockResolvedValue({
      pricelist: { pricelist_id: 401, status: 'active' }
    });

    render(<PricelistManagementPanel canManage sectionId="test-pricelists" />);

    expect(await screen.findByTestId('pos-pricelists-results')).toBeTruthy();
    expect(screen.getByText('test 4')).toBeTruthy();
    expect(screen.getByText('Default standard pricing rules')).toBeTruthy();
    expect(screen.getByTestId('pos-pricelists-search').getAttribute('placeholder')).toBe('Name');
    const newPricelistButton = screen.getByRole('button', { name: 'New pricelist' });
    expect(document.getElementById('test-pricelists')?.className).toContain('pos-pricelist-catalog-workspace');
    expect(newPricelistButton.className).toContain('pos-items-mobile-icon-button');
    expect(newPricelistButton.className).toContain('pos-items-mobile-primary-button');
    expect(newPricelistButton.className).toContain('h-10');
    expect(newPricelistButton.className).toContain('w-10');
    expect(newPricelistButton.className).toContain('sm:h-9');
    expect(newPricelistButton.className).toContain('sm:w-auto');
    expect(newPricelistButton.querySelector('span')?.className).toContain('hidden');
    const newPricelistIcon = newPricelistButton.querySelector('svg');
    expect(newPricelistIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(newPricelistIcon?.querySelector('path[d="M16 13h6"]')).toBeTruthy();
    expect(newPricelistIcon?.querySelector('path[d="M19 10v6"]')).toBeTruthy();
    const card = screen.getByText('test 4').closest('article');
    expect(card).toBeTruthy();
    expect(card.className).toContain('p-2');
    expect(card.className).not.toContain('sm:p-3');
    expect(card.querySelector('.pos-pricelist-card-row')?.className).toContain('gap-2');
    expect(card.querySelector('.pos-pricelist-card-icon')?.className).toContain('h-12');
    expect(card.querySelector('p')?.className).toContain('uppercase');
    expect(card.querySelector('p')?.className).toContain('text-[13px]');
    expect(card.querySelector('p')?.className).not.toContain('text-base');
    expect(card.querySelector('p')?.className).toContain('tracking-[0.06em]');
    expect(card.querySelectorAll('p')[1]?.className).toContain('tracking-[0.02em]');
    const statusPill = screen.getByText('draft').closest('span');
    expect(statusPill?.className).toContain('bg-slate-100');
    expect(statusPill?.className).toContain('text-slate-700');
    expect(statusPill?.className).toContain('border-slate-200');
    expect(statusPill?.querySelector('span')?.className).toContain('bg-current');
    expect(card.querySelector('button')?.className).toContain('sm:w-[6.5rem]');
    const editItemsButton = screen.getByRole('button', { name: 'Edit items' });
    const publishButton = screen.getByRole('button', { name: 'Publish' });
    const archiveButton = screen.getByRole('button', { name: 'Archive' });
    expect(editItemsButton.compareDocumentPosition(publishButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(publishButton.compareDocumentPosition(archiveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const archiveDialog = screen.getByRole('dialog');
    const archiveConfirmButton = screen.getAllByRole('button', { name: 'Archive' }).at(-1);
    expect(screen.getByText('Archive this pricelist?')).toBeTruthy();
    expect(archiveDialog.querySelector('svg')).toBeNull();
    expect(archiveConfirmButton?.className).toContain('bg-rose-600');
    expect(archiveConfirmButton?.className).toContain('w-full');
    expect(archiveConfirmButton?.parentElement?.className).toContain('items-stretch');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(publishButton);
    await waitFor(() => {
      expect(publishPricelist).toHaveBeenCalledWith(401);
    });
    const results = screen.getByTestId('pos-pricelists-results');
    const pagination = screen.getByTestId('pos-pricelists-pagination');
    expect(results.className).toContain('overflow-y-auto');
    expect(pagination.className).toContain('mt-auto');
    expect(pagination.parentElement).toBe(results.parentElement?.parentElement);
    expect(listPricelists).toHaveBeenCalledWith({ page: 1, limit: 20 });

    await user.type(screen.getByTestId('pos-pricelists-search'), 'test');
    await waitFor(() => {
      expect(listPricelists).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'test' });
    });

    await user.click(screen.getByTestId('pos-pricelists-pagination-next-page'));
    await waitFor(() => {
      expect(listPricelists).toHaveBeenLastCalledWith({ page: 2, limit: 20, search: 'test' });
    });
  });
});
