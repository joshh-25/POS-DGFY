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
  changeDgfyPassword: vi.fn(),
  clearDgfySession: vi.fn(),
  completeDgfyPasswordReset: vi.fn(),
  dgfyAuthHeader: vi.fn(() => ({ Authorization: 'Bearer dgfy-token' })),
  fetchDgfyLegalTerms: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyAccount: vi.fn(() => null),
  getStoredDgfyToken: vi.fn(() => ''),
  loginDgfyAccount: vi.fn(),
  logoutDgfyAccount: vi.fn(),
  requestDgfyEmailVerification: vi.fn(),
  requestDgfyPasswordReset: vi.fn(),
  verifyDgfyEmail: vi.fn(),
  registerDgfyAccount: vi.fn(),
  updateDgfyProfile: vi.fn()
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
  phone: '+639123456789',
  email_verified_at: '2026-05-21T00:00:00.000Z',
  is_email_verified: true
};

const dgfyLegalTerms = {
  provider_clause: 'DGFY is an e-marketplace/platform service provider. The seller owns the product, sets the price, fulfills the order, and remains the seller of record. DGFY facilitates the sale, collects payment through a licensed payment partner, deducts disclosed fees, and remits the seller’s net settlement.',
  flows: {
    account_registration: {
      snapshot: {
        terms_version: 'dgfy-account-terms-2026-05-26',
        privacy_version: 'dgfy-privacy-2026-05-26',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26',
        acknowledgement_text: 'I agree to the DGFY Terms, Privacy Policy, and marketplace account terms. DGFY is an e-marketplace/platform service provider. The seller owns the product, sets the price, fulfills the order, and remains the seller of record. DGFY facilitates the sale, collects payment through a licensed payment partner, deducts disclosed fees, and remits the seller’s net settlement.'
      },
      documents: [
        { key: 'accountTerms', title: 'DGFY Account Terms', version: 'dgfy-account-terms-2026-05-26', summary: 'Account terms', href: '/legal/dgfy-account-terms' },
        { key: 'privacy', title: 'DGFY Privacy Policy', version: 'dgfy-privacy-2026-05-26', summary: 'Privacy terms', href: '/privacy' },
        { key: 'marketplaceTerms', title: 'DGFY Marketplace Provider Terms', version: 'dgfy-marketplace-provider-2026-05-26', summary: 'Marketplace terms', href: '/legal/dgfy-marketplace-provider-terms' }
      ]
    },
    company_registration: {
      snapshot: {
        company_terms_version: 'dgfy-company-terms-2026-05-26',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26',
        acknowledgement_text: 'I confirm that the registered company is the seller of record for products, services, prices, fulfillment, customer support, tax obligations, and payout account ownership. DGFY is an e-marketplace/platform service provider. The seller owns the product, sets the price, fulfills the order, and remains the seller of record. DGFY facilitates the sale, collects payment through a licensed payment partner, deducts disclosed fees, and remits the seller’s net settlement.'
      },
      documents: [
        { key: 'companyTerms', title: 'DGFY Company Registration Terms', version: 'dgfy-company-terms-2026-05-26', summary: 'Company terms', href: '/legal/dgfy-company-terms' },
        { key: 'marketplaceTerms', title: 'DGFY Marketplace Provider Terms', version: 'dgfy-marketplace-provider-2026-05-26', summary: 'Marketplace terms', href: '/legal/dgfy-marketplace-provider-terms' }
      ]
    }
  }
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
    dgfyAuthMock.changeDgfyPassword.mockReset();
    dgfyAuthMock.clearDgfySession.mockReset();
    dgfyAuthMock.completeDgfyPasswordReset.mockReset();
    dgfyAuthMock.fetchDgfyMe.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockResolvedValue(dgfyLegalTerms);
    dgfyAuthMock.getStoredDgfyAccount.mockReset();
    dgfyAuthMock.getStoredDgfyAccount.mockReturnValue(null);
    dgfyAuthMock.getStoredDgfyToken.mockReset();
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');
    dgfyAuthMock.loginDgfyAccount.mockReset();
    dgfyAuthMock.logoutDgfyAccount.mockReset();
    dgfyAuthMock.requestDgfyEmailVerification.mockReset();
    dgfyAuthMock.requestDgfyPasswordReset.mockReset();
    dgfyAuthMock.verifyDgfyEmail.mockReset();
    dgfyAuthMock.registerDgfyAccount.mockReset();
    dgfyAuthMock.updateDgfyProfile.mockReset();
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

  it('disables registration when current DGFY legal terms cannot load', async () => {
    dgfyAuthMock.fetchDgfyLegalTerms.mockRejectedValue(new Error('terms unavailable'));

    renderRegistrationFlow();

    expect(await screen.findByText(/DGFY terms are temporarily unavailable/i)).toBeTruthy();
    const submitButton = screen.getAllByRole('button', { name: /create dgfy account/i })
      .find((button) => button.type === 'submit');
    expect(submitButton.disabled).toBe(true);
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
    await screen.findByText('DGFY Account Terms');
    await signInDgfy();

    fireEvent.change(screen.getByLabelText('Company Name'), {
      target: { value: 'Auto Foods' }
    });
    fireEvent.change(screen.getByLabelText('Email Verification Code'), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getAllByRole('button', { name: /send code/i }).at(-1));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/auth/email-otp/request', {
      purpose: 'company_registration',
      email: dgfyAccount.email
    }));

    fireEvent.change(screen.getByLabelText('Email Verification Code'), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenLastCalledWith('/admin/tenants/register', {
      name: 'Auto Foods',
      workflowMode: 'food_manufacturing',
      email_otp_code: '123456',
      accepted_company_terms: true,
      company_terms_version: 'dgfy-company-terms-2026-05-26',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26'
    }, {
      headers: { Authorization: 'Bearer dgfy-token' }
    }));
    expect(await screen.findByText('Company Created')).toBeTruthy();
  });

  it('requires marketplace acknowledgement before company registration can be submitted', async () => {
    renderRegistrationFlow();
    await screen.findByText('DGFY Account Terms');
    await signInDgfy();

    expect(screen.getByText(/DGFY is an e-marketplace\/platform service provider/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /create company/i }).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));

    expect(screen.getByRole('button', { name: /create company/i }).disabled).toBe(false);
  });

  it('renames Business Mode to Business Industry without exposing legacy manufacturing', async () => {
    renderRegistrationFlow();
    await screen.findByText('DGFY Account Terms');
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

  it('updates DGFY profile settings without submitting company registration', async () => {
    dgfyAuthMock.updateDgfyProfile.mockResolvedValue({
      account: {
        ...dgfyAccount,
        first_name: 'Grace',
        last_name: 'Hopper',
        username: 'Grace',
        phone: '+639987654321'
      }
    });

    renderRegistrationFlow();
    await screen.findByText('DGFY Account Terms');
    await signInDgfy();

    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Grace' }
    });
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Hopper' }
    });
    fireEvent.change(screen.getByLabelText('Phone Number'), {
      target: { value: '+639987654321' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(dgfyAuthMock.updateDgfyProfile).toHaveBeenCalledWith({
      first_name: 'Grace',
      last_name: 'Hopper',
      phone: '+639987654321'
    }, 'dgfy-token'));
    expect(apiMock.post).not.toHaveBeenCalledWith('/admin/tenants/register', expect.anything(), expect.anything());
    expect(await screen.findByText('DGFY profile updated.')).toBeTruthy();
  });

  it('requests and completes a DGFY password reset from the registration screen', async () => {
    dgfyAuthMock.requestDgfyPasswordReset.mockResolvedValue({});
    dgfyAuthMock.completeDgfyPasswordReset.mockResolvedValue({});

    renderRegistrationFlow();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: dgfyAccount.email }
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

    await waitFor(() => expect(dgfyAuthMock.requestDgfyPasswordReset).toHaveBeenCalledWith(dgfyAccount.email));

    fireEvent.change(screen.getByLabelText('Reset Code'), {
      target: { value: '123456' }
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'new-password123' }
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'new-password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(dgfyAuthMock.completeDgfyPasswordReset).toHaveBeenCalledWith({
      email: dgfyAccount.email,
      code: '123456',
      password: 'new-password123',
      confirm_password: 'new-password123'
    }));
    expect(await screen.findByText('Password reset complete. Sign in with your new password.')).toBeTruthy();
  });

  it('blocks company registration until the DGFY account email is verified', async () => {
    dgfyAuthMock.loginDgfyAccount.mockResolvedValue({
      token: 'dgfy-token',
      account: {
        ...dgfyAccount,
        email_verified_at: null,
        is_email_verified: false
      }
    });

    renderRegistrationFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: dgfyAccount.email }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in with dgfy/i }));

    expect(await screen.findByText('Verify your DGFY email')).toBeTruthy();
    expect(screen.getByRole('button', { name: /create company/i }).disabled).toBe(true);
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
