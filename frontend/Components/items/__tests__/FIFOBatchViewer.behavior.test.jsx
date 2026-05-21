// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FIFOBatchViewer from '../FIFOBatchViewer.jsx';

vi.mock('../WriteOffBatchDialog.jsx', () => ({
  default: () => null
}));

afterEach(() => {
  cleanup();
});

const buildItem = ({ itemId = 100, locations, batches }) => ({
  item_id: itemId,
  id: itemId,
  name: `Item ${itemId}`,
  category: 'product',
  fifo_enabled: true,
  unit_of_measure: 'pcs',
  item_location_stocks: locations.map((location) => ({
    location_id: location.id,
    location_name: location.name,
    quantity_on_hand: location.onHand
  })),
  cost_metrics: {
    by_location: locations.map((location) => ({
      location_id: location.id,
      location_name: location.name,
      available_qty: location.onHand,
      weighted_avg_cost: location.avgCost,
      inventory_value: location.value
    }))
  },
  fifo_batches: batches.map((batch) => ({
    batch_id: batch.id,
    location_id: batch.locationId,
    location_name: batch.locationName,
    quantity: batch.quantity,
    quantity_consumed: 0,
    cost_per_unit: batch.cost,
    received_date: batch.received,
    expiry_date: batch.expiry,
    po_number: batch.po
  }))
});

describe('FIFOBatchViewer behavior', () => {
  it('falls back to visible location groups when a selected location becomes stale', async () => {
    const user = userEvent.setup();
    const initialItem = buildItem({
      locations: [
        { id: 1, name: 'Main Stockroom', onHand: 5, avgCost: 10, value: 50 },
        { id: 2, name: 'Branch Shelf', onHand: 7, avgCost: 12, value: 84 }
      ],
      batches: [
        {
          id: 'M-001',
          locationId: 1,
          locationName: 'Main Stockroom',
          quantity: 5,
          cost: 10,
          received: '2026-01-01T00:00:00.000Z',
          expiry: '2030-01-01T00:00:00.000Z',
          po: 'PO-MAIN'
        },
        {
          id: 'B-001',
          locationId: 2,
          locationName: 'Branch Shelf',
          quantity: 7,
          cost: 12,
          received: '2026-01-02T00:00:00.000Z',
          expiry: '2030-01-02T00:00:00.000Z',
          po: 'PO-BRANCH'
        }
      ]
    });
    const updatedSameItem = buildItem({
      itemId: 100,
      locations: [
        { id: 3, name: 'Depot Rack', onHand: 4, avgCost: 14, value: 56 }
      ],
      batches: [
        {
          id: 'D-001',
          locationId: 3,
          locationName: 'Depot Rack',
          quantity: 4,
          cost: 14,
          received: '2026-01-03T00:00:00.000Z',
          expiry: '2030-01-03T00:00:00.000Z',
          po: 'PO-DEPOT'
        }
      ]
    });

    const { rerender } = render(<FIFOBatchViewer item={initialItem} onRefresh={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /show fifo batches for branch shelf/i }));
    expect(screen.getByText('Batch B-001')).toBeTruthy();
    expect(screen.queryByText('Batch M-001')).toBeNull();

    rerender(<FIFOBatchViewer item={updatedSameItem} onRefresh={vi.fn()} />);

    expect(screen.getByText('Depot Rack')).toBeTruthy();
    expect(screen.getByText('Batch D-001')).toBeTruthy();
    expect(screen.queryByText('Batch B-001')).toBeNull();
    expect(screen.getByText(/Visible Quantity/i).parentElement.textContent).toContain('4.00 pcs');
  });

  it('resets the selected location when switching to another item', async () => {
    const user = userEvent.setup();
    const firstItem = buildItem({
      itemId: 201,
      locations: [
        { id: 1, name: 'North Bin', onHand: 3, avgCost: 8, value: 24 },
        { id: 2, name: 'South Bin', onHand: 6, avgCost: 9, value: 54 }
      ],
      batches: [
        {
          id: 'N-001',
          locationId: 1,
          locationName: 'North Bin',
          quantity: 3,
          cost: 8,
          received: '2026-02-01T00:00:00.000Z',
          expiry: '2030-02-01T00:00:00.000Z',
          po: 'PO-NORTH'
        },
        {
          id: 'S-001',
          locationId: 2,
          locationName: 'South Bin',
          quantity: 6,
          cost: 9,
          received: '2026-02-02T00:00:00.000Z',
          expiry: '2030-02-02T00:00:00.000Z',
          po: 'PO-SOUTH'
        }
      ]
    });
    const secondItem = buildItem({
      itemId: 202,
      locations: [
        { id: 4, name: 'East Case', onHand: 2, avgCost: 11, value: 22 },
        { id: 5, name: 'West Case', onHand: 9, avgCost: 13, value: 117 }
      ],
      batches: [
        {
          id: 'E-001',
          locationId: 4,
          locationName: 'East Case',
          quantity: 2,
          cost: 11,
          received: '2026-03-01T00:00:00.000Z',
          expiry: '2030-03-01T00:00:00.000Z',
          po: 'PO-EAST'
        },
        {
          id: 'W-001',
          locationId: 5,
          locationName: 'West Case',
          quantity: 9,
          cost: 13,
          received: '2026-03-02T00:00:00.000Z',
          expiry: '2030-03-02T00:00:00.000Z',
          po: 'PO-WEST'
        }
      ]
    });

    const { rerender } = render(<FIFOBatchViewer item={firstItem} onRefresh={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /show fifo batches for south bin/i }));
    expect(screen.getByText('Batch S-001')).toBeTruthy();
    expect(screen.queryByText('Batch N-001')).toBeNull();

    rerender(<FIFOBatchViewer item={secondItem} onRefresh={vi.fn()} />);

    expect(screen.getByText('Batch E-001')).toBeTruthy();
    expect(screen.getByText('Batch W-001')).toBeTruthy();
    expect(screen.getByText(/Visible Quantity/i).parentElement.textContent).toContain('11.00 pcs');
  });

  it('exposes accessible pressed state for location filters', async () => {
    const user = userEvent.setup();
    const item = buildItem({
      locations: [
        { id: 10, name: 'Very Long Location Name With Receiving Dock And Overflow Shelf', onHand: 8, avgCost: 10, value: 80 },
        { id: 11, name: 'Counter Stock', onHand: 2, avgCost: 12, value: 24 }
      ],
      batches: [
        {
          id: 'LONG-001',
          locationId: 10,
          locationName: 'Very Long Location Name With Receiving Dock And Overflow Shelf',
          quantity: 8,
          cost: 10,
          received: '2026-04-01T00:00:00.000Z',
          expiry: '2030-04-01T00:00:00.000Z',
          po: 'PO-LONG'
        },
        {
          id: 'COUNTER-001',
          locationId: 11,
          locationName: 'Counter Stock',
          quantity: 2,
          cost: 12,
          received: '2026-04-02T00:00:00.000Z',
          expiry: '2030-04-02T00:00:00.000Z',
          po: 'PO-COUNTER'
        }
      ]
    });

    render(<FIFOBatchViewer item={item} onRefresh={vi.fn()} />);

    const allButton = screen.getByRole('button', { name: /show fifo batches for all locations/i });
    const longLocationButton = screen.getByRole('button', {
      name: /show fifo batches for very long location name with receiving dock and overflow shelf/i
    });
    expect(allButton.getAttribute('aria-pressed')).toBe('true');
    expect(longLocationButton.getAttribute('aria-pressed')).toBe('false');

    await user.click(longLocationButton);

    expect(allButton.getAttribute('aria-pressed')).toBe('false');
    expect(longLocationButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Batch LONG-001')).toBeTruthy();
    expect(screen.queryByText('Batch COUNTER-001')).toBeNull();
  });
});
