// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StorefrontCategoryFilterBar } from './StorefrontCategoryFilterBar.jsx';

describe('StorefrontCategoryFilterBar', () => {
  it('shows all categories and reports the selected category identity', () => {
    const onCategoryChange = vi.fn();
    render(
      <StorefrontCategoryFilterBar
        filteredFnbViewModel={{
          menuItems: [{ item_id: 1 }, { item_id: 2 }],
          menuSections: [{
            sectionIdentity: 'folder:12',
            sectionLabel: 'Coffees',
            items: [{ item_id: 2 }],
            visualMeta: { iconToken: 'coffee' }
          }]
        }}
        isMobileViewport={false}
        modeAdapter={{ catalogCategoryAllLabel: 'All products', heroTheme: { accent: '#ea580c' } }}
        onCategoryChange={onCategoryChange}
        resolvedSection=""
      />
    );

    expect(screen.getByRole('button', { name: 'All products, 2 items' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Coffees, 1 item' }));
    expect(onCategoryChange).toHaveBeenCalledWith('folder:12');
  });
});
