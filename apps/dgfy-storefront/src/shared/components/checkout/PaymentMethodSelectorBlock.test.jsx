/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentMethodSelectorBlock } from './PaymentMethodSelectorBlock.jsx';

afterEach(cleanup);

describe('PaymentMethodSelectorBlock accessibility', () => {
  it('gives the custom payment combobox the visible field label', () => {
    render(
      <PaymentMethodSelectorBlock
        label="Payment Type"
        value="cash"
        onChange={vi.fn()}
        options={[{ value: 'cash', label: 'Cash' }]}
        DropdownComponent={({ ariaLabel, value: selectedValue }) => (
          <button type="button" role="combobox" aria-label={ariaLabel}>{selectedValue}</button>
        )}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Payment Type' })).toBeTruthy();
  });
});
