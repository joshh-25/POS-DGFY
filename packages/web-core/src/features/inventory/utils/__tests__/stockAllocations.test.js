import { describe, expect, it } from 'vitest';
import {
  buildStockAllocationDraft,
  buildStockAllocations,
  getStockAllocationTotal
} from '../stockAllocations.js';

const locations = [
  { location_id: 11, name: 'Main branch', is_active: true },
  { location_id: 12, name: 'Second branch', is_active: true },
  { location_id: 13, name: 'Inactive branch', is_active: false }
];

describe('stock allocation helpers', () => {
  it('creates an empty draft for the available locations', () => {
    expect(buildStockAllocationDraft(locations)).toEqual({
      '11': '',
      '12': '',
      '13': ''
    });
  });

  it('keeps only positive quantities for known locations', () => {
    const allocations = buildStockAllocations({
      '11': '100',
      '12': 100,
      '13': 0,
      '99': 500,
      '10': ''
    }, locations);

    expect(allocations).toEqual([
      { location_id: 11, quantity: 100 },
      { location_id: 12, quantity: 100 }
    ]);
    expect(getStockAllocationTotal(allocations)).toBe(200);
  });
});
