import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_FILES = [
  'Components/items/ItemCard.jsx',
  'Components/items/ItemDetailsModal.jsx',
  'Components/items/details/CostFinancialSection.jsx',
  'Components/items/details/StockInventorySection.jsx',
  'Components/po/POCreateWizard.jsx',
  'Pages/Dashboard.jsx',
  'Pages/PurchaseOrders.jsx',
  'Pages/Reports.jsx'
].map((relativePath) => path.join(ROOT, relativePath));

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
