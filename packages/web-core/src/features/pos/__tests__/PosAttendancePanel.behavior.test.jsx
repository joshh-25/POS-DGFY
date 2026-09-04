// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PosAttendancePanel from '../components/PosAttendancePanel.jsx';
import {
    countedPosCustodyHandoff,
    endPosCashierBreak,
    fetchCurrentPosOperator,
    fetchCurrentPosCashierAttendance,
    fetchEligiblePosOperators,
    startPosCashierBreak,
    startPosCashierReliefDuty,
    takeOverPosRegister,
    timeInPosCashierAttendance
} from '../services/posService.js';

vi.mock('../services/posService.js', () => ({
    POS_ATTENDANCE_CONFIG_CHANGED_EVENT: 'dgfy:pos-attendance-config-changed',
    countedPosCustodyHandoff: vi.fn(),
    endPosCashierBreak: vi.fn(),
    endPosCashierReliefDuty: vi.fn(),
    endPosSharedRelief: vi.fn(),
    fetchCurrentPosOperator: vi.fn(),
    fetchCurrentPosCashierAttendance: vi.fn(),
    fetchEligiblePosOperators: vi.fn(),
    returnPosRegister: vi.fn(),
    startPosCashierBreak: vi.fn(),
    startPosCashierReliefDuty: vi.fn(),
    startPosSharedRelief: vi.fn(),
    takeOverPosRegister: vi.fn(),
    timeInPosCashierAttendance: vi.fn(),
    timeOutPosCashierAttendance: vi.fn()
}));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

beforeEach(() => {
    fetchCurrentPosCashierAttendance.mockResolvedValue({
        feature: { enabled: true },
        attendance_session: null,
        active_break: null
    });
    fetchCurrentPosOperator.mockResolvedValue({ operator_session: null, authority_valid: false });
    fetchEligiblePosOperators.mockResolvedValue({ operators: [] });
});

describe('PosAttendancePanel', () => {
    it('stays hidden while the rollout flag is disabled', async () => {
        fetchCurrentPosCashierAttendance.mockResolvedValueOnce({ feature: { enabled: false } });

        render(<PosAttendancePanel locationId={12} canView canOperate />);

        await waitFor(() => expect(fetchCurrentPosCashierAttendance).toHaveBeenCalledWith({ location_id: 12 }));
        expect(screen.queryByTestId('pos-attendance-panel')).toBeNull();
    });

    it('refreshes immediately and hides after the attendance configuration is disabled', async () => {
        fetchCurrentPosCashierAttendance
            .mockResolvedValueOnce({ feature: { enabled: true }, attendance_session: null, active_break: null })
            .mockResolvedValueOnce({ feature: { enabled: false }, attendance_session: null, active_break: null });

        render(<PosAttendancePanel locationId={12} canView canOperate />);
        expect(await screen.findByTestId('pos-attendance-panel')).toBeTruthy();

        window.dispatchEvent(new CustomEvent('dgfy:pos-attendance-config-changed'));

        await waitFor(() => expect(fetchCurrentPosCashierAttendance).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByTestId('pos-attendance-panel')).toBeNull());
    });

    it('records a server-backed time in and prevents duplicate clicks while pending', async () => {
        let resolveTimeIn;
        timeInPosCashierAttendance.mockImplementation(() => new Promise((resolve) => { resolveTimeIn = resolve; }));

        render(<PosAttendancePanel locationId={12} canView canOperate />);
        await screen.findByRole('button', { name: 'Time In' });

        const timeInButton = screen.getByRole('button', { name: 'Time In' });
        fireEvent.click(timeInButton);
        fireEvent.click(timeInButton);

        await waitFor(() => expect(timeInPosCashierAttendance).toHaveBeenCalledTimes(1));
        expect(timeInPosCashierAttendance.mock.calls[0][0]).toEqual(expect.objectContaining({ location_id: 12 }));
        expect(timeInPosCashierAttendance.mock.calls[0][0].idempotency_key).toMatch(/^pos-attendance-time-in-/);

        resolveTimeIn({});
        await waitFor(() => expect(fetchCurrentPosCashierAttendance).toHaveBeenCalledTimes(2));
    });

    it('shows active-break state and exposes only end-break while a break is open', async () => {
        fetchCurrentPosCashierAttendance.mockResolvedValueOnce({
            feature: { enabled: true },
            attendance_session: { duty_type: 'relief', started_at: '2026-08-24T04:00:00.000Z' },
            active_break: { started_at: '2026-08-24T05:00:00.000Z' }
        });

        render(<PosAttendancePanel locationId={12} canView canOperate />);

        expect(await screen.findByText(/on break since/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'End Break' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Start Break' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'End Relief Duty' })).toBeNull();
        expect(startPosCashierBreak).not.toHaveBeenCalled();
        expect(startPosCashierReliefDuty).not.toHaveBeenCalled();
        expect(endPosCashierBreak).not.toHaveBeenCalled();
    });

    it('locks selling until a timed-in cashier takes over with a PIN', async () => {
        fetchEligiblePosOperators.mockResolvedValueOnce({
            operators: [{ user_id: 42, username: 'cashier-b', duty_type: 'regular' }]
        });
        takeOverPosRegister.mockResolvedValueOnce({
            operator_session: { user_id: 42 },
            authority_valid: true
        });

        render(<PosAttendancePanel locationId={12} terminalId="COUNTER-01" shiftId={88} canView canOperate />);

        expect(await screen.findByText(/register locked: cashier takeover required/i)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Cashier PIN'), { target: { value: '2468' } });
        fireEvent.click(screen.getByRole('button', { name: 'Take over' }));

        await waitFor(() => expect(takeOverPosRegister).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 42,
            pin: '2468',
            terminal_id: 'COUNTER-01',
            location_id: 12,
            shift_id: 88
        })));
    });

    it('requires an explicit outgoing-cashier acknowledgement before a counted handoff', async () => {
        fetchEligiblePosOperators.mockResolvedValueOnce({
            operators: [{ user_id: 42, username: 'cashier-b', duty_type: 'regular' }]
        });
        countedPosCustodyHandoff.mockResolvedValueOnce({ operator_session: { user_id: 42 } });

        render(<PosAttendancePanel locationId={12} terminalId="COUNTER-01" shiftId={88} canView canOperate />);
        await screen.findByText(/register locked: cashier takeover required/i);
        fireEvent.change(screen.getByLabelText('Cashier PIN'), { target: { value: '2468' } });
        fireEvent.change(screen.getByLabelText('Counted cash'), { target: { value: '1250.50' } });
        fireEvent.click(screen.getByRole('button', { name: 'Counted handoff' }));

        expect(countedPosCustodyHandoff).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toMatch(/outgoing cashier must confirm/i);

        fireEvent.click(screen.getByLabelText(/outgoing cashier confirms/i));
        fireEvent.click(screen.getByRole('button', { name: 'Counted handoff' }));

        await waitFor(() => expect(countedPosCustodyHandoff).toHaveBeenCalledWith(expect.objectContaining({
            outgoing_acknowledged: true,
            incoming_acknowledged: true,
            counted_cash_amount: 1250.5
        })));
    });

    it('disables cashier mutations while offline and recovers after connectivity returns', async () => {
        const { rerender } = render(<PosAttendancePanel locationId={12} terminalId="COUNTER-01" shiftId={88} canView canOperate isOnline />);
        await screen.findByRole('button', { name: 'Time In' });

        rerender(<PosAttendancePanel locationId={12} terminalId="COUNTER-01" shiftId={88} canView canOperate isOnline={false} />);
        expect(screen.getByText(/reconnect to change attendance/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Time In' }).disabled).toBe(true);

        rerender(<PosAttendancePanel locationId={12} terminalId="COUNTER-01" shiftId={88} canView canOperate isOnline />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Time In' }).disabled).toBe(false));
    });

    it('shows a reachable retry control after the initial attendance request fails', async () => {
        fetchCurrentPosCashierAttendance
            .mockRejectedValueOnce(new Error('Attendance service unavailable'))
            .mockResolvedValueOnce({ feature: { enabled: true }, attendance_session: null, active_break: null });

        render(<PosAttendancePanel locationId={12} canView canOperate />);
        expect((await screen.findByRole('alert')).textContent).toContain('Attendance service unavailable');

        fireEvent.click(screen.getByRole('button', { name: 'Retry attendance' }));
        expect(await screen.findByRole('button', { name: 'Time In' })).toBeTruthy();
    });

    it('uses one compact Break & Lock action for the normal cashier flow', async () => {
        fetchCurrentPosCashierAttendance.mockResolvedValueOnce({
            feature: { enabled: true },
            attendance_session: { duty_type: 'regular', started_at: '2026-08-24T04:00:00.000Z' },
            active_break: null
        });
        const onBreakAndLock = vi.fn();

        render(<PosAttendancePanel locationId={12} shiftId={88} canView canOperate compact onBreakAndLock={onBreakAndLock} />);

        expect(await screen.findByRole('button', { name: 'Break & Lock' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Time In' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Start Break' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Break & Lock' }));
        expect(onBreakAndLock).toHaveBeenCalledTimes(1);
    });

    it('refreshes compact attendance when opening a shift automatically starts attendance', async () => {
        fetchCurrentPosCashierAttendance
            .mockResolvedValueOnce({
                feature: { enabled: true },
                attendance_session: null,
                active_break: null
            })
            .mockResolvedValueOnce({
                feature: { enabled: true },
                attendance_session: { duty_type: 'regular', started_at: '2026-08-24T04:00:00.000Z' },
                active_break: null
            });
        const onBreakAndLock = vi.fn();
        const { rerender } = render(
            <PosAttendancePanel locationId={12} canView canOperate compact onBreakAndLock={onBreakAndLock} />
        );

        expect(await screen.findByText('Shift attendance will start when you open the shift')).toBeTruthy();

        rerender(
            <PosAttendancePanel locationId={12} shiftId={88} canView canOperate compact onBreakAndLock={onBreakAndLock} />
        );

        await waitFor(() => expect(fetchCurrentPosCashierAttendance).toHaveBeenCalledTimes(2));
        expect(await screen.findByRole('button', { name: 'Break & Lock' })).toBeTruthy();
        expect(screen.queryByText('Shift attendance will start when you open the shift')).toBeNull();
    });

    it('keeps End Break reachable from the compact cashier status bar', async () => {
        fetchCurrentPosCashierAttendance.mockResolvedValueOnce({
            feature: { enabled: true },
            attendance_session: { duty_type: 'regular', started_at: '2026-08-24T04:00:00.000Z' },
            active_break: { started_at: '2026-08-24T05:00:00.000Z' }
        });
        endPosCashierBreak.mockResolvedValueOnce({});

        render(<PosAttendancePanel locationId={12} shiftId={88} canView canOperate compact />);

        const endBreakButton = await screen.findByRole('button', { name: 'End Break' });
        fireEvent.click(endBreakButton);

        await waitFor(() => expect(endPosCashierBreak).toHaveBeenCalledWith(expect.objectContaining({
            location_id: 12,
            idempotency_key: expect.stringMatching(/^pos-attendance-break-end-/)
        })));
    });
});
