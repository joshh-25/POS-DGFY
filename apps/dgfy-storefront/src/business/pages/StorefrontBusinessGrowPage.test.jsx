/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}));

const dgfyAuthMock = vi.hoisted(() => ({
  clearDgfySession: vi.fn(),
  exchangeDgfyHandoff: vi.fn(),
  fetchDgfyLegalTerms: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyAccount: vi.fn(() => null),
  getStoredDgfyToken: vi.fn(() => ''),
  logoutDgfyAccount: vi.fn()
}));

vi.mock('../../../../../packages/web-core/src/services/api.js', () => ({ default: apiMock }));
vi.mock('../../../../../packages/web-core/src/services/dgfyAuthService.js', () => dgfyAuthMock);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import StorefrontBusinessGrowPage from './StorefrontBusinessGrowPage.jsx';
import { resetRegistrationIndustriesCache } from '../../../../../packages/web-core/src/features/registration/registrationIndustryService.js';

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

const makeDraft = (overrides = {}) => ({
  id: 'draft-1',
  status: 'draft',
  current_step: 1,
  version: 1,
  payload: {
    business: {},
    storefront: { social_links: {}, delivery_partners: [], gallery: [] },
    location: {},
    hours: {},
    menu: { upload_ids: [] }
  },
  uploads: [],
  ...overrides
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="router-location">{location.pathname}{location.search}</output>;
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/business/grow']}>
    <StorefrontBusinessGrowPage />
    <LocationProbe />
  </MemoryRouter>
);

describe('StorefrontBusinessGrowPage — three-step company registration', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          industries: [{ key: 'micro_fnb', label: 'Micro Food & Beverage', summary: 'Food and beverage businesses' }]
        }
      }
    });
    apiMock.post.mockImplementation(async (url) => {
      if (url === '/registration/drafts') return { data: { success: true, data: makeDraft() } };
      if (url.endsWith('/submit')) return { data: { success: true, data: { registration_id: 'draft-1', status: 'pending_review' } } };
      throw new Error(`Unexpected POST ${url}`);
    });
    apiMock.patch.mockImplementation(async (url, body) => ({
      data: {
        success: true,
        data: makeDraft({
          current_step: body.current_step,
          version: Number(body.version) + 1,
          payload: body.payload
        })
      }
    }));
    apiMock.delete.mockResolvedValue({ data: { success: true, data: { status: 'removed' } } });

    resetRegistrationIndustriesCache();
    dgfyAuthMock.clearDgfySession.mockReset();
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

  it('creates a private draft and blocks step-one autosave until required business details are valid', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Business details' })).toBeTruthy();
    expect(apiMock.post).toHaveBeenCalledWith('/registration/drafts', {}, expect.objectContaining({
      skipTenantAuthHeaders: true,
      skipAuthRefresh: true,
      withCredentials: true
    }));

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByText(/choose a business type/i)).toBeTruthy();
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it('saves each step and submits the draft with separate legal consents', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Business type'), { target: { value: 'food_beverage' } });
    fireEvent.change(screen.getByLabelText(/Company name/i), { target: { value: 'Kusina ni Nena' } });
    fireEvent.change(screen.getByLabelText('What kind of business is this?'), { target: { value: 'micro_fnb' } });
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/registration/drafts/draft-1', expect.objectContaining({
      current_step: 2,
      payload: expect.objectContaining({
        business: expect.objectContaining({ business_type: 'food_beverage', company_name: 'Kusina ni Nena', industry_key: 'micro_fnb' })
      })
    }), expect.anything()));
    expect(await screen.findByRole('heading', { name: 'Storefront profile' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/registration/drafts/draft-1', expect.objectContaining({ current_step: 3 }), expect.anything()));
    expect(await screen.findByRole('heading', { name: 'Location and submission' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit details and create company/i }).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Business address'), { target: { value: '123 Test Street, Manila' } });
    fireEvent.click(screen.getByLabelText(/Company Registration Terms/i));
    fireEvent.click(screen.getByLabelText(/Marketplace Terms/i));
    expect(screen.getByRole('button', { name: /submit details and create company/i }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /submit details and create company/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/registration/drafts/draft-1/submit', expect.objectContaining({
      accepted_company_terms: true,
      accepted_marketplace_terms: true,
      company_terms_version: 'dgfy-company-terms-2026-06-08',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08'
    }), expect.objectContaining({ skipTenantAuthHeaders: true, skipAuthRefresh: true })));
    await waitFor(() => expect(screen.getByTestId('router-location').textContent).toBe('/business-registration-submission?application_id=draft-1'));
  });
});
