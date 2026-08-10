/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import POReceiptModal from '../POReceiptModal.jsx';

vi.mock('../../../src/hooks/useLocations.js', () => ({
  useLocations: () => ({
    locations: [{ location_id: 1, name: 'Main', is_active: true }],
    loading: false
  })
}));

describe('POReceiptModal valuation refresh behavior', () => {
  afterEach(() => {
    cleanup();
  });

  it('updates variance badge when weighted average cost changes from refreshed PO detail', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const basePo = {
      po_number: 'PO-001',
      supplier_name: 'Prime Supply',
      notes: '',
      items: [{
        line_item_id: 10,
        item_id: 1,
        item_name: 'Candy',
        quantity: 10,
        quantity_received: 10,
        unit_price: 10,
        weighted_avg_cost: 10,
        quality_check: 'pass'
      }]
    };

    const { rerender } = render(
      <POReceiptModal
        po={basePo}
        open
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('At average')).toBeTruthy();

    const refreshedPo = {
      ...basePo,
      items: [{
        ...basePo.items[0],
        weighted_avg_cost: 8
      }]
    };

    rerender(
      <POReceiptModal
        po={refreshedPo}
        open
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('+25.0% vs avg')).toBeTruthy();
    });
  });
});
