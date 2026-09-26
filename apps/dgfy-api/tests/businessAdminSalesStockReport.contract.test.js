import { describe, expect, it } from '@jest/globals';
import { BUSINESS_ADMIN_REPORT_DEFINITIONS } from '../src/modules/businessAdmin/domain/businessAdminReportCatalog.js';
import {
    buildBusinessAdminFinancialReportQuery,
    buildBusinessAdminFinancialReportScope
} from '../src/modules/businessAdmin/repositories/businessAdminFinancialReportRepository.js';

describe('Business Admin sales and stock report contract', () => {
    it('publishes a branch-aware stock-bearing sales dataset', () => {
        expect(BUSINESS_ADMIN_REPORT_DEFINITIONS.sales_and_stock_by_item).toMatchObject({
            label: 'Sales & stock by item',
            default_sort: 'units_sold',
            source: 'pos',
            filters: ['date_from', 'date_to', 'branch_id']
        });
    });

    it('joins finalized stock-bearing sales to the authoritative current stock balance', () => {
        const scope = buildBusinessAdminFinancialReportScope({
            dateFrom: '2026-09-18',
            dateTo: '2026-09-18',
            branchId: 12,
            allowedLocationIds: null
        });
        const query = buildBusinessAdminFinancialReportQuery('sales_and_stock_by_item', scope);

        expect(query).toContain('COALESCE(l.stock_effect_type, \'inventory_issue\') = \'inventory_issue\'');
        expect(query).toContain('item_location_stocks stock');
        expect(query).toContain('stock.quantity_on_hand');
        expect(query).toContain('units_sold');
        expect(query).toContain('pos_transaction_adjustments');
        expect(query).toContain('t.location_id = :branchId');
        expect(scope.replacements.branchId).toBe(12);
    });
});
