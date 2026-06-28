import { describe, expect, it } from '@jest/globals';
import {
  SESSION_COOKIE_NAMES,
  setBearerSessionCookie
} from '../src/utils/browserSessionCookies.js';

describe('POS terminal pairing cookie', () => {
  it('stores pairing authority in an HttpOnly cookie', () => {
    const res = {};
    setBearerSessionCookie(res, SESSION_COOKIE_NAMES.posTerminalPairing, 'pairing-token', {
      maxAgeMs: 30 * 24 * 60 * 60 * 1000
    });

    const pairingCookie = res.__setCookie.find((entry) => entry.startsWith('sku_pos_terminal_pairing='));
    expect(pairingCookie).toContain('HttpOnly');
    expect(pairingCookie).toContain('SameSite=Lax');
    expect(pairingCookie).toContain('Max-Age=2592000');
  });
});
