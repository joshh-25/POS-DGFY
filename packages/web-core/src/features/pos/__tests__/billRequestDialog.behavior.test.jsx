// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BillRequestDialog from '../components/BillRequestDialog.jsx';

afterEach(() => cleanup());

describe('BillRequestDialog', () => {
  it('shows item quantities, prices, and the overall price without payment fields', () => {
    render(
      <BillRequestDialog
        open
        draft={{
          lines: [{ lineKey: 'line-1', itemName: 'Cake', quantity: 2, unitPrice: 200 }],
          total: 400
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Bill Request' })).toBeDefined();
    expect(screen.getByText('Cake')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('₱200.00')).toBeDefined();
    expect(screen.getByText('₱400.00')).toBeDefined();
    expect(screen.getByText('Overall price')).toBeDefined();
    expect(screen.getByText(/no payment has been recorded/i)).toBeDefined();
    expect(screen.queryByText(/total payment/i)).toBeNull();
  });
});
