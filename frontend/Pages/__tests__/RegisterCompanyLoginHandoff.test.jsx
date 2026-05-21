/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn()
}));

const clearClientSessionMock = vi.hoisted(() => vi.fn());
const dgfyAuthMock = vi.hoisted(() => ({
  clearDgfySession: vi.fn(),
  dgfyAuthHeader: vi.fn(() => ({ Authorization: 'Bearer dgfy-token' })),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyAccount: vi.fn(() => null),
  getStoredDgfyToken: vi.fn(() => ''),
  loginDgfyAccount: vi.fn(),
  registerDgfyAccount: vi.fn()
}));

vi.mock('../../src/services/api.js', () => ({
  default: apiMock
}));

vi.mock('../../src/services/sessionCleanup.js', () => ({
  clearClientSession: clearClientSessionMock
}));

vi.mock('../../src/services/dgfyAuthService.js', () => dgfyAuthMock);

import RegisterCompany from '../RegisterCompany.jsx';
import Login from '../Login.jsx';

const dgfyAccount = {
  id: 'dgfy-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  username: 'Ada',
  email: 'ada@example.test',
  phone: '+639123456789'
};

const renderRegistrationFlow = (initialEntries = ['/register-company']) => render(
  <MemoryRouter initialEntries={initialEntries}>
    <Routes>
      <Route path="/register-company" element={<RegisterCompany />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<div>Dashboard screen</div>} />
    </Routes>
  </MemoryRouter>
);

const signInDgfy = async () => {
  dgfyAuthMock.loginDgfyAccount.mockResolvedValue({
    token: 'dgfy-token',
    account: dgfyAccount
  });

  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: dgfyAccount.email }
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'password123' }
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in with dgfy/i }));

  await screen.findByText(/Ada Lovelace/);
};

describe('RegisterCompany DGFY handoff', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    apiMock.get.mockReset();
    dgfyAuthMock.clearDgfySession.mockReset();
    dgfyAuthMock.fetchDgfyMe.mockReset();
    dgfyAuthMock.getStoredDgfyAccount.mockReset();
    dgfyAuthMock.getStoredDgfyAccount.mockReturnValue(null);
    dgfyAuthMock.getStoredDgfyToken.mockReset();
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');
    dgfyAuthMock.loginDgfyAccount.mockReset();
    dgfyAuthMock.registerDgfyAccount.mockReset();
    dgfyAuthMock.dgfyAuthHeader.mockReset();
    dgfyAuthMock.dgfyAuthHeader.mockReturnValue({ Authorization: 'Bearer dgfy-token' });
    clearClientSessionMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requires a DGFY account before showing company registration fields', () => {
    renderRegistrationFlow();

    expect(screen.getByText('Create DGFY account')).toBeTruthy();
    expect(screen.queryByLabelText('Company Name')).toBeNull();
  });

  it('registers a company from the signed-in DGFY account', async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Company registered and activated successfully. You can sign in now.',
          data: {
            id: 'tenant-1',
            name: 'Auto Foods',
            status: 'active',
            plan: 'premium',
            company_token: 'token-autofoods-12345678',
            workflow_mode: 'food_manufacturing'
          }
        }
      });

    renderRegistrationFlow();
    await signInDgfy();

    fireEvent.change(screen.getByLabelText('Company Name'), {
      target: { value: 'Auto Foods' }
    });
    fireEvent.change(screen.getByLabelText('Email Verification Code'), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/auth/email-otp/request', {
      purpose: 'company_registration',
      email: dgfyAccount.email
    }));

    fireEvent.change(screen.getByLabelText('Email Verification Code'), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenLastCalledWith('/admin/tenants/register', {
      name: 'Auto Foods',
      workflowMode: 'food_manufacturing',
      email_otp_code: '123456'
    }, {
      headers: { Authorization: 'Bearer dgfy-token' }
    }));
    expect(await screen.findByText('Company Created')).toBeTruthy();
  });

  it('renames Business Mode to Business Industry without exposing legacy manufacturing', async () => {
    renderRegistrationFlow();
    await signInDgfy();

    const options = Array.from(screen.getByLabelText('Business Industry').querySelectorAll('option'))
      .map((option) => ({
        value: option.value,
        label: option.textContent
      }));

    expect(options.some((option) => option.value === 'manufacturing')).toBe(false);
    expect(options.filter((option) => option.label === 'Food Manufacturing')).toHaveLength(1);
    expect(options.some((option) => option.value === 'food_manufacturing')).toBe(true);
  });

  it('prefills SKUpervisor login from registration router state without an API lookup', async () => {
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
