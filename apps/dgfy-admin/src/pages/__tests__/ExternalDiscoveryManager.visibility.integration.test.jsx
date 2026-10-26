// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ExternalDiscoveryManager from '../../../Pages/ExternalDiscoveryManager.jsx';

const mocks = vi.hoisted(() => ({
  getExternalDiscovery: vi.fn(),
  setExternalSiteVisibility: vi.fn(),
  setExternalListingVisibility: vi.fn(),
  saveExternalRedirectSite: vi.fn(),
  saveExternalDiscoveryListing: vi.fn(),
  removeExternalDiscoveryListing: vi.fn(),
  clearTemporaryExternalDiscoveryListings: vi.fn()
}));

vi.mock('@/services/adminService', () => mocks);

const makeSites = () => [
  { site_key: 'proventus', display_name: 'Proventous', type_label: 'Job', url_template: 'https://proventus.example/company/{id}', enabled: true, show_on_map: true, pin_count: 1, visible_pin_count: 1 },
  { site_key: 'mapviu', display_name: 'Mapviu', type_label: 'Real Estate', url_template: 'https://mapviu.example/property/{id}', enabled: false, show_on_map: true, pin_count: 0, visible_pin_count: 0 },
  { site_key: 'synqcore', display_name: 'Synqcore', type_label: 'Hotel', url_template: '', enabled: false, show_on_map: true, pin_count: 0, visible_pin_count: 0 },
  { site_key: 'eytitu', display_name: 'Eytitu', type_label: 'Taxi', url_template: '', enabled: false, show_on_map: true, pin_count: 0, visible_pin_count: 0 }
];

const makeListings = () => [{
  slug: 'sample-employer', title: 'Sample employer', external_provider: 'proventus',
  external_reference_id: 'ref-1', external_record_origin: 'event_seed', is_visible: true
}];

describe('ExternalDiscoveryManager visibility controls', () => {
  let sites;
  let listings;

  beforeEach(() => {
    vi.clearAllMocks();
    sites = makeSites();
    listings = makeListings();
    mocks.getExternalDiscovery.mockImplementation(async () => ({
      sites: structuredClone(sites), listings: structuredClone(listings)
    }));
    mocks.setExternalSiteVisibility.mockImplementation(async (siteKey, showOnMap) => {
      sites = sites.map((site) => site.site_key === siteKey ? {
        ...site,
        show_on_map: showOnMap,
        visible_pin_count: showOnMap ? listings.filter((row) => row.external_provider === siteKey && row.is_visible).length : 0
      } : site);
      return { site_key: siteKey, show_on_map: showOnMap };
    });
    mocks.setExternalListingVisibility.mockImplementation(async (slug, isVisible) => {
      listings = listings.map((row) => row.slug === slug ? { ...row, is_visible: isVisible } : row);
      return { slug, is_visible: isVisible };
    });
    mocks.saveExternalRedirectSite.mockResolvedValue({});
    mocks.saveExternalDiscoveryListing.mockResolvedValue({});
    mocks.removeExternalDiscoveryListing.mockResolvedValue({});
    mocks.clearTemporaryExternalDiscoveryListings.mockResolvedValue({});
  });

  afterEach(() => cleanup());

  it('toggles partner and pin visibility and refreshes the returned state', async () => {
    render(<ExternalDiscoveryManager />);

    const partnerSwitch = await screen.findByRole('switch', { name: 'Show Proventous on discovery map' });
    expect(screen.getByText('Proventous · Job')).toBeTruthy();
    expect(screen.getByText('1 of 1 pins visible')).toBeTruthy();
    fireEvent.click(partnerSwitch);

    await waitFor(() => expect(mocks.setExternalSiteVisibility).toHaveBeenCalledWith('proventus', false));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Show Proventous on discovery map' }).checked).toBe(false));
    expect(screen.getByText('Hidden on the map; its /e/ links are unavailable.')).toBeTruthy();
    expect(screen.getByText('0 of 1 pins visible')).toBeTruthy();
    expect(screen.getByText('Hidden by type')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Sample employer' }));
    await waitFor(() => expect(mocks.setExternalListingVisibility).toHaveBeenCalledWith('sample-employer', false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show Sample employer' })).toBeTruthy());
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByText('Hidden by type')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show Sample employer' }));
    await waitFor(() => expect(mocks.setExternalListingVisibility).toHaveBeenLastCalledWith('sample-employer', true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide Sample employer' })).toBeTruthy());
    expect(screen.getByText('Hidden by type')).toBeTruthy();
  });

  it('preserves unsaved destination drafts when a type switch refreshes data', async () => {
    render(<ExternalDiscoveryManager />);
    const proventusCard = await screen.findByText('Proventous · Job').then((node) => node.closest('div.rounded-xl'));
    const mapviuCard = screen.getByText('Mapviu · Real Estate').closest('div.rounded-xl');
    const proventusInput = within(proventusCard).getByLabelText('HTTPS destination template');
    const mapviuInput = within(mapviuCard).getByLabelText('HTTPS destination template');
    fireEvent.change(proventusInput, { target: { value: 'https://draft.example/proventus/{id}' } });
    fireEvent.change(mapviuInput, { target: { value: 'https://draft.example/mapviu/{id}' } });

    fireEvent.click(screen.getByRole('switch', { name: 'Show Proventous on discovery map' }));

    await waitFor(() => expect(mocks.setExternalSiteVisibility).toHaveBeenCalledWith('proventus', false));
    await waitFor(() => expect(proventusInput.value).toBe('https://draft.example/proventus/{id}'));
    expect(mapviuInput.value).toBe('https://draft.example/mapviu/{id}');
  });

  it('disables a type switch until its destination has been saved', async () => {
    render(<ExternalDiscoveryManager />);
    const toggle = await screen.findByRole('switch', { name: 'Show Synqcore on discovery map' });
    expect(toggle.disabled).toBe(true);
    expect(within(toggle.closest('div.rounded-xl')).getByText('Save a destination first.')).toBeTruthy();
  });
});
