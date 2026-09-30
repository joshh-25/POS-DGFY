import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(posRoot, '../..');

const readRepositoryFile = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

describe('production POS surface boundary contract', () => {
  it('does not register Back Office routes or expose OPIS handoffs', () => {
    expect(fs.existsSync(path.join(repositoryRoot, 'packages/web-core/src/features/merchantBackOffice'))).toBe(true);

    const posEntry = readRepositoryFile('apps/dgfy-pos/src/main.jsx');
    const posSidebar = readRepositoryFile('packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx');
    const opisEntry = readRepositoryFile('apps/dgfy-opis/src/main.jsx');

    expect(posEntry).not.toMatch(/BusinessAdminPage|BackOfficeLoginPage|backoffice|business-admin|opis/i);
    expect(posEntry).toContain('<Route path="/sales" element={<SkupervisorSalesRedirect />} />');
    expect(posSidebar).not.toMatch(/Back Office|OPIS|pos-nav-backoffice/i);
    expect(opisEntry).toContain("const BusinessAdminPage = lazy(() => import('./features/businessAdmin/BusinessAdminPage.jsx'));");
  });

  it('keeps the standalone terminal, checkout, and reports routes wired', () => {
    const posEntry = readRepositoryFile('apps/dgfy-pos/src/main.jsx');
    const terminalLayout = readRepositoryFile('packages/web-core/src/features/pos/components/TerminalPageLayout.jsx');
    const terminalOperations = readRepositoryFile('packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx');

    expect(posEntry).toContain('import TerminalPage from');
    expect(posEntry).toContain('<Route path="/terminal" element={<TerminalPage />} />');
    expect(terminalLayout).toContain("import('./POSCheckoutTerminal.jsx')");
    expect(terminalOperations).toContain("const PosReportsAnalyticsWorkspace = lazyWithChunkRetry(() => import('./PosReportsAnalyticsWorkspace.jsx'));");
  });
});
