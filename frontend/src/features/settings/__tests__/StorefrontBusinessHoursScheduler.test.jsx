/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
        sun: { enabled: true, open: '00:00', close: '00:00', intervals: [{ open: '00:00', close: '00:00' }] },
        mon: { enabled: true, open: '00:00', close: '00:00', intervals: [{ open: '00:00', close: '00:00' }] }
      })
    }));

    await user.click(alwaysOpen);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] },
        mon: { enabled: true, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] }
      })
    }));
  });

  it('applies selected days and renders schedule blocks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/^Close time$/i), { target: { value: '17:00' } });
    await user.click(screen.getByRole('button', { name: /Apply/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        mon: { enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] },
        fri: { enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] },
        sat: { enabled: true, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] }
      })
    }));
    expect(screen.getByLabelText(/Mon schedule block/i)).toBeTruthy();
  });

  it('adds and edits a second interval without overflowing the weekly row controls', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    const addButtons = screen.getAllByRole('button', { name: /Add interval/i });
    await user.click(addButtons[1]);
    fireEvent.change(screen.getByLabelText(/Mon interval 1 open time/i), { target: { value: '06:00' } });
    fireEvent.change(screen.getByLabelText(/Mon interval 1 close time/i), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText(/Mon interval 2 open time/i), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText(/Mon interval 2 close time/i), { target: { value: '20:00' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        mon: expect.objectContaining({
          intervals: [
            { open: '06:00', close: '12:00' },
            { open: '13:00', close: '20:00' }
          ]
        })
      })
    }));
    expect(screen.getByText(/Preview:/i).textContent).toContain('Mon 6:00 AM - 12:00 PM, 1:00 PM - 8:00 PM');
  });
});
