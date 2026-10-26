/** @vitest-environment jsdom */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { bindOidcInteraction, fetchOidcInteraction, prepareOidcCompletion } = vi.hoisted(() => ({
  bindOidcInteraction: vi.fn(),
  fetchOidcInteraction: vi.fn(),
  prepareOidcCompletion: vi.fn()
}));

vi.mock('./oidcInteractionService.js', () => ({
  bindOidcInteraction,
  fetchOidcInteraction,
  prepareOidcCompletion,
  validateOidcCompletionUrl: vi.fn(() => ''),
  validateOidcRestartUrl: vi.fn(() => '')
}));

import StorefrontOidcInteractionPage from './StorefrontOidcInteractionPage.jsx';

describe('Storefront OIDC interaction page', () => {
  beforeEach(() => {
    bindOidcInteraction.mockReset().mockResolvedValue({ expires_at: 1_900_000_000_000 });
    fetchOidcInteraction.mockReset().mockResolvedValue({
      authenticated: true,
      account: { first_name: 'Ada', last_name: 'Owner', email: 'ada@example.test' },
      companies: [{ id: 'company-1', name: 'Laundry One', role: 'owner' }],
      prompt_login: false,
      prompt_select_account: false,
      fresh_auth_verified: false,
      new_company_intent: false
    });
    prepareOidcCompletion.mockReset();
    window.history.replaceState({}, '', '/oidc/interaction/interaction-1#oidc_handoff=one-use-secret');
  });

  it('removes the handoff fragment before binding and displays the authenticated identity and membership', async () => {
    render(
      <MemoryRouter initialEntries={['/oidc/interaction/interaction-1#oidc_handoff=one-use-secret']}>
        <Routes><Route path="/oidc/interaction/:id" element={<StorefrontOidcInteractionPage />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Continue to DGLaundry')).toBeTruthy();
    await waitFor(() => expect(bindOidcInteraction).toHaveBeenCalledWith('interaction-1', 'one-use-secret'));
    expect(window.location.hash).toBe('');
    expect(screen.getByText('Ada Owner')).toBeTruthy();
    expect(screen.getByText('Laundry One')).toBeTruthy();
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });
});
