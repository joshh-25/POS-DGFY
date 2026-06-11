/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn()
}));

const dgfyAuthMock = vi.hoisted(() => ({
  clearDgfySession: vi.fn(),
  completeDgfyPasswordReset: vi.fn(),
  createDgfyHandoff: vi.fn(),
  dgfyAuthHeader: vi.fn(() => ({ Authorization: 'Bearer dgfy-token' })),
  exchangeDgfyHandoff: vi.fn(),
  fetchDgfyLegalTerms: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyAccount: vi.fn(() => null),
  getStoredDgfyToken: vi.fn(() => ''),
  loginDgfyAccount: vi.fn(),
  logoutDgfyAccount: vi.fn(),
  registerDgfyAccount: vi.fn(),
  requestDgfyEmailVerification: vi.fn(),
  requestDgfyRegistrationEmailVerification: vi.fn(),
  requestDgfyPasswordReset: vi.fn(),
  verifyDgfyEmail: vi.fn(),
  startDgfyTenantSession: vi.fn()
}));

vi.mock('../../src/services/api.js', () => ({
  default: apiMock
}));

vi.mock('../../src/services/dgfyAuthService.js', () => dgfyAuthMock);
vi.mock('@lottiefiles/react-lottie-player', () => ({
  Player: ({ children, ...props }) => <div data-testid="dgfy-auth-lottie" {...props}>{children}</div>
}));

import DgfyAuthPage from '../DgfyAuthPage.jsx';
import DgfyResetPasswordPage from '../DgfyResetPasswordPage.jsx';
import LegalDocument from '../LegalDocument.jsx';
import RegisterCompany from '../RegisterCompany.jsx';
import { appendDgfyHandoffToken } from '../../src/features/dgfyRouteHelpers.js';

const dgfyAccount = {
  id: 'dgfy-1',
  first_name: 'Ada',
  middle_name: 'Byron',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  phone: '+639123456789'
};

const marketplaceProviderClause = 'DGFY is an e-marketplace/platform service provider. The seller owns the product, sets the price, fulfills the order, and remains the seller of record. Online payments are processed by licensed payment partners such as PayMongo; DGFY does not operate a stored-value wallet or hold seller settlement funds. When PayMongo QR Ph checkout is used, the disclosed DGFY platform fee is 1% of the item subtotal and is charged to the customer as an added platform fee. PayMongo/provider processing, payout, bank, dispute, and related provider fees are shouldered by the registered company and reduce the company net settlement unless a separate signed provider contract says otherwise.';
const accountAcknowledgementText = `I agree to the DGFY Terms, Privacy Policy, and marketplace account terms. ${marketplaceProviderClause}`;
const companyAcknowledgementText = `I confirm that the registered company is the seller of record for products, services, prices, fulfillment, customer support, tax obligations, and payout account ownership. ${marketplaceProviderClause}`;

const dgfyLegalTerms = {
  provider_clause: marketplaceProviderClause,
  flows: {
    account_registration: {
      snapshot: {
        terms_version: 'dgfy-account-terms-2026-06-08',
        privacy_version: 'dgfy-privacy-2026-06-08',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08',
        acknowledgement_text: accountAcknowledgementText
      },
      documents: [
        { key: 'accountTerms', title: 'DGFY Account Terms', version: 'dgfy-account-terms-2026-06-08', summary: 'Account terms', href: '/legal/dgfy-account-terms' },
        { key: 'privacy', title: 'DGFY Privacy Policy', version: 'dgfy-privacy-2026-06-08', summary: 'Privacy terms', href: '/privacy' },
        { key: 'marketplaceTerms', title: 'DGFY Marketplace Provider Terms', version: 'dgfy-marketplace-provider-2026-06-08', summary: 'Marketplace terms', href: '/legal/dgfy-marketplace-provider-terms' }
      ]
    },
    company_registration: {
      snapshot: {
        company_terms_version: 'dgfy-company-terms-2026-06-08',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08',
        acknowledgement_text: companyAcknowledgementText
      },
      documents: [
        { key: 'companyTerms', title: 'DGFY Company Registration Terms', version: 'dgfy-company-terms-2026-06-08', summary: 'Company terms', href: '/legal/dgfy-company-terms' },
        { key: 'marketplaceTerms', title: 'DGFY Marketplace Provider Terms', version: 'dgfy-marketplace-provider-2026-06-08', summary: 'Marketplace terms', href: '/legal/dgfy-marketplace-provider-terms' }
      ]
    }
  }
};

const renderRoutes = (initialEntries = ['/dgfy/auth']) => render(
  <MemoryRouter initialEntries={initialEntries}>
    <Routes>
      <Route path="/dgfy/auth" element={<DgfyAuthPage />} />
      <Route path="/dgfy/reset-password" element={<DgfyResetPasswordPage />} />
      <Route path="/legal/:slug" element={<LegalDocument />} />
      <Route path="/privacy" element={<LegalDocument />} />
      <Route path="/register-company" element={<RegisterCompany />} />
      <Route path="/done" element={<div>Done screen</div>} />
      <Route path="/login" element={<div>Login screen</div>} />
      <Route path="/" element={<div>Dashboard screen</div>} />
    </Routes>
  </MemoryRouter>
);

describe('DGFY auth and business registration routes', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    apiMock.get.mockReset();
    dgfyAuthMock.clearDgfySession.mockReset();
    dgfyAuthMock.completeDgfyPasswordReset.mockReset();
    dgfyAuthMock.createDgfyHandoff.mockReset();
    dgfyAuthMock.createDgfyHandoff.mockResolvedValue({ handoff_token: 'handoff-token-1' });
    dgfyAuthMock.dgfyAuthHeader.mockReset();
    dgfyAuthMock.dgfyAuthHeader.mockReturnValue({ Authorization: 'Bearer dgfy-token' });
    dgfyAuthMock.exchangeDgfyHandoff.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockResolvedValue(dgfyLegalTerms);
    dgfyAuthMock.fetchDgfyMe.mockReset();
    dgfyAuthMock.fetchDgfyMe.mockRejectedValue({ response: { status: 401 } });
    dgfyAuthMock.getStoredDgfyAccount.mockReset();
    dgfyAuthMock.getStoredDgfyAccount.mockReturnValue(null);
    dgfyAuthMock.getStoredDgfyToken.mockReset();
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');
    dgfyAuthMock.loginDgfyAccount.mockReset();
    dgfyAuthMock.logoutDgfyAccount.mockReset();
    dgfyAuthMock.registerDgfyAccount.mockReset();
    dgfyAuthMock.requestDgfyEmailVerification.mockReset();
    dgfyAuthMock.requestDgfyRegistrationEmailVerification.mockReset();
    dgfyAuthMock.verifyDgfyEmail.mockReset();
    dgfyAuthMock.requestDgfyPasswordReset.mockReset();
    dgfyAuthMock.startDgfyTenantSession.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('appends a one-time handoff token to absolute storefront auth return targets', () => {
    const target = appendDgfyHandoffToken(
      'https://dgfy.ph/map-dgfy/account?dgfy_account=1',
      'handoff-token-1'
    );

    expect(target).toBe('https://dgfy.ph/map-dgfy/account?dgfy_account=1&handoff_token=handoff-token-1');
  });

  it('renders the canonical DGFY sign-in route and returns to the supplied intent target', async () => {
    dgfyAuthMock.loginDgfyAccount.mockResolvedValue({ token: 'dgfy-token', account: dgfyAccount });
    dgfyAuthMock.fetchDgfyMe
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ token: 'dgfy-token', account: dgfyAccount });

    renderRoutes(['/dgfy/auth?intent=customer&return_to=%2Fdone']);

    expect(await screen.findByRole('button', { name: /^login$/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: dgfyAccount.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByText('Done screen')).toBeTruthy();
    expect(dgfyAuthMock.loginDgfyAccount).toHaveBeenCalledWith({
      email: dgfyAccount.email,
      password: 'password123'
    });
  });

  it('renders the canonical DGFY create-account route with the required field order and legal acknowledgement', async () => {
    dgfyAuthMock.registerDgfyAccount.mockResolvedValue({ token: 'dgfy-token', account: dgfyAccount });
    dgfyAuthMock.requestDgfyRegistrationEmailVerification.mockResolvedValue({});
    dgfyAuthMock.fetchDgfyMe
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ token: 'dgfy-token', account: dgfyAccount });

    renderRoutes(['/dgfy/auth?intent=customer&mode=create-account&return_to=%2Fdone']);

    const submitButton = await screen.findByRole('button', { name: /continue to email verification/i });
    const labels = Array.from(submitButton.closest('form').querySelectorAll('label'))
      .map((label) => label.textContent.trim());
    expect(labels.slice(0, 7)).toEqual([
      'Last Name',
      'First Name',
      'Middle Name (Optional)',
      'Email Address',
      'Mobile Number',
      'Password',
      'Confirm Password'
    ]);

    expect(screen.getByRole('link', { name: /terms/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/Middle Name/), { target: { value: 'Byron' } });
    fireEvent.change(screen.getAllByLabelText('Email Address')[0], { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '+639123456789' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(submitButton);

    await waitFor(() => expect(dgfyAuthMock.requestDgfyRegistrationEmailVerification).toHaveBeenCalledWith('ada@example.test'));
    expect(dgfyAuthMock.registerDgfyAccount).not.toHaveBeenCalled();
    expect(await screen.findByText(/check your email/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /create verified account/i }));

    await waitFor(() => expect(dgfyAuthMock.registerDgfyAccount).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'Ada',
      middle_name: 'Byron',
      last_name: 'Lovelace',
      email: 'ada@example.test',
      phone: '+639123456789',
      email_otp_code: '123456',
      accepted_terms: true,
      terms_version: 'dgfy-account-terms-2026-06-08',
      privacy_version: 'dgfy-privacy-2026-06-08',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08'
    })));
    expect(await screen.findByText('Done screen')).toBeTruthy();
  });

  it('returns from legal terms to create-account with the filled registration form preserved', async () => {
    renderRoutes(['/dgfy/auth?intent=customer&mode=create-account&return_to=%2Fdone']);

    expect(await screen.findByRole('button', { name: /continue to email verification/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/Middle Name/), { target: { value: 'Byron' } });
    fireEvent.change(screen.getAllByLabelText('Email Address')[0], { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '+639123456789' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('link', { name: /see terms & conditions/i }));
    expect(await screen.findByRole('heading', { name: 'DGFY Account Terms' })).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /back to registration/i }));
    expect(await screen.findByRole('button', { name: /continue to email verification/i })).toBeTruthy();
    expect(screen.getByLabelText('Last Name').value).toBe('Lovelace');
    expect(screen.getByLabelText('First Name').value).toBe('Ada');
    expect(screen.getByLabelText(/Middle Name/).value).toBe('Byron');
    expect(screen.getAllByLabelText('Email Address')[0].value).toBe('ada@example.test');
    expect(screen.getByLabelText('Mobile Number').value).toBe('+639123456789');
    expect(screen.getByLabelText('Password').value).toBe('password123');
    expect(screen.getByLabelText('Confirm Password').value).toBe('password123');
  });

  it('does not create the account when the first verification code request fails', async () => {
    dgfyAuthMock.requestDgfyRegistrationEmailVerification.mockRejectedValueOnce({
      response: {
        data: {
          error_code: 'EMAIL_OTP_DELIVERY_FAILED',
          message: 'Email verification code could not be sent'
        }
      }
    });

    renderRoutes(['/dgfy/auth?intent=customer&mode=create-account&return_to=%2Fdone']);
    expect(await screen.findByRole('button', { name: /continue to email verification/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/Middle Name/), { target: { value: 'Byron' } });
    fireEvent.change(screen.getAllByLabelText('Email Address')[0], { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '+639123456789' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /continue to email verification/i }));

    await waitFor(() => expect(dgfyAuthMock.requestDgfyRegistrationEmailVerification).toHaveBeenCalledWith('ada@example.test'));
    expect(dgfyAuthMock.registerDgfyAccount).not.toHaveBeenCalled();
    expect(screen.queryByText(/check your email/i)).toBeNull();
  });

  it('explains when the verification code has expired and requires resend', async () => {
    dgfyAuthMock.requestDgfyRegistrationEmailVerification.mockResolvedValue({});
    dgfyAuthMock.registerDgfyAccount.mockRejectedValue({
      response: {
        data: {
          error_code: 'EMAIL_OTP_EXPIRED',
          message: 'Email verification code is missing or expired'
        }
      }
    });

    renderRoutes(['/dgfy/auth?intent=customer&mode=create-account&return_to=%2Fdone']);
    expect(await screen.findByRole('button', { name: /continue to email verification/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/Middle Name/), { target: { value: 'Byron' } });
    fireEvent.change(screen.getAllByLabelText('Email Address')[0], { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '+639123456789' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Account Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /continue to email verification/i }));

    fireEvent.change(await screen.findByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /create verified account/i }));

    expect(await screen.findByText(/^verification code expired$/i)).toBeTruthy();
    expect(screen.getByText(/request a new code, then enter the latest 6-digit code/i)).toBeTruthy();
  });

  it('uses the dedicated password reset route and returns to canonical sign-in after success', async () => {
    dgfyAuthMock.requestDgfyPasswordReset.mockResolvedValue({});
    dgfyAuthMock.completeDgfyPasswordReset.mockResolvedValue({});

    renderRoutes(['/dgfy/reset-password?intent=register-business&return_to=%2Fregister-company%23business-registration&email=ada%40example.test']);

    expect(await screen.findByRole('button', { name: /send reset link/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(dgfyAuthMock.requestDgfyPasswordReset).toHaveBeenCalledWith('ada@example.test'));
    expect(await screen.findByLabelText('Reset Code')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Reset Code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(dgfyAuthMock.completeDgfyPasswordReset).toHaveBeenCalledWith({
      email: 'ada@example.test',
      code: '123456',
      password: 'password123',
      confirm_password: 'password123'
    }));
    expect(await screen.findByText(/password reset complete/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeTruthy();
  });

  it('redirects unauthenticated company registration to canonical DGFY auth', async () => {
    renderRoutes(['/register-company']);

    expect(await screen.findByRole('button', { name: /register company using my dgfy account/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /create dgfy account/i })).toBeTruthy();
  });

  it('shows business-only registration fields after a valid DGFY session and creates the company', async () => {
    dgfyAuthMock.fetchDgfyMe.mockResolvedValueOnce({
      token: 'dgfy-token',
      account: dgfyAccount
    });
    dgfyAuthMock.startDgfyTenantSession.mockResolvedValue({
      token: 'ims-token',
      company: { token: 'token-autofoods-12345678' }
    });
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Company registered and activated successfully. You can sign in now.',
        data: {
          id: 'tenant-1',
          name: 'Auto Foods',
          status: 'active',
          company_token: 'token-autofoods-12345678',
          workflow_mode: 'food_manufacturing'
        }
      }
    });

    renderRoutes(['/register-company#business-registration']);

    expect(await screen.findByText(/DGFY account connected/i)).toBeTruthy();
    expect(screen.queryByLabelText('Last Name')).toBeNull();
    expect(screen.getByLabelText('Company Name')).toBeTruthy();
    expect(screen.getByLabelText('Business Industry')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Auto Foods' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/tenants/register', {
      name: 'Auto Foods',
      workflowMode: 'food_manufacturing',
      accepted_company_terms: true,
      company_terms_version: 'dgfy-company-terms-2026-06-08',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08'
    }, {
      headers: { Authorization: 'Bearer dgfy-token' }
    }));
    await waitFor(() => expect(dgfyAuthMock.startDgfyTenantSession).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      companyToken: 'token-autofoods-12345678'
    }, 'dgfy-token'));
    expect(await screen.findByText('Dashboard screen')).toBeTruthy();
  });

  it('falls back to SKUpervisor login when the automatic IMS session cannot start', async () => {
    dgfyAuthMock.fetchDgfyMe.mockResolvedValueOnce({
      token: 'dgfy-token',
      account: dgfyAccount
    });
    dgfyAuthMock.startDgfyTenantSession.mockRejectedValue({
      response: { data: { message: 'Unable to start a SKUpervisor session for this DGFY account.' } }
    });
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Company registered and activated successfully. You can sign in now.',
        data: {
          id: 'tenant-1',
          name: 'Auto Foods',
          status: 'active',
          company_token: 'token-autofoods-12345678',
          workflow_mode: 'food_manufacturing'
        }
      }
    });

    renderRoutes(['/register-company#business-registration']);

    expect(await screen.findByText(/DGFY account connected/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Auto Foods' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() => expect(dgfyAuthMock.startDgfyTenantSession).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      companyToken: 'token-autofoods-12345678'
    }, 'dgfy-token'));
    expect(await screen.findByText('Login screen')).toBeTruthy();
  });
});
