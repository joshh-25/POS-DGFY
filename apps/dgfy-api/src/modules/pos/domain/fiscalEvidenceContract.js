import crypto from 'crypto';

export const FISCAL_EVIDENCE_CONTRACT_VERSION = 'pos-bir-annex-b-items-4-6-v1';
export const FISCAL_EVIDENCE_TIMEZONE = 'Asia/Manila';
const RECEIPT_RENDERER_PACKAGE = ['@sieitzz', 'pos-receipt'].join('/');

export const ITEM_4_FIXTURE_IDS = Object.freeze([
    'R4-REGULAR',
    'R4-SENIOR',
    'R4-PWD',
    'R4-ATHLETE',
    'R4-SOLO',
    'R4-CHARGES',
    'R4-NONFISCAL'
]);

export const ITEM_5_ADJUSTMENT_TYPES = Object.freeze([
    'cancel',
    'void',
    'cash_refund',
    'external_refund',
    'provider_refund',
    'return',
    'reprint',
    'reversal'
]);

const REQUIRED_SNAPSHOT_PATHS = Object.freeze([
    'template_version',
    'source_timezone',
    'issued_at',
    'document.invoice_number',
    'document.document_type',
    'document.document_context',
    'seller',
    'seller.taxpayer_type',
    'seller.software_name',
    'terminal',
    'buyer',
    'totals.subtotal_amount',
    'totals.vatable_sales',
    'totals.vat_amount',
    'totals.vat_exempt_sales',
    'totals.zero_rated_sales',
    'totals.discount_amount',
    'totals.total_amount',
    'totals.payment_type',
    'payment_breakdown',
    'lines'
]);

const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

const isPresent = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const stableStringify = (value) => {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
};

export const hashFiscalEvidence = (value) => crypto
    .createHash('sha256')
    .update(stableStringify(value))
    .digest('hex');

export const parseFiscalSnapshot = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const validateFiscalDocumentSnapshot = (snapshotValue, { expectedHash = null } = {}) => {
    const snapshot = parseFiscalSnapshot(snapshotValue);
    const missingFields = REQUIRED_SNAPSHOT_PATHS.filter((path) => {
        const value = getPath(snapshot, path);
        if (path === 'lines' || path === 'payment_breakdown') return !Array.isArray(value) || value.length === 0;
        return !isPresent(value) && !['buyer', 'seller', 'terminal'].includes(path);
    });
    const computedHash = snapshot ? hashFiscalEvidence(snapshot) : null;
    const hashMatches = expectedHash == null || String(expectedHash).trim() === computedHash;

    return {
        valid: Boolean(snapshot) && missingFields.length === 0 && hashMatches,
        snapshot_present: Boolean(snapshot),
        missing_fields: missingFields,
        computed_hash: computedHash,
        expected_hash: expectedHash || null,
        hash_matches: hashMatches
    };
};

const normalizeSourceTransaction = (transaction = {}) => ({
    source_transaction_id: transaction?.pos_transaction_id || null,
    original_document_number: transaction?.invoice_number || null,
    original_document_type: transaction?.document_type || null,
    original_document_context: transaction?.document_context || null,
    original_document_hash: transaction?.fiscal_document_hash || null,
    source_terminal_id: transaction?.terminal_id || null,
    source_location_id: transaction?.location_id || null,
    source_shift_id: transaction?.shift_id || null,
    source_created_at: transaction?.created_at || null
});

export const buildFiscalReceiptEvidence = ({ transaction = {} } = {}) => {
    const snapshot = parseFiscalSnapshot(transaction?.fiscal_document_snapshot);
    const validation = validateFiscalDocumentSnapshot(snapshot, {
        expectedHash: transaction?.fiscal_document_hash || null
    });
    const source = normalizeSourceTransaction(transaction);

    return {
        contract_version: FISCAL_EVIDENCE_CONTRACT_VERSION,
        evidence_type: 'receipt_or_invoice',
        immutable_source: true,
        renderer_contract: {
            browser_component: 'ReceiptPrintView',
            receipt_package: RECEIPT_RENDERER_PACKAGE,
            paper_widths: ['80mm', '57mm'],
            source_projection: 'server_owned_snapshot'
        },
        ...source,
        snapshot_hash: validation.computed_hash || transaction?.fiscal_document_hash || null,
        snapshot_integrity: validation.valid ? 'verified' : (snapshot ? 'invalid' : 'missing'),
        snapshot_validation: validation
    };
};

const ADJUSTMENT_LABELS = Object.freeze({
    cancel: 'CANCEL',
    void: 'VOID',
    cash_refund: 'REFUND',
    external_refund: 'REFUND',
    provider_refund: 'REFUND',
    return: 'RETURN',
    reprint: 'REPRINT',
    reversal: 'REVERSAL',
    employee_credit_reversal: 'REVERSAL'
});

const normalizeAdjustmentLines = ({ adjustment, transaction }) => {
    const metadata = adjustment?.metadata && typeof adjustment.metadata === 'object'
        ? adjustment.metadata
        : {};
    if (Array.isArray(metadata.returned_lines) && metadata.returned_lines.length > 0) {
        return metadata.returned_lines;
    }
    const snapshot = parseFiscalSnapshot(transaction?.fiscal_document_snapshot);
    if (Array.isArray(snapshot?.lines) && snapshot.lines.length > 0) return snapshot.lines;
    return Array.isArray(transaction?.lines)
        ? transaction.lines.map((line, index) => ({
            sequence: index + 1,
            line_id: line?.line_id || null,
            item_id: line?.item_id || null,
            item_name: line?.item_name_snapshot || line?.item?.name || null,
            quantity: line?.quantity ?? null,
            sale_price: line?.sale_price ?? null,
            line_subtotal: line?.line_subtotal ?? null
        }))
        : [];
};

export const buildAdjustmentEvidenceDocument = ({ adjustment = {}, transaction = {} } = {}) => {
    const serializedAdjustment = adjustment && typeof adjustment.toJSON === 'function'
        ? adjustment.toJSON()
        : adjustment;
    const metadata = serializedAdjustment?.metadata && typeof serializedAdjustment.metadata === 'object'
        ? serializedAdjustment.metadata
        : {};
    const source = normalizeSourceTransaction(transaction);
    const receiptEvidence = buildFiscalReceiptEvidence({ transaction });
    const adjustmentType = String(serializedAdjustment?.adjustment_type || '').trim().toLowerCase() || null;
    const amount = Number(serializedAdjustment?.amount || 0);

    return {
        contract_version: FISCAL_EVIDENCE_CONTRACT_VERSION,
        evidence_type: 'adjustment_document',
        e_journal_record_type: 'ADJUSTMENT',
        document_label: ADJUSTMENT_LABELS[adjustmentType] || 'ADJUSTMENT',
        adjustment_type: adjustmentType,
        adjustment_reference: serializedAdjustment?.adjustment_reference || null,
        status: serializedAdjustment?.status || null,
        amount: Number.isFinite(amount) ? amount : 0,
        signed_amount: Number.isFinite(Number(metadata.signed_amount))
            ? Number(metadata.signed_amount)
            : (adjustmentType === 'return' ? -Math.abs(amount) : 0),
        currency: serializedAdjustment?.currency || 'PHP',
        reason: serializedAdjustment?.reason || null,
        original_document: {
            ...source,
            original_document_date_time: source.source_created_at,
            snapshot_hash: receiptEvidence.snapshot_hash,
            snapshot_integrity: receiptEvidence.snapshot_integrity,
            immutable: true
        },
        lines: normalizeAdjustmentLines({ adjustment: serializedAdjustment, transaction }),
        actor: {
            user_id: serializedAdjustment?.actor_user_id || null,
            shift_id: serializedAdjustment?.actor_shift_id || null,
            terminal_id: serializedAdjustment?.actor_terminal_id || null,
            location_id: serializedAdjustment?.actor_location_id || null
        },
        fiscal_event_hash: metadata.fiscal_event_hash || null,
        payment_adjustment_reference: metadata.payment_adjustment_reference || null,
        inventory_reversal: metadata.inventory_reversal || { status: 'not_requested' }
    };
};

export const buildReadingEvidencePayload = ({
    readingType,
    businessDate,
    locationId = null,
    terminalId = null,
    readingIdentifier = null,
    generatedAt = null,
    summary = {},
    counters = {},
    reconciliation = null,
    snapshotPersisted = false
} = {}) => {
    const payload = {
        contract_version: FISCAL_EVIDENCE_CONTRACT_VERSION,
        evidence_type: 'pos_reading',
        reading_type: String(readingType || '').trim().toUpperCase() || null,
        source_timezone: FISCAL_EVIDENCE_TIMEZONE,
        business_date: businessDate || null,
        location_id: locationId || null,
        terminal_id: terminalId || null,
        reading_identifier: readingIdentifier || null,
        generated_at: generatedAt || null,
        snapshot_persisted: snapshotPersisted === true,
        summary,
        counters,
        reconciliation: reconciliation || null
    };

    return {
        ...payload,
        payload_hash: hashFiscalEvidence(payload)
    };
};

export const isReconciledReading = (readingEvidence = {}) => (
    readingEvidence?.reconciliation?.status === 'matched'
    && Number(readingEvidence?.reconciliation?.variance || 0) === 0
);
