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
  preflightDgfyAccountRegistration: vi.fn(),
  registerDgfyAccount: vi.fn(),
  requestDgfySignupOtp: vi.fn(),
}));

vi.mock('../../../../packages/web-core/src/services/dgfyAuthService.js', async () => {
  const actual = await vi.importActual('../../../../packages/web-core/src/services/dgfyAuthService.js');
  return {
    ...actual,
    ...dgfyAuthMock
  };
});

vi.mock('@lottiefiles/react-lottie-player', () => ({
  Player: ({ children, ...props }) => <div data-testid="dgfy-auth-lottie" {...props}>{children}</div>
}));

import DgfyAuthPage from '../../../../packages/web-core/Pages/DgfyAuthPage.jsx';

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
    dgfyAuthMock.preflightDgfyAccountRegistration.mockReset();
    dgfyAuthMock.preflightDgfyAccountRegistration.mockResolvedValue({ available: true });
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

  it('formats PH mobile input while typing, preflights registration, then requests signup otp', async () => {
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
    await waitFor(() => expect(dgfyAuthMock.preflightDgfyAccountRegistration).toHaveBeenCalledWith({
      email: 'ada@example.test',
      phone: '+639171234567'
    }));
    await waitFor(() => expect(dgfyAuthMock.requestDgfySignupOtp).toHaveBeenCalledWith('ada@example.test'));
    expect(dgfyAuthMock.preflightDgfyAccountRegistration.mock.invocationCallOrder[0])
      .toBeLessThan(dgfyAuthMock.requestDgfySignupOtp.mock.invocationCallOrder[0]);
    expect(dgfyAuthMock.registerDgfyAccount).not.toHaveBeenCalled();
  });

  it('keeps duplicate emails on create-account and does not request signup otp', async () => {
    dgfyAuthMock.preflightDgfyAccountRegistration.mockRejectedValue({
      response: {
        data: {
          message: 'A DGFY account already exists with this email.',
          error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
          details: { field: 'email' }
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

    expect(await screen.findByText('A DGFY account already exists with this email. Log in instead or reset your password.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /check your email/i })).toBeNull();
    expect(dgfyAuthMock.requestDgfySignupOtp).not.toHaveBeenCalled();
  });

  it('keeps duplicate phones on create-account and does not request signup otp', async () => {
    dgfyAuthMock.preflightDgfyAccountRegistration.mockRejectedValue({
      response: {
        data: {
          message: 'A DGFY account already exists with this phone number.',
          error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
          details: { field: 'phone' }
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

    expect(await screen.findByText('A DGFY account already exists with this phone number. Use a different mobile number or contact support.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /check your email/i })).toBeNull();
    expect(dgfyAuthMock.requestDgfySignupOtp).not.toHaveBeenCalled();
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
});
