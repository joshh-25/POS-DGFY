import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi, isAuthenticated, login, logout } from '../adminService.js';

describe('adminService logout contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts best-effort admin revoke then clears the cookie session', async () => {
    const postSpy = vi.spyOn(adminApi, 'post')
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: {} });

    await login('admin', 'password');
    expect(isAuthenticated()).toBe(true);

    logout();

    // Admin sessions are cookie-based (ADR 0026); the cookie-session marker
    // is what getToken() returns while authenticated, not a real credential.
    expect(postSpy).toHaveBeenCalledWith(
      '/admin/logout',
      {},
      expect.objectContaining({
        headers: { Authorization: 'Bearer cookie-session' },
        skipGlobalErrorToast: true
      })
    );
    expect(isAuthenticated()).toBe(false);
  });
});
