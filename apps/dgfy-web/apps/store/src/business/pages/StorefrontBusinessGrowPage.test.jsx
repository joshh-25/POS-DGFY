/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mocked at the same specifier StorefrontBusinessGrowPage.jsx itself imports
// from (frontend/src, a cross-app import — see the component's own comment)
// so both the page and IndustrySelect/registrationIndustryService, which
// resolve to the same frontend/src/services/api.js file, share one mock.
const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn()
}));

const dgfyAuthMock = vi.hoisted(() => ({
  clearDgfySession: vi.fn(),
  dgfyAuthHeader: vi.fn(() => ({ Authorization: 'Bearer dgfy-token' })),
  exchangeDgfyHandoff: vi.fn(),
  fetchDgfyLegalTerms: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyAccount: vi.fn(() => null),
  getStoredDgfyToken: vi.fn(() => ''),
  logoutDgfyAccount: vi.fn()
}));

vi.mock('../../../../../src/services/api.js', () => ({ default: apiMock }));
vi.mock('../../../../../src/services/dgfyAuthService.js', () => dgfyAuthMock);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import StorefrontBusinessGrowPage from './StorefrontBusinessGrowPage.jsx';
import { resetRegistrationIndustriesCache } from '../../../../../src/features/registration/registrationIndustryService.js';

const dgfyAccount = {
  id: 'dgfy-1',
  first_name: 'Ada',
  middle_name: '',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  phone: '+639123456789'
};

const dgfyLegalTerms = {
  flows: {
    company_registration: {
      snapshot: {
        company_terms_version: 'dgfy-company-terms-2026-06-08',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08',
        acknowledgement_text: 'I agree to the DGFY company terms.'
      },
      documents: []
    }
  }
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/business/grow']}>
    <StorefrontBusinessGrowPage />
  </MemoryRouter>
);

describe('StorefrontBusinessGrowPage — registration Industry picker', () => {
  let locationUrl;
  let mockLocation;

  beforeEach(() => {
    locationUrl = new URL('http://localhost/business/grow');
    mockLocation = {
      assign: vi.fn((value) => { locationUrl = new URL(String(value || ''), locationUrl.toString()); }),
      replace: vi.fn(),
      reload: vi.fn(),
      toString: () => locationUrl.toString(),
      get href() { return locationUrl.toString(); },
      get origin() { return locationUrl.origin; },
      get protocol() { return locationUrl.protocol; },
      get hostname() { return locationUrl.hostname; },
      get pathname() { return locationUrl.pathname; }
    };
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: mockLocation });

    apiMock.post.mockReset();
    apiMock.get.mockReset();
    apiMock.get.mockResolvedValue({ data: { data: { industries: [] } } });
    resetRegistrationIndustriesCache();

    dgfyAuthMock.clearDgfySession.mockReset();
    dgfyAuthMock.dgfyAuthHeader.mockReset();
    dgfyAuthMock.dgfyAuthHeader.mockReturnValue({ Authorization: 'Bearer dgfy-token' });
    dgfyAuthMock.exchangeDgfyHandoff.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockReset();
    dgfyAuthMock.fetchDgfyLegalTerms.mockResolvedValue(dgfyLegalTerms);
    dgfyAuthMock.fetchDgfyMe.mockReset();
    dgfyAuthMock.fetchDgfyMe.mockResolvedValue({ token: 'dgfy-token', account: dgfyAccount });
    dgfyAuthMock.getStoredDgfyAccount.mockReset();
    dgfyAuthMock.getStoredDgfyAccount.mockReturnValue(dgfyAccount);
    dgfyAuthMock.getStoredDgfyToken.mockReset();
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('dgfy-token');
    dgfyAuthMock.logoutDgfyAccount.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('blocks submission until an Industry is chosen', async () => {
    renderPage();

    expect(await screen.findByText('What kind of business is this?')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Auto Foods' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /^create company$/i }));

    expect(await screen.findByText(/choose what kind of business this is before registering/i)).toBeTruthy();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('submits industryKey (and no raw workflowMode) once an Industry is picked', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Company registration submitted for approval.',
        data: { application_id: 'application-carinderia' }
      }
    });

    renderPage();

    expect(await screen.findByText('What kind of business is this?')).toBeTruthy();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'micro_fnb' } });
    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Kusina ni Nena' } });
    fireEvent.change(screen.getByLabelText('Industry (optional)'), { target: { value: 'carinderia' } });
    fireEvent.click(screen.getByLabelText(/I have reviewed and agree to the current DGFY Company Registration Terms/i));
    fireEvent.click(screen.getByRole('button', { name: /^create company$/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/tenants/register', {
      name: 'Kusina ni Nena',
      industryKey: 'micro_fnb',
      industryTag: 'carinderia',
      accepted_company_terms: true,
      company_terms_version: 'dgfy-company-terms-2026-06-08',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08'
    }, expect.objectContaining({
      headers: { Authorization: 'Bearer dgfy-token' },
      skipTenantAuthHeaders: true,
      withCredentials: true
    })));

    const call = apiMock.post.mock.calls[0][0];
    expect(call).not.toHaveProperty('workflowMode');
    await waitFor(() => expect(mockLocation.assign).toHaveBeenCalled());
  });
});
