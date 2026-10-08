import {
    buildEJournalExportPackage,
    buildEJournalSourceRevision,
    escapeEJournalValue,
    parseEJournalText,
    validateEJournalText
} from '../src/modules/reports/domain/eJournalReadiness.js';
import { hashFiscalEvidence } from '../src/modules/pos/domain/fiscalEvidenceContract.js';

const buildSnapshot = ({ invoiceNumber = 'INV-000001', issuedAt = '2026-10-03T08:00:00.000Z' } = {}) => ({
    template_version: 'rmo-24-2023-prep-v1',
    source_timezone: 'Asia/Manila',
    issued_at: issuedAt,
    document: {
        invoice_number: invoiceNumber,
        document_type: 'fiscal_invoice',
        document_context: 'fiscal'
    },
    seller: {
        registered_name: 'Test Store',
        taxpayer_type: 'vat_registered',
        software_name: 'DGFY POS'
    },
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
    lines: [{
        sequence: 1,
        item_id: 1,
        sku_code: 'SKU|1',
        item_name: 'Test item\nwith slash \\',
        quantity: 1,
        sale_price: 100,
        discount_amount: 0,
        vat_amount: 10.7143,
        line_subtotal: 100
    }]
});

const buildTransaction = (overrides = {}) => {
    const snapshot = overrides.fiscal_document_snapshot || buildSnapshot({
        invoiceNumber: overrides.invoice_number || 'INV-000001',
        issuedAt: overrides.created_at || '2026-10-03T08:00:00.000Z'
    });
    return {
        pos_transaction_id: overrides.pos_transaction_id || 1,
        invoice_number: overrides.invoice_number || snapshot.document.invoice_number,
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        created_at: snapshot.issued_at,
        fiscal_document_snapshot: snapshot,
        fiscal_document_hash: hashFiscalEvidence(snapshot),
        ...overrides
    };
};

describe('Item 8 internal e-journal readiness serializer', () => {
    it('produces deterministic, checksum-valid output and a linked hard-copy projection', () => {
        const input = {
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'TERM-01',
            businessDate: '2026-10-03',
            transactions: [buildTransaction()],
            events: [{
                pos_fiscal_event_id: 11,
                event_type: 'print_reprint',
                occurred_at: '2026-10-03T08:05:00.000Z'
            }]
        };
        const first = buildEJournalExportPackage(input);
        const second = buildEJournalExportPackage(input);

        expect(first.rawText).toBe(second.rawText);
        expect(first.manifest).toEqual(second.manifest);
        expect(validateEJournalText(first.rawText)).toEqual(expect.objectContaining({ valid: true }));
        expect(first.summary.source_counts).toEqual(expect.objectContaining({
            transactions: 1,
            documents: 1,
            lines: 1,
            payments: 1,
            reprints: 1
        }));
        expect(first.hardCopyText).toContain(`source_filename=${first.filename}`);
        expect(first.hardCopyText).toContain(`serializer_version=${first.summary.serializer_version}`);
        expect(first.hardCopyText).toContain(`checksum=${first.summary.content_sha256}`);
        expect(first.manifest.approval_claim).toBe('none');
        expect(first.manifest.external_review_status).toBe('required_before_external_submission');
    });

    it('escapes reserved delimiters and round-trips them without changing the checksum contract', () => {
        const pkg = buildEJournalExportPackage({
            tenantId: 'tenant|1',
            locationId: 7,
            terminalId: 'TERM-01',
            businessDate: '2026-10-03',
            transactions: [buildTransaction()]
        });
        const records = parseEJournalText(pkg.rawText);
        const line = records.find((record) => record.recordType === 'LINE');

        expect(escapeEJournalValue('a|b\nc\\d')).toBe('a\\|b\\nc\\\\d');
        expect(line.fields.item_code).toBe('SKU|1');
        expect(line.fields.description).toBe('Test item\nwith slash \\');
        expect(records.at(-1).recordType).toBe('TRAILER');
    });

    it('links adjustments and deduplicates the same X/Z reading source', () => {
        const transaction = buildTransaction();
        const pkg = buildEJournalExportPackage({
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'TERM-01',
            businessDate: '2026-10-03',
            transactions: [transaction],
            adjustments: [{
                pos_transaction_adjustment_id: 22,
                adjustment_reference: 'RET-22',
                pos_transaction_id: 1,
                adjustment_type: 'return',
                amount: 100,
                status: 'succeeded',
                reason: 'Customer return',
                created_at: '2026-10-03T09:00:00.000Z',
                transaction: {
                    pos_transaction_id: 1,
                    invoice_number: transaction.invoice_number
                }
            }],
            events: [{
                pos_fiscal_event_id: 30,
                event_type: 'z_reading',
                occurred_at: '2026-10-03T16:00:00.000Z',
                payload: JSON.stringify({
                    business_date: '2026-10-03',
                    reading_identifier: 'Z-001',
                    generated_at: '2026-10-03T16:00:00.000Z',
                    summary: { total_transactions: 1, total_amount: 100 }
                })
            }],
            zSnapshots: [{
                pos_z_reading_snapshot_id: 31,
                business_date: '2026-10-03',
                generated_at: '2026-10-03T16:01:00.000Z',
                reading_identifier: 'Z-001',
                summary: { transaction_count: 1, total_amount: 100 }
            }]
        });
        const records = parseEJournalText(pkg.rawText);

        expect(records.filter((record) => record.recordType === 'ADJUSTMENT')).toHaveLength(1);
        expect(records.filter((record) => record.recordType === 'READING')).toHaveLength(1);
        expect(records.find((record) => record.recordType === 'ADJUSTMENT').fields.original_document_no).toBe(transaction.invoice_number);
        expect(validateEJournalText(pkg.rawText).valid).toBe(true);
    });

    it('rejects missing immutable snapshots, duplicate documents, BOMs, and tampered trailers', () => {
        expect(() => buildEJournalExportPackage({
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'TERM-01',
            businessDate: '2026-10-03',
            transactions: [{ pos_transaction_id: 1, invoice_number: 'INV-1', document_type: 'fiscal_invoice' }]
        })).toThrow('EJOURNAL_FISCAL_SNAPSHOT_INVALID');

        const duplicate = buildEJournalExportPackage({
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'TERM-01',
            businessDate: '2026-10-03',
            transactions: [buildTransaction({ pos_transaction_id: 1 }), buildTransaction({ pos_transaction_id: 2, invoice_number: 'INV-000002' })]
        });
        expect(validateEJournalText(`\uFEFF${duplicate.rawText}`).valid).toBe(false);
        expect(() => buildEJournalExportPackage({
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'TERM-01',
            businessDate: '2026-10-03',
            transactions: [buildTransaction({ pos_transaction_id: 1 }), buildTransaction({ pos_transaction_id: 2, invoice_number: 'INV-000001' })]
        })).toThrow('EJOURNAL_DUPLICATE_DOCUMENT');

        const tampered = duplicate.rawText.replace(/content_sha256=[^|\n]+/, 'content_sha256=bad');
        expect(validateEJournalText(tampered)).toEqual(expect.objectContaining({ valid: false }));
    });

    it('binds the source revision to the serializer version', () => {
        expect(buildEJournalSourceRevision({ registryHash: 'registry', grammarHash: 'grammar' })).toMatch(/^[a-f0-9]{64}$/);
    });
});
