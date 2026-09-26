import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const purchaseOrdersPage = readRepoFile('packages/web-core/src/features/merchantBackOffice/pages/PurchaseOrdersPage.jsx');
const purchaseOrdersHook = readRepoFile('packages/web-core/src/hooks/usePurchaseOrders.js');
const businessAdminCss = readRepoFile('apps/dgfy-pos/src/features/businessAdmin/businessAdmin.css');

describe('POS Back Office purchase orders presentation contract', () => {
  it('keeps purchase-order lifecycle actions and permission gates intact', () => {
    expect(purchaseOrdersPage).toContain('usePurchaseOrders');
    expect(purchaseOrdersPage).toContain('useCreatePurchaseOrder');
    expect(purchaseOrdersPage).toContain('useReceivePurchaseOrder');
    expect(purchaseOrdersPage).toContain('useArchivePurchaseOrder');
    expect(purchaseOrdersPage).toContain('useRestorePurchaseOrder');
    expect(purchaseOrdersPage).toContain("canCreate('purchase_orders')");
    expect(purchaseOrdersPage).toContain("canDelete('purchase_orders')");
    expect(purchaseOrdersPage).toContain("can('po:receive')");
    expect(purchaseOrdersPage).toContain('onGenerateToken={handleQRTokenGenerate}');
  });

  it('uses the shared Business Admin visual language for summary, context, filters, and records', () => {
    expect(purchaseOrdersPage).toContain('business-admin-purchase-orders-workspace');
    expect(purchaseOrdersPage).toContain('PurchaseOrderSummaryMetric');
    expect(purchaseOrdersPage).toContain('Canonical purchasing records');
    expect(purchaseOrdersPage).toContain('business-admin-purchase-orders-filter-card');
    expect(purchaseOrdersPage).toContain('business-admin-purchase-orders-table-view');
    expect(purchaseOrdersPage).toContain('business-admin-purchase-orders-mobile-view');
    expect(purchaseOrdersPage).toContain('PurchaseOrderMobileCard');
    expect(purchaseOrdersPage).toContain('business-admin-purchase-order-card-facts');
  });

  it('keeps the workspace mounted while the selected view refreshes', () => {
    expect(purchaseOrdersHook).toContain('const [hasLoaded, setHasLoaded] = useState(false);');
    expect(purchaseOrdersHook).toContain('const requestIdRef = useRef(0);');
    expect(purchaseOrdersHook).toContain('if (requestId !== requestIdRef.current) return;');
    expect(purchaseOrdersPage).toContain('const isInitialLoading = !purchaseOrdersLoaded || !supportingDataReady;');
    expect(purchaseOrdersPage).toContain('const isRefreshing = loading && purchaseOrdersLoaded;');
    expect(purchaseOrdersPage).toContain('business-admin-purchase-orders-results');
    expect(purchaseOrdersPage).toContain('business-admin-purchase-orders-loading');
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-loading { position: absolute; inset: 0;');
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-results.is-refreshing .business-admin-purchase-orders-results-content');
  });

  it('switches to compact cards on mobile without forcing a wide purchase-order table', () => {
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-table-view .business-admin-table { min-width: 0; table-layout: fixed; }');
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-mobile-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-table-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-mobile-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-purchase-orders-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }');
    expect(businessAdminCss).toContain('.business-admin-purchase-order-card .business-admin-purchase-orders-action { flex: 1 1 120px; }');
  });
});
