// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricelistManagementPanel from '../PricelistManagementPanel.jsx';

const listPricelists = vi.fn();

vi.mock('@/services/pricelistService.js', () => ({
  listPricelists: (...args) => listPricelists(...args),
  archivePricelist: vi.fn(),
  createPricelist: vi.fn(),
  getPricelist: vi.fn(),
  publishPricelist: vi.fn(),
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

const renderPanel = async (pricelists = []) => {
  listPricelists.mockResolvedValue({
    pricelists,
    pagination: { page: 1, limit: 20, total: pricelists.length, total_pages: 1 }
  });

  const user = userEvent.setup();
  render(<PricelistManagementPanel canManage sectionId="test-pricelists" />);
  await user.click(await screen.findByRole('button', { name: /new pricelist/i }));
  return user;
};

describe('PricelistManagementPanel -- create modal presentation', () => {
  it('uses the Vouchers-style shell and stacked actions when no copy source exists', async () => {
    listPricelists.mockResolvedValueOnce({
      pricelists: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 1 }
    });
    listPricelists.mockResolvedValueOnce({ pricelists: [] });

    await renderPanel();

    const dialog = screen.getByTestId('pos-pricelist-create-dialog');
    const footer = screen.getByRole('button', { name: 'Create' }).parentElement;
    const overlay = document.querySelector('[data-dialog-overlay="true"]');

    expect(dialog.className).toContain('max-w-md');
    expect(dialog.className).toContain('rounded-2xl');
    expect(dialog.className).toContain('shadow-2xl');
    expect(overlay?.className).toContain('bg-slate-950/60');
    expect(screen.getByRole('heading', { name: 'New pricelist' }).className).toContain('text-[16px]');
    expect(screen.getByText('Create a pricelist to set per-item prices for wholesale vouchers.')).toBeTruthy();
    expect(screen.queryByLabelText('Copy prices from (optional)')).toBeNull();
    expect(footer?.className).toContain('items-stretch');
    expect(footer?.className).toContain('border-t');
    expect(screen.getByRole('button', { name: 'Create' }).className).toContain('bg-[#1A4E8D]');
    expect(screen.getByRole('button', { name: 'Create' }).className).toContain('w-full');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('w-full');
  });

  it('keeps the same shell and action styling when the copy-prices field is shown', async () => {
    const activePricelist = {
      pricelist_id: 801,
      name: 'Wholesale active',
      status: 'active',
      created_at: '2026-10-05T00:00:00Z'
    };
    listPricelists.mockResolvedValueOnce({
      pricelists: [activePricelist],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 }
    });
    listPricelists.mockResolvedValueOnce({ pricelists: [activePricelist] });

    const user = await renderPanel([activePricelist]);

    expect(await screen.findByLabelText('Copy prices from (optional)')).toBeTruthy();
    expect(screen.getByText('Create a pricelist to set per-item prices for wholesale vouchers.')).toBeTruthy();
    const infoButton = screen.getByRole('button', { name: 'More information about Copy prices from' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.click(infoButton);
    expect((await screen.findByRole('tooltip')).textContent).toContain('Copies the selected pricelist\'s current prices once.');
    const copyPricesTrigger = screen.getByRole('button', { name: 'Copy prices from (optional)' });
    expect(copyPricesTrigger.className).toContain('h-10');
    await user.click(copyPricesTrigger);
    const blankOption = screen.getByRole('option', { name: 'Start blank (SRP for every item)' });
    expect(blankOption.className).toContain('bg-[#EAF2FC]');
    expect(screen.getByRole('option', { name: 'Wholesale active' }).className).toContain('hover:bg-[#EFF6FF]');
    expect(blankOption.parentElement?.className).toContain('max-h-[6.125rem]');
    expect(blankOption.parentElement?.className).toContain('overflow-y-auto');
    await user.click(screen.getByRole('option', { name: 'Wholesale active' }));
    expect(copyPricesTrigger.textContent).toContain('Wholesale active');
    expect(screen.getByTestId('pos-pricelist-create-dialog').className).toContain('max-w-md');
    expect(screen.getByRole('button', { name: 'Create' }).className).toContain('bg-[#1A4E8D]');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('border');
  });
});
