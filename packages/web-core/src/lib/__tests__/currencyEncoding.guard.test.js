import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Components/ moved into packages/web-core (this package); the Pages/ below did not -- see
// docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const appRoot = path.resolve(webCoreRoot, '../../apps/dgfy-web');
const TARGET_FILES = [
  path.join(webCoreRoot, 'Components/items/ItemCard.jsx'),
  path.join(webCoreRoot, 'Components/items/ItemDetailsModal.jsx'),
  path.join(webCoreRoot, 'Components/items/details/CostFinancialSection.jsx'),
  path.join(webCoreRoot, 'Components/items/details/StockInventorySection.jsx'),
  path.join(webCoreRoot, 'Components/po/POCreateWizard.jsx'),
  path.join(appRoot, 'Pages/Dashboard.jsx'),
  path.join(appRoot, 'Pages/PurchaseOrders.jsx'),
  path.join(appRoot, 'Pages/Reports.jsx')
];

const DISALLOWED_TOKENS = [
  'â‚±',
  'Ã¢â€šÂ±',
  'PHP '
];

describe('currency encoding guard', () => {
  it('does not contain mojibake or legacy PHP currency prefixes in weighted-cost surfaces', () => {
    for (const filePath of TARGET_FILES) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const token of DISALLOWED_TOKENS) {
        expect(content, `${path.basename(filePath)} contains disallowed token "${token}"`).not.toContain(token);
      }
    }
  });
});
