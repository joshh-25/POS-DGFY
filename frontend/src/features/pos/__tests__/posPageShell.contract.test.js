import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('POS page shell and route ownership', () => {
  it('keeps both checkout identities on one shared POS shell', () => {
    const sharedShell = read('frontend/src/features/pos/pages/PosPageShell.jsx');
    const posPage = read('frontend/src/features/pos/pages/POSPage.jsx');
    const skupervisorPage = read('frontend/src/features/pos/pages/SkupervisorPOSPage.jsx');

    expect(sharedShell).toContain('export default function PosPageShell');
    expect(posPage).toContain("lazy(() => import('../components/POSCheckoutTerminal.jsx'))");
    expect(skupervisorPage).toContain("lazy(() => import('../components/SkupervisorPOSCheckoutTerminal.jsx'))");
    expect(sharedShell).toContain('<CheckoutTerminal canViewHistory={canViewPos} fnbContext={fnbCheckoutContext} />');
    expect(posPage).not.toContain('ServicesPosQueue');
    expect(skupervisorPage).not.toContain('ServicesPosQueue');
  });

  it('redirects the legacy feedback route and documents integrated versus dedicated POS routes', () => {
    const main = read('frontend/src/main.jsx');

    expect(main).toContain('path="/admin/feedback-old" element={<Navigate to="/admin/feedback" replace />}');
    expect(main).not.toContain('FeedbackViewer');
    expect(main).toContain('Integrated POS inside the authenticated SKUpervisor application shell.');
    expect(main).toContain('Dedicated POS application surface; intentionally leaves the IMS shell.');
  });
});
