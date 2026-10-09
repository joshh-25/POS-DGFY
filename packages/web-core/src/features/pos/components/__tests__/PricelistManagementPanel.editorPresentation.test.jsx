// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricelistManagementPanel from '../PricelistManagementPanel.jsx';

const listPricelists = vi.fn();
const getPricelist = vi.fn();
const getItems = vi.fn();

vi.mock('@/services/pricelistService.js', () => ({
  listPricelists: (...args) => listPricelists(...args),
  archivePricelist: vi.fn(),
  createPricelist: vi.fn(),
  getPricelist: (...args) => getPricelist(...args),
  publishPricelist: vi.fn(),
  replacePricelistItems: vi.fn()
}));

vi.mock('@/services/itemService.js', () => ({
  getItems: (...args) => getItems(...args)
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

describe('PricelistManagementPanel -- edit-items modal presentation', () => {
  it('uses the Vouchers-style modal shell and pricelist-specific item table', async () => {
    const user = userEvent.setup();
    const pricelist = {
      pricelist_id: 701,
      name: 'test 4',
      status: 'draft',
      version: 1,
      created_at: '2026-10-05T00:00:00Z'
    };

    listPricelists.mockResolvedValue({
      pricelists: [pricelist],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 }
    });
    getPricelist.mockResolvedValue({
      pricelist,
      items: [{ item_id: 9001, unit_price_centavos: 23500, is_manual_override: false }]
    });
    getItems.mockResolvedValue({
      items: [{
        item_id: 9001,
        name: 'Adobe',
        sku_code: 'SKU-ADB-001',
        category: 'product',
        default_sale_price: 235,
        cost_per_unit: 0
      }]
    });

    render(<PricelistManagementPanel canManage sectionId="test-pricelists" />);
    await user.click(await screen.findByRole('button', { name: /edit items/i }));

    expect(await screen.findByRole('heading', { name: 'Edit Pricelist Items' })).toBeTruthy();
    expect(screen.getByText('Configure item pricing, voucher prices, and discounts for test 4')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search items in pricelist' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /find/i })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Item description' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Status / warnings' })).toBeTruthy();
    expect(screen.getByText('SKU-ADB-001')).toBeTruthy();
    expect(screen.getByLabelText('Voucher price for Adobe')).toBeTruthy();
    expect(screen.getByText('No discount at this price.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy();
    const modal = document.querySelector('.pos-pricelist-items-modal');
    expect(modal).toBeTruthy();
    expect(modal?.className).toContain('sm:h-[min(52rem,calc(100dvh-6rem))]');
    expect(modal?.className).not.toContain('sm:h-auto');
    expect(document.querySelector('.pos-pricelist-items-modal-header')?.className).toContain('bg-[#1A4E8D]');
    expect(screen.getByTestId('pos-pricelist-items-table')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: 'Search items in pricelist' }), 'adobe');
    expect(document.querySelector('.pos-pricelist-items-modal')?.className).toContain('sm:h-[min(52rem,calc(100dvh-6rem))]');
  });

  it('uses one full-width previous/next pair on mobile', async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;
    window.innerWidth = 375;

    const pricelist = {
      pricelist_id: 702,
      name: 'mobile test',
      status: 'draft',
      version: 1,
      created_at: '2026-10-05T00:00:00Z'
    };

    listPricelists.mockResolvedValue({
      pricelists: [pricelist],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 }
    });
    getPricelist.mockResolvedValue({
      pricelist,
      items: [{ item_id: 9002, unit_price_centavos: 23500, is_manual_override: false }]
    });
    getItems.mockResolvedValue({
      items: [{
        item_id: 9002,
        name: 'Mobile Adobe',
        sku_code: 'SKU-MOBILE-001',
        category: 'product',
        default_sale_price: 235,
        cost_per_unit: 0
      }]
    });

    try {
      render(<PricelistManagementPanel canManage sectionId="mobile-pricelists" />);
      await user.click(await screen.findByRole('button', { name: /edit items/i }));

      const navigation = await screen.findByTestId('pos-pricelist-mobile-item-navigation');
      expect(within(navigation).getByRole('button', { name: 'Previous item' })).toBeTruthy();
      expect(within(navigation).getByRole('button', { name: 'Next item' })).toBeTruthy();
      expect(within(navigation).getAllByRole('button')).toHaveLength(2);
      const mobileCategory = screen.getByTestId('pos-pricelist-mobile-category');
      expect(mobileCategory.className).toContain('shrink-0');
      expect(mobileCategory.parentElement?.className).toContain('justify-between');
      expect(screen.queryByRole('button', { name: /^Next item$/ })).toBeTruthy();
    } finally {
      window.innerWidth = originalInnerWidth;
    }
  });
});
