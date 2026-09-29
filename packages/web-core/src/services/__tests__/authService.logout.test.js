import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());
const clearClientSession = vi.hoisted(() => vi.fn());

vi.mock('../api.js', () => ({
  default: { post: apiPost }
}));

vi.mock('../browserSession.js', () => ({
  getAccessToken: vi.fn(),
  getCompanyToken: vi.fn(),
  refreshBrowserSession: vi.fn(),
  setBrowserSession: vi.fn()
}));

vi.mock('../sessionCleanup.js', () => ({ clearClientSession }));

describe('authService logout redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPost.mockResolvedValue({ data: { success: true } });
  });

  it('keeps the existing /login default for callers without an override', async () => {
    const { logout } = await import('../authService.js');

    await logout();

    expect(clearClientSession).toHaveBeenCalledWith({
      reason: 'logout',
      broadcast: true,
      emitAuthEvents: true,
      redirectTo: '/login'
    });
  });

  it('uses the requested app sign-in route when supplied', async () => {
    const { logout } = await import('../authService.js');

    await logout({ redirectTo: '/dgfy/auth' });

    expect(clearClientSession).toHaveBeenCalledWith({
      reason: 'logout',
      broadcast: true,
      emitAuthEvents: true,
      redirectTo: '/dgfy/auth'
    });
  });
});
