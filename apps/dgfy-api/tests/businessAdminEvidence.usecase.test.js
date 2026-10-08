import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PERMISSIONS } from '../src/config/permissions.js';
import { hashFiscalEvidence } from '../src/modules/pos/domain/fiscalEvidenceContract.js';
import {
    buildGetBusinessAdminEJournalEvidenceUseCase,
    buildListBusinessAdminEvidenceCatalogUseCase
} from '../src/modules/businessAdmin/usecases/businessAdminEvidenceUseCase.js';

const MANAGER = {
    user_id: 7,
    tenant_id: 'tenant-1',
    username: 'manager',
    role: 'manager',
    permissions: [
        PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS
    ]
};

const buildSnapshot = () => ({
    template_version: 'rmo-24-2023-prep-v1',
    source_timezone: 'Asia/Manila',
    issued_at: '2026-10-03T08:00:00.000Z',
    document: {
        invoice_number: 'INV-000001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal'
    },
    seller: { taxpayer_type: 'vat_registered', software_name: 'DGFY POS' },
    terminal: { terminal_id: 'TERM-01' },
    buyer: { name: 'Walk-in' },
    totals: {
        subtotal_amount: 100,
        vatable_sales: 89.2857,
        vat_amount: 10.7143,
        vat_exempt_sales: 0,
        zero_rated_sales: 0,
        discount_amount: 0,
        total_amount: 100,
        payment_type: 'cash'
    },
    payment_breakdown: [{ payment_type: 'cash', amount: 100 }],
    lines: [{ sequence: 1, item_id: 1, sku_code: 'SKU-1', item_name: 'Test item', quantity: 1, sale_price: 100, line_subtotal: 100 }]
});

const buildSource = () => {
    const fiscal_document_snapshot = buildSnapshot();
    return {
        transactions: [{
            pos_transaction_id: 1,
            invoice_number: 'INV-000001',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal',
            created_at: fiscal_document_snapshot.issued_at,
            fiscal_document_snapshot,
            fiscal_document_hash: hashFiscalEvidence(fiscal_document_snapshot)
        }],
        adjustments: [],
        events: [],
        zSnapshots: []
    };
};

const buildDependencies = () => {
    const source = buildSource();
    return {
        source,
        businessAdminOverviewRepository: {
            listUserLocationGrantIds: jest.fn().mockResolvedValue([7])
        },
        posRepository: {
            listEJournalTransactions: jest.fn().mockResolvedValue(source.transactions),
            listEJournalAdjustments: jest.fn().mockResolvedValue(source.adjustments),
            listEJournalFiscalEvents: jest.fn().mockResolvedValue(source.events),
            listEJournalZReadingSnapshots: jest.fn().mockResolvedValue(source.zSnapshots),
            createAuditLog: jest.fn().mockResolvedValue(undefined)
        }
    };
};

describe('Business Admin Item 8 evidence use cases', () => {
    let dependencies;
    let getEvidence;

    beforeEach(() => {
        dependencies = buildDependencies();
        getEvidence = buildGetBusinessAdminEJournalEvidenceUseCase(dependencies);
    });

    it('returns the registry-backed catalog and records a view audit event', async () => {
        const listCatalog = buildListBusinessAdminEvidenceCatalogUseCase({ posRepository: dependencies.posRepository });
        const result = await listCatalog({ user: MANAGER, auditContext: { requestId: 'req-1' } });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            environment: 'local',
            approval_claim: 'none',
            external_review_status: 'required_before_external_submission'
        }));
        expect(result.data.reports.length).toBeGreaterThan(0);
        expect(dependencies.posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_bir_report_catalog_viewed',
            action: 'VIEW'
        }));
    });

    it('enforces branch scope, source bounds, and produces summary/text formats', async () => {
        const query = { date_from: '2026-10-03', date_to: '2026-10-03', branch_id: '7', terminal_id: 'term-01' };
        const summary = await getEvidence({ user: MANAGER, query, format: 'summary' });
        expect(summary).toMatchObject({
            success: true,
            data: { summary: { record_count: 4, terminal_id: 'TERM-01' } }
        });
        expect(dependencies.posRepository.listEJournalTransactions).toHaveBeenCalledWith(expect.objectContaining({ limit: 5001, terminalId: 'TERM-01' }));

        const text = await getEvidence({ user: MANAGER, query, format: 'txt' });
        expect(text).toMatchObject({
            success: true,
            data: { contentType: 'text/plain; charset=utf-8' }
        });
        expect(text.data.content).toContain('FILE|sequence=1');
        expect(text.data.content).toContain('TRAILER|');
    });

    it('rejects missing permissions, unauthorized branches, oversized sources, and source failures', async () => {
        const noReportPermission = await getEvidence({
            user: { ...MANAGER, permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS] },
            query: { date: '2026-10-03', branch_id: 7, terminal_id: 'TERM-01' }
        });
        expect(noReportPermission).toMatchObject({ success: false, error: expect.objectContaining({ statusCode: 403 }) });

        const unauthorized = await getEvidence({
            user: MANAGER,
            query: { date: '2026-10-03', branch_id: 99, terminal_id: 'TERM-01' }
        });
        expect(unauthorized.error.code).toBe('AUTHORIZATION_FAILED');

        dependencies.posRepository.listEJournalTransactions.mockResolvedValue([...Array(5001)].map(() => ({})));
        const oversized = await getEvidence({ user: MANAGER, query: { date: '2026-10-03', branch_id: 7, terminal_id: 'TERM-01' } });
        expect(oversized).toMatchObject({ success: false, error: expect.objectContaining({ statusCode: 422 }) });
        expect(oversized.error.details).toEqual(expect.objectContaining({ reason_code: 'BUSINESS_ADMIN_EJOURNAL_EXPORT_LIMIT' }));

        dependencies = buildDependencies();
        dependencies.posRepository.listEJournalTransactions.mockRejectedValue(new Error('database unavailable'));
        getEvidence = buildGetBusinessAdminEJournalEvidenceUseCase(dependencies);
        const failed = await getEvidence({ user: MANAGER, query: { date: '2026-10-03', branch_id: 7, terminal_id: 'TERM-01' } });
        expect(failed).toMatchObject({ success: false, error: expect.objectContaining({ statusCode: 500 }) });
        expect(failed.error.details).toEqual(expect.objectContaining({ reason_code: 'BUSINESS_ADMIN_EJOURNAL_SOURCE_READ_FAILED' }));
    });

    it('rejects multi-day scopes before reading source records', async () => {
        const result = await getEvidence({
            user: MANAGER,
            query: { date_from: '2026-10-02', date_to: '2026-10-03', branch_id: 7, terminal_id: 'TERM-01' }
        });

        expect(result).toMatchObject({ success: false, error: expect.objectContaining({ statusCode: 422 }) });
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'BUSINESS_ADMIN_EJOURNAL_SINGLE_DATE_REQUIRED' }));
        expect(dependencies.posRepository.listEJournalTransactions).not.toHaveBeenCalled();
    });
});
