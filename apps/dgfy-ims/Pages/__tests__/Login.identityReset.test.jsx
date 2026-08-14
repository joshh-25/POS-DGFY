/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({ post: vi.fn() }));
const loginMock = vi.hoisted(() => vi.fn());
const clearClientSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../packages/web-core/src/services/api.js', () => ({ default: apiMock }));
vi.mock('../../../../packages/web-core/src/services/authService.js', () => ({ login: loginMock }));
vi.mock('../../../../packages/web-core/src/services/sessionCleanup.js', () => ({
  clearClientSession: clearClientSessionMock
}));

import Login from '../Login.jsx';

describe('IMS login identity reset', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    loginMock.mockReset();
    clearClientSessionMock.mockReset();
    loginMock.mockResolvedValue({});
    apiMock.post
      .mockResolvedValueOnce({
        data: { data: { company_token: 'token-company-a', status: 'active' } }
      })
      .mockResolvedValueOnce({
        data: { data: { company_token: 'token-company-b', status: 'active' } }
      });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('discards the first company before submitting a changed account', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    );

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');

    fireEvent.change(email, { target: { value: 'first@example.test' } });
    fireEvent.blur(email);
    await screen.findByText('Company identified automatically');
    fireEvent.change(password, { target: { value: 'first-password' } });

    fireEvent.change(email, { target: { value: 'second@example.test' } });
    expect(password.value).toBe('');
    fireEvent.change(password, { target: { value: 'second-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith({
      email: 'second@example.test',
      password: 'second-password',
      companyToken: 'token-company-b'
    }));
    expect(loginMock).not.toHaveBeenCalledWith(expect.objectContaining({
      companyToken: 'token-company-a'
    }));
    expect(apiMock.post).toHaveBeenLastCalledWith(
      '/auth/lookup',
      { email: 'second@example.test' },
      expect.objectContaining({ skipAuthRefresh: true, skipTenantAuthHeaders: true })
    );
  });
});
