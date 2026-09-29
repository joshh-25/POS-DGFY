import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.resolve(__dirname, '../../../../../apps/dgfy-ims/src/main.jsx');
const businessAdminPath = path.resolve(__dirname, '../businessAdmin/BusinessAdminPage.jsx');
const businessAdminManifestPath = path.resolve(__dirname, '../businessAdmin/businessAdminManifest.js');
const retiredMerchantPagePaths = [
  'Items',
  'JobOrders',
  'AiChat',
  'Dashboard',
  'DispatchOrders',
  'MobileReceive',
  'PurchaseOrders',
  'Reports',
  'StockMovements',
  'Suppliers'
].map((pageName) => path.resolve(__dirname, `../../../../../apps/dgfy-ims/Pages/${pageName}.jsx`));
const featureItemsPath = path.resolve(__dirname, '../inventory/pages/ItemsPage.jsx');
const featureJobOrdersPath = path.resolve(__dirname, '../jobOrders/pages/JobOrdersPage.jsx');
const featureStockMovementsPath = path.resolve(__dirname, '../stockMovements/pages/StockMovementsPage.jsx');

describe('feature route wiring', () => {
  let mainContent = '';
  let businessAdminContent = '';
  let businessAdminManifestContent = '';
  let featureItemsContent = '';
  let featureJobOrdersContent = '';
  let featureStockMovementsContent = '';

  beforeAll(() => {
    mainContent = fs.readFileSync(mainPath, 'utf8');
    businessAdminContent = fs.readFileSync(businessAdminPath, 'utf8');
    businessAdminManifestContent = fs.readFileSync(businessAdminManifestPath, 'utf8');
    featureItemsContent = fs.readFileSync(featureItemsPath, 'utf8');
    featureJobOrdersContent = fs.readFileSync(featureJobOrdersPath, 'utf8');
    featureStockMovementsContent = fs.readFileSync(featureStockMovementsPath, 'utf8');
  });

  it('owns the catalog migration in POS Back Office', () => {
    expect(businessAdminManifestContent).toContain('catalog: module(');
    expect(businessAdminContent).toContain('MIGRATED_BACKOFFICE_MODULE_KEYS');
    expect(mainContent).toContain('<Route path="/items" element={<LegacyMerchantRoute target="/backoffice/catalog" title="Catalog workspace moved" />} />');
  });

  it('owns Job Orders in POS Back Office', () => {
    expect(businessAdminManifestContent).toContain("'job-orders': module(");
    expect(businessAdminContent).toContain('MIGRATED_BACKOFFICE_MODULE_KEYS');
    expect(mainContent).toContain('<Route path="/job-orders" element={<LegacyMerchantRoute target="/backoffice/job-orders" title="Job-order workspace moved" />} />');
  });

  it('owns Stock Movements in POS Back Office', () => {
    expect(businessAdminManifestContent).toContain("'stock-movements': module(");
    expect(businessAdminContent).toContain('MIGRATED_BACKOFFICE_MODULE_KEYS');
    expect(mainContent).toContain('<Route path="/stock-movements" element={<LegacyMerchantRoute target="/backoffice/stock-movements" title="Inventory workspace moved" />} />');
  });

  it('removes retired IMS merchant page implementations after the POS migration', () => {
    for (const legacyPagePath of retiredMerchantPagePaths) {
      expect(fs.existsSync(legacyPagePath), legacyPagePath).toBe(false);
    }
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
