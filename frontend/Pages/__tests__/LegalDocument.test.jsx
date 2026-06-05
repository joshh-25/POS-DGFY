/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LegalDocument from '../LegalDocument.jsx';

const renderLegalDocument = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/legal/:slug" element={<LegalDocument />} />
      <Route path="/privacy" element={<LegalDocument />} />
    </Routes>
  </MemoryRouter>
);

describe('LegalDocument', () => {
  it('renders the DGFY company registration terms route with content', () => {
    renderLegalDocument('/legal/dgfy-company-terms');

    expect(screen.getByRole('heading', { name: 'DGFY Company Registration Terms' })).toBeTruthy();
    expect(screen.getByText('dgfy-company-terms-2026-05-26')).toBeTruthy();
    expect(screen.getByText(/Company registration uses the signed-in DGFY account as the founder identity/i)).toBeTruthy();
    expect(screen.getByText(/DGFY is an e-marketplace\/platform service provider/i)).toBeTruthy();
  });

  it('renders the marketplace provider terms route with seller-of-record content', () => {
    renderLegalDocument('/legal/dgfy-marketplace-provider-terms');

    expect(screen.getByRole('heading', { name: 'DGFY Marketplace Provider Terms' })).toBeTruthy();
    expect(screen.getByText('dgfy-marketplace-provider-2026-05-26')).toBeTruthy();
    expect(screen.getByText(/The seller owns catalog accuracy/i)).toBeTruthy();
  });

  it('renders the privacy route with nonblank policy content', () => {
    renderLegalDocument('/privacy');

    expect(screen.getByRole('heading', { name: 'DGFY Privacy Policy' })).toBeTruthy();
    expect(screen.getByText('dgfy-privacy-2026-05-26')).toBeTruthy();
    expect(screen.getByText(/DGFY records explicit legal acknowledgements/i)).toBeTruthy();
  });
});
