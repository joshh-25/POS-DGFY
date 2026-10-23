import { describe, expect, it } from 'vitest';
import { getDiscoveryCategoryLists } from '../discovery/components/DiscoveryCategoryStage.jsx';
import { BUSINESS_MODE_PIN_META } from '../discovery/model/businessModePins.js';

describe('discovery category chips', () => {
  it('keeps the existing twelve categories and appends the four partner categories in order', () => {
    const { primaryCats, extendedCats } = getDiscoveryCategoryLists();
    const labels = [...primaryCats, ...extendedCats].map(({ label }) => label);

    expect(labels.slice(0, 12)).toEqual([
      'Food', 'Grocery', 'Laundry', 'Salon', 'Pharmacy',
      'Bakery', 'Clothing', 'Drinks', 'Food Stall', 'Frozen', 'Beauty', 'Hardware'
    ]);
    expect(labels.slice(-4)).toEqual(['Hotel', 'Real Estate', 'Taxi', 'Job']);
  });

  it('uses each external pin color for its matching category chip', () => {
    const { extendedCats } = getDiscoveryCategoryLists();
    const pinModeByCategory = {
      Hotel: 'external_hotels',
      'Real Estate': 'external_real_estate',
      Taxi: 'external_taxis',
      Job: 'external_jobs'
    };

    for (const category of extendedCats.slice(-4)) {
      expect(category.color).toBe(BUSINESS_MODE_PIN_META[pinModeByCategory[category.label]].color);
    }
  });
});
