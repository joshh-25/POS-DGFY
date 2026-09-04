import { describe, expect, it } from 'vitest';

import { SERVICES_PALETTE } from './servicesPalette.js';

describe('SERVICES_PALETTE', () => {
  it('matches the Services storefront template contract', () => {
    expect(SERVICES_PALETTE.primary).toBe('#1A4E8D');
    expect(SERVICES_PALETTE.primaryDark).toBe('#1A4586');
    expect(SERVICES_PALETTE.primaryLight).toBe('#AEE8F4');
    expect(SERVICES_PALETTE.primarySoft).toBe('#EEF6FD');
    expect(SERVICES_PALETTE.warning).toBe('#F59E0B');
    expect(SERVICES_PALETTE.textPrimary).toBe('#0F172A');
  });

  it('does not use the F&B orange or legacy Services teal as its core accent', () => {
    expect(SERVICES_PALETTE.primary).not.toBe('#f97316');
    expect(SERVICES_PALETTE.primary).not.toBe('#0f766e');
  });
});
