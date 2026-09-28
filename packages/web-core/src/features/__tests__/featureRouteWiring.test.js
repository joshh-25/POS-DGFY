import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const featureItemsPath = path.resolve(__dirname, '../inventory/pages/ItemsPage.jsx');
const featureJobOrdersPath = path.resolve(__dirname, '../jobOrders/pages/JobOrdersPage.jsx');
const featureStockMovementsPath = path.resolve(__dirname, '../stockMovements/pages/StockMovementsPage.jsx');

describe('feature route wiring', () => {
  let featureItemsContent = '';
  let featureJobOrdersContent = '';
  let featureStockMovementsContent = '';

  beforeAll(() => {
    featureItemsContent = fs.readFileSync(featureItemsPath, 'utf8');
    featureJobOrdersContent = fs.readFileSync(featureJobOrdersPath, 'utf8');
    featureStockMovementsContent = fs.readFileSync(featureStockMovementsPath, 'utf8');
  });

  it('prevents feature pages from importing legacy Pages', () => {
    const legacyImportPattern = /from\s+['"][^'"]*Pages\//;
    expect(featureItemsContent).not.toMatch(legacyImportPattern);
    expect(featureJobOrdersContent).not.toMatch(legacyImportPattern);
    expect(featureStockMovementsContent).not.toMatch(legacyImportPattern);
  });

  it('routes jobOrders and stockMovements pages through feature-owned hooks/api', () => {
    expect(featureJobOrdersContent).toContain("from '@/src/features/jobOrders'");
    expect(featureStockMovementsContent).toContain("from '@/src/features/stockMovements'");

    expect(featureJobOrdersContent).not.toContain("from '@/hooks/useJobOrders.js'");
    expect(featureJobOrdersContent).not.toContain("from '@/hooks/useItems.js'");
    expect(featureJobOrdersContent).not.toContain("from '@/services/receiveTokenService.js'");

    expect(featureStockMovementsContent).not.toContain("from '@/hooks/useStockMovements.js'");
    expect(featureStockMovementsContent).not.toContain("from '@/hooks/useItems.js'");
    expect(featureStockMovementsContent).not.toContain("from '@/services/stockMovementService.js'");
  });
});
