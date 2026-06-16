import { describe, expect, it } from 'vitest';
import {
  POS_TERMINAL_LOGIN_ERROR_CODES,
  createTerminalLoginError,
  isCompanyTokenResolutionError,
  normalizeLookupTenantOptions,
  resolveTerminalLoginErrorMessage,
  shouldFallbackToCurrentCompanyTokenAfterLookupError
} from '../terminalUnlockDiagnostics.js';

const apiError = ({ status, data = {}, url = '/auth/login', message = 'Request failed' } = {}) => ({
  message,
  response: status ? { status, data } : undefined,
  config: { url }
});

const apiErrorWithHeaders = ({ status, data = {}, headers = {}, url = '/auth/login' } = {}) => ({
  message: 'Request failed',
  response: status ? { status, data, headers } : undefined,
  config: { url }
});

describe('terminal unlock diagnostics', () => {
  it('normalizes single and multi-tenant lookup payloads', () => {
    expect(normalizeLookupTenantOptions({ company_token: 'token-space' })).toEqual([
      { company_token: 'token-space' }
    ]);
    expect(normalizeLookupTenantOptions({
      multiple: true,
      tenants: [{ company_token: 'token-a' }, { company_token: 'token-b' }]
    })).toHaveLength(2);
    expect(normalizeLookupTenantOptions({ tenants: [{ company_token: 'ignored' }] })).toEqual([]);
  });

  it('only falls back to the current company token after transient lookup failures', () => {
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError())).toBe(true);
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError({ status: 503 }))).toBe(true);
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError({ status: 404 }))).toBe(false);
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError({ status: 429 }))).toBe(false);
  });

  it('detects tenant token resolution failures from login responses', () => {
    expect(isCompanyTokenResolutionError(apiError({
      status: 404,
      data: { message: 'Company token tenant not found' }
    }))).toBe(true);
    expect(isCompanyTokenResolutionError(apiError({
      status: 400,
      data: { message: 'Company token is required' }
    }))).toBe(true);
    expect(isCompanyTokenResolutionError(apiError({
      status: 401,
      data: { message: 'Invalid email or password' }
    }))).toBe(false);
  });

  it('maps login failures to POS-specific operator messages', () => {
    expect(resolveTerminalLoginErrorMessage(apiError({ status: 401 }))).toBe('Invalid email or password.');
    expect(resolveTerminalLoginErrorMessage(apiError({ status: 404 }))).toBe(
      'No company is registered for this POS login email. Check the email or sign in from SKUpervisor first.'
    );
    expect(resolveTerminalLoginErrorMessage(apiError({ status: 429 }))).toBe(
      'Too many terminal login attempts. Wait a moment, then try again.'
    );
    expect(resolveTerminalLoginErrorMessage(apiErrorWithHeaders({
      status: 429,
      data: { retryAfterSeconds: 125 }
    }))).toBe('Too many terminal login attempts. Try again in about 3 minutes.');
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 403,
      data: { message: 'Missing pos:view permission' }
    }))).toBe('Your account does not have permission to unlock or operate this POS terminal.');
  });

  it('preserves multi-tenant and capability-block diagnostics', () => {
    const multipleTenantError = createTerminalLoginError(
      'This email belongs to multiple companies. Sign in from SKUpervisor once, then reopen POS for the selected company.',
      POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS
    );
    expect(resolveTerminalLoginErrorMessage(multipleTenantError)).toContain('multiple companies');

    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 403,
      data: {
        code: 'TENANT_CAPABILITY_DISABLED',
        capability: 'tenant_pos_enabled'
      }
    }))).toContain('POS access is disabled for this company.');
  });

  it('classifies the optional device bridge separately from login failure', () => {
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 503,
      url: '/pos/device/status'
    }))).toBe(
      'The receipt printer/cash drawer bridge is unavailable. Login can continue, but hardware controls stay disabled until the bridge is running.'
    );
  });
});
