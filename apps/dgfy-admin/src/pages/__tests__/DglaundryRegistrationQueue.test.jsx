/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DglaundryRegistrationQueue from '../../../Pages/DglaundryRegistrationQueue.jsx';
import * as adminService from '@/services/adminService';

vi.mock('@/services/adminService', () => ({
  listDglaundryRegistrationIntents: vi.fn(),
  getDglaundryRegistrationIntent: vi.fn(),
  decideDglaundryRegistrationIntent: vi.fn()
}));

const queueResponse = {
  success: true,
  data: {
    total: 1,
    items: [{ intentId: 'intent-1', status: 'pending', organizationName: 'asdsad', branchName: 'Main Branch', applicant: { email: 'owner@example.test' }, createdAt: '2026-10-27T00:00:00.000Z' }]
  }
};
const detail = {
  success: true,
  data: {
    intentId: 'intent-1',
    status: 'pending',
    statusVersion: 4,
    createdAt: '2026-10-27T00:00:00.000Z',
    payload: { organizationName: 'asdsad', branchName: 'Main Branch', branchCode: 'MAIN', timezone: 'Asia/Manila', currency: 'PHP' },
    applicant: { issuer: 'https://stage.example/oidc', subject: 'account-1', name: 'Owner', email: 'owner@example.test', identityVerified: true }
  }
};

describe('DGLaundry registration approval queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminService.listDglaundryRegistrationIntents.mockResolvedValue(queueResponse);
    adminService.getDglaundryRegistrationIntent.mockResolvedValue(detail);
    adminService.decideDglaundryRegistrationIntent.mockResolvedValue({ success: true, data: { status: 'approved', idempotentReplay: false } });
  });

  afterEach(() => cleanup());

  it('shows DGLaundry registrations separately and submits approval with the reviewed version', async () => {
    const user = userEvent.setup();
    render(<DglaundryRegistrationQueue />);

    expect(await screen.findByRole('heading', { name: 'DGLaundry registrations' })).toBeTruthy();
    expect(await screen.findByText('asdsad')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('Main Branch (MAIN)')).toBeTruthy();
    expect(screen.getByText('Verified against the DGFY issuer')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve registration' }));

    await waitFor(() => expect(adminService.decideDglaundryRegistrationIntent).toHaveBeenCalledWith('intent-1', {
      decision: 'approve',
      expectedStatusVersion: 4,
      reason: null
    }));
    expect(await screen.findByText('Decision recorded.')).toBeTruthy();
  });

  it('requires a reason for correction and disables approval for an unverified applicant', async () => {
    const user = userEvent.setup();
    adminService.getDglaundryRegistrationIntent.mockResolvedValueOnce({
      ...detail,
      data: { ...detail.data, applicant: { ...detail.data.applicant, identityVerified: false } }
    });
    render(<DglaundryRegistrationQueue />);
    await screen.findByText('asdsad');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    const approveButton = await screen.findByRole('button', { name: 'Approve registration' });
    expect(approveButton.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Request correction' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Enter a reason before rejecting or requesting a correction.');
    expect(adminService.decideDglaundryRegistrationIntent).not.toHaveBeenCalled();
  });
});
