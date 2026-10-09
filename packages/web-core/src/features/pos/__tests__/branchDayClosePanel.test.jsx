// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchDayClosePanel } from '../components/ShiftSessionCloseoutPanels.jsx';

afterEach(() => cleanup());

describe('BranchDayClosePanel', () => {
  it('explains a terminal-location mismatch instead of showing a ready state', () => {
    render(
      <BranchDayClosePanel
        activeShift={null}
        canCloseDay
        shiftActionLoading={{ zReading: false }}
        locked={false}
        isOnline
        activeTerminalMatchesOperatingLocation={false}
        shiftState={{ loading: false, errorMessage: '' }}
        dayCloseReadinessState={{
          loading: false,
          errorMessage: '',
          readiness: { ready: true, already_closed: false, open_shift_count: 0 }
        }}
        refreshDayCloseReadiness={vi.fn()}
        handleCloseDay={vi.fn()}
      />
    );

    const closeDayButton = screen.getByTestId('pos-close-day-button');
    expect(closeDayButton.disabled).toBe(true);
    expect(closeDayButton.textContent).toBe('Close Day');
    expect(closeDayButton.getAttribute('aria-busy')).toBeNull();
    expect(closeDayButton.getAttribute('aria-describedby')).toBe('pos-close-day-readiness');
    expect(screen.getByTestId('pos-branch-day-close-panel').className).toContain('rounded-xl');
    expect(screen.getByText(/This terminal is assigned to another branch/)).toBeTruthy();
    expect(screen.queryByText('All cashier shifts are closed. The branch Z-reading is ready to generate.'))
      .toBeNull();
  });

  it('keeps the card refresh beside the heading and the close action in its own row', () => {
    render(
      <BranchDayClosePanel
        activeShift={{ pos_terminal_shift_id: 12 }}
        canCloseDay
        shiftActionLoading={{ zReading: false }}
        locked={false}
        isOnline
        activeTerminalMatchesOperatingLocation
        shiftState={{ loading: false, errorMessage: '' }}
        dayCloseReadinessState={{
          loading: false,
          errorMessage: '',
          readiness: { ready: false, already_closed: false, open_shift_count: 1 }
        }}
        refreshDayCloseReadiness={vi.fn()}
        handleCloseDay={vi.fn()}
      />
    );

    const panel = screen.getByTestId('pos-branch-day-close-panel');
    const refreshButton = screen.getByTestId('pos-close-day-refresh');
    const closeDayButton = screen.getByTestId('pos-close-day-button');

    expect(refreshButton.closest('header')).toBeTruthy();
    expect(closeDayButton.closest('header')).toBeNull();
    expect(closeDayButton.parentElement.querySelectorAll('button')).toHaveLength(1);
    expect(closeDayButton.className).toContain('flex-[1_1_16rem]');
    expect(closeDayButton.className).toContain('whitespace-normal');
    expect(closeDayButton.className).toContain('max-w-96');
    expect(screen.getByText('Close this cashier shift before generating the branch Z-reading.'))
      .toBeTruthy();
    expect(panel.querySelector('header [data-testid="pos-close-day-refresh"]')).toBe(refreshButton);
  });

  it('renders the no-shift day-close controls flat with refresh before the primary action', () => {
    const refreshDayCloseReadiness = vi.fn();
    render(
      <BranchDayClosePanel
        layout="flat"
        activeShift={null}
        canCloseDay
        shiftActionLoading={{ zReading: false }}
        locked={false}
        isOnline
        activeTerminalMatchesOperatingLocation
        shiftState={{ loading: false, errorMessage: '' }}
        dayCloseReadinessState={{
          loading: false,
          errorMessage: '',
          readiness: { ready: true, already_closed: false, open_shift_count: 0 }
        }}
        refreshDayCloseReadiness={refreshDayCloseReadiness}
        handleCloseDay={vi.fn()}
      />
    );

    const panel = screen.getByTestId('pos-branch-day-close-panel');
    const actions = panel.querySelectorAll('button');

    expect(panel.className).toContain('border-t');
    expect(panel.className).not.toContain('rounded-xl');
    expect(actions[0].getAttribute('data-testid')).toBe('pos-close-day-refresh');
    expect(actions[1].getAttribute('data-testid')).toBe('pos-close-day-button');
    expect(actions[1].disabled).toBe(false);
    expect(actions[1].textContent).toBe('Close Day');
    expect(screen.getByText('All cashier shifts are closed. The branch Z-reading is ready to generate.'))
      .toBeTruthy();
    expect(screen.getByTestId('pos-close-day-button').getAttribute('aria-describedby'))
      .toBe('pos-close-day-readiness');

    screen.getByTestId('pos-close-day-refresh').click();
    expect(refreshDayCloseReadiness).toHaveBeenCalledOnce();
  });

  it('uses a short consistent print action when the Z-reading is already generated', () => {
    render(
      <BranchDayClosePanel
        activeShift={null}
        canCloseDay
        shiftActionLoading={{ zReading: false }}
        locked={false}
        isOnline
        activeTerminalMatchesOperatingLocation
        shiftState={{ loading: false, errorMessage: '' }}
        dayCloseReadinessState={{
          loading: false,
          errorMessage: '',
          readiness: { ready: true, already_closed: true, open_shift_count: 0 }
        }}
        refreshDayCloseReadiness={vi.fn()}
        handleCloseDay={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Print Z-reading' }).disabled).toBe(false);
    expect(screen.getByText('The branch Z-reading is already generated and ready to print again.'))
      .toBeTruthy();
  });
});
