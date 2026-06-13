import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const terminalPagePath = resolve(__dirname, '../pages/TerminalPage.jsx');
const terminalPageSource = readFileSync(terminalPagePath, 'utf8');

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
});
