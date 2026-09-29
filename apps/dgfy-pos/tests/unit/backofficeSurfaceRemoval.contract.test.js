import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(posRoot, '../..');

const readRepositoryFile = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

describe('POS administration and OPIS Back Office coexistence contract', () => {
  it('uses one shared shell, keeps POS on its native route, and has no OPIS route target', () => {
    expect(fs.existsSync(path.join(posRoot, 'src/features/businessAdmin'))).toBe(false);
    expect(fs.existsSync(path.join(repositoryRoot, 'packages/web-core/src/features/businessAdmin/BusinessAdminPage.jsx'))).toBe(true);

    const posEntry = readRepositoryFile('apps/dgfy-pos/src/main.jsx');
    const posSidebar = readRepositoryFile('packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx');
    const opisEntry = readRepositoryFile('apps/dgfy-opis/src/main.jsx');

    expect(posEntry).toContain('src/features/businessAdmin/BusinessAdminPage.jsx');
    expect(posEntry).toContain('<Route path="/business-admin/*" element={<BusinessAdminPage surface="pos" />} />');
    expect(posEntry).not.toContain('<Route path="/backoffice/*"');
    expect(posSidebar).toContain('pos-nav-business-admin');
    expect(posSidebar).not.toContain('Open the dedicated DGFY Back Office');
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
