/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('../../../../../packages/web-core/src/components/maps/MapPinPicker.jsx', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ onChange, locationEditorAction, mapHeightClassName }) => ReactModule.createElement(
      'div',
      { role: 'group', 'aria-label': 'Map picker test controls', 'data-map-height-class': mapHeightClassName },
      ReactModule.createElement('button', {
        type: 'button',
        onClick: () => onChange({ latitude: 14.5995, longitude: 120.9842 })
      }, 'Place map pin'),
      locationEditorAction
    )
  };
});

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
    sessionStorage.clear();
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

  it('keeps the signed-out registration gate balanced and preserves both account actions', async () => {
    dgfyAuthMock.getStoredDgfyAccount.mockReturnValue(null);
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');
    dgfyAuthMock.fetchDgfyMe.mockRejectedValue(new Error('No active DGFY account'));

    renderPage();

    const heading = await screen.findByRole('heading', { name: 'Register Your Business' });
    expect(heading.parentElement.getAttribute('data-testid')).toBe('business-registration-account-gate');
    expect(heading.parentElement.className).toContain('lg:my-auto');
    expect(screen.getByText('To register a business, you must first have an active DGFY customer account.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Register Company Using My DGFY Account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create DGFY Account' })).toBeTruthy();
  });

  it('creates a private draft and blocks step-one progression until required business details are valid', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Business details' })).toBeTruthy();
    expect(screen.queryByText('Enter your company name and choose the industry that best describes its main activity.')).toBeNull();
    expect(await screen.findByText('Draft loaded. New edits save automatically.')).toBeTruthy();
    expect(screen.queryByText('Uploaded files stay with this private draft until you submit or remove them.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Company identity' })).toBeNull();
    expect(screen.queryByText('These details identify the company connected to your DGFY account.')).toBeNull();
    expect(screen.getByLabelText('Company name')).toBeTruthy();
    const businessFieldGroup = screen.getByLabelText('Company name').parentElement?.parentElement;
    expect(businessFieldGroup?.className).toContain('w-full');
    expect(businessFieldGroup?.className).not.toContain('max-w-3xl');
    const ownershipCard = screen.getByRole('heading', { name: 'Registration ownership' }).parentElement;
    expect(ownershipCard?.className).toContain('w-full');
    expect(screen.getByLabelText('Business industry')).toBeTruthy();
    const industryDescription = screen.getByLabelText('Industry (optional)');
    expect(industryDescription.hasAttribute('required')).toBe(false);
    expect(industryDescription.maxLength).toBe(120);
    expect(screen.getByRole('combobox', { name: 'Business industry' }).querySelector('span').className).toContain('font-normal');
    const footerActions = screen.getByRole('button', { name: /save and continue/i }).parentElement;
    expect(footerActions.className).toContain('sm:justify-end');
    expect(footerActions.className).not.toContain('sm:justify-between');
    expect(screen.getByRole('button', { name: /Step 1: Business/i }).getAttribute('aria-current')).toBe('step');
    expect(screen.queryByText('Step 1 of 3')).toBeNull();
    expect(screen.getByRole('button', { name: /Step 2: Storefront profile/i }).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: 'Register Business' })).toBeNull();
    expect(apiMock.post).toHaveBeenCalledWith('/registration/drafts', {}, expect.objectContaining({
      skipTenantAuthHeaders: true,
      skipAuthRefresh: true,
      withCredentials: true
    }));

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByText(/choose a business industry/i)).toBeTruthy();
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it('autosaves edited fields and restores them after the registration page is reloaded', async () => {
    let persistedDraft = makeDraft();
    const clone = (value) => JSON.parse(JSON.stringify(value));
    apiMock.post.mockImplementation(async (url) => {
      if (url === '/registration/drafts') return { data: { success: true, data: clone(persistedDraft) } };
      if (url.endsWith('/submit')) return { data: { success: true, data: { registration_id: 'draft-1', status: 'pending_review' } } };
      throw new Error(`Unexpected POST ${url}`);
    });
    apiMock.patch.mockImplementation(async (_url, body) => {
      persistedDraft = makeDraft({
        current_step: Math.max(persistedDraft.current_step, body.current_step),
        version: Number(body.version) + 1,
        payload: body.payload
      });
      return { data: { success: true, data: clone(persistedDraft) } };
    });

    const firstRender = renderPage();
    fireEvent.change(await screen.findByLabelText('Company name'), { target: { value: 'Acme Corp' } });

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(1));
    expect(apiMock.patch.mock.calls[0][1].payload.business.company_name).toBe('Acme Corp');
    expect(await screen.findByText('Draft saved. You can refresh and resume.')).toBeTruthy();

    firstRender.unmount();
    renderPage();

    expect((await screen.findByLabelText('Company name')).value).toBe('Acme Corp');
    expect(screen.getByText('Draft loaded. New edits save automatically.')).toBeTruthy();
  });

  it('recovers edits immediately after an unmount before the autosave debounce fires', async () => {
    let persistedDraft = makeDraft();
    const clone = (value) => JSON.parse(JSON.stringify(value));
    apiMock.post.mockImplementation(async (url) => {
      if (url === '/registration/drafts') return { data: { success: true, data: clone(persistedDraft) } };
      throw new Error(`Unexpected POST ${url}`);
    });
    apiMock.patch.mockImplementation(async (_url, body) => {
      persistedDraft = makeDraft({
        current_step: Math.max(persistedDraft.current_step, body.current_step),
        version: Number(body.version) + 1,
        payload: body.payload
      });
      return { data: { success: true, data: clone(persistedDraft) } };
    });

    const firstRender = renderPage();
    fireEvent.change(await screen.findByLabelText('Company name'), { target: { value: 'Acme Corp' } });
    expect(sessionStorage.length).toBeGreaterThan(0);

    firstRender.unmount();
    renderPage();

    expect((await screen.findByLabelText('Company name')).value).toBe('Acme Corp');
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(1));
    expect(apiMock.patch.mock.calls[0][1].payload.business.company_name).toBe('Acme Corp');
    expect(await screen.findByText('Draft saved. You can refresh and resume.')).toBeTruthy();
    expect(sessionStorage.length).toBe(0);
  });

  it('replaces a staged profile image atomically and clears its preview after removal', async () => {
    const initialDraft = makeDraft({
      current_step: 2,
      payload: {
        ...makeDraft().payload,
        business: { company_name: 'Acme Corp', industry_key: 'micro_fnb' },
        storefront: { social_links: {}, delivery_partners: [], gallery: [], profile_upload_id: 'old-profile' }
      },
      uploads: [{ id: 'old-profile', category: 'profile_image', original_name: 'old.png', upload_status: 'ready_for_review' }]
    });
    const createObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectUrlMock = vi.fn(() => 'blob:registration-profile-preview');
    const revokeObjectUrlMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectUrlMock });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectUrlMock });
    apiMock.post.mockImplementation(async (url, body) => {
      if (url === '/registration/drafts') return { data: { success: true, data: initialDraft } };
      if (url.endsWith('/uploads')) {
        expect(body.get('replace_upload_id')).toBe('old-profile');
        return { data: { success: true, data: { id: 'new-profile', category: 'profile_image', original_name: 'new.png', upload_status: 'ready_for_review' } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    try {
      renderPage();
      const input = await screen.findByLabelText('Choose profile photo file');
      fireEvent.change(input, { target: { files: [new File(['new profile'], 'new.png', { type: 'image/png' })] } });

      expect(await screen.findByAltText('Profile photo preview')).toBeTruthy();
      expect(apiMock.delete).not.toHaveBeenCalled();
      expect(screen.getByText('new.png')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Remove profile photo' }));

      await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/registration/drafts/draft-1/uploads/new-profile', expect.anything()));
      expect(screen.queryByAltText('Profile photo preview')).toBeNull();
      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:registration-profile-preview');
    } finally {
      cleanup();
      if (createObjectUrl) Object.defineProperty(URL, 'createObjectURL', createObjectUrl);
      else delete URL.createObjectURL;
      if (revokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrl);
      else delete URL.revokeObjectURL;
    }
  });

  it('counts completed menu uploads once across separate upload batches', async () => {
    const initialDraft = makeDraft({
      current_step: 2,
      payload: {
        ...makeDraft().payload,
        business: { company_name: 'Acme Corp', industry_key: 'micro_fnb' }
      }
    });
    let nextUploadId = 0;
    apiMock.post.mockImplementation(async (url, body) => {
      if (url === '/registration/drafts') return { data: { success: true, data: initialDraft } };
      if (url.endsWith('/uploads')) {
        nextUploadId += 1;
        const file = body.get('file');
        return { data: { success: true, data: {
          id: `menu-${nextUploadId}`,
          category: 'menu_upload',
          original_name: file.name,
          upload_status: 'ready_for_review'
        } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    renderPage();
    expect(await screen.findByRole('heading', { name: 'Storefront profile' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    expect(await screen.findByRole('heading', { name: 'Location and submission' })).toBeTruthy();
    const input = await screen.findByLabelText('Choose menu files');
    const makeMenuFile = (name) => new File(['menu data'], name, { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [
      makeMenuFile('batch-one-1.csv'),
      makeMenuFile('batch-one-2.csv'),
      makeMenuFile('batch-one-3.csv')
    ] } });

    expect(await screen.findByText('batch-one-3.csv')).toBeTruthy();
    expect(input.disabled).toBe(false);
    expect(screen.getAllByText('batch-one-1.csv')).toHaveLength(1);

    fireEvent.change(input, { target: { files: [makeMenuFile('batch-two-1.csv'), makeMenuFile('batch-two-2.csv')] } });

    expect(await screen.findByText('batch-two-2.csv')).toBeTruthy();
    expect(apiMock.post.mock.calls.filter(([url]) => url.endsWith('/uploads'))).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'browse computer storage' }).disabled).toBe(true);
  });

  it('keeps field values and offers retry when an autosave request fails', async () => {
    apiMock.patch.mockRejectedValueOnce(new Error('Network unavailable'));
    renderPage();

    const companyName = await screen.findByLabelText('Company name');
    fireEvent.change(companyName, { target: { value: 'Acme Corp' } });

    expect(await screen.findByText('Draft not saved. Your edits are still here. Retry the save.')).toBeTruthy();
    expect(companyName.value).toBe('Acme Corp');

    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Draft saved. You can refresh and resume.')).toBeTruthy();
    expect(companyName.value).toBe('Acme Corp');
  });

  it('shows conflict recovery and reloads the latest draft without overwriting local edits', async () => {
    const latestDraft = makeDraft({
      payload: {
        ...makeDraft().payload,
        business: { company_name: 'Latest Cafe', industry_key: 'micro_fnb' }
      }
    });
    apiMock.get.mockImplementation(async (url) => {
      if (url === '/registration/industries') {
        return {
          data: {
            data: {
              industries: [{ key: 'micro_fnb', label: 'Micro Food & Beverage', summary: 'Food and beverage businesses' }]
            }
          }
        };
      }
      if (url === '/registration/drafts/draft-1') return { data: { success: true, data: latestDraft } };
      throw new Error(`Unexpected GET ${url}`);
    });
    const conflict = new Error('This registration draft changed. Reload it before saving again.');
    conflict.response = { status: 409, data: { message: conflict.message } };
    apiMock.patch.mockRejectedValueOnce(conflict);

    renderPage();

    const companyName = await screen.findByLabelText('Company name');
    fireEvent.change(companyName, { target: { value: 'Local Cafe' } });
    await waitFor(() => expect(screen.getByText('This registration changed elsewhere.')).toBeTruthy(), { timeout: 3000 });
    expect(companyName.value).toBe('Local Cafe');

    fireEvent.click(screen.getByRole('button', { name: 'Review my unsaved edits' }));
    expect(companyName.value).toBe('Local Cafe');
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/registration/drafts/draft-1', expect.anything()));
    await waitFor(() => expect(companyName.value).toBe('Latest Cafe'));
    expect(screen.queryByText('This registration changed elsewhere.')).toBeNull();
  });

  it('saves each step and submits the draft with separate legal consents', async () => {
    const savedStorefrontValues = {
      delivery_partners: [{ partner: 'grab', label: 'Grab', url: 'https://www.grab.com' }],
      gallery: [{ upload_id: 'existing-gallery-upload', caption: 'Storefront', alt: 'Storefront exterior', sort_order: 0 }]
    };
    const initialDraft = makeDraft();
    Object.assign(initialDraft.payload.storefront, savedStorefrontValues);
    apiMock.post.mockImplementationOnce(async () => ({
      data: { success: true, data: initialDraft }
    }));
    renderPage();
    apiMock.patch.mockImplementationOnce(async (_url, body) => ({
      data: {
        success: true,
        data: makeDraft({
          current_step: body.current_step,
          version: Number(body.version) + 1,
          payload: {
            business: {
              company_name: body.payload.business.company_name,
              industry_key: body.payload.business.industry_key
            }
          }
        })
      }
    }));

    fireEvent.change(await screen.findByLabelText('Company name'), { target: { value: 'Kusina ni Nena' } });
    expect(screen.getByRole('heading', { name: 'Registration ownership', level: 2 })).toBeTruthy();
    const industrySelect = await screen.findByRole('combobox', { name: 'Business industry' });
    fireEvent.click(industrySelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Micro Food & Beverage' }));
    fireEvent.change(screen.getByLabelText('Industry (optional)'), { target: { value: 'Neighborhood cafe and bakery' } });
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/registration/drafts/draft-1', expect.objectContaining({
      current_step: 2,
      payload: expect.objectContaining({
        business: expect.objectContaining({
          company_name: 'Kusina ni Nena',
          industry_key: 'micro_fnb',
          industry_tag: 'Neighborhood cafe and bakery'
        })
      })
    }), expect.anything()));
    expect(apiMock.patch.mock.calls[0][1].payload.business.business_type).toBeUndefined();
    expect(apiMock.patch.mock.calls[0][1].payload.storefront.delivery_partners).toEqual(savedStorefrontValues.delivery_partners);
    expect(apiMock.patch.mock.calls[0][1].payload.storefront.gallery).toEqual(savedStorefrontValues.gallery);
    expect(await screen.findByRole('heading', { name: 'Storefront profile' })).toBeTruthy();
    expect(screen.queryByText('Add the public information customers will see.')).toBeNull();
    expect(screen.getByText('Uploaded files stay with this private draft until you submit or remove them.')).toBeTruthy();
    const storefrontImagesHeading = screen.getByRole('heading', { name: 'Storefront images', level: 2 });
    expect(storefrontImagesHeading.className).toContain('sr-only');
    expect(screen.getByRole('heading', { name: 'Profile photo', level: 3 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cover photo', level: 3 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Social Links', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Delivery Partners', exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Gallery', exact: true })).toBeNull();
    expect(screen.queryByText('Upload optional images that will be staged with this registration for review.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Storefront contact and description' })).toBeNull();
    expect(screen.queryByText('All fields below are optional, but help customers recognize and contact your store.')).toBeNull();
    expect(screen.getByLabelText('Store email')).toBeTruthy();
    expect(screen.getByLabelText('Store contact number')).toBeTruthy();
    expect(screen.getByLabelText('Tagline')).toBeTruthy();
    expect(screen.getByLabelText('About us')).toBeTruthy();

    const pageShell = screen.getByTestId('business-registration-shell');
    expect(pageShell.className).toContain('lg:overflow-hidden');
    const scrollRegion = screen.getByRole('region', { name: 'Storefront profile' });
    expect(scrollRegion.getAttribute('tabindex')).toBe('0');
    expect(scrollRegion.className).toContain('lg:overflow-y-auto');
    expect(scrollRegion.contains(screen.getByRole('heading', { name: 'Storefront profile' }))).toBe(true);
    expect(scrollRegion.contains(screen.getByRole('button', { name: /save and continue/i }))).toBe(true);
    expect(scrollRegion.contains(screen.getByRole('link', { name: 'Sign in to POS' }))).toBe(true);

    fireEvent.change(screen.getByLabelText('Store email'), { target: { value: 'hello@kusinani.example' } });
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: 'Freshly made every day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));

    expect(await screen.findByRole('heading', { name: 'Business details' })).toBeTruthy();
    expect(screen.getByLabelText('Company name').value).toBe('Kusina ni Nena');
    expect(screen.getByRole('combobox', { name: 'Business industry' }).textContent).toContain('Micro Food & Beverage');
    expect(screen.getByLabelText('Industry (optional)').value).toBe('Neighborhood cafe and bakery');

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(3));
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/registration/drafts/draft-1', expect.objectContaining({
      current_step: 2,
      payload: expect.objectContaining({
        storefront: expect.objectContaining({
          store_email: 'hello@kusinani.example',
          tagline: 'Freshly made every day'
        })
      })
    }), expect.anything());
    expect(apiMock.patch).toHaveBeenNthCalledWith(3, '/registration/drafts/draft-1', expect.objectContaining({
      current_step: 2,
      payload: expect.objectContaining({
        storefront: expect.objectContaining({
          store_email: 'hello@kusinani.example',
          tagline: 'Freshly made every day'
        })
      })
    }), expect.anything());
    expect(await screen.findByRole('heading', { name: 'Storefront profile' })).toBeTruthy();
    expect(screen.getByLabelText('Store email').value).toBe('hello@kusinani.example');
    expect(screen.getByLabelText('Tagline').value).toBe('Freshly made every day');
    expect(apiMock.patch.mock.calls[1][1].payload.storefront.delivery_partners).toEqual(savedStorefrontValues.delivery_partners);
    expect(apiMock.patch.mock.calls[1][1].payload.storefront.gallery).toEqual(savedStorefrontValues.gallery);

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/registration/drafts/draft-1', expect.objectContaining({ current_step: 3 }), expect.anything()));
    expect(await screen.findByRole('heading', { name: 'Location and submission' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Business hours', exact: true })).toBeNull();
    expect(screen.queryByText('Set at least one open schedule so customers know when the business operates.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Store Location', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Business Hours', exact: true, level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Menu uploads/, level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Required agreements', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Current Schedule', exact: true })).toBeNull();
    expect(screen.queryByText('This is how your business hours will appear on your storefront.')).toBeNull();
    const addScheduleButton = screen.getByRole('button', { name: 'Add Schedule Set', exact: true });
    expect(addScheduleButton.parentElement?.querySelector('.bg-blue-50')).toBeNull();
    const scheduleContainer = addScheduleButton.closest('section');
    expect(scheduleContainer?.className).not.toContain('rounded-xl');
    expect(scheduleContainer?.className).not.toContain('border-slate-200');
    fireEvent.click(addScheduleButton);
    const selectedMonday = screen.getByRole('button', { name: 'Select Monday', exact: true });
    expect(selectedMonday.parentElement?.className).toContain('grid-cols-7');
    expect(selectedMonday.querySelector('svg')?.getAttribute('class')).toContain('absolute');
    fireEvent.click(within(scheduleContainer).getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByLabelText('Business address')).toBeNull();
    expect(screen.queryByLabelText(/latitude/i)).toBeNull();
    expect(screen.queryByLabelText(/longitude/i)).toBeNull();
    const mapPicker = await screen.findByRole('group', { name: 'Map picker test controls' });
    expect(mapPicker.getAttribute('data-map-height-class')).toBe('h-[260px] rounded-xl sm:h-[340px] lg:h-[420px]');
    expect(screen.getByText('Search for an address below or click the map to place a pin. Then add it as your first branch location.')).toBeTruthy();
    const businessHoursHeading = screen.getByRole('heading', { name: 'Business Hours', exact: true });
    const businessHoursIntroHeader = businessHoursHeading.parentElement?.parentElement?.parentElement;
    expect(businessHoursIntroHeader?.className).toContain('flex');
    expect(businessHoursIntroHeader?.className).not.toContain('hidden sm:flex');
    expect(businessHoursHeading.parentElement?.parentElement?.querySelector('svg')).toBeNull();
    expect(screen.getByRole('heading', { name: /Menu uploads/i }).closest('section').textContent).toContain('Uploaded files stay with this private draft until you submit or remove them.');
    expect(screen.getByText('Drag and drop files here')).toBeTruthy();
    expect(screen.getByText('Max 10 MB each, up to 5 files')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'browse computer storage' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Supported menu file types' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit registration/i }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Place map pin' }));
    const addBranchButton = screen.getByRole('button', { name: 'Add branch location' });
    expect(addBranchButton.className).toContain('w-auto');
    expect(addBranchButton.className).toContain('min-h-11');
    expect(addBranchButton.disabled).toBe(true);
    expect(apiMock.patch).toHaveBeenCalledTimes(4);
    fireEvent.change(screen.getByLabelText('Business address'), { target: { value: '123 Test Street, Manila' } });
    // #2595: the branch also needs the street no., unit, floor or building before it can be added.
    expect(addBranchButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Street no\., unit, floor or building/), { target: { value: 'Unit 2' } });
    expect(addBranchButton.disabled).toBe(false);
    expect(apiMock.patch).toHaveBeenCalledTimes(4);
    fireEvent.click(addBranchButton);
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(5));
    expect(apiMock.patch.mock.calls.map(([, body]) => body.version)).toEqual([1, 2, 3, 4, 5]);
    expect(apiMock.patch).toHaveBeenNthCalledWith(5, '/registration/drafts/draft-1', expect.objectContaining({
      current_step: 3,
      payload: expect.objectContaining({
        location: expect.objectContaining({
          address_line: 'Unit 2, 123 Test Street, Manila',
          address_details: 'Unit 2',
          latitude: 14.5995,
          longitude: 120.9842
        })
      })
    }), expect.anything());
    expect(await screen.findByText('Added to registration draft')).toBeTruthy();
    const changeLocationButton = screen.getByRole('button', { name: 'Change branch location' });
    expect(changeLocationButton.getAttribute('title')).toBe('Change location');
    fireEvent.click(changeLocationButton);
    expect(await screen.findByRole('heading', { name: 'Selected location' })).toBeTruthy();
    // Editing splits the saved line back into the location and the details.
    expect(screen.getByLabelText('Business address').value).toBe('123 Test Street, Manila');
    expect(screen.getByLabelText(/Street no\., unit, floor or building/).value).toBe('Unit 2');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(await screen.findByRole('button', { name: 'Change branch location' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Company Registration Terms/i));
    fireEvent.click(screen.getByLabelText(/Marketplace Terms/i));
    expect(screen.getByRole('button', { name: /submit registration/i }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/registration/drafts/draft-1/submit', expect.objectContaining({
      accepted_company_terms: true,
      accepted_marketplace_terms: true,
      company_terms_version: 'dgfy-company-terms-2026-06-08',
      marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08'
    }), expect.objectContaining({ skipTenantAuthHeaders: true, skipAuthRefresh: true })));
    expect(apiMock.patch.mock.calls.every(([, body]) => (
      !Object.prototype.hasOwnProperty.call(body, 'accepted_company_terms')
      && !Object.prototype.hasOwnProperty.call(body, 'accepted_marketplace_terms')
    ))).toBe(true);
    await waitFor(() => expect(screen.getByTestId('router-location').textContent).toBe('/business-registration-submission?application_id=draft-1'));
  });

  it('resets both the page scroll pane and step region when moving to the next step', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Company name'), { target: { value: 'Acme Corp' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Business industry' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Micro Food & Beverage' }));

    const pageScroller = screen.getByTestId('business-registration-scroll-container');
    const stepRegion = screen.getByRole('region', { name: 'Business details' });
    pageScroller.scrollTop = 480;
    stepRegion.scrollTop = 260;
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByRole('heading', { name: 'Storefront profile' })).toBeTruthy();
    expect(pageScroller.scrollTop).toBe(0);
    expect(stepRegion.scrollTop).toBe(0);

    pageScroller.scrollTop = 720;
    stepRegion.scrollTop = 350;
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByRole('heading', { name: 'Location and submission' })).toBeTruthy();
    expect(pageScroller.scrollTop).toBe(0);
    expect(stepRegion.scrollTop).toBe(0);
  });
});
