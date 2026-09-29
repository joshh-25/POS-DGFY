import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../../../');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const manifest = readRepoFile('packages/web-core/src/features/businessAdmin/businessAdminManifest.js');
const businessAdminPage = readRepoFile('packages/web-core/src/features/businessAdmin/BusinessAdminPage.jsx');
const salesPage = readRepoFile('packages/web-core/src/features/sales/pages/SalesPage.jsx');
const main = readRepoFile('apps/dgfy-pos/src/main.jsx');

describe('Business Admin Sales & Orders consolidation contract', () => {
    it('keeps the analytical, operational, and customer owners distinct in navigation', () => {
        expect(manifest).toContain("overview: module('Overview', 'overview'");
        expect(manifest).toContain("sales: module('Sales', 'sales', 'Sales timeline'");
        expect(manifest).toContain("orders: module('Sales', 'orders', 'Order center'");
        expect(manifest).toContain("customers: module('Customers', 'customers'");
        expect(manifest).toContain("payments: module('Sales', 'payments'");
        expect(manifest).toContain("sales: module('Sales', 'sales', 'Sales timeline', '', ShoppingBag, SalesPage)");
        expect(manifest).toContain('receipt-safe detail history');
    });

    it('routes Overview and customer history into the shared receipt-safe Order detail', () => {
        expect(businessAdminPage).toContain('const handleOverviewOrderClick = useCallback');
        expect(businessAdminPage).toContain('buildBackOfficeModulePath(rootPath, \'orders\')');
        expect(businessAdminPage).toContain('transaction_id=${encodeURIComponent(id)}');
        expect(businessAdminPage).toContain('Select a transaction to open the original POS receipt popup.');
        expect(businessAdminPage).toContain('onOrderSelect={onOrderSelect}');
        expect(businessAdminPage).toContain('businessAdminApi.orderDetail(requestedOrderId)');
        expect(businessAdminPage).toContain('onClose={handleOrderDetailClose}');
        expect(businessAdminPage).toContain('BusinessAdminReceiptModal');
    });

    it('exposes server-backed Sales, Refund, and Voided receipt filters only in Orders', () => {
        expect(businessAdminPage).toContain('id="ba-receipt-type"');
        expect(businessAdminPage).toContain('Sales receipts');
        expect(businessAdminPage).toContain('Refund receipts');
        expect(businessAdminPage).toContain('Voided receipts');
        expect(businessAdminPage).toContain('...(receiptType ? { receipt_type: receiptType } : {})');
        expect(businessAdminPage).toContain("receiptType: activeSection === 'orders' ? receiptType : ''");
    });

    it('keeps Sales Timeline available and hands POS records to canonical Orders', () => {
        expect(salesPage).toContain('Sales Timeline');
        expect(salesPage).toContain('Open the canonical Orders detail for payment, refund, item, and audit history.');
        expect(salesPage).toContain('const ordersPath = `${String(adminRootPath || \'/\').replace(/\\/$/, \'\')}/orders`;');
        expect(main).toContain('<Route path="/sales" element={<LegacyBusinessAdminRoute section="sales" />} />');
        expect(main).toContain('<Route path="/business-admin/*" element={<BusinessAdminPage surface="pos" />} />');
        expect(main).not.toContain('<Route path="/backoffice/*"');
    });
});
