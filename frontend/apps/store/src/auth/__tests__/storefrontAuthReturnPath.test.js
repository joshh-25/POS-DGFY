/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { sanitizeStorefrontReturnPath, toInternalReturnPath } from '../storefrontAuthReturnPath.js';

// sanitizeStorefrontReturnPath now delegates to the shared
// sanitizeInternalReturnPath (frontend/src/features/dgfyRouteHelpers.js),
// which SKUpervisor's DgfyCompanySelect.jsx also uses. These lock in the
// storefront's own default block list (login/register/reset-password)
// survived that refactor unchanged.
describe('sanitizeStorefrontReturnPath', () => {
  it('rejects protocol-relative and absolute targets', () => {
    expect(sanitizeStorefrontReturnPath('//evil.test/x')).toBe('/');
    expect(sanitizeStorefrontReturnPath('https://evil.test/x')).toBe('/');
  });

  it('rejects a loop back into the storefront auth routes', () => {
    expect(sanitizeStorefrontReturnPath('/login')).toBe('/');
    expect(sanitizeStorefrontReturnPath('/register')).toBe('/');
    expect(sanitizeStorefrontReturnPath('/reset-password?x=1')).toBe('/');
  });

  it('accepts a same-origin path with query and hash', () => {
    expect(sanitizeStorefrontReturnPath('/map-dgfy/account?tab=orders#top')).toBe('/map-dgfy/account?tab=orders#top');
  });

  it('honors a caller-supplied fallback', () => {
    expect(sanitizeStorefrontReturnPath('//evil.test', '/map-dgfy/account')).toBe('/map-dgfy/account');
  });
});

describe('toInternalReturnPath', () => {
  it('collapses an absolute URL to its path/search/hash, discarding the origin', () => {
    expect(toInternalReturnPath('https://dgfy.ph/map-dgfy/account?tab=orders')).toBe('/map-dgfy/account?tab=orders');
  });

  it('passes a same-origin path through unchanged', () => {
    expect(toInternalReturnPath('/business/grow')).toBe('/business/grow');
  });

  it('resolves a bare (non-absolute, non-slash) target as a relative path against the current origin', () => {
    expect(toInternalReturnPath('not-a-route')).toBe('/not-a-route');
  });

  it('falls back on an empty target', () => {
    expect(toInternalReturnPath('')).toBe('/');
  });
});
