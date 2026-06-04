// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const browserSessionMock = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => ''),
  refreshBrowserSession: vi.fn()
}));

const authServiceMock = vi.hoisted(() => ({
  getCurrentUser: vi.fn()
}));

vi.mock('../../services/browserSession.js', () => browserSessionMock);
vi.mock('../../services/authService', () => authServiceMock);

const { PermissionProvider } = await import('../PermissionContext.jsx');

describe('PermissionProvider public routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/register-company?source=dgfy&auth=login#business-registration');
  });

  afterEach(() => {
    cleanup();
  });

  it('does not refresh tenant session or load tenant permissions on DGFY registration routes', async () => {
    render(
      <PermissionProvider>
        <div>public registration</div>
      </PermissionProvider>
    );

    await waitFor(() => expect(browserSessionMock.refreshBrowserSession).not.toHaveBeenCalled());
    expect(authServiceMock.getCurrentUser).not.toHaveBeenCalled();
  });
});
