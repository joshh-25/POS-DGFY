// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CostFinancialSection from '../details/CostFinancialSection.jsx';

afterEach(() => {
  cleanup();
});

const finishedProduct = {
  item_id: 91,
  id: 91,
  name: 'Finished Bread',
  sku_code: 'BR-001',
  category: 'product',
  product_type: 'finished_goods',
  mode_item_preset: 'finished_product',
  unit_of_measure: 'pcs',
  current_stock: 10,
  cost_per_unit: 22.26,
  labor_cost: 0,
  overhead_cost: 0,
  additional_packaging_cost: 0
};

describe('CostFinancialSection financial display', () => {
  it('treats zero sale price as missing instead of a valid displayed price', () => {
    render(
      <CostFinancialSection
        item={{ ...finishedProduct, default_sale_price: 0 }}
        workflowMode="food_manufacturing"
      />
    );

    expect(screen.getByText('Default Sale Price')).toBeTruthy();
    expect(screen.getByText(/not set - required before pos, storefront, or dispatch order sale/i)).toBeTruthy();
    expect(screen.queryByText('₱0.00')).toBeNull();
  });

  it('shows selling price for a priced finished product detail view', () => {
    render(
      <CostFinancialSection
        item={{ ...finishedProduct, default_sale_price: 55 }}
        workflowMode="food_manufacturing"
      />
    );

    expect(screen.getByText('Default Sale Price')).toBeTruthy();
    expect(screen.getByText('₱55.00')).toBeTruthy();
  });
});
