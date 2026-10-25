/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import ContactUsPage from './ContactUsPage.jsx';
import { useDiscoveryNavActions } from '../hooks/useDiscoveryNavActions.js';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';

const mocks = vi.hoisted(() => ({
  getPublicStorefrontSupportContact: vi.fn()
}));

vi.mock('../../services/supportContactService.js', () => ({
  getPublicStorefrontSupportContact: mocks.getPublicStorefrontSupportContact
}));

function DiscoveryNavigationHarness() {
  const [, setActiveDiscoveryNavItem] = useState('Explore');
  const [, setIsDiscoveryNavMenuOpen] = useState(false);
  const { handleDiscoveryNavItemClick } = useDiscoveryNavActions({
    isDiscoveryMobileViewport: false,
    setActiveDiscoveryNavItem,
    setIsDiscoveryNavMenuOpen
  });

  return <button type="button" onClick={() => handleDiscoveryNavItemClick('Contact Us')}>Contact Us</button>;
}

function CurrentRoute() {
  const location = useLocation();
  return <p data-testid="current-route">{`${location.pathname}${location.search}`}</p>;
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  useStorefrontStore.getState().discoverySetActiveNavItem('Explore');
});

beforeEach(() => {
  mocks.getPublicStorefrontSupportContact.mockReset();
  mocks.getPublicStorefrontSupportContact.mockResolvedValue({ email: null });
});

describe('ContactUsPage', () => {
  it('keeps the inquiry form fallback available when no support email is configured', () => {
    render(
      <MemoryRouter initialEntries={['/contact-us']}>
        <Routes>
          <Route path="/contact-us" element={<ContactUsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Contact Us', level: 1 })).toBeTruthy();
    expect(screen.getByText('For general questions or business inquiries, use the form below.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Need help with the DGFY Storefront app?', level: 2 })).toBeTruthy();
    expect(screen.getByText(/A support email is not yet available/))
      .toBeTruthy();
    expect(screen.queryByRole('link', { name: 'support@dgfy.ph' })).toBeNull();
    expect(document.querySelector('a[href="mailto:support@dgfy.ph"]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Contact inquiry form' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Send us an inquiry' })).toBeNull();
    expect(screen.queryByText(/This form is hosted by Pin4MS/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in / Sign up' })).toBeTruthy();
    const iframe = screen.getByTitle('DGFY contact inquiry form');
    expect(iframe.getAttribute('src')).toBe('https://pin4ms.bblabs.dev/f/dgfy-gateway-1?embed=1');
    expect(iframe.getAttribute('width')).toBe('100%');
    expect(iframe.getAttribute('height')).toBe('600');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    const fallbackLink = screen.getByRole('link', { name: 'open the form in a new tab' });
    expect(fallbackLink.getAttribute('href')).toBe('https://pin4ms.bblabs.dev/f/dgfy-gateway-1');
    expect(fallbackLink.getAttribute('target')).toBe('_blank');
    expect(fallbackLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
  });

  it('shows the configured address returned by the public contact endpoint', async () => {
    mocks.getPublicStorefrontSupportContact.mockResolvedValue({ email: 'help@dgfy.ph' });

    render(
      <MemoryRouter initialEntries={['/contact-us']}>
        <Routes>
          <Route path="/contact-us" element={<ContactUsPage />} />
        </Routes>
      </MemoryRouter>
    );

    const supportLink = await screen.findByRole('link', { name: 'help@dgfy.ph' });
    expect(supportLink.getAttribute('href')).toBe('mailto:help@dgfy.ph');
    expect(screen.queryByRole('link', { name: 'support@dgfy.ph' })).toBeNull();
  });

  it('keeps the existing customer sign-in action in the shared header', async () => {
    render(
      <MemoryRouter initialEntries={['/contact-us']}>
        <Routes>
          <Route path="/contact-us" element={<ContactUsPage />} />
          <Route path="/login" element={<CurrentRoute />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log in / Sign up' }));

    const route = await screen.findByTestId('current-route');
    expect(route.textContent).toMatch(/^\/login\?/);
    expect(route.textContent).toContain('intent=customer');
    expect(route.textContent).toContain('mode=sign-in');
  });

  it('returns to the Discovery page with the selected section active', async () => {
    render(
      <MemoryRouter initialEntries={['/contact-us']}>
        <Routes>
          <Route path="/contact-us" element={<ContactUsPage />} />
          <Route path="/" element={<p>Discovery home</p>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Solutions' }));

    expect(await screen.findByText('Discovery home')).toBeTruthy();
    expect(useStorefrontStore.getState().discovery.activeNavItem).toBe('Solutions');
  });

  it('routes the existing Discovery Contact Us navigation to the new page', async () => {
    window.history.replaceState({}, '', '/');

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/contact-us" element={<p>Separate contact page route</p>} />
          <Route path="*" element={<DiscoveryNavigationHarness />} />
        </Routes>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Contact Us' }));

    expect(await screen.findByText('Separate contact page route')).toBeTruthy();
  });

  it('does not add a duplicate history entry when Contact Us is already active', () => {
    window.history.replaceState({}, '', '/contact-us');

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/contact-us" element={<ContactUsPage />} />
        </Routes>
      </BrowserRouter>
    );

    const initialHistoryLength = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Contact Us' }));

    expect(window.location.pathname).toBe('/contact-us');
    expect(window.history.length).toBe(initialHistoryLength);
  });
});
