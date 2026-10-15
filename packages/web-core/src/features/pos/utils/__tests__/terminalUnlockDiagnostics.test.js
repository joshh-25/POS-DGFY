import { describe, expect, it } from 'vitest';
import {
  POS_TERMINAL_LOGIN_ERROR_CODES,
  classifyTerminalLoginFailure,
  createTerminalLoginError,
  extractTerminalShiftConflictDetails,
  isRetryableCompanyLookupError,
  isCompanyTokenResolutionError,
  normalizeLookupTenantOptions,
  resolveTerminalLoginErrorMessage,
  scopeDgfyCompaniesToEmailLookup,
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

  it('scopes DGFY company choices to the entered email lookup when identifiers overlap', () => {
    const availableCompanies = [
      { tenant_id: 'masu-tenant', company_token: 'token-masu', name: 'Masu Cafe' },
      { tenant_id: 'second-tenant', company_token: 'token-second', name: 'Second Company' }
    ];

    expect(scopeDgfyCompaniesToEmailLookup(availableCompanies, {
      email: 'gutojoshua.hubomoto@gmail.com',
      lookup: {
        status: 'single',
        email: 'GUTOJOSHUA.HUBOMOTO@GMAIL.COM',
        companies: [{ tenant_id: 'masu-tenant', company_token: 'token-masu' }]
      }
    })).toEqual([availableCompanies[0]]);
  });

  it('keeps the authenticated DGFY company list when the lookup is unavailable or unrelated', () => {
    const availableCompanies = [
      { tenant_id: 'masu-tenant', company_token: 'token-masu' },
      { tenant_id: 'second-tenant', company_token: 'token-second' }
    ];

    expect(scopeDgfyCompaniesToEmailLookup(availableCompanies, {
      email: 'gutojoshua.hubomoto@gmail.com',
      lookup: { status: 'loading', email: 'gutojoshua.hubomoto@gmail.com', companies: [] }
    })).toBe(availableCompanies);
    expect(scopeDgfyCompaniesToEmailLookup(availableCompanies, {
      email: 'different@example.com',
      lookup: {
        status: 'single',
        email: 'gutojoshua.hubomoto@gmail.com',
        companies: [{ tenant_id: 'masu-tenant', company_token: 'token-masu' }]
      }
    })).toBe(availableCompanies);
    expect(scopeDgfyCompaniesToEmailLookup(availableCompanies, {
      email: 'gutojoshua.hubomoto@gmail.com',
      lookup: {
        status: 'single',
        email: 'gutojoshua.hubomoto@gmail.com',
        companies: [{ tenant_id: 'unknown-tenant', company_token: 'token-unknown' }]
      }
    })).toBe(availableCompanies);
  });

  it('only falls back to the current company token after transient lookup failures', () => {
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError())).toBe(true);
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError({ status: 503 }))).toBe(true);
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError({ status: 404 }))).toBe(false);
    expect(shouldFallbackToCurrentCompanyTokenAfterLookupError(apiError({ status: 429 }))).toBe(false);
  });

  it('retries company lookup during backend cold starts but stops on deterministic client errors', () => {
    expect(isRetryableCompanyLookupError(apiError())).toBe(true);
    expect(isRetryableCompanyLookupError(apiError({ status: 503 }))).toBe(true);
    expect(isRetryableCompanyLookupError(apiError({ status: 429 }))).toBe(false);
    expect(isRetryableCompanyLookupError(apiError({ status: 404 }))).toBe(false);
    expect(isRetryableCompanyLookupError(apiError({ status: 400 }))).toBe(false);
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
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 401,
      url: '/dgfy/account/companies/tenant-1/pos-session',
      data: { message: 'Terminal password is incorrect.' }
    }))).toBe('Terminal password is incorrect.');
    expect(resolveTerminalLoginErrorMessage(apiError({ status: 404 }))).toBe(
      'No company is registered for this POS login email. Check the email or sign in from SKUpervisor first.'
    );
    expect(resolveTerminalLoginErrorMessage(apiError({ status: 429 }))).toBe(
      'Too many terminal login attempts. Wait a moment, then try again.'
    );
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 403,
      data: {
        error_code: 'CSRF_TOKEN_REQUIRED',
        message: 'CSRF token is required for cookie-authenticated requests.'
      },
      url: '/dgfy/auth/tenant-session'
    }))).toBe('CSRF token is required for cookie-authenticated requests.');
    expect(resolveTerminalLoginErrorMessage(apiErrorWithHeaders({
      status: 429,
      data: { retryAfterSeconds: 125 }
    }))).toBe('Too many terminal login attempts. Try again in about 3 minutes.');
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 403,
      data: { message: 'Missing pos:view permission' }
    }))).toBe('Your account does not have permission to unlock or operate this POS terminal.');
  });

  it('does not misreport terminal pairing failures as invalid credentials', () => {
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 401,
      url: '/pos/terminal/paired',
      data: { message: 'This POS device pairing is missing, expired, or no longer valid.' }
    }))).toBe('The registered terminal session is missing or expired. Select the terminal again and continue.');
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 401,
      url: '/pos/terminal/pair',
      data: { message: 'No company token provided.' }
    }))).toBe('The selected business session is missing or expired. Select the company and continue again.');
  });

  it('keeps cashier credential failures explicit', () => {
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 401,
      url: '/pos/auth/cashier-login',
      data: { message: 'Invalid username/email or password' }
    }))).toBe('Invalid cashier username/email or password.');
  });

  it('preserves multi-tenant and capability-block diagnostics', () => {
    const multipleTenantError = createTerminalLoginError(
      'This email belongs to multiple companies. Select the company to continue.',
      POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS
    );
    expect(resolveTerminalLoginErrorMessage(multipleTenantError)).toContain('multiple companies');
    expect(resolveTerminalLoginErrorMessage(multipleTenantError)).not.toContain('SKUpervisor');

    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 403,
      data: {
        code: 'TENANT_CAPABILITY_DISABLED',
        capability: 'tenant_pos_enabled'
      }
    }))).toContain('POS access is disabled for this company.');
  });

  it('classifies the optional device bridge separately from login failure', () => {
    // A terminal with no hardware configured never reaches this branch — it's
    // a normal 200 from /pos/device/status (ADR 0053). This 503 only fires
    // when a driver IS configured but genuinely unreachable.
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 503,
      url: '/pos/device/status'
    }))).toBe(
      'The configured receipt printer/cash drawer bridge is unavailable. Login can continue; printing will report the failure when attempted.'
    );
  });

  it('preserves actionable backend errors for shift operations', () => {
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 500,
      url: '/pos/terminal/shifts/open',
      data: { message: 'This terminal already has an active shift.' }
    }))).toBe('This terminal already has an active shift.');
  });

  it('extracts the existing shift details from the cross-location conflict', () => {
    expect(extractTerminalShiftConflictDetails(apiError({
      status: 409,
      url: '/pos/terminal/shifts/open',
      data: {
        message: 'This cashier is already active at another register or location.',
        errors: {
          reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE',
          existing_terminal_id: 'john-01',
          existing_location_id: 1,
          existing_shift_id: 151,
          existing_opened_at: '2026-10-14T08:30:00.000Z'
        }
      }
    }))).toEqual({
      existingShiftId: 151,
      existingTerminalId: 'JOHN-01',
      existingLocationId: 1,
      existingOpenedAt: '2026-10-14T08:30:00.000Z'
    });
  });

  it('does not offer resume details for unrelated conflicts', () => {
    expect(extractTerminalShiftConflictDetails(apiError({
      status: 409,
      data: { errors: { reason_code: 'POS_TARGET_TERMINAL_OCCUPIED' } }
    }))).toBeNull();
  });

  it('does not show a shift-resume action for an attendance-only conflict', () => {
    expect(extractTerminalShiftConflictDetails(apiError({
      status: 409,
      data: {
        errors: {
          reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE',
          existing_location_id: 9
        }
      }
    }))).toBeNull();
  });

  it('preserves actionable local shift ownership errors', () => {
    expect(resolveTerminalLoginErrorMessage({
      message: 'Terminal COUNTER-01 is already in use by another cashier. Supervisor assistance is required.',
      config: { url: '/pos/terminal/shifts/current' }
    })).toBe('Terminal COUNTER-01 is already in use by another cashier. Supervisor assistance is required.');
  });

  it('does not misclassify generic server failures as connection outages', () => {
    expect(resolveTerminalLoginErrorMessage(apiError({
      status: 500,
      url: '/pos/terminal/shifts/open'
    }))).toBe(
      'The POS backend could not complete the request. Try again or contact an administrator if the problem continues.'
    );
  });

  it('does not misreport a locally-thrown occupancy/session error as a network outage', () => {
    // No `.response`, no transport `.code`, no `.request` -- exactly the
    // shape of `throw new Error(...)` in TerminalPage.jsx's unlock/shift
    // handlers (e.g. terminalShiftEntryDecision's "already in use" throw).
    const localError = new Error('Terminal COUNTER-01 is already in use by another cashier. Supervisor assistance is required.');
    expect(resolveTerminalLoginErrorMessage(localError)).toBe(
      'Terminal COUNTER-01 is already in use by another cashier. Supervisor assistance is required.'
    );
    expect(classifyTerminalLoginFailure(localError)).toEqual({
      kind: 'local',
      status: null,
      requestPath: '',
      code: ''
    });
  });

  it('falls back to a generic sign-in message for a local error with no message', () => {
    expect(resolveTerminalLoginErrorMessage(new Error())).toBe('Unable to sign in to terminal.');
  });

  it('still reports genuine transport failures as an unreachable backend', () => {
    const networkError = {
      name: 'AxiosError',
      code: 'ERR_NETWORK',
      message: 'Network Error',
      request: {},
      config: { url: '/pos/terminal/shifts/open' }
    };
    expect(resolveTerminalLoginErrorMessage(networkError)).toBe(
      'Unable to reach the POS backend. Check the server connection and try again.'
    );
    expect(classifyTerminalLoginFailure(networkError)).toEqual({
      kind: 'network',
      status: null,
      requestPath: '/pos/terminal/shifts/open',
      code: 'ERR_NETWORK'
    });

    const timeoutError = {
      name: 'AxiosError',
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded',
      request: {},
      config: { url: '/pos/auth/cashier-login' }
    };
    expect(resolveTerminalLoginErrorMessage(timeoutError)).toBe(
      'Unable to reach the POS backend. Check the server connection and try again.'
    );
    expect(classifyTerminalLoginFailure(timeoutError).kind).toBe('network');
  });

  it('classifies a genuine HTTP failure distinctly from network and local failures', () => {
    expect(classifyTerminalLoginFailure(apiError({ status: 401, url: '/auth/login' }))).toEqual({
      kind: 'http',
      status: 401,
      requestPath: '/auth/login',
      code: ''
    });
  });
});
