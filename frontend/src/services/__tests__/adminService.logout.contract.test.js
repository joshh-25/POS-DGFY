import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi, logout } from '../adminService.js';

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

  it('posts best-effort admin revoke then clears local token', () => {
    sessionStorage.setItem('admin_token', 'admin-jwt-token');
    const postSpy = vi.spyOn(adminApi, 'post').mockResolvedValue({ data: {} });

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
