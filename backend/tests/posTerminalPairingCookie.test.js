import { describe, expect, it, jest } from '@jest/globals';
import { SESSION_COOKIE_NAMES, setBearerSessionCookie } from '../src/utils/browserSessionCookies.js';

describe('POS terminal pairing cookie', () => {
  it('is HttpOnly, Lax scoped, and unavailable to JavaScript', () => {
    const res = { getHeader: jest.fn(), setHeader: jest.fn() };
    setBearerSessionCookie(res, SESSION_COOKIE_NAMES.posTerminalPairing, 'pairing-token', { maxAgeMs: 60_000 });
    const cookie = res.setHeader.mock.calls[0][1][0];
    expect(cookie).toContain('sku_pos_terminal_pairing=pairing-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });
});
