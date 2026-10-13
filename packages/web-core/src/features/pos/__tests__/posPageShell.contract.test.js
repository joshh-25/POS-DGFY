import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('POS page shell and route ownership', () => {
  it('keeps both checkout identities on one shared POS shell', () => {
    const sharedShell = read('packages/web-core/src/features/pos/pages/PosPageShell.jsx');
    const posPage = read('packages/web-core/src/features/pos/pages/POSPage.jsx');
    const skupervisorPage = read('packages/web-core/src/features/pos/pages/SkupervisorPOSPage.jsx');

    expect(sharedShell).toContain('export default function PosPageShell');
    expect(posPage).toContain("lazyWithChunkRetry(() => import('../components/POSCheckoutTerminal.jsx'))");
    expect(skupervisorPage).toContain("lazyWithChunkRetry(() => import('../components/SkupervisorPOSCheckoutTerminal.jsx'))");
    expect(sharedShell).toContain('<CheckoutTerminal canViewHistory={canViewPos} fnbContext={fnbCheckoutContext} />');
    expect(posPage).not.toContain('ServicesPosQueue');
    expect(skupervisorPage).not.toContain('ServicesPosQueue');
  });

  it('routes the customer-display chunk through stale-build recovery', () => {
    const main = read('apps/dgfy-pos/src/main.jsx');

    expect(main).toContain("const CustomerDisplayPage = lazyWithChunkRetry(() => import('../../../packages/web-core/src/features/pos/pages/CustomerDisplayPage.jsx'));");
  });

  it('keeps IMS merchant routes as compatibility handoffs while preserving internal admin routing', () => {
    const main = read('apps/dgfy-ims/src/main.jsx');

    expect(main).toContain('path="/admin/feedback-old" element={<Navigate to="/admin/feedback" replace />}');
    expect(main).toContain("import MerchantSurfaceRetired from './pages/MerchantSurfaceRetired.jsx'");
    expect(main).toContain('path="/items" element={<LegacyMerchantRoute target="/backoffice/catalog" title="Catalog workspace moved" />}');
    expect(main).not.toContain('FeedbackViewer');
    expect(main).not.toContain("const TerminalPage = lazy(() => import('../../../packages/web-core/src/features/pos/pages/TerminalPage.jsx'))");
    expect(main).not.toContain("const Items = lazy(() => import('../../../packages/web-core/src/features/inventory/pages/ItemsPage.jsx'))");
  });
});
