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
    fireEvent.change(screen.getByLabelText('Create Password'), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => expect(screen.getByText('Home screen')).toBeTruthy());
    expect(apiMock.post).toHaveBeenCalledWith('/auth/accept-invite', {
      token: 'invite-token',
      username: 'teammate',
      password: 'StrongPass1!'
    }, {});
    expect(window.localStorage.getItem('authToken')).toBe('access-token');
    expect(window.localStorage.getItem('refreshToken')).toBe('refresh-token');
    expect(window.localStorage.getItem('companyToken')).toBe('tenant-token');
  });
});
