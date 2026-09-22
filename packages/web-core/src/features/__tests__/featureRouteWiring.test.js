import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/src/main.jsx');
const businessAdminPath = path.resolve(__dirname, '../../../../../apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx');
const legacyItemsPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/Pages/Items.jsx');
const legacyJobOrdersPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/Pages/JobOrders.jsx');
const legacyStockMovementsPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/Pages/StockMovements.jsx');
const featureItemsPath = path.resolve(__dirname, '../inventory/pages/ItemsPage.jsx');
const featureJobOrdersPath = path.resolve(__dirname, '../jobOrders/pages/JobOrdersPage.jsx');
const featureStockMovementsPath = path.resolve(__dirname, '../stockMovements/pages/StockMovementsPage.jsx');

describe('feature route wiring', () => {
  let mainContent = '';
  let businessAdminContent = '';
  let legacyStockMovementsContent = '';
  let featureItemsContent = '';
  let featureJobOrdersContent = '';
  let featureStockMovementsContent = '';

  beforeAll(() => {
    mainContent = fs.readFileSync(mainPath, 'utf8');
    businessAdminContent = fs.readFileSync(businessAdminPath, 'utf8');
    legacyStockMovementsContent = fs.readFileSync(legacyStockMovementsPath, 'utf8');
    featureItemsContent = fs.readFileSync(featureItemsPath, 'utf8');
    featureJobOrdersContent = fs.readFileSync(featureJobOrdersPath, 'utf8');
    featureStockMovementsContent = fs.readFileSync(featureStockMovementsPath, 'utf8');
  });

  it('owns the catalog migration in POS Back Office', () => {
    expect(businessAdminContent).toContain('catalog: MERCHANT_BACKOFFICE_MODULE_META.catalog');
    expect(mainContent).toContain('<Route path="/items" element={<LegacyMerchantRoute target="/backoffice/catalog" title="Catalog workspace moved" />} />');
  });

  it('owns Job Orders in POS Back Office', () => {
    expect(businessAdminContent).toContain("'job-orders': MERCHANT_BACKOFFICE_MODULE_META['job-orders']");
    expect(mainContent).toContain('<Route path="/job-orders" element={<LegacyMerchantRoute target="/backoffice/job-orders" title="Job-order workspace moved" />} />');
  });

  it('owns Stock Movements in POS Back Office', () => {
    expect(businessAdminContent).toContain("'stock-movements': MERCHANT_BACKOFFICE_MODULE_META['stock-movements']");
    expect(mainContent).toContain('<Route path="/stock-movements" element={<LegacyMerchantRoute target="/backoffice/stock-movements" title="Inventory workspace moved" />} />');
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
