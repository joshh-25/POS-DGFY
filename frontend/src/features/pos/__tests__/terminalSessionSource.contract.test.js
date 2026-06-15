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
    expect(terminalPageSource).toContain(
      "import { getAccessToken, getCompanyToken, refreshBrowserSession } from '@/services/browserSession.js';"
    );
    expect(terminalPageSource).toContain('refreshBrowserSession()');
    expect(terminalPageSource).toContain('getCompanyToken()');
    expect(terminalPageSource).not.toMatch(/localStorage\.getItem\(['"`](authToken|companyToken)['"`]/);
    expect(terminalPageSource).not.toMatch(/localStorage\.setItem\(['"`](authToken|companyToken)['"`]/);
  });

  it('resolves terminal login tenant from email before trusting the current browser company token', () => {
    expect(terminalPageSource).toContain('const currentCompanyToken = String(getCompanyToken() || \'\').trim();');
    expect(terminalPageSource).toContain('lookupCompanyToken(email, currentCompanyToken)');
    expect(terminalPageSource).toContain('normalizeLookupTenantOptions');
    expect(terminalPageSource).toContain('POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS');
    expect(terminalPageSource).toContain('tenants.some((tenant) => tenant?.company_token === normalizedPreferred)');
    expect(terminalPageSource).toContain('shouldFallbackToCurrentCompanyTokenAfterLookupError(lookupError)');
    expect(terminalPageSource).toContain('resolveTerminalLoginErrorMessage(lookupError)');
  });

  it('does not auto-bind standalone POS dev sessions to the legacy tenant unless explicitly enabled', () => {
    expect(standalonePosMainSource).toContain("import.meta.env.VITE_POS_DEV_AUTO_LOGIN === 'true'");
    expect(standalonePosMainSource).toContain('devAutoLoginCompanyToken');
    expect(standalonePosMainSource).not.toContain('if (import.meta.env.DEV) {');
  });
});
