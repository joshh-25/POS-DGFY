import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi, login, logout } from '../adminService.js';

const sessionStorageMock = (() => {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true
});

describe('adminService logout contract', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts best-effort admin revoke then clears memory token', async () => {
    const postSpy = vi.spyOn(adminApi, 'post')
      .mockResolvedValueOnce({ data: { success: true, token: 'admin-jwt-token' } })
      .mockResolvedValueOnce({ data: {} });

    await login('admin', 'password');

    logout();

    expect(postSpy).toHaveBeenCalledWith(
      '/admin/logout',
      {},
      expect.objectContaining({
        headers: { Authorization: 'Bearer admin-jwt-token' },
        skipGlobalErrorToast: true
      })
    );
    expect(sessionStorage.getItem('admin_token')).toBeNull();
  });
});
