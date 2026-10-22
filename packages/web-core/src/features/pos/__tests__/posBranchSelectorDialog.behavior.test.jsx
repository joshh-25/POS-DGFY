/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PosBranchSelectorDialog from '../components/PosBranchSelectorDialog.jsx';

afterEach(cleanup);

const branchDirectoryState = {
  loading: false,
  errorMessage: '',
  locations: [{
    location_id: 1,
    name: 'Main Branch',
    open_shift_count: 1,
    is_open: true,
    can_view: true,
    terminals: [{
      terminal_id: 'MAIN-01',
      label: 'Main Register',
      status: 'stale',
      can_open: false,
      can_resume: false,
      reason_code: 'POS_TERMINAL_STALE_SHIFT',
      current_operator: { display_name: 'Active Cashier' },
      shift: { cashier: { display_name: 'Admin One' } }
    }]
  }]
};

describe('POS independent branch selector', () => {
  it('shows occupied admin branches independently from shift controls', () => {
    const onOpenChange = vi.fn();
    const onViewBranch = vi.fn(async () => true);

    render(
      <PosBranchSelectorDialog
        open
        mode="directory"
        branchDirectoryState={branchDirectoryState}
        isOnline
        onOpenChange={onOpenChange}
        onViewBranch={onViewBranch}
      />
    );

    const dialog = screen.getByTestId('pos-branch-selector-dialog');
    const card = within(screen.getByTestId('pos-branch-selector-card-1'));

    expect(screen.getByRole('heading', { name: 'Select a branch' })).toBeTruthy();
    expect(screen.queryByText(/viewing a branch is read-only/i)).toBeNull();
    expect(card.getByText('Main Branch')).toBeTruthy();
    expect(card.getByText('In use')).toBeTruthy();
    expect(card.getByText('Shift cashier: Admin One')).toBeTruthy();
    expect(card.getByText('Active cashier: Active Cashier')).toBeTruthy();
    expect(card.getByRole('button', { name: 'View Branch' }).disabled).toBe(false);
    const recoveryButton = card.getByTestId('pos-branch-selector-open-1');
    expect(recoveryButton.textContent).toContain('Recovery required');
    expect(recoveryButton.disabled).toBe(true);
    expect(card.getByText(/belongs to another cashier and must be recovered by a master administrator/i)).toBeTruthy();
    expect(dialog.closest('[data-dialog-root="true"]')).toBeTruthy();

    fireEvent.click(card.getByRole('button', { name: 'View Branch' }));

    return waitFor(() => {
      expect(onViewBranch).toHaveBeenCalledWith({ locationId: 1 });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('offers Resume Shift when stale data still advertises can_resume for the owner', () => {
    const onResumeShift = vi.fn(async () => true);

    render(
      <PosBranchSelectorDialog
        open
        mode="directory"
        branchDirectoryState={{
          loading: false,
          errorMessage: '',
          locations: [{
            location_id: 4,
            name: 'Stale Branch',
            open_shift_count: 1,
            is_open: true,
            can_view: true,
            terminals: [{
              terminal_id: 'STALE-01',
              label: 'Stale Register',
              status: 'stale',
              can_open: false,
              can_resume: true,
              reason_code: 'POS_TERMINAL_STALE_SHIFT',
              shift: { pos_terminal_shift_id: 77, cashier: { display_name: 'Admin One' } }
            }]
          }]
        }}
        operatorState={{ canOpenShift: true }}
        isOnline
        onOpenChange={vi.fn()}
        onResumeShift={onResumeShift}
      />
    );

    const card = within(screen.getByTestId('pos-branch-selector-card-4'));
    const resumeButton = card.getByTestId('pos-branch-selector-resume-4');
    expect(resumeButton.textContent).toContain('Resume Shift');
    expect(resumeButton.disabled).toBe(false);
    expect(card.queryByTestId('pos-branch-selector-open-4')).toBeNull();

    fireEvent.click(resumeButton);

    return waitFor(() => {
      expect(onResumeShift).toHaveBeenCalledWith({
        locationId: 4,
        terminalId: 'STALE-01',
        shiftId: 77
      });
    });
  });

  it('shows the assigned cashier branch card without coupling it to shift controls', () => {
    const onContinue = vi.fn();

    render(
      <PosBranchSelectorDialog
        open
        mode="cashier"
        cashierRegister={{
          branchName: 'East Branch',
          terminalLabel: 'East Register',
          cashierLabel: 'Cashier One',
          hasActiveShift: true
        }}
        isOnline
        onContinue={onContinue}
      />
    );

    expect(screen.getByRole('heading', { name: 'Confirm your branch' })).toBeTruthy();
    expect(screen.getByTestId('pos-cashier-branch-card')).toBeTruthy();
    expect(screen.getByText('East Branch')).toBeTruthy();
    expect(screen.getByText('East Register')).toBeTruthy();
    expect(screen.getByText('Cashier One')).toBeTruthy();
    expect(screen.getByText(/Existing shift found — resume is a separate step/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View Branch' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to POS' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows every assigned cashier branch and lets the cashier choose where to open a shift', async () => {
    const onOpenShift = vi.fn(async () => true);
    const onResumeShift = vi.fn(async () => true);

    render(
      <PosBranchSelectorDialog
        open
        mode="cashier"
        cashierRegister={{
          cashierLabel: 'Cashier One',
          loading: false,
          branches: [
            {
              location_id: 11,
              name: 'First Branch',
              open_shift_count: 0,
              is_open: true,
              terminals: [{
                terminal_id: 'FIRST-01',
                label: 'First Register',
                status: 'available',
                can_open: true,
                can_resume: false
              }]
            },
            {
              location_id: 12,
              name: 'Second Branch',
              open_shift_count: 0,
              is_open: true,
              terminals: [{
                terminal_id: 'SECOND-01',
                label: 'Second Register',
                status: 'available',
                can_open: true,
                can_resume: false
              }]
            }
          ]
        }}
        operatorState={{ canOpenShift: true }}
        isOnline
        onOpenChange={vi.fn()}
        onOpenShift={onOpenShift}
        onResumeShift={onResumeShift}
      />
    );

    expect(screen.getByRole('heading', { name: 'Choose your branch' })).toBeTruthy();
    expect(screen.getByTestId('pos-cashier-branch-card-11')).toBeTruthy();
    expect(screen.getByTestId('pos-cashier-branch-card-12')).toBeTruthy();

    fireEvent.click(screen.getByTestId('pos-cashier-branch-selector-open-11'));
    await waitFor(() => {
      expect(onOpenShift).toHaveBeenCalledWith({
        locationId: 11,
        terminalId: 'FIRST-01',
        shiftId: null
      });
    });

    fireEvent.click(screen.getByTestId('pos-cashier-branch-selector-open-12'));
    await waitFor(() => {
      expect(onOpenShift).toHaveBeenCalledWith({
        locationId: 12,
        terminalId: 'SECOND-01',
        shiftId: null
      });
    });
    expect(onResumeShift).not.toHaveBeenCalled();
  });

  it('offers Resume Shift only for the admin-owned shift and disables other branch opening', () => {
    const onResumeShift = vi.fn(async () => true);
    const onOpenShift = vi.fn(async () => true);

    render(
      <PosBranchSelectorDialog
        open
        mode="directory"
        branchDirectoryState={{
          loading: false,
          errorMessage: '',
          locations: [
            {
              location_id: 1,
              name: 'Main Branch',
              open_shift_count: 1,
              is_open: true,
              can_view: true,
              terminals: [{
                terminal_id: 'MAIN-01',
                label: 'Main Register',
                status: 'occupied',
                can_resume: true,
                can_open: false,
                shift: {
                  pos_terminal_shift_id: 42,
                  cashier: { display_name: 'Admin One' }
                }
              }]
            },
            {
              location_id: 2,
              name: 'Second Branch',
              open_shift_count: 0,
              is_open: true,
              can_view: true,
              can_open: false,
              terminals: [{
                terminal_id: 'SECOND-01',
                label: 'Second Register',
                status: 'available',
                can_resume: false,
                can_open: false,
                reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE'
              }]
            }
          ]
        }}
        operatorState={{ canOpenShift: true }}
        isOnline
        onOpenChange={vi.fn()}
        onOpenShift={onOpenShift}
        onResumeShift={onResumeShift}
      />
    );

    const mainCard = within(screen.getByTestId('pos-branch-selector-card-1'));
    const secondCard = within(screen.getByTestId('pos-branch-selector-card-2'));
    const resumeButton = mainCard.getByTestId('pos-branch-selector-resume-1');
    const blockedOpenButton = secondCard.getByTestId('pos-branch-selector-open-2');

    expect(resumeButton.textContent).toContain('Resume Shift');
    expect(resumeButton.disabled).toBe(false);
    expect(blockedOpenButton.textContent).toContain('Open Shift');
    expect(blockedOpenButton.disabled).toBe(true);
    expect(secondCard.getByText(/your existing shift is active at Main Branch/i)).toBeTruthy();

    fireEvent.click(resumeButton);

    return waitFor(() => {
      expect(onResumeShift).toHaveBeenCalledWith({
        locationId: 1,
        terminalId: 'MAIN-01',
        shiftId: 42
      });
      expect(onOpenShift).not.toHaveBeenCalled();
    });
  });

  it('places the admin-owned open-shift branch first while preserving other branch order', () => {
    render(
      <PosBranchSelectorDialog
        open
        mode="directory"
        branchDirectoryState={{
          loading: false,
          errorMessage: '',
          locations: [
            {
              location_id: 1,
              name: 'First Branch',
              open_shift_count: 0,
              is_open: true,
              can_view: true,
              terminals: [{
                terminal_id: 'FIRST-01',
                label: 'First Register',
                status: 'available',
                can_resume: false,
                can_open: false,
                reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE'
              }]
            },
            {
              location_id: 2,
              name: 'Admin Shift Branch',
              open_shift_count: 1,
              is_open: true,
              can_view: true,
              terminals: [{
                terminal_id: 'ADMIN-01',
                label: 'Admin Register',
                status: 'occupied',
                can_resume: true,
                can_open: false,
                shift: {
                  pos_terminal_shift_id: 42,
                  cashier: { display_name: 'Admin One' }
                }
              }]
            },
            {
              location_id: 3,
              name: 'Other Cashier Branch',
              open_shift_count: 1,
              is_open: true,
              can_view: true,
              terminals: [{
                terminal_id: 'OTHER-01',
                label: 'Other Register',
                status: 'occupied',
                can_resume: false,
                can_open: false,
                shift: {
                  pos_terminal_shift_id: 84,
                  cashier: { display_name: 'Cashier Two' }
                }
              }]
            }
          ]
        }}
        operatorState={{
          activeShiftId: 42,
          activeShiftLocationId: 2,
          activeShiftTerminalId: 'ADMIN-01',
          canOpenShift: true
        }}
        isOnline
        onOpenChange={vi.fn()}
      />
    );

    const cards = screen.getAllByTestId(/^pos-branch-selector-card-/);
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Admin Shift Branch',
      'First Branch',
      'Other Cashier Branch'
    ]);
    expect(within(cards[0]).getByRole('button', { name: 'Resume Shift' })).toBeTruthy();
    expect(within(cards[2]).queryByRole('button', { name: 'Resume Shift' })).toBeNull();
  });

  it('offers Open Shift for an available terminal when no admin shift exists', () => {
    const onOpenShift = vi.fn(async () => true);

    render(
      <PosBranchSelectorDialog
        open
        mode="directory"
        branchDirectoryState={{
          loading: false,
          errorMessage: '',
          locations: [{
            location_id: 3,
            name: 'Third Branch',
            open_shift_count: 0,
            is_open: true,
            can_view: true,
            terminals: [{
              terminal_id: 'THIRD-01',
              label: 'Third Register',
              status: 'available',
              can_open: true,
              can_resume: false
            }]
          }]
        }}
        operatorState={{ canOpenShift: true }}
        isOnline
        onOpenChange={vi.fn()}
        onOpenShift={onOpenShift}
      />
    );

    const card = within(screen.getByTestId('pos-branch-selector-card-3'));
    const openButton = card.getByTestId('pos-branch-selector-open-3');

    expect(openButton.disabled).toBe(false);
    fireEvent.click(openButton);

    return waitFor(() => {
      expect(onOpenShift).toHaveBeenCalledWith({
        locationId: 3,
        terminalId: 'THIRD-01',
        shiftId: null
      });
    });
  });
});
