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
  exchangeDgfyHandoff: vi.fn(),
  fetchDgfyLegalTerms: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyAccount: vi.fn(() => null),
  getStoredDgfyToken: vi.fn(() => ''),
  loginDgfyAccount: vi.fn(),
  logoutDgfyAccount: vi.fn(),
  requestDgfyEmailVerification: vi.fn(),
  requestDgfyPasswordReset: vi.fn(),
  startDgfyTenantSession: vi.fn(),
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
  middle_name: null,
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
    dgfyAuthMock.fetchDgfyMe.mockResolvedValue({ account: dgfyAccount });
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
    dgfyAuthMock.exchangeDgfyHandoff.mockReset();
    dgfyAuthMock.startDgfyTenantSession.mockReset();
    dgfyAuthMock.startDgfyTenantSession.mockResolvedValue({
      token: 'tenant-token',
      company: { token: 'token-autofoods-12345678' }
    });
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

  it('starts business-registration handoff links on DGFY sign in', () => {
    renderRegistrationFlow(['/register-company?source=dgfy&auth=login']);

    expect(screen.getByRole('button', { name: /sign in with dgfy/i }).type).toBe('submit');
    expect(screen.queryByLabelText('Last Name')).toBeNull();
  });

  it('lands storefront business-registration handoff on the signed-in business registration area', async () => {
    renderRegistrationFlow(['/register-company?source=dgfy&auth=login#business-registration']);

    await signInDgfy();

    expect(document.querySelector('#business-registration')).toBeTruthy();
    expect(screen.getByLabelText('Company Name')).toBeTruthy();
    expect(screen.getByRole('button', { name: /create company/i })).toBeTruthy();
  });

  it('exchanges storefront DGFY handoff tokens before business registration', async () => {
    dgfyAuthMock.exchangeDgfyHandoff.mockResolvedValue({
      token: 'dgfy-token',
      account: dgfyAccount
    });

    renderRegistrationFlow(['/register-company?source=dgfy&auth=login&handoff_token=handoff-123#business-registration']);

    await waitFor(() => expect(dgfyAuthMock.exchangeDgfyHandoff).toHaveBeenCalledWith('handoff-123'));
    expect(await screen.findByLabelText('Company Name')).toBeTruthy();
    expect(screen.getByText(/DGFY account connected/i)).toBeTruthy();
  });

  it('signs out of DGFY without touching removed company OTP state', async () => {
    dgfyAuthMock.logoutDgfyAccount.mockResolvedValue({});

    renderRegistrationFlow();
    await signInDgfy();

    fireEvent.click(screen.getByRole('button', { name: /sign out of dgfy/i }));

    await waitFor(() => expect(dgfyAuthMock.logoutDgfyAccount).toHaveBeenCalledWith('dgfy-token'));
    expect(screen.getByText('Create DGFY account')).toBeTruthy();
  });

  it('collects DGFY account fields in the approved order with terms modal and password visibility', async () => {
    dgfyAuthMock.registerDgfyAccount.mockResolvedValue({
      token: 'dgfy-token',
      account: {
        ...dgfyAccount,
        middle_name: 'Byron'
      }
    });

    renderRegistrationFlow();
    await screen.findByRole('button', { name: /view terms/i });

    const submitButton = screen.getAllByRole('button', { name: /create dgfy account/i })
      .find((button) => button.type === 'submit');
    const labels = Array.from(submitButton.closest('form').querySelectorAll('label'))
      .map((label) => label.textContent.trim());
    expect(labels.slice(0, 7)).toEqual([
      'Last Name',
      'First Name',
      'Optional Middle Name',
      'Email',
      'Contact Number',
      'Password',
      'Confirm Password'
    ]);

    fireEvent.click(screen.getByRole('button', { name: /view terms/i }));
    expect(screen.getByRole('dialog', { name: /current dgfy terms/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Optional Middle Name'), { target: { value: 'Byron' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Contact Number'), { target: { value: '+639123456789' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^show password$/i })[0]);
    expect(screen.getByLabelText('Password').type).toBe('text');
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(submitButton);

    await waitFor(() => expect(dgfyAuthMock.registerDgfyAccount).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'Ada',
      middle_name: 'Byron',
      last_name: 'Lovelace',
      email: 'ada@example.test',
      phone: '+639123456789',
      accepted_terms: true,
      terms_version: 'dgfy-account-terms-2026-05-26',
      privacy_version: 'dgfy-privacy-2026-05-26',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26'
    })));
  });

  it('disables registration when current DGFY legal terms cannot load', async () => {
    dgfyAuthMock.fetchDgfyLegalTerms.mockRejectedValue(new Error('terms unavailable'));

    renderRegistrationFlow();

    expect(await screen.findByText(/DGFY terms are temporarily unavailable/i)).toBeTruthy();
    const submitButton = screen.getAllByRole('button', { name: /create dgfy account/i })
      .find((button) => button.type === 'submit');
    expect(submitButton.disabled).toBe(true);
  });

  it('fail-closes account and company registration when legal versions are incomplete', async () => {
    dgfyAuthMock.fetchDgfyLegalTerms.mockResolvedValue({
      flows: {
        account_registration: { snapshot: {}, documents: [] },
        company_registration: { snapshot: {}, documents: [] }
      }
    });

    renderRegistrationFlow();

    expect(await screen.findByText(/account terms are incomplete/i)).toBeTruthy();
    const accountSubmit = screen.getAllByRole('button', { name: /create dgfy account/i })
      .find((button) => button.type === 'submit');
    expect(accountSubmit.disabled).toBe(true);

    await signInDgfy();

    expect(await screen.findByText(/company terms are incomplete/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /create company/i }).disabled).toBe(true);
  });

  it('registers a company from the signed-in DGFY account', async () => {
    apiMock.post.mockResolvedValueOnce({
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
    await screen.findByRole('button', { name: /view terms/i });
    await signInDgfy();

    fireEvent.change(screen.getByLabelText('Company Name'), {
      target: { value: 'Auto Foods' }
    });
    expect(screen.getByText(/Email ownership verified/i)).toBeTruthy();
    expect(screen.queryByLabelText('Email Verification Code')).toBeNull();
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenLastCalledWith('/admin/tenants/register', {
      name: 'Auto Foods',
      workflowMode: 'food_manufacturing',
      accepted_company_terms: true,
      company_terms_version: 'dgfy-company-terms-2026-05-26',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26'
    }, {
      headers: { Authorization: 'Bearer dgfy-token' }
    }));
    await waitFor(() => expect(dgfyAuthMock.startDgfyTenantSession).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      companyToken: 'token-autofoods-12345678'
    }, 'dgfy-token'));
    expect(await screen.findByText('Dashboard screen')).toBeTruthy();
  });

  it('requires marketplace acknowledgement before company registration can be submitted', async () => {
    renderRegistrationFlow();
    await screen.findByRole('button', { name: /view terms/i });
    await signInDgfy();

    fireEvent.click(screen.getByRole('button', { name: /view terms/i }));
    expect(screen.getByText(/DGFY is an e-marketplace\/platform service provider/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.getByRole('button', { name: /create company/i }).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));

    expect(screen.getByRole('button', { name: /create company/i }).disabled).toBe(false);
  });

  it('renames Business Mode to Business Industry without exposing legacy manufacturing', async () => {
    renderRegistrationFlow();
    await screen.findByRole('button', { name: /view terms/i });
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

  it('keeps the signed-in business registration page focused on company fields', async () => {
    renderRegistrationFlow();
    await screen.findByRole('button', { name: /view terms/i });
    await signInDgfy();

    expect(screen.getByLabelText('Company Name')).toBeTruthy();
    expect(screen.getByLabelText('Business Industry')).toBeTruthy();
    expect(screen.queryByText('DGFY Profile')).toBeNull();
    expect(screen.queryByText('Password')).toBeNull();
    expect(apiMock.post).not.toHaveBeenCalledWith('/admin/tenants/register', expect.anything(), expect.anything());
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
