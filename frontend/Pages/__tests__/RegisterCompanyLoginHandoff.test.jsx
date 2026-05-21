/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  post: vi.fn()
}));

const loginMock = vi.hoisted(() => vi.fn());
const clearClientSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/api.js', () => ({
  default: apiMock
}));

vi.mock('../../src/services/authService.js', () => ({
  login: loginMock
}));

vi.mock('../../src/services/sessionCleanup.js', () => ({
  clearClientSession: clearClientSessionMock
}));

import RegisterCompany from '../RegisterCompany.jsx';
import Login from '../Login.jsx';

const renderRegistrationFlow = (initialEntries = ['/register-company']) => render(
  <MemoryRouter initialEntries={initialEntries}>
    <Routes>
      <Route path="/register-company" element={<RegisterCompany />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<div>Dashboard screen</div>} />
    </Routes>
  </MemoryRouter>
);

const fillRegistrationForm = ({
  companyName = 'Auto Foods',
  email = 'owner@autofoods.test',
  phone = '+63 912 345 6789',
  password = 'abcdefgh',
  otp = '123456'
} = {}) => {
  fireEvent.change(screen.getByLabelText('Company Name'), {
    target: { value: companyName }
  });
  fireEvent.change(screen.getByLabelText('Admin Email'), {
    target: { value: email }
  });
  fireEvent.change(screen.getByLabelText('Admin Phone Number'), {
    target: { value: phone }
  });
  fireEvent.change(screen.getByLabelText('Admin Password'), {
    target: { value: password }
  });
  fireEvent.change(screen.getByLabelText('Confirm Password'), {
    target: { value: password }
  });
  fireEvent.change(screen.getByLabelText('Email Verification Code'), {
    target: { value: otp }
  });
};

describe('RegisterCompany login handoff', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    loginMock.mockReset();
    clearClientSessionMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('auto-logs in after active registration succeeds', async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        message: 'Company registered and activated successfully. You can sign in now.',
        data: {
          id: 'tenant-1',
          name: 'Auto Foods',
          status: 'active',
          plan: 'standard',
          company_token: 'token-autofoods-12345678'
        }
      }
    });
    loginMock.mockResolvedValue({
      user: { email: 'owner@autofoods.test' },
      token: 'auth-token',
      refreshToken: 'refresh-token'
    });

    renderRegistrationFlow();

    fillRegistrationForm();
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith({
      email: 'owner@autofoods.test',
      password: 'abcdefgh',
      companyToken: 'token-autofoods-12345678'
    }));
    expect(await screen.findByText('Dashboard screen')).toBeTruthy();
  });

  it('does not expose the legacy manufacturing alias as a selectable registration mode', () => {
    renderRegistrationFlow();

    const options = Array.from(screen.getByLabelText('Business Mode').querySelectorAll('option'))
      .map((option) => ({
        value: option.value,
        label: option.textContent
      }));

    expect(options.some((option) => option.value === 'manufacturing')).toBe(false);
    expect(options.filter((option) => option.label === 'Food Manufacturing')).toHaveLength(1);
    expect(options.some((option) => option.value === 'food_manufacturing')).toBe(true);
  });

  it('generates a matching 16-character founder password', () => {
    renderRegistrationFlow();

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    const password = screen.getByLabelText('Admin Password').value;
    expect(password).toHaveLength(16);
    expect(screen.getByLabelText('Confirm Password').value).toBe(password);
    expect(screen.getByText('At least 8 characters')).toBeTruthy();
  });

  it('falls back to manual login when auto-login fails after active registration', async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        message: 'Company registered and activated successfully. You can sign in now.',
        data: {
          id: 'tenant-1',
          name: 'Auto Foods',
          status: 'active',
          plan: 'standard',
          company_token: 'token-autofoods-12345678'
        }
      }
    });
    loginMock.mockRejectedValue(new Error('Login failed after registration'));

    renderRegistrationFlow();

    fillRegistrationForm();
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await screen.findByText('Company Created!');
    expect(screen.getAllByText('Sign in manually').length).toBeGreaterThan(0);
    expect(screen.getByText('Login failed after registration')).toBeTruthy();
    expect(screen.getByText('token-autofoods-12345678')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sign in manually/i }));

    await waitFor(() => expect(screen.getByLabelText('Email').value).toBe('owner@autofoods.test'));
    expect(screen.getByText('Company identified automatically')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByLabelText('Company Token').value).toBe('token-autofoods-12345678');
    expect(screen.getByLabelText('Password').value).toBe('');
  });

  it('keeps pending registrations in review state without auto-login', async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        message: 'Your standard plan registration has been submitted for review. You will be notified once approved.',
        data: {
          id: 'tenant-1',
          name: 'Pending Foods',
          status: 'pending',
          plan: 'standard',
          company_token: 'token-pendingfoods-12345678'
        }
      }
    });

    renderRegistrationFlow();

    fillRegistrationForm({
      companyName: 'Pending Foods',
      email: 'owner@pendingfoods.test'
    });
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await screen.findByText('Request Submitted!');
    expect(screen.getByText('What happens next?')).toBeTruthy();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('prefills login from registration router state without an API lookup', async () => {
    renderRegistrationFlow([{
      pathname: '/login',
      state: {
        registration: {
          email: 'founder@example.test',
          companyToken: 'token-founder-abc123',
          companyName: 'Founder Foods'
        }
      }
    }]);

    expect(screen.getByLabelText('Email').value).toBe('founder@example.test');
    expect(screen.getByText('Company identified automatically')).toBeTruthy();
    expect(apiMock.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByLabelText('Company Token').value).toBe('token-founder-abc123');
    expect(screen.getByLabelText('Password').value).toBe('');
  });
});
