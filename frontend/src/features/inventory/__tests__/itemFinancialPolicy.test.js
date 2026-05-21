import { describe, expect, it } from 'vitest';
import {
  hasExplicitSalePrice,
  resolveItemFinancialPolicy
} from '../itemFinancialPolicy.js';

describe('item financial display policy', () => {
  it('shows service selling price while hiding service cost by default', () => {
    const policy = resolveItemFinancialPolicy({
      workflowMode: 'services',
      item: {
        category: 'service',
        mode_item_preset: 'service',
        default_sale_price: 250
      }
    });

    expect(policy).toEqual(expect.objectContaining({
      is_pure_service: true,
      show_sale_price: true,
      show_cost: false,
      requires_sale_price: false
    }));
  });

  it('shows optional internal service cost only when enabled or already stored', () => {
    expect(resolveItemFinancialPolicy({
      workflowMode: 'services',
      item: { category: 'service', mode_item_preset: 'service', cost_per_unit: 0 },
      serviceCostTrackingEnabled: true
    }).show_cost).toBe(true);

    expect(resolveItemFinancialPolicy({
      workflowMode: 'services',
      item: { category: 'service', mode_item_preset: 'service', cost_per_unit: 75 }
    }).show_cost).toBe(true);
  });

  it('keeps service physical items cost-visible and sale-price-visible only when sellable', () => {
    const scissors = {
      category: 'product',
      product_type: 'finished_goods',
      mode_item_preset: 'physical_add_on',
      unit_of_measure: 'pcs'
    };

    expect(resolveItemFinancialPolicy({
      workflowMode: 'services',
      item: scissors
    })).toEqual(expect.objectContaining({
      show_cost: true,
      show_sale_price: false,
      requires_sale_price: false
    }));

    expect(resolveItemFinancialPolicy({
      workflowMode: 'services',
      item: scissors,
      posVisible: true
    })).toEqual(expect.objectContaining({
      show_cost: true,
      show_sale_price: true,
      requires_sale_price: true
    }));
  });

  it('shows both cost and selling price for finished manufacturing and F&B sellable presets', () => {
    expect(resolveItemFinancialPolicy({
      workflowMode: 'food_manufacturing',
      item: { category: 'product', product_type: 'finished_goods', mode_item_preset: 'finished_product' }
    })).toEqual(expect.objectContaining({
      show_cost: true,
      show_sale_price: true
    }));

    expect(resolveItemFinancialPolicy({
      workflowMode: 'fnb',
      item: { category: 'product', product_type: 'finished_goods', mode_item_preset: 'menu_item', unit_of_measure: 'serving' }
    })).toEqual(expect.objectContaining({
      show_cost: true,
      show_sale_price: true
    }));
  });

  it('shows sale price for raw inventory only after it becomes sellable', () => {
    const ingredient = { category: 'raw_material', mode_item_preset: 'ingredient', unit_of_measure: 'kg' };

    expect(resolveItemFinancialPolicy({
      workflowMode: 'fnb',
      item: ingredient
    })).toEqual(expect.objectContaining({
      show_cost: true,
      show_sale_price: false
    }));

    expect(resolveItemFinancialPolicy({
      workflowMode: 'fnb',
      item: ingredient,
      storefrontVisible: true
    })).toEqual(expect.objectContaining({
      show_cost: true,
      show_sale_price: true,
      requires_sale_price: true
    }));
  });

  it('does not treat item cost as an explicit sale price', () => {
    expect(hasExplicitSalePrice({ default_sale_price: null, cost_per_unit: 100 })).toBe(false);
    expect(hasExplicitSalePrice({ default_sale_price: 100, cost_per_unit: 40 })).toBe(true);
  });
});
