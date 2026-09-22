import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Components/ moved into packages/web-core (this package). Merchant page ownership moved to
// the POS Back Office; these targets cover the canonical owners rather than retired IMS pages.
const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(webCoreRoot, '../..');
const TARGET_FILES = [
  path.join(webCoreRoot, 'Components/items/ItemCard.jsx'),
  path.join(webCoreRoot, 'Components/items/ItemDetailsModal.jsx'),
  path.join(webCoreRoot, 'Components/items/details/CostFinancialSection.jsx'),
  path.join(webCoreRoot, 'Components/items/details/StockInventorySection.jsx'),
  path.join(webCoreRoot, 'Components/po/POCreateWizard.jsx'),
  path.join(repoRoot, 'apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx'),
  path.join(webCoreRoot, 'src/features/merchantBackOffice/pages/PurchaseOrdersPage.jsx'),
  path.join(webCoreRoot, 'src/features/merchantBackOffice/pages/ReportsPage.jsx')
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
