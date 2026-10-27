import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readRepoFile = (relativePath) => fs.readFileSync(
    path.resolve(__dirname, '../../../..', relativePath),
    'utf8'
);

const businessAdminPage = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/BusinessAdminPage.jsx');
const businessAdminService = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/businessAdminService.js');

describe('Business Admin approval queue contract', () => {
    it('keeps approval review and decision actions on the OPIS Business Admin surface', () => {
        expect(businessAdminPage).toContain("activeSection === 'approvals'");
        expect(businessAdminPage).toContain('data-testid="business-admin-administrative-tools"');
        expect(businessAdminPage).toContain('data-testid={`business-admin-admin-tool-${tool.key}`}');
        expect(businessAdminPage).toContain('onOpenAdministrativeTool={handleAdministrativeToolNavigate}');
        expect(businessAdminPage).toContain("businessAdminApi.approvals({ status: 'pending', limit: 100 }, requestConfig)");
        expect(businessAdminPage).toContain("businessAdminApi.decideApproval(id, decision, `${decision} requested from Back Office.`)");
        expect(businessAdminPage).toContain('Review the reason and target before deciding. POS and Inventory perform approved changes');
        expect(businessAdminPage).toContain("{ key: 'reason', label: 'Reason'");
        expect(businessAdminPage).toContain('data-testid="approved-void-history-toggle"');
        expect(businessAdminPage).toContain('Approved Void History');
        expect(businessAdminPage).toContain('{!voidHistoryOpen ? (');
        expect(businessAdminPage).toContain('data-testid="approved-void-history-back"');
        expect(businessAdminPage).toContain('Back to Approval Queue');
        expect(businessAdminPage).toContain('data-testid="approved-void-history-refresh"');
        expect(businessAdminPage).toContain('const BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE = 20;');
        expect(businessAdminPage).toContain('const VoidHistoryPagination');
        expect(businessAdminPage).toContain('aria-label="Next approved void history page"');
        expect(businessAdminPage).toContain('rows={visibleHistoryRows}');
        expect(businessAdminPage).toContain("businessAdminApi.approvals({ status: 'executed', limit: 100 })");
        expect(businessAdminPage).toContain("businessAdminApi.approvals({ status: 'approved', limit: 100 })");
        expect(businessAdminPage).toContain("businessAdminApi.orders({ receipt_type: 'voided', page: 1, limit: 100 })");
        expect(businessAdminPage).toContain("source: approval ? 'Approved workflow' : 'Direct/admin void'");
        expect(businessAdminService).toContain("approvals: (params, config) => get('/business-admin/approvals', params, config)");
        expect(businessAdminService).toContain("api.post(`/business-admin/approvals/${encodeURIComponent(id)}/${decision}`, { note })");
        expect(businessAdminService).toContain("orders: (params, config) => get('/business-admin/orders', params, config)");
    });

    it('keeps direct/admin void actor and reason fields in the shared order-list response', () => {
        const repository = readRepoFile('apps/dgfy-api/src/modules/businessAdmin/repositories/businessAdminOrderCenterRepository.js');

        expect(repository).toContain("userInclude('voidedByUser')");
        expect(repository).toContain('voided_by: row.voidedByUser?.username || row.voidedByUser?.email || null');
        expect(repository).toContain('void_reason: row.void_reason || null');
        expect(repository).toContain("if (filters.receiptType === 'voided')");
        expect(repository).toContain("addReceiptTypeCondition({ status: 'voided' })");
    });
});
