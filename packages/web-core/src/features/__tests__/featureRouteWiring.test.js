import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/src/main.jsx');
const legacyItemsPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/Pages/Items.jsx');
const legacyJobOrdersPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/Pages/JobOrders.jsx');
const legacyStockMovementsPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/Pages/StockMovements.jsx');
const featureItemsPath = path.resolve(__dirname, '../inventory/pages/ItemsPage.jsx');
const featureJobOrdersPath = path.resolve(__dirname, '../jobOrders/pages/JobOrdersPage.jsx');
const featureStockMovementsPath = path.resolve(__dirname, '../stockMovements/pages/StockMovementsPage.jsx');

describe('feature route wiring', () => {
  let mainContent = '';
  let legacyStockMovementsContent = '';
  let featureItemsContent = '';
  let featureJobOrdersContent = '';
  let featureStockMovementsContent = '';

  beforeAll(() => {
    mainContent = fs.readFileSync(mainPath, 'utf8');
    legacyStockMovementsContent = fs.readFileSync(legacyStockMovementsPath, 'utf8');
    featureItemsContent = fs.readFileSync(featureItemsPath, 'utf8');
    featureJobOrdersContent = fs.readFileSync(featureJobOrdersPath, 'utf8');
    featureStockMovementsContent = fs.readFileSync(featureStockMovementsPath, 'utf8');
  });

  it('loads Items page from inventory feature path', () => {
    expect(mainContent).toContain("const Items = lazy(() => import('../../../packages/web-core/src/features/inventory/pages/ItemsPage.jsx'))");
  });

  it('loads JobOrders page from jobOrders feature path', () => {
    expect(mainContent).toContain("const JobOrders = lazy(() => import('../../../packages/web-core/src/features/jobOrders/pages/JobOrdersPage.jsx'))");
  });

  it('loads StockMovements page from stockMovements feature path', () => {
    expect(mainContent).toContain("const StockMovements = lazy(() => import('../../../packages/web-core/src/features/stockMovements/pages/StockMovementsPage.jsx'))");
  });

  it('removes retired feature facades while preserving the remaining migration facade', () => {
    expect(fs.existsSync(legacyItemsPath)).toBe(false);
    expect(fs.existsSync(legacyJobOrdersPath)).toBe(false);
    expect(legacyStockMovementsContent).toContain("import StockMovementsPage from '../../../packages/web-core/src/features/stockMovements/pages/StockMovementsPage.jsx'");
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
