/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const dgfyAuthMock = vi.hoisted(() => ({
  clearDgfySession: vi.fn(),
  fetchDgfyLegalTerms: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyToken: vi.fn(() => ''),
  loginDgfyAccount: vi.fn(),
  registerDgfyAccount: vi.fn(),
  requestDgfySignupOtp: vi.fn(),
}));

vi.mock('../../src/services/dgfyAuthService.js', async () => {
  const actual = await vi.importActual('../../src/services/dgfyAuthService.js');
  return {
    ...actual,
    ...dgfyAuthMock
  };
});

vi.mock('@lottiefiles/react-lottie-player', () => ({
  Player: ({ children, ...props }) => <div data-testid="dgfy-auth-lottie" {...props}>{children}</div>
}));

import DgfyAuthPage from '../DgfyAuthPage.jsx';

const dgfyLegalTerms = {
  provider_clause: 'Provider clause',
  flows: {
    account_registration: {
      snapshot: {
        terms_version: 'dgfy-account-terms-2026-06-08',
        privacy_version: 'dgfy-privacy-2026-06-08',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08',
        acknowledgement_text: 'Account terms acknowledgement'
      },
      documents: [
        { key: 'accountTerms', title: 'DGFY Account Terms', version: 'dgfy-account-terms-2026-06-08', summary: 'Account terms', href: '/legal/dgfy-account-terms' }
      ]
    }
  }
};

const renderCreateAccount = () => render(
  <MemoryRouter initialEntries={['/dgfy/auth?intent=customer&mode=create-account&return_to=%2Fdone']}>
    <Routes>
      <Route path="/dgfy/auth" element={<DgfyAuthPage />} />
      <Route path="/done" element={<div>Done screen</div>} />
    </Routes>
  </MemoryRouter>
);

const renderBusinessIntentCreateAccount = () => render(
  <MemoryRouter initialEntries={['/dgfy/auth?intent=register-business&mode=create-account&return_to=%2Fregister-company%23business-registration']}>
    <Routes>
      <Route path="/dgfy/auth" element={<DgfyAuthPage />} />
      <Route path="/register-company" element={<div>Register company screen</div>} />
    </Routes>
  </MemoryRouter>
);

describe('DgfyAuthPage create-account field enhancements', () => {
  beforeEach(() => {
    dgfyAuthMock.clearDgfySession.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockResolvedValue(dgfyLegalTerms);
    dgfyAuthMock.fetchDgfyMe.mockReset();
    dgfyAuthMock.fetchDgfyMe.mockRejectedValue({ response: { status: 401 } });
    dgfyAuthMock.getStoredDgfyToken.mockReset();
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');
    dgfyAuthMock.loginDgfyAccount.mockReset();
    dgfyAuthMock.registerDgfyAccount.mockReset();
    dgfyAuthMock.requestDgfySignupOtp.mockReset();
    dgfyAuthMock.requestDgfySignupOtp.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows email suggestions for localpart@ and lets the user select one', async () => {
    renderCreateAccount();

    const emailInput = await screen.findByLabelText('Email Address');
    fireEvent.change(emailInput, { target: { value: 'johndoe@' } });

    expect(await screen.findByRole('option', { name: 'johndoe@gmail.com' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'johndoe@yahoo.com' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'johndoe@icloud.com' })).toBeTruthy();

    fireEvent.keyDown(emailInput, { key: 'ArrowDown' });
    fireEvent.keyDown(emailInput, { key: 'Enter' });

    expect(emailInput.value).toBe('johndoe@yahoo.com');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'johndoe@gmail.com' })).toBeNull());
  });

  it('allows manual non-suggested email entry', async () => {
    renderCreateAccount();

    const emailInput = await screen.findByLabelText('Email Address');
    fireEvent.change(emailInput, { target: { value: 'johndoe@company.com' } });

    expect(emailInput.value).toBe('johndoe@company.com');
    expect(screen.queryByRole('option', { name: /johndoe@gmail.com/i })).toBeNull();
  });

  it('formats PH mobile input while typing and requests signup otp first', async () => {
    renderCreateAccount();

    fireEvent.change(await screen.findByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ada@example.test' } });

    const phoneInput = screen.getByLabelText('Mobile Number');
    fireEvent.change(phoneInput, { target: { value: '0917-123-4567' } });
    expect(phoneInput.value).toBe('917 123 4567');

    expect(screen.getByText('For PH numbers, enter 10 digits starting with 9.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeTruthy();
    await waitFor(() => expect(dgfyAuthMock.requestDgfySignupOtp).toHaveBeenCalledWith('ada@example.test'));
    expect(dgfyAuthMock.registerDgfyAccount).not.toHaveBeenCalled();
  });

  it('stays on create-account when verification code sending fails', async () => {
    dgfyAuthMock.requestDgfySignupOtp.mockRejectedValueOnce({
      response: {
        data: {
          message: 'Email verification code could not be sent',
          error_code: 'EMAIL_OTP_DELIVERY_FAILED'
        }
      }
    });

    renderCreateAccount();

    fireEvent.change(await screen.findByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '0917-123-4567' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(dgfyAuthMock.requestDgfySignupOtp).toHaveBeenCalledWith('ada@example.test'));
    expect(screen.queryByRole('heading', { name: /check your email/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /create your dgfy account/i })).toBeTruthy();
  });

  it('shows the PH validation message for invalid mobile numbers', async () => {
    renderCreateAccount();

    fireEvent.change(await screen.findByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '8171234567' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Enter a valid Philippine mobile number starting with 9.')).toBeTruthy();
    expect(screen.getByLabelText('Mobile Number').getAttribute('aria-invalid')).toBe('true');
    expect(dgfyAuthMock.registerDgfyAccount).not.toHaveBeenCalled();
  });

  it('keeps signup customer-only even when the entry intent is register-business', async () => {
    dgfyAuthMock.requestDgfySignupOtp.mockResolvedValueOnce({ dev_code: '123456' });
    dgfyAuthMock.registerDgfyAccount.mockResolvedValueOnce({
      token: 'dgfy-token-created',
      account: { id: 'dgfy-1', email: 'ada@example.test' }
    });
    dgfyAuthMock.loginDgfyAccount.mockResolvedValueOnce({
      token: 'dgfy-token-login',
      account: { id: 'dgfy-1', email: 'ada@example.test' }
    });
    dgfyAuthMock.fetchDgfyMe
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({
        token: 'dgfy-token-login',
        account: { id: 'dgfy-1', email: 'ada@example.test' }
      });

    renderBusinessIntentCreateAccount();

    fireEvent.change(await screen.findByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '0917-123-4567' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    expect(await screen.findByRole('button', { name: /^login$/i })).toBeTruthy();
    expect(screen.getByText(/your dgfy customer account is ready/i)).toBeTruthy();
    expect(screen.queryByText(/register company screen/i)).toBeNull();

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => expect(dgfyAuthMock.loginDgfyAccount).toHaveBeenCalledWith({
      email: 'ada@example.test',
      password: 'password123'
    }));
    expect(screen.queryByText('Register company screen')).toBeNull();
  });
});
