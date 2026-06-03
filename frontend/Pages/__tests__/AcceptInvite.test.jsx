/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock('../../src/services/api.js', () => ({
  default: apiMock
}));

import AcceptInvite from '../AcceptInvite.jsx';

describe('AcceptInvite', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows invitation context and logs the invited user in after password setup', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          email: 'teammate@example.com',
          role: 'staff',
          tenantName: 'Acme Foods',
          inviter_name: 'Master Admin',
          expires_at: '2026-05-07T04:30:00.000Z'
        }
      }
    });
    apiMock.post.mockResolvedValue({
      data: {
        data: {
          user: { user_id: 2, username: 'teammate', email: 'teammate@example.com', role: 'staff' },
          token: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 86400,
          company: { token: 'tenant-token' }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/accept-invite?token=invite-token']}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Acme Foods');
    expect(screen.getByText('Invited by: Master Admin')).toBeTruthy();
    expect(screen.getByText('Email: teammate@example.com')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Choose a Username'), {
      target: { value: 'teammate' }
    });
    fireEvent.change(screen.getByLabelText('Phone Number'), {
      target: { value: '+63 912 345 6789' }
    });
    fireEvent.change(screen.getByLabelText('Create Password'), {
      target: { value: 'abcdefgh' }
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'abcdefgh' }
    });
    fireEvent.change(screen.getByLabelText('Email Verification Code'), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => expect(screen.getByText('Home screen')).toBeTruthy());
    expect(apiMock.post).toHaveBeenCalledWith('/auth/accept-invite', {
      token: 'invite-token',
      username: 'teammate',
      phone_number: '+63 912 345 6789',
      password: 'abcdefgh',
      email_otp_code: '123456'
    });
    expect(window.localStorage.getItem('authToken')).toBeNull();
    expect(window.localStorage.getItem('refreshToken')).toBeNull();
    expect(window.localStorage.getItem('companyToken')).toBeNull();
  });

  it('generates a matching 16-character password for invitation setup', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          email: 'teammate@example.com',
          role: 'staff',
          tenantName: 'Acme Foods',
          inviter_name: 'Master Admin',
          expires_at: '2026-05-07T04:30:00.000Z'
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/accept-invite?token=invite-token']}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvite />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Acme Foods');
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    const password = screen.getByLabelText('Create Password').value;
    expect(password).toHaveLength(16);
    expect(screen.getByLabelText('Confirm Password').value).toBe(password);
    expect(screen.getByText('At least 8 characters')).toBeTruthy();
  });

  it('ignores legacy company query params and lets the backend resolve tenant context from the invite token', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          email: 'teammate@example.com',
          role: 'staff',
          tenantName: 'Acme Foods',
          inviter_name: 'Master Admin',
          expires_at: '2026-05-07T04:30:00.000Z'
        }
      }
    });
    apiMock.post.mockResolvedValue({
      data: {
        data: {
          user: { user_id: 2, username: 'teammate', email: 'teammate@example.com', role: 'staff' },
          token: 'access-token',
          expiresIn: 86400,
          company: { token: 'tenant-token-from-registry' }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/accept-invite?token=invite-token&company=legacy-token&companyToken=other-token']}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Acme Foods');
    expect(apiMock.get).toHaveBeenCalledWith('/auth/validate-invite/invite-token');

    fireEvent.change(screen.getByLabelText('Choose a Username'), {
      target: { value: 'teammate' }
    });
    fireEvent.change(screen.getByLabelText('Phone Number'), {
      target: { value: '+63 912 345 6789' }
    });
    fireEvent.change(screen.getByLabelText('Create Password'), {
      target: { value: 'abcdefgh' }
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'abcdefgh' }
    });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/auth/email-otp/request', {
      purpose: 'invitation_acceptance',
      invitation_token: 'invite-token'
    }));

    fireEvent.change(screen.getByLabelText('Email Verification Code'), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => expect(screen.getByText('Home screen')).toBeTruthy());
    expect(apiMock.post).toHaveBeenCalledWith('/auth/accept-invite', {
      token: 'invite-token',
      username: 'teammate',
      phone_number: '+63 912 345 6789',
      password: 'abcdefgh',
      email_otp_code: '123456'
    });
  });
});
