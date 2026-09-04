import { describe, expect, it } from 'vitest';
import { shouldRefreshBrowserSessionForPath } from '../publicRoutePolicy.js';

describe('public route session refresh policy', () => {
  it.each([
    '/login',
    '/register',
    '/register-company',
    '/register-company/business',
    '/legal/dgfy-company-terms',
    '/legal/dgfy-marketplace-provider-terms',
    '/privacy',
    '/accept-invite',
    '/reactivate',
    '/admin',
    '/admin/tenants',
    '/admin/dgfy-accounts'
  ])('skips tenant session refresh on public route %s', (path) => {
    expect(shouldRefreshBrowserSessionForPath(path)).toBe(false);
  });

  it.each([
    '/',
    '/items',
    '/settings',
    '/pos',
    '/sales'
  ])('keeps tenant session refresh on protected route %s', (path) => {
    expect(shouldRefreshBrowserSessionForPath(path)).toBe(true);
  });
});
