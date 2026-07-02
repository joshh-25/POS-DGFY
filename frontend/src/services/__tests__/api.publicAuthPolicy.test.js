import { describe, expect, it } from 'vitest';
import { isPublicOrAuthRequest } from '../api.js';

describe('API public authentication policy', () => {
  it.each([
    '/auth/login',
    '/auth/lookup',
    '/dgfy/auth/login'
  ])('does not preflight tenant refresh for %s', (path) => {
    expect(isPublicOrAuthRequest(path)).toBe(true);
  });

  it('keeps protected tenant requests refreshable', () => {
    expect(isPublicOrAuthRequest('/users/me')).toBe(false);
  });
});
