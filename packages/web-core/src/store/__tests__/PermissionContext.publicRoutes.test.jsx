// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { PermissionProvider } from '../PermissionContext.jsx';

const browserSessionMock = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => ''),
  refreshBrowserSession: vi.fn()
}));

const authServiceMock = vi.hoisted(() => ({
  getCurrentUser: vi.fn()
}));

vi.mock('../../services/browserSession.js', () => browserSessionMock);
vi.mock('../../services/authService', () => authServiceMock);

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
      <MemoryRouter initialEntries={['/register-company?source=dgfy&auth=login#business-registration']}>
        <PermissionProvider>
          <div>public registration</div>
        </PermissionProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(browserSessionMock.refreshBrowserSession).not.toHaveBeenCalled());
    expect(authServiceMock.getCurrentUser).not.toHaveBeenCalled();
  });

  it('loads tenant permissions after login navigation reaches a protected route', async () => {
    const NavigateAfterLogin = () => {
      const navigate = useNavigate();
      React.useEffect(() => {
        window.dispatchEvent(new CustomEvent('auth:login'));
        navigate('/');
      }, [navigate]);
      return <div>login screen</div>;
    };

    browserSessionMock.getAccessToken.mockReturnValue('access-token');
    authServiceMock.getCurrentUser.mockResolvedValue({
      role: 'admin',
      is_master_admin: false,
      permissions: ['items:view'],
      company: { plan: 'premium' }
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <PermissionProvider>
          <Routes>
            <Route path="/login" element={<NavigateAfterLogin />} />
            <Route path="/" element={<div>dashboard</div>} />
          </Routes>
        </PermissionProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(authServiceMock.getCurrentUser).toHaveBeenCalled());
    expect(browserSessionMock.refreshBrowserSession).not.toHaveBeenCalled();
  });
});
