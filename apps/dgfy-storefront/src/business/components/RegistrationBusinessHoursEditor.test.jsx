/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import StorefrontBusinessHoursScheduler from '../../../../../packages/web-core/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { createDefaultStorefrontBusinessHours } from '../../../../../packages/web-core/src/features/settings/storefrontBusinessHours.js';

function RegistrationScheduler() {
  const [hours, setHours] = useState(createDefaultStorefrontBusinessHours());
  return (
    <StorefrontBusinessHoursScheduler
      value={hours}
      onChange={setHours}
      compactDayLabels
      compactDaySelection
      hideScheduleSummaryHeader
      unboxed
      registrationScheduleEditor
    />
  );
}

describe('business registration hours editor', () => {
  afterEach(() => cleanup());

  it('removes the mobile Business Hours heading border in the unboxed registration layout', () => {
    render(<RegistrationScheduler />);

    const heading = screen.getByRole('heading', { name: 'Business Hours', exact: true });
    const headingContainer = heading.parentElement?.parentElement?.parentElement;

    expect(headingContainer?.className).toContain('border-0');
    expect(headingContainer?.className).not.toContain('border-slate-200');
  });

  it('uses roller time pickers, removes the 24/7 divider, and puts actions on their own row', async () => {
    const user = userEvent.setup();
    const view = render(<RegistrationScheduler />);
    const scheduleEditButton = within(view.container).getByRole('button', { name: 'Edit Monday - Saturday schedule', exact: true });
    const scheduleRow = scheduleEditButton.parentElement?.parentElement;

    expect(scheduleRow?.className).toContain('border-slate-200');
    expect(scheduleRow?.className).toContain('rounded-lg');

    await user.click(within(view.container).getByRole('button', { name: 'Add Schedule Set', exact: true }));

    const form = screen.getByRole('heading', { name: 'Add New Schedule Set', exact: true }).closest('form');
    const openTime = within(form).getByRole('button', { name: 'Open Time: 10:00 AM', exact: true });
    const closeTime = within(form).getByRole('button', { name: 'Close Time: 09:00 PM', exact: true });
    const fields = screen.getByTestId('registration-schedule-fields');
    const actions = screen.getByTestId('registration-schedule-actions');
    const openTwentyFourSevenRow = screen.getByRole('switch', { name: 'Open 24/7 for this schedule' }).closest('label')?.parentElement;

    expect(form.querySelector('input[type="time"]')).toBeNull();
    expect(openTime.querySelectorAll('[data-testid="roller-clock-icon"]')).toHaveLength(1);
    expect(closeTime.querySelectorAll('[data-testid="roller-clock-icon"]')).toHaveLength(1);
    expect(fields.className).toContain('min-[1200px]:items-start');
    expect(fields.nextElementSibling).toBe(actions);
    expect(actions.className).toContain('mt-4');
    expect(openTwentyFourSevenRow?.className).not.toContain('border-b');

    await user.click(openTime);
    const openTimePicker = screen.getByRole('group', { name: 'Open Time roller time picker', exact: true });
    expect(openTime.parentElement.className).toContain('relative');
    expect(openTimePicker.className).toContain('absolute');

    await user.keyboard('{ArrowDown}');
    expect(openTime.getAttribute('aria-label')).toBe('Open Time: 11:00 AM');

    const minuteWheel = screen.getByRole('listbox', { name: 'Open Time minute', exact: true });
    await user.click(within(minuteWheel).getByRole('option', { name: '37', exact: true }));
    expect(openTime.getAttribute('aria-label')).toBe('Open Time: 11:37 AM');

    const periodWheel = screen.getByRole('listbox', { name: 'Open Time am/pm', exact: true });
    await user.click(within(periodWheel).getByRole('option', { name: 'PM', exact: true }));
    expect(openTime.getAttribute('aria-label')).toBe('Open Time: 11:37 PM');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Open Time hour', exact: true })).toBeNull();
    expect(document.activeElement).toBe(openTime);

    await user.dblClick(openTime);
    expect(screen.queryByRole('listbox', { name: 'Open Time hour', exact: true })).not.toBeNull();
  });

  it('keeps the shared scheduler native time fields outside the registration variant', async () => {
    const user = userEvent.setup();
    const view = render(
      <StorefrontBusinessHoursScheduler
        value={createDefaultStorefrontBusinessHours()}
        onChange={() => {}}
        hideScheduleSummaryHeader
      />
    );

    const heading = screen.getByRole('heading', { name: 'Business Hours', exact: true });
    const headingContainer = heading.parentElement?.parentElement?.parentElement;
    expect(headingContainer?.className).toContain('border-slate-200');

    await user.click(within(view.container).getByRole('button', { name: 'Add Schedule Set', exact: true }));

    const form = screen.getByRole('heading', { name: 'Add New Schedule Set', exact: true }).closest('form');
    const fields = form.querySelector('.mt-3.grid');
    expect(form.querySelectorAll('input[type="time"]')).toHaveLength(2);
    expect(fields.className).toContain('min-[1200px]:items-end');
    expect(screen.queryByTestId('registration-schedule-actions')).toBeNull();
  });
});
