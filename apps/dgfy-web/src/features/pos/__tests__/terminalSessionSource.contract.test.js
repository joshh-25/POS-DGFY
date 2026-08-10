import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const terminalPagePath = resolve(__dirname, '../pages/TerminalPage.jsx');
const terminalPageSource = readFileSync(terminalPagePath, 'utf8');
const standalonePosMainPath = resolve(__dirname, '../../../../apps/pos/src/main.jsx');
const standalonePosMainSource = readFileSync(standalonePosMainPath, 'utf8');

describe('TerminalPage session contract', () => {
  it('uses browserSession for protected POS auth state instead of persisted privileged tokens', () => {
    expect(terminalPageSource).toContain("from '@/services/browserSession.js';");
    expect(terminalPageSource).toContain('preparePosCompanySwitchHandoff,');
    expect(terminalPageSource).toContain('refreshBrowserSession()');
    expect(terminalPageSource).toContain('getCompanyToken()');
    expect(terminalPageSource).not.toMatch(/localStorage\.getItem\(['"`](authToken|companyToken)['"`]/);
    expect(terminalPageSource).not.toMatch(/localStorage\.setItem\(['"`](authToken|companyToken)['"`]/);
  });

  it('resolves terminal login tenant from email before trusting the current browser company token', () => {
    expect(terminalPageSource).toContain('const currentCompanyToken = String(getCompanyToken() || \'\').trim();');
    expect(terminalPageSource).toContain('lookupCompanyToken(normalizedIdentifier, currentCompanyToken)');
    expect(terminalPageSource).toContain('normalizeLookupTenantOptions');
    expect(terminalPageSource).toContain('POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS');
    expect(terminalPageSource).toContain('tenants.some((tenant) => tenant?.company_token === normalizedPreferred)');
    expect(terminalPageSource).toContain('shouldFallbackToCurrentCompanyTokenAfterLookupError(lookupError)');
    expect(terminalPageSource).toContain('throw lookupError;');
  });

  it('does not auto-bind standalone POS dev sessions to the legacy tenant unless explicitly enabled', () => {
    expect(standalonePosMainSource).toContain("import.meta.env.VITE_POS_DEV_AUTO_LOGIN === 'true'");
    expect(standalonePosMainSource).toContain('devAutoLoginCompanyToken');
    expect(standalonePosMainSource).not.toContain('if (import.meta.env.DEV) {');
  });

  it('restores dedicated POS app refresh only when browser session and open shift are present', () => {
    expect(terminalPageSource).toContain('refreshBrowserSession()');
    expect(terminalPageSource).toContain('storedReason !== \'shift_closed\'');
    expect(terminalPageSource).toContain('storedReason !== \'terminal_reunlock\'');
    expect(terminalPageSource).toContain('const storedRegistryEntry = terminalRegistryLookup.get(storedTerminalId);');
    expect(terminalPageSource).toContain('operatingLocationIdOverride: storedLocationId');
    expect(terminalPageSource).toContain('allowWhileLocked: true');
    expect(terminalPageSource).toContain('if (operationalContext?.shift) {');
    expect(terminalPageSource).toContain('setLocked(true);');
    expect(terminalPageSource).toContain('setDrawerOpen(true);');
    expect(terminalPageSource).toContain('const shiftOpeningModalOpen = (');
    expect(terminalPageSource).toContain('!drawerOpen');
    expect(terminalPageSource).toContain('requiresOpenShift');
    expect(terminalPageSource).toContain('canViewPos');
  });

  it('falls back to governed legacy POS unlock when DGFY account login rejects tenant-local credentials', () => {
    expect(terminalPageSource).toContain('performLegacyTerminalUnlock({ email, password, selectedTerminalId })');
    expect(terminalPageSource).toContain('if (isCompanyTokenResolutionError(error)) {');
    expect(terminalPageSource).not.toContain('Legacy POS access used. Link this account to DGFY before June 17, 2027.');
    expect(terminalPageSource).toContain('loginWithCredentials(');
    expect(terminalPageSource).toContain('resolveCompanyTokenForEmailIdentifier(email, currentCompanyToken)');
  });

  it('redirects DGFY accounts without accessible businesses back to the customer dashboard instead of leaving them in POS', () => {
    expect(terminalPageSource).toContain("resolveStorefrontAccountUrl } from '@/src/features/dgfyRouteHelpers.js';");
    expect(terminalPageSource).toContain("No registered business was found for this account. Opening your DGFY customer dashboard.");
    expect(terminalPageSource).toContain('window.location.href = resolveStorefrontAccountUrl();');
  });

  it('clears source-company terminal lock state before loading a switched company session', () => {
    expect(terminalPageSource).toContain(
      "setStoredTerminalLock(false);\n        window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);\n        preparePosCompanySwitchHandoff({ tenantId: normalizedTenantId });\n        window.location.assign('/terminal');"
    );
  });

  it('sends onboarding handoff to the dedicated POS app origin when started from IMS', () => {
    expect(terminalPageSource).toContain('resolvePosTerminalUrl');
    expect(terminalPageSource).toContain('const posOnboardingUrl = resolvePosTerminalUrl(POS_ONBOARDING_ENTRY_SEARCH);');
    expect(terminalPageSource).toContain('if (targetUrl.origin !== window.location.origin) {');
    expect(terminalPageSource).toContain('window.location.assign(targetUrl.toString());');
  });
});
