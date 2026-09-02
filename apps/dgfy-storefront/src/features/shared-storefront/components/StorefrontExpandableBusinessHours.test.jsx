/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StorefrontExpandableBusinessHours } from './StorefrontExpandableBusinessHours.jsx';

const allDaySchedule = {
  timezone: 'Asia/Manila',
  weekly: Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, {
      enabled: true,
      intervals: [{ open: '00:00', close: '00:00' }]
    }])
  )
};

describe('StorefrontExpandableBusinessHours', () => {
  afterEach(cleanup);

  it('stacks service days above hours when requested', () => {
    render(
      <StorefrontExpandableBusinessHours
        schedule={allDaySchedule}
        stackedSchedule
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Open 24 hours today/i }));

    const days = screen.getByText('Sun, Mon, Tue, Wed, Thu, Fri, Sat');
    const row = days.parentElement;
    const hours = screen.getByText('24 hours');

    expect(row.style.gridTemplateColumns).toBe('1fr');
    expect(hours.style.textAlign).toBe('left');
  });

  it('keeps the existing side-by-side layout by default', () => {
    render(<StorefrontExpandableBusinessHours schedule={allDaySchedule} />);

    fireEvent.click(screen.getByRole('button', { name: /Open 24 hours today/i }));

    const days = screen.getByText('Sun, Mon, Tue, Wed, Thu, Fri, Sat');
    const row = days.parentElement;
    const hours = screen.getByText('24 hours');

    expect(row.style.gridTemplateColumns).toBe('auto 1fr');
    expect(hours.style.textAlign).toBe('right');
  });
});
