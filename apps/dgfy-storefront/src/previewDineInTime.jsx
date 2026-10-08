import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StorefrontScheduledDateTimePicker } from './shared/components/checkout/StorefrontScheduledDateTimePicker.jsx';

const storefrontHours = {
  mode: 'weekly',
  timezone: 'Asia/Manila',
  weekly: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, {
    enabled: true,
    open: '09:00',
    close: '21:00',
    intervals: [{ open: '09:00', close: '21:00' }]
  }])),
  display: 'Sun-Sat 9:00 AM - 9:00 PM'
};

function Preview() {
  const [confirmedValue, setConfirmedValue] = useState('');

  return (
    <>
      <StorefrontScheduledDateTimePicker
        availabilityMode="dine_in"
        onApply={setConfirmedValue}
        onOpenChange={() => {}}
        open
        scheduleHoursLabel="Sun-Sat 9:00 AM - 9:00 PM"
        storefrontHours={storefrontHours}
        value="2026-10-08T13:30"
      />
      {confirmedValue ? <output style={{ bottom: 8, left: 8, position: 'fixed' }}>{confirmedValue}</output> : null}
    </>
  );
}

createRoot(document.getElementById('root')).render(<Preview />);
