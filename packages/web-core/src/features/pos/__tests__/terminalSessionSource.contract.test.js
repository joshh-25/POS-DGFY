import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const terminalPagePath = resolve(__dirname, '../pages/TerminalPage.jsx');
const terminalPageSource = readFileSync(terminalPagePath, 'utf8');
const terminalCompanyAccessSource = readFileSync(
  resolve(__dirname, '../utils/posTerminalCompanyAccess.js'),
  'utf8'
);
const standalonePosMainPath = resolve(__dirname, '../../../../../../apps/dgfy-web/apps/pos/src/main.jsx');
const standalonePosMainSource = readFileSync(standalonePosMainPath, 'utf8');

describe('TerminalPage session contract', () => {
  it('uses browserSession for protected POS auth state instead of persisted privileged tokens', () => {
    expect(terminalPageSource).toContain("from '@/services/browserSession.js';");
    expect(terminalPageSource).toContain('preparePosCompanySwitchHandoff,');
    expect(terminalPageSource).toContain('consumePosDgfyTenantHandoff,');
    expect(terminalPageSource).toContain('getFreshPosCompanySwitchHandoff,');
    expect(terminalPageSource).toContain('refreshBrowserSession()');
    expect(terminalPageSource).toContain('getCompanyToken()');
    expect(terminalPageSource).not.toMatch(/localStorage\.getItem\(['"`](authToken|companyToken)['"`]/);
    expect(terminalPageSource).not.toMatch(/localStorage\.setItem\(['"`](authToken|companyToken)['"`]/);
  });

  it('resolves terminal login tenant from email before trusting the current browser company token', () => {
    expect(terminalPageSource).toContain('const currentCompanyToken = String(getCompanyToken() || \'\').trim();');
    expect(terminalPageSource).toContain('lookupCompanyToken(normalizedIdentifier, currentCompanyToken)');
    expect(terminalCompanyAccessSource).toContain('normalizeLookupTenantOptions');
    expect(terminalCompanyAccessSource).toContain('POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS');
    expect(terminalCompanyAccessSource).toContain('tenants.some((tenant) => tenant?.company_token === normalizedPreferred)');
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
    expect(terminalPageSource).toContain('const storedRegistryEntry = restoreTerminalRegistry.find(');
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

  it('hydrates the terminal registry before restoring a saved cashier terminal and relocks the live shell when it is invalid', () => {
    expect(terminalPageSource).toContain('const terminalBootstrap = await hydrateTerminalMeta({ suppressGlobalErrors: true });');
    expect(terminalPageSource).toContain('terminalBootstrap?.registry');
    expect(terminalPageSource).toContain('canViewPosOverride: userCanViewPos');
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('full_auth');");
    expect(terminalPageSource).toMatch(
      /setStoredTerminalLockReason\('full_auth'\);[\s\S]*setLocked\(true\);[\s\S]*setDrawerOpen\(true\);/
    );
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

  it('accepts a fresh DGFY Business POS handoff only long enough to clear stale terminal-local state and verify its tenant', () => {
    expect(terminalPageSource).toContain('const dgfyTenantHandoff = consumePosDgfyTenantHandoff();');
    expect(terminalPageSource).toContain('const companySwitchHandoff = getFreshPosCompanySwitchHandoff();');
    expect(terminalPageSource).toContain("String(dgfyTenantHandoff?.tenantId || companySwitchHandoff?.tenantId || '').trim()");
    expect(terminalPageSource).toContain("window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);");
    expect(terminalPageSource).toContain("setActiveTerminalId('');");
    expect(terminalPageSource).toContain('setOperatingLocationId(null);');
    expect(terminalPageSource).toContain("setFormData((prev) => ({ ...prev, terminalId: '' }));");
    expect(terminalPageSource).toContain("dgfyTenantId ? '' : (readStoredTerminalId() || activeTerminalId)");
    expect(terminalPageSource).toContain("if (!dgfyTenantId && storedLockActiveAtStart && ['full_auth', 'shift_closed'].includes(storedReasonAtStart))");
    expect(terminalPageSource).toContain("String(user?.company?.id || '').trim() !== dgfyTenantId");
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('full_auth');");
  });

  it('sends a verified DGFY cashier handoff into the same terminal shift-entry flow as direct POS login', () => {
    expect(terminalPageSource).toContain('if (IS_DGFY_POS_SURFACE && dgfyTenantId && !userCanAccessSettings) {');
    expect(terminalPageSource).toContain('fetchPosSettingsBootstrap(SUPPRESS_GLOBAL_ERROR_TOAST)');
    expect(terminalPageSource).toContain('fetchCurrentTerminalShift({}, SUPPRESS_GLOBAL_ERROR_TOAST)');
    expect(terminalPageSource).toContain("source: 'dgfy_pos'");
    expect(terminalPageSource).toContain("setTerminalUnlockMode('resume_shift');");
    expect(terminalPageSource).toContain("setTerminalUnlockMode('shift_start');");
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('shift_start_required');");
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(true);');
  });

  it('fails closed when the DGFY handoff cannot determine the cashier active shift', () => {
    expect(terminalPageSource).toContain('resolveActiveShiftResumeDecision({');
    expect(terminalPageSource).not.toMatch(
      /fetchCurrentTerminalShift\(\{\}, SUPPRESS_GLOBAL_ERROR_TOAST\)\.catch/
    );
    expect(terminalPageSource).toContain("flow: 'terminal_session_restore'");
    expect(terminalPageSource).toContain('throw new Error(activeShiftDecision.message);');
    expect(terminalPageSource).toContain('throw new Error(currentShiftDecision.message);');
    expect(terminalPageSource).toContain('throw new Error(selectedActiveShiftDecision.message);');
  });


  it('sends onboarding handoff to the dedicated POS app origin when started from IMS', () => {
    expect(terminalPageSource).toContain('resolvePosTerminalUrl');
    expect(terminalPageSource).toContain('const posOnboardingUrl = resolvePosTerminalUrl(POS_ONBOARDING_ENTRY_SEARCH);');
    expect(terminalPageSource).toContain('if (targetUrl.origin !== window.location.origin) {');
    expect(terminalPageSource).toContain('window.location.assign(targetUrl.toString());');
  });

  it('mounts the DGFY SSO handoff routes inside the standalone POS HashRouter', () => {
    expect(standalonePosMainSource).toContain('const DgfyAuthPage = lazy(() => import(\'../../../../../packages/web-core/Pages/DgfyAuthPage.jsx\'));');
    expect(standalonePosMainSource).toContain('const DgfyCompanySelect = lazy(() => import(\'../../../../../packages/web-core/Pages/DgfyCompanySelect.jsx\'));');
    expect(standalonePosMainSource).toContain('<Route path="/dgfy/auth" element={<DgfyAuthPage />} />');
    expect(standalonePosMainSource).toContain('<Route path="/dgfy/companies" element={<DgfyCompanySelect targetSurface="pos" />} />');
  });
});
