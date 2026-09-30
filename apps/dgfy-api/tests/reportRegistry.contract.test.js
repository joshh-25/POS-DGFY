import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import {
    BUSINESS_ADMIN_REPORT_DEFINITIONS,
    LEGACY_BACK_OFFICE_REPORT_DEFINITIONS,
    REPORT_REGISTRY,
    TERMINAL_REPORT_DEFINITIONS,
    getReportDefinition,
    getReportSortColumnMap,
    getReportSortFields,
    listBusinessAdminReportDefinitions,
    listReportDefinitions
} from '../src/modules/reports/domain/reportRegistry.js';
import { BUSINESS_ADMIN_REPORT_DEFINITIONS as catalogDefinitions } from '../src/modules/businessAdmin/domain/businessAdminReportCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('canonical report registry contract', () => {
    it('has one definition per key and keeps Business Admin catalog compatibility', () => {
        const keys = Object.keys(REPORT_REGISTRY);

        expect(new Set(keys).size).toBe(keys.length);
        expect(Object.keys(catalogDefinitions)).toEqual(Object.keys(BUSINESS_ADMIN_REPORT_DEFINITIONS));
        expect(listBusinessAdminReportDefinitions()).toHaveLength(Object.keys(BUSINESS_ADMIN_REPORT_DEFINITIONS).length);
        expect(listBusinessAdminReportDefinitions().every((definition) => !('sort_column_map' in definition))).toBe(true);
        expect(listReportDefinitions({ surface: 'business_admin' }).map(({ key }) => key)).toEqual(Object.keys(BUSINESS_ADMIN_REPORT_DEFINITIONS));
    });

    it('centralizes Business Admin sort fields and keeps SQL column mappings private', () => {
        expect(getReportSortFields('sales_by_item')).toEqual([
            'item_id', 'item_name', 'sku_code', 'category', 'gross_sales', 'net_sales',
            'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat',
            'service_fees', 'cogs', 'pos_profit_loss'
        ]);
        expect(getReportSortColumnMap('inventory_movements')).toEqual({
            timestamp: 'timestamp',
            item: 'item_id',
            movement_type: 'movement_type',
            quantity: 'quantity',
            reference: 'reference_id'
        });
        expect(getReportSortColumnMap('low_stock').min_threshold).toBe('item.min_threshold');

        const financialRepository = readRepoFile('apps/dgfy-api/src/modules/businessAdmin/repositories/businessAdminFinancialReportRepository.js');
        const inventoryRepository = readRepoFile('apps/dgfy-api/src/modules/businessAdmin/repositories/businessAdminInventoryReportRepository.js');
        expect(financialRepository).not.toContain('const reportSortFields =');
        expect(inventoryRepository).toContain("getReportSortColumnMap('inventory_movements')");
        expect(inventoryRepository).toContain("getReportSortColumnMap('low_stock')");
    });

    it('keeps terminal reports POS-owned and explicitly offline-capable', () => {
        const requiredFilters = ['date_from', 'date_to', 'granularity', 'location_id', 'terminal_id'];
        expect(Object.keys(TERMINAL_REPORT_DEFINITIONS)).toEqual(expect.arrayContaining([
            'terminal_daily',
            'terminal_registers',
            'terminal_handoffs',
            'terminal_attendance'
        ]));

        Object.values(TERMINAL_REPORT_DEFINITIONS).forEach((definition) => {
            expect(definition.owner).toBe('pos_terminal');
            expect(definition.permission).toBe('pos:view');
            expect(definition.offline_supported).toBe(true);
            expect(definition.filters).toEqual(expect.arrayContaining(requiredFilters));
            expect(definition.compatibility.read_endpoints).toEqual(['/api/v1/pos/reports/overview']);
            expect(definition.compatibility.export_endpoints).toEqual(['/api/v1/pos/reports/export']);
        });

        const workspace = readRepoFile('packages/web-core/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx');
        expect(workspace).toContain('loadOfflinePosReportSnapshot');
        expect(workspace).toContain('if (!isOnline)');
        expect(readRepoFile('apps/dgfy-api/src/routes/pos.js')).toContain("router.get('/reports/overview'");
        expect(readRepoFile('apps/dgfy-api/src/routes/pos.js')).toContain("router.get('/reports/export'");
    });

    it('registers legacy report consumers as compatibility seams until individual migration', () => {
        const legacyRoutes = readRepoFile('apps/dgfy-api/src/routes/reports.js');
        const legacyHook = readRepoFile('packages/web-core/src/hooks/useReports.js');

        Object.entries(LEGACY_BACK_OFFICE_REPORT_DEFINITIONS).forEach(([key, definition]) => {
            const route = definition.compatibility.read_endpoints[0].replace('/api/v1', '');
            expect(legacyRoutes).toContain(`'${route.replace('/reports', '')}'`);
            if (['expiry', 'stock_aging_enhanced', 'production', 'po_analysis', 'executive_summary', 'compliance_package'].includes(key)) {
                expect(legacyHook).toContain(route);
            }
        });

        expect(getReportDefinition('saved_report_snapshots').compatibility.export_endpoints).toBeUndefined();
        expect(getReportDefinition('expiry').filter_aliases).toEqual({
            startDate: 'date_from',
            endDate: 'date_to',
            location_id: 'branch_id'
        });
    });
});
