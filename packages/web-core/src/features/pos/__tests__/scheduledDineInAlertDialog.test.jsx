/** @vitest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ScheduledDineInAlertDialog from '../components/ScheduledDineInAlertDialog.jsx';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const order = {
  pos_transaction_id: 9201,
  invoice_number: 'INV-9201',
  customer_name: 'Scheduled Guest',
  order_method: 'dine_in',
  scheduled_for: '2026-09-23T12:14:32.000Z',
  fulfillment_status: 'confirmed'
};

describe('ScheduledDineInAlertDialog', () => {
  it('shows the warning, exact countdown, and acknowledge action', () => {
    const onOpenChange = vi.fn();

    render(
      <ScheduledDineInAlertDialog
        alert={{ milestone: 15, order }}
        now={NOW}
        onOpenChange={onOpenChange}
      />
    );

    const dialogText = screen.getByRole('dialog').textContent;
    expect(dialogText).toContain('15-minute warning');
    expect(dialogText).toContain('Scheduled Guest');
    expect(dialogText).toContain('In 00h 14m 32s');

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
