/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontBusinessHoursScheduler from '../StorefrontBusinessHoursScheduler.jsx';
import { createDefaultStorefrontBusinessHours } from '../storefrontBusinessHours.js';

function ControlledScheduler({ onChange = vi.fn() }) {
  const [value, setValue] = useState(createDefaultStorefrontBusinessHours());
  return (
    <StorefrontBusinessHoursScheduler
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('StorefrontBusinessHoursScheduler', () => {
  afterEach(() => cleanup());

  it('restores the previous weekly schedule after Open 24/7 is unchecked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    const alwaysOpen = screen.getByLabelText(/Open 24\/7/i);
    await user.click(alwaysOpen);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: { enabled: true, open: '00:00', close: '00:00' },
        mon: { enabled: true, open: '00:00', close: '00:00' }
      })
    }));

    await user.click(alwaysOpen);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: { enabled: false, open: '09:00', close: '18:00' },
        mon: { enabled: true, open: '09:00', close: '18:00' }
      })
    }));
  });

  it('applies selected days and renders schedule blocks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.clear(screen.getByLabelText(/Close time/i));
    await user.type(screen.getByLabelText(/Close time/i), '17:00');
    await user.click(screen.getByRole('button', { name: /Add Time Set/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        mon: { enabled: true, open: '10:00', close: '17:00' },
        fri: { enabled: true, open: '10:00', close: '17:00' },
        sat: { enabled: true, open: '09:00', close: '18:00' }
      })
    }));
    expect(screen.getByText(/10:00 AM - 05:00 PM/i)).toBeTruthy();
  });

  it('confirms before applying a new all-days time set over existing schedules', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.click(screen.getByLabelText(/All Days/i));
    await user.click(screen.getByRole('button', { name: /Add Time Set/i }));

    expect(screen.getByText(/Apply this time to all days/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Apply to All Days/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: { enabled: true, open: '10:00', close: '21:00' },
        mon: { enabled: true, open: '10:00', close: '21:00' },
        sat: { enabled: true, open: '10:00', close: '21:00' }
      })
    }));
  });
});
