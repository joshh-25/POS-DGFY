import {
    FISCAL_EVIDENCE_CONTRACT_VERSION,
    buildAdjustmentEvidenceDocument,
    buildFiscalReceiptEvidence,
    buildReadingEvidencePayload,
    hashFiscalEvidence,
    validateFiscalDocumentSnapshot
} from '../src/modules/pos/domain/fiscalEvidenceContract.js';

const buildSnapshot = () => ({
    template_version: 'rmo-24-2023-prep-v1',
    source_timezone: 'Asia/Manila',
    issued_at: '2026-10-03T08:00:00.000Z',
    document: {
        invoice_number: 'INV-000001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal'
    },
    seller: {
        registered_name: 'Test Store',
        taxpayer_type: 'vat_registered',
        software_name: 'DGFY POS'
    },
    terminal: { terminal_id: 'TERM-01' },
    buyer: { name: 'Walk-in', tin: null, business_style: null, address: null },
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
    lines: [{ sequence: 1, item_id: 1, quantity: 1, line_subtotal: 100 }]
});
describe('POS fiscal evidence contract', () => {
    it('validates a server-owned fiscal snapshot and detects tampering', () => {
        const snapshot = buildSnapshot();
        const hash = hashFiscalEvidence(snapshot);

        expect(validateFiscalDocumentSnapshot(snapshot, { expectedHash: hash })).toEqual(expect.objectContaining({
            valid: true,
            hash_matches: true,
            missing_fields: []
        }));
        expect(validateFiscalDocumentSnapshot({ ...snapshot, totals: { ...snapshot.totals, total_amount: 999 } }, {
            expectedHash: hash
        }).valid).toBe(false);
    });

    it('keeps adjustment evidence linked to the original immutable document', () => {
        const transaction = {
            pos_transaction_id: 22,
            invoice_number: 'INV-000022',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal',
            fiscal_document_hash: hashFiscalEvidence(buildSnapshot()),
            fiscal_document_snapshot: buildSnapshot(),
            terminal_id: 'TERM-01',
            location_id: 7,
            created_at: '2026-10-03T08:00:00.000Z'
        };
        const document = buildAdjustmentEvidenceDocument({
            transaction,
            adjustment: {
                adjustment_reference: 'POS-RETURN-22',
                pos_transaction_id: 22,
                adjustment_type: 'return',
                amount: 100,
                currency: 'PHP',
                status: 'succeeded',
                reason: 'Customer returned item',
                actor_user_id: 12,
                metadata: {
                    signed_amount: -100,
                    returned_lines: [{ line_id: 1, quantity: 1, line_subtotal: 100 }]
                }
            }
        });

        expect(document).toEqual(expect.objectContaining({
            contract_version: FISCAL_EVIDENCE_CONTRACT_VERSION,
            e_journal_record_type: 'ADJUSTMENT',
            document_label: 'RETURN',
            signed_amount: -100,
            original_document: expect.objectContaining({
                original_document_number: 'INV-000022',
                immutable: true,
                snapshot_integrity: 'verified'
            })
        }));
        expect(document.lines).toEqual([{ line_id: 1, quantity: 1, line_subtotal: 100 }]);
    });

    it('hashes X/Z payloads from one serialized reading contract', () => {
        const evidence = buildReadingEvidencePayload({
            readingType: 'Z',
            businessDate: '2026-10-03',
            locationId: 7,
            terminalId: 'TERM-01',
            readingIdentifier: 'ZR-20261003-00000001',
            generatedAt: '2026-10-03T16:00:00.000Z',
            summary: { transaction_count: 1, total_amount: 100 },
            counters: { z_counter: 1 },
            reconciliation: { status: 'matched', variance: 0 },
            snapshotPersisted: true
        });

        expect(evidence.payload_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(evidence.reconciliation.status).toBe('matched');
        expect(evidence.contract_version).toBe(FISCAL_EVIDENCE_CONTRACT_VERSION);
    });
});
