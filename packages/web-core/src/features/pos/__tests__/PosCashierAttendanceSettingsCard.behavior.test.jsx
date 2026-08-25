// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PosCashierAttendanceSettingsCard from '../components/PosCashierAttendanceSettingsCard.jsx';
import {
  fetchPosCashierAttendanceConfig,
  POS_ATTENDANCE_CONFIG_CHANGED_EVENT,
  updatePosCashierAttendanceConfig
} from '../services/posService.js';

vi.mock('../services/posService.js', () => ({
  fetchPosCashierAttendanceConfig: vi.fn(),
  POS_ATTENDANCE_CONFIG_CHANGED_EVENT: 'dgfy:pos-attendance-config-changed',
  updatePosCashierAttendanceConfig: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
  posToast: { success: vi.fn(), error: vi.fn() }
}));

const defaultPayload = {
  config: { enabled: false, location_ids: [] },
  revision: null,
  active_locations: [
    { location_id: 1, name: 'Main Store', is_active: true },
    { location_id: 2, name: 'Second Store', is_active: true }
  ]
};

beforeEach(() => {
  fetchPosCashierAttendanceConfig.mockResolvedValue(defaultPayload);
  updatePosCashierAttendanceConfig.mockResolvedValue({
    config: { enabled: true, location_ids: [1] },
    revision: 'a'.repeat(64),
    affected_location_ids: [1]
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PosCashierAttendanceSettingsCard', () => {
  it('loads active locations and saves through its dedicated revision-bound boundary', async () => {
    const changed = vi.fn();
    window.addEventListener(POS_ATTENDANCE_CONFIG_CHANGED_EVENT, changed);
    render(<PosCashierAttendanceSettingsCard canEdit />);

    const enableSwitch = await screen.findByRole('switch', { name: 'Enable Cashier Attendance and Breaks' });
    fireEvent.click(enableSwitch);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Main Store' }));
    fireEvent.click(screen.getByRole('button', { name: /save attendance settings/i }));

    await waitFor(() => expect(updatePosCashierAttendanceConfig).toHaveBeenCalledWith({
      enabled: true,
      location_ids: [1],
      revision: null
    }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    window.removeEventListener(POS_ATTENDANCE_CONFIG_CHANGED_EVENT, changed);
  });

  it('shows active-workflow conflicts and does not hide blocker details', async () => {
    fetchPosCashierAttendanceConfig.mockResolvedValue({
      ...defaultPayload,
      config: { enabled: true, location_ids: [1] },
      revision: 'b'.repeat(64)
    });
    updatePosCashierAttendanceConfig.mockRejectedValue({
      response: {
        data: {
          message: 'Finish active work before changing this setting.',
          errors: {
            blockers: [{ type: 'open_register_shift', location_id: 1, terminal_id: 'COUNTER-01', record_id: 41 }]
          }
        }
      }
    });
    render(<PosCashierAttendanceSettingsCard canEdit />);

    await screen.findByRole('switch', { name: 'Enable Cashier Attendance and Breaks' });
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Cashier Attendance and Breaks' }));
    fireEvent.click(screen.getByRole('button', { name: /save attendance settings/i }));

    expect((await screen.findByRole('alert')).textContent).toContain('Finish active work before changing this setting.');
    expect(screen.getByText(/open register shift at location 1 · COUNTER-01/i)).toBeTruthy();
  });

  it('is view-only without settings edit permission', async () => {
    render(<PosCashierAttendanceSettingsCard canEdit={false} />);

    const enableSwitch = await screen.findByRole('switch', { name: 'Enable Cashier Attendance and Breaks' });
    expect(enableSwitch.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /save attendance settings/i })).toBeNull();
    expect(screen.getByText('You have view-only settings access.')).toBeTruthy();
  });
});
