// @vitest-environment jsdom
//
// RF-4 (PR #752 review): #748's own acceptance names a "no manual save before publish" regression
// test and the original diff shipped none -- apps/dgfy-web had no test for this component at all.
// Asserts the actual bug fix: Publish must persist the edited rows (via replacePricelistItems)
// BEFORE calling publishPricelist, and must target the id the server actually wrote to
// (result.editing_pricelist_id, which may be a draft-revision id distinct from the pricelist the
// list handed the editor), not the stale editingTargetId a naive "just call handleSave first"
// fix would have used.

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricelistManagementPanel from '../PricelistManagementPanel.jsx';

const listPricelists = vi.fn();
const createPricelist = vi.fn();
const getPricelist = vi.fn();
const replacePricelistItems = vi.fn();
const publishPricelist = vi.fn();
const archivePricelist = vi.fn();
const getItems = vi.fn();

vi.mock('@/services/pricelistService.js', () => ({
  listPricelists: (...args) => listPricelists(...args),
  createPricelist: (...args) => createPricelist(...args),
  getPricelist: (...args) => getPricelist(...args),
  replacePricelistItems: (...args) => replacePricelistItems(...args),
  publishPricelist: (...args) => publishPricelist(...args),
  archivePricelist: (...args) => archivePricelist(...args)
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

// Never-Saved pricelist: the server has zero pricelist_items rows for it, matching #748's exact
// repro (create -> edit price -> Publish, no Save).
const NEW_PRICELIST = { pricelist_id: 501, name: 'Wholesale', status: 'draft', created_at: '2026-08-20T00:00:00Z' };
const CATALOG_ITEM = { item_id: 9001, name: 'Cold & Flu Tablets', category: 'Meds', default_sale_price: 80, cost_per_unit: 40 };
// The server writes the edit to a DIFFERENT id than the one openEditor was called with -- this is
// what the original bug's "publish the stale editingTargetId" shape would have gotten wrong.
const DRAFT_REVISION_ID = 502;

describe('PricelistManagementPanel -- Publish persists edited rows (#748)', () => {
  it('persists the edited price via replacePricelistItems before publishing, targeting the id the server wrote to', async () => {
    const user = userEvent.setup();

    listPricelists.mockResolvedValue({ pricelists: [] });
    createPricelist.mockResolvedValue({ pricelist: NEW_PRICELIST });
    getPricelist.mockResolvedValue({ pricelist: NEW_PRICELIST, items: [] });
    getItems.mockResolvedValue({ items: [CATALOG_ITEM] });
    replacePricelistItems.mockResolvedValue({
      editing_pricelist_id: DRAFT_REVISION_ID,
      pricelist: { ...NEW_PRICELIST, pricelist_id: DRAFT_REVISION_ID, version: 2 },
      is_draft: true,
      items: [{ item_id: CATALOG_ITEM.item_id, unit_price_centavos: 6000, is_manual_override: true }]
    });
    publishPricelist.mockResolvedValue({
      pricelist: { ...NEW_PRICELIST, pricelist_id: DRAFT_REVISION_ID, status: 'active', version: 3 }
    });

    render(<PricelistManagementPanel canManage sectionId="test-pricelists" />);

    await user.click(await screen.findByRole('button', { name: /new pricelist/i }));
    // Label isn't htmlFor-linked to the input (shadcn Label used decoratively here), so select
    // by position -- Name is the dialog's first textbox, Description the second.
    const dialogInputs = screen.getAllByRole('textbox');
    await user.type(dialogInputs[0], 'Wholesale');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    // Editor loaded with the one catalog item.
    const priceInput = await screen.findByDisplayValue('80');
    await user.clear(priceInput);
    await user.type(priceInput, '60');

    await user.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(replacePricelistItems).toHaveBeenCalledTimes(1);
      expect(publishPricelist).toHaveBeenCalledTimes(1);
    });

    // Persist before publish, not after and not skipped.
    const persistOrder = replacePricelistItems.mock.invocationCallOrder[0];
    const publishOrder = publishPricelist.mock.invocationCallOrder[0];
    expect(persistOrder).toBeLessThan(publishOrder);

    // The edited row actually reached the server.
    const [, savePayload] = replacePricelistItems.mock.calls[0];
    expect(savePayload.items).toEqual([
      expect.objectContaining({ item_id: CATALOG_ITEM.item_id, unit_price_centavos: 6000, is_manual_override: true })
    ]);

    // Publish targets the id the server actually wrote the edit to -- not the original,
    // now-stale pricelist_id the editor was opened with.
    expect(publishPricelist).toHaveBeenCalledWith(DRAFT_REVISION_ID);
  });
});
