// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const getAccessToken = vi.fn();
const getCompanyToken = vi.fn();
const refreshBrowserSession = vi.fn();
const setBrowserSession = vi.fn();

vi.mock('../api.js', () => ({
  default: {
    get: apiGet,
    post: vi.fn()
  }
}));

vi.mock('../browserSession.js', () => ({
  getAccessToken,
  getCompanyToken,
  refreshBrowserSession,
  setBrowserSession
}));

vi.mock('../sessionCleanup.js', () => ({
  clearClientSession: vi.fn()
}));

describe('authService tenant handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccessToken.mockReturnValue('');
    getCompanyToken.mockReturnValue('');
    refreshBrowserSession.mockResolvedValue('');
  });

  it('binds the first protected request to the tenant session returned by DGFY', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          user_id: 6,
          role: 'cashier'
        }
      }
    });

    const { getCurrentUser } = await import('../authService.js');
    const user = await getCurrentUser(
      { skipGlobalErrorToast: true },
      {
        token: 'tenant-access-token',
        companyToken: 'masu-company-token'
      }
    );

    expect(setBrowserSession).toHaveBeenCalledWith({
      token: 'tenant-access-token',
      companyToken: 'masu-company-token'
    });
    expect(apiGet).toHaveBeenCalledWith('/users/me', {
      skipGlobalErrorToast: true,
      headers: {
        Authorization: 'Bearer tenant-access-token',
        'x-company-token': 'masu-company-token'
      }
    });
    expect(user).toEqual({ user_id: 6, role: 'cashier' });
    expect(refreshBrowserSession).not.toHaveBeenCalled();
  });

  it('does not send a protected request when neither an access token nor refresh is available', async () => {
    const { getCurrentUser } = await import('../authService.js');

    await expect(getCurrentUser()).resolves.toBeNull();

    expect(refreshBrowserSession).toHaveBeenCalledTimes(1);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('verifies a candidate tenant session without activating it first', async () => {
    apiGet.mockResolvedValue({
      data: { data: { user_id: 7, role: 'admin' } }
    });
    const { getCurrentUser } = await import('../authService.js');

    const user = await getCurrentUser(
      { skipGlobalErrorToast: true },
      {
        token: 'candidate-token',
        companyToken: 'candidate-company',
        installSession: false
      }
    );

    expect(user).toEqual({ user_id: 7, role: 'admin' });
    expect(setBrowserSession).not.toHaveBeenCalled();
    expect(apiGet).toHaveBeenCalledWith('/users/me', expect.objectContaining({
      skipAuthRefresh: true,
      headers: {
        Authorization: 'Bearer candidate-token',
        'x-company-token': 'candidate-company'
      }
    }));
  });
});
