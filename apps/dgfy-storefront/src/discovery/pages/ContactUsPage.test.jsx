/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import ContactUsPage from './ContactUsPage.jsx';
import { useDiscoveryNavActions } from '../hooks/useDiscoveryNavActions.js';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';

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

describe('ContactUsPage', () => {
  it('renders the hosted inquiry form without the redundant intro block and with an accessible fallback', () => {
    render(
      <MemoryRouter initialEntries={['/contact-us']}>
        <Routes>
          <Route path="/contact-us" element={<ContactUsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Contact Us', level: 1 })).toBeTruthy();
    expect(screen.getByText('Have a question, idea, or business inquiry? Let’s start a conversation.')).toBeTruthy();
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
    expect(screen.getByRole('link', { name: 'open the form in a new tab' }).getAttribute('href'))
      .toBe('https://pin4ms.bblabs.dev/f/dgfy-gateway-1');
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
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
