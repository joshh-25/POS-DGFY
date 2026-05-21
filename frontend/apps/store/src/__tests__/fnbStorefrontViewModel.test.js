import { describe, expect, it } from 'vitest';
import { getFoodBeverageStorefrontViewModel } from '../fnbStorefrontViewModel.js';

describe('fnbStorefrontViewModel', () => {
  it('groups menu items into food and beverage sections with storefront-ready metadata', () => {
    const viewModel = getFoodBeverageStorefrontViewModel([
      {
        item_id: 1,
        name: 'Chicken Inasal Meal',
        category: 'product',
        unit_of_measure: 'plate',
        default_sale_price: 189,
        description: 'Grilled chicken meal with java rice',
        availability_status: 'in_stock'
      },
      {
        item_id: 2,
        name: 'Iced Latte',
        category: 'product',
        unit_of_measure: 'cup',
        default_sale_price: 120,
        description: 'Cold espresso drink',
        is_available: true
      },
      {
        item_id: 3,
        name: 'Halo-Halo',
        category: 'product',
        unit_of_measure: 'glass',
        default_sale_price: 95,
        description: 'Cold dessert with shaved ice',
        availability_status: 'low_stock'
      }
    ]);

    expect(viewModel.totalItems).toBe(3);
    expect(viewModel.menuSectionCount).toBe(3);
    expect(viewModel.beverageCount).toBe(1);
    expect(viewModel.dessertCount).toBe(1);
    expect(viewModel.readyNowCount).toBe(2);
    expect(viewModel.startingPrice).toBe(95);
    expect(viewModel.menuSections.map((section) => section.sectionLabel)).toEqual(['Rice Meals', 'Coffee & Tea', 'Desserts']);
    expect(viewModel.menuItems[0].unitLabel).toBe('Per plate');
    expect(viewModel.menuItems[2].availabilityMeta.label).toBe('Limited servings');
  });

  it('prefers SKU folder grouping and preserves the original product description', () => {
    const viewModel = getFoodBeverageStorefrontViewModel([
      {
        item_id: 10,
        name: 'Oreo Frappe',
        category: 'product',
        folder_name: 'Rocket Fuel',
        menu_category: 'Cold Beverages',
        unit_of_measure: 'cup',
        default_sale_price: 159,
        description: 'Oreo Frappe from Space Bar. A blended iced drink with dessert-style texture and a chilled finish. Blended for a smooth, chilled finish.',
        availability_status: 'in_stock'
      }
    ]);

    expect(viewModel.menuSections.map((section) => section.sectionLabel)).toEqual(['Rocket Fuel']);
    expect(viewModel.menuItems[0].descriptionPreview).toBe('Oreo Frappe from Space Bar. A blended iced drink with dessert-style texture and a chilled finish. Blended for a smooth, chilled finish.');
  });
});
