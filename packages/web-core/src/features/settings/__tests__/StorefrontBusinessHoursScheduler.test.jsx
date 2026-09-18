/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontBusinessHoursScheduler from '../StorefrontBusinessHoursScheduler.jsx';
import { createDefaultStorefrontBusinessHours } from '../storefrontBusinessHours.js';

function ControlledScheduler({ onChange = vi.fn(), initialValue = createDefaultStorefrontBusinessHours() }) {
  const [value, setValue] = useState(initialValue);
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

describe.skip('StorefrontBusinessHoursScheduler legacy modal behavior', () => {
  afterEach(() => cleanup());

  it('removes the redundant closed-days control while keeping schedule editing available', () => {
    render(<ControlledScheduler />);

    expect(screen.queryByText('Closed days')).toBeNull();
    expect(screen.getByRole('button', { name: /Add schedule set/i })).toBeTruthy();
  });

  it('aligns custom editor header content with the Open 24/7 control', () => {
    render(
      <StorefrontBusinessHoursScheduler
        value={createDefaultStorefrontBusinessHours()}
        headerContent={(
          <div className="min-w-0">
            <h4>Edit Business Hours</h4>
            <p>Update the schedule customers see on your storefront, then save when finished.</p>
          </div>
        )}
      />
    );

    const header = screen.getByRole('heading', { name: 'Edit Business Hours' }).parentElement?.parentElement;
    const alwaysOpenLabel = screen.getByRole('switch', { name: 'Open 24/7' }).closest('label');

    expect(header).toBeTruthy();
    expect(header?.className).toContain('sm:flex-row');
    expect(header?.className).toContain('sm:justify-between');
    expect(alwaysOpenLabel?.parentElement).toBe(header);
  });

  it('restores the previous weekly schedule after Open 24/7 is unchecked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    const alwaysOpen = screen.getByLabelText(/Open 24\/7/i);
    await user.click(alwaysOpen);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: expect.objectContaining({ enabled: true, open: '00:00', close: '00:00' }),
        mon: expect.objectContaining({ enabled: true, open: '00:00', close: '00:00' })
      })
    }));

    await user.click(alwaysOpen);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: expect.objectContaining({ enabled: false, open: '09:00', close: '18:00' }),
        mon: expect.objectContaining({ enabled: true, open: '09:00', close: '18:00' })
      })
    }));
  });

  it('labels an all-day schedule compactly', async () => {
    const user = userEvent.setup();
    render(<ControlledScheduler />);

    await user.click(screen.getByLabelText(/Open 24\/7/i));

    expect(screen.getByText('12:00 AM - 12:00 AM (24 hrs)')).toBeTruthy();
  });

  it('applies selected days and renders schedule blocks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Add schedule set/i }));
    await user.clear(screen.getByLabelText(/Close time/i));
    await user.type(screen.getByLabelText(/Close time/i), '17:00');
    await user.click(screen.getByRole('button', { name: /Add schedule set/i }));
    await user.click(screen.getByRole('button', { name: /Replace schedule/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        mon: expect.objectContaining({ enabled: true, open: '10:00', close: '17:00' }),
        fri: expect.objectContaining({ enabled: true, open: '10:00', close: '17:00' }),
        sat: expect.objectContaining({ enabled: true, open: '09:00', close: '18:00' })
      })
    }));
    expect(screen.getAllByText(/10:00 AM - 05:00 PM/i).length).toBeGreaterThan(0);
  });

  it('offers 24-hour and all-days presets in the schedule-set modal', async () => {
    const user = userEvent.setup();
    const view = render(<ControlledScheduler />);

    await user.click(within(view.container).getByRole('button', { name: /Add schedule set/i }));

    const twentyFourHours = screen.getByRole('button', { name: 'Use 24 hours' });
    expect(twentyFourHours).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select All Days' })).toBeTruthy();

    await user.click(twentyFourHours);

    expect(twentyFourHours.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText(/Open time/i).value).toBe('00:00');
    expect(screen.getByLabelText(/Close time/i).value).toBe('00:00');
  });

  it('persists weekday selection after clicking a day chip', async () => {
    const user = userEvent.setup();
    cleanup();
    const view = render(<ControlledScheduler />);

    await user.click(within(view.container).getByRole('button', { name: /Add schedule set/i }));
    const saturday = screen.getByRole('button', { name: 'Select Sat' });
    expect(saturday.getAttribute('aria-pressed')).toBe('false');

    await user.click(saturday);
    expect(saturday.getAttribute('aria-pressed')).toBe('true');

    await user.click(saturday);
    expect(saturday.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps native time controls shrinkable inside mobile cards', async () => {
    const user = userEvent.setup();
    const view = render(<ControlledScheduler />);
    await user.click(within(view.container).getByRole('button', { name: /Add schedule set/i }));
    const openTime = screen.getByLabelText(/Open time/i);
    const closeTime = screen.getByLabelText(/Close time/i);

    expect(openTime.className).toContain('min-w-0');
    expect(openTime.className).toContain('max-w-full');
    expect(closeTime.className).toContain('min-w-0');
    expect(closeTime.className).toContain('max-w-full');
  });

  it('edits an existing schedule set from the preview-style row', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Edit Monday - Saturday schedule/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Edit Schedule Set', exact: true })).toBeTruthy();

    await user.clear(screen.getByLabelText(/Close time/i));
    await user.type(screen.getByLabelText(/Close time/i), '20:00');
    await user.click(screen.getByRole('button', { name: /Update schedule set/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        mon: expect.objectContaining({ enabled: true, close: '20:00' }),
        sat: expect.objectContaining({ enabled: true, close: '20:00' })
      })
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('warns before an edit reassigns days from another schedule set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initialValue = createDefaultStorefrontBusinessHours();
    ['sat', 'sun'].forEach((dayKey) => {
      initialValue.weekly[dayKey] = {
        ...initialValue.weekly[dayKey],
        enabled: true,
        open: '12:00',
        close: '16:00',
        intervals: [{ open: '12:00', close: '16:00' }]
      };
    });
    render(<ControlledScheduler initialValue={initialValue} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Edit Monday - Friday schedule/i }));
    await user.click(screen.getByRole('button', { name: 'Select Sat' }));
    await user.click(screen.getByRole('button', { name: /Update schedule set/i }));

    const conflict = screen.getByRole('alertdialog');
    expect(conflict).toBeTruthy();
    expect(conflict.textContent).toMatch(/Saturday currently uses 12:00 PM - 04:00 PM/i);
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Replace schedule/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sat: expect.objectContaining({ enabled: true, open: '09:00', close: '18:00' }),
        sun: expect.objectContaining({ enabled: true, open: '12:00', close: '16:00' })
      })
    }));
  });

  it('protects unsaved schedule-set changes when the modal is closed', async () => {
    const user = userEvent.setup();
    render(<ControlledScheduler />);

    await user.click(screen.getByRole('button', { name: /Add schedule set/i }));
    await user.clear(screen.getByLabelText(/Close time/i));
    await user.type(screen.getByLabelText(/Close time/i), '20:00');
    await user.click(screen.getByRole('button', { name: 'Close schedule set editor' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Discard schedule changes?')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/Close time/i).value).toBe('20:00');

    await user.click(screen.getByRole('button', { name: 'Close schedule set editor' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes a schedule set from its row action', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Remove Monday - Saturday schedule/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        mon: expect.objectContaining({ enabled: false }),
        sat: expect.objectContaining({ enabled: false })
      })
    }));
    expect(screen.getByText('No open schedule sets yet.')).toBeTruthy();
  });

  it('confirms before applying a new all-days time set over existing schedules', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Add schedule set/i }));
    await user.click(screen.getByRole('button', { name: /Select All Days/i }));
    await user.click(screen.getByRole('button', { name: /Add schedule set/i }));

    expect(screen.getByText(/Apply this time to all days/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Apply to All Days/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      weekly: expect.objectContaining({
        sun: expect.objectContaining({ enabled: true, open: '10:00', close: '21:00' }),
        mon: expect.objectContaining({ enabled: true, open: '10:00', close: '21:00' }),
        sat: expect.objectContaining({ enabled: true, open: '10:00', close: '21:00' })
      })
    }));
  });
});

describe('StorefrontBusinessHoursScheduler inline schedule-set behavior', () => {
  afterEach(() => cleanup());

  it('keeps the default schedule visible and expands the add form inline below it', async () => {
    const user = userEvent.setup();
    render(<ControlledScheduler />);

    await user.click(screen.getByRole('button', { name: 'Add Schedule Set', exact: true }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Add New Schedule Set', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Edit Monday - Saturday schedule/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Open 24/7 for this schedule' })).toBeTruthy();
  });

  it('cancels an inline add without changing the schedule', async () => {
    const user = userEvent.setup();
    render(<ControlledScheduler />);

    await user.click(screen.getByRole('button', { name: 'Add Schedule Set', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));

    expect(screen.queryByRole('heading', { name: 'Add New Schedule Set', exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Schedule Set', exact: true })).toBeTruthy();
  });

  it('expands an editor directly below the selected schedule row', async () => {
    const user = userEvent.setup();
    render(<ControlledScheduler />);

    await user.click(screen.getByRole('button', { name: /Edit Monday - Saturday schedule/i }));

    expect(screen.getByRole('button', { name: 'Save Changes', exact: true })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Open 24/7 for this schedule' })).toBeTruthy();
  });

  it('requires confirmation before deleting a schedule set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledScheduler onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Remove Monday - Saturday schedule/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete', exact: true }));
    expect(onChange).toHaveBeenCalled();
  });
});
