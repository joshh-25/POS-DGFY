/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGuestCheckoutOtp } from '../shared/checkout/hooks/useGuestCheckoutOtp.js';

// #846: handleRequestGuestCheckoutOtp(emailOverride) previously trusted emailOverride's presence
// without checking its type -- a bare `onClick={onRequestCode}` (no arrow wrapper) passes the
// click SyntheticEvent as emailOverride, and String(event) coerces to "[object Object]", which
// then reached the OTP request body as the email. Fixed at every call site AND guarded here.
describe('useGuestCheckoutOtp -- emailOverride type guard (#846)', () => {
  const buildHook = ({ requestJson }) => renderHook(() => useGuestCheckoutOtp({
    customerEmail: 'shopper@example.com',
    isDgfyCustomerSignedIn: false,
    requestJson,
    selectedStore: { slug: 'demo-store' },
    toast: { success: vi.fn(), error: vi.fn() }
  }));

  it('falls back to customerEmail when emailOverride is a non-string object (e.g. a click event)', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const { result } = buildHook({ requestJson });

    await act(async () => {
      await result.current.handleRequestGuestCheckoutOtp({ type: 'click', target: {} });
    });

    expect(requestJson).toHaveBeenCalledTimes(1);
    const [, options] = requestJson.mock.calls[0];
    expect(options.body.email).toBe('shopper@example.com');
    expect(options.body.email).not.toContain('object');
  });

  it('still accepts a genuine string emailOverride', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const { result } = buildHook({ requestJson });

    await act(async () => {
      await result.current.handleRequestGuestCheckoutOtp('override@example.com');
    });

    const [, options] = requestJson.mock.calls[0];
    expect(options.body.email).toBe('override@example.com');
  });

  it('falls back to customerEmail when called with no arguments (the correct call-site shape)', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const { result } = buildHook({ requestJson });

    await act(async () => {
      await result.current.handleRequestGuestCheckoutOtp();
    });

    const [, options] = requestJson.mock.calls[0];
    expect(options.body.email).toBe('shopper@example.com');
  });
});
