import crypto from 'node:crypto';
import {
    hashFiscalEvidence,
    parseFiscalSnapshot,
    validateFiscalDocumentSnapshot
} from '../../pos/domain/fiscalEvidenceContract.js';

export const EJOURNAL_GRAMMAR_VERSION = 'EJOURNAL-READINESS-0.1';
export const EJOURNAL_TIMEZONE = 'Asia/Manila';
export const EJOURNAL_HASH_ALGORITHM = 'SHA-256';

const RECORD_FIELDS = Object.freeze({
    FILE: ['sequence', 'grammar_version', 'business_date', 'tenant_id', 'location_id', 'terminal_id'],
    DOCUMENT: ['sequence', 'record_id', 'document_type', 'source_transaction_id', 'document_no', 'issued_at', 'gross', 'discount', 'vat', 'net'],
    LINE: ['sequence', 'record_id', 'document_record_id', 'line_no', 'item_code', 'description', 'quantity', 'unit_price', 'discount', 'vat', 'line_total'],
    PAYMENT: ['sequence', 'record_id', 'document_record_id', 'method', 'amount', 'reference'],
    ADJUSTMENT: ['sequence', 'record_id', 'adjustment_type', 'original_transaction_id', 'original_document_no', 'adjustment_document_no', 'occurred_at', 'amount', 'status', 'reason'],
    READING: ['sequence', 'record_id', 'reading_type', 'reading_no', 'business_date', 'generated_at', 'gross', 'net', 'transaction_count'],
    TRAILER: ['sequence', 'record_count', 'first_sequence', 'last_sequence', 'content_sha256']
});
const REQUIRED_NON_EMPTY = Object.freeze({
    FILE: ['grammar_version', 'business_date', 'tenant_id', 'location_id', 'terminal_id'],
    DOCUMENT: ['record_id', 'document_type', 'source_transaction_id', 'document_no', 'issued_at'],
    LINE: ['record_id', 'document_record_id', 'line_no', 'item_code', 'description'],
    PAYMENT: ['record_id', 'document_record_id', 'method'],
    ADJUSTMENT: ['record_id', 'adjustment_type', 'original_transaction_id', 'original_document_no', 'adjustment_document_no', 'occurred_at', 'status'],
    READING: ['record_id', 'reading_type', 'reading_no', 'business_date', 'generated_at'],
    TRAILER: ['record_count', 'first_sequence', 'last_sequence', 'content_sha256']
});
const ADJUSTMENT_TYPE_MAP = Object.freeze({
    cancel: 'CANCELLATION',
    cancellation: 'CANCELLATION',
    void: 'VOID',
    cash_refund: 'REFUND',
    external_refund: 'REFUND',
    provider_refund: 'REFUND',
    employee_credit_reversal: 'REFUND',
    return: 'RETURN'
});

const normalizeText = (value) => String(value ?? '').trim();

const asPlain = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const parseJsonObject = (value) => {
    const plain = asPlain(value);
    if (plain && typeof plain === 'object' && !Array.isArray(plain)) return plain;
    if (typeof plain !== 'string' || !plain.trim()) return {};
    try {
        const parsed = JSON.parse(plain);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const decimal = (value, scale, label) => {
    const normalized = value === null || value === undefined || value === '' ? '0' : String(value).trim();
    const number = Number(normalized);
    if (!Number.isFinite(number)) {
        throw new Error(`EJOURNAL_INVALID_DECIMAL:${label}`);
    }
    const result = number.toFixed(scale);
    return result === `-${'0'.padEnd(scale + 2, '0')}` ? result.slice(1) : result;
};

const money = (value, label) => decimal(value, 2, label);
const quantity = (value, label) => decimal(value, 3, label);

const isoDateTime = (value, label) => {
    const normalized = value instanceof Date ? value.toISOString() : normalizeText(value);
    const parsed = new Date(normalized);
    if (!normalized || Number.isNaN(parsed.getTime())) throw new Error(`EJOURNAL_INVALID_DATETIME:${label}`);
    return normalized;
};

const businessDate = (value) => {
    const normalized = normalizeText(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('EJOURNAL_INVALID_BUSINESS_DATE');
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
        throw new Error('EJOURNAL_INVALID_BUSINESS_DATE');
    }
    return normalized;
};

export const escapeEJournalValue = (value) => String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n');

const splitEscapedFields = (line) => {
    const fields = [];
    let current = '';
    let escaped = false;
    for (const character of line) {
        if (escaped) {
            current += character === 'n' ? '\n' : character === 'r' ? '\r' : character;
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === '|') {
            fields.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    if (escaped) current += '\\';
    fields.push(current);
    return fields;
};

const requireFields = (recordType, fields) => {
    const required = RECORD_FIELDS[recordType];
    if (!required) throw new Error(`EJOURNAL_UNKNOWN_RECORD:${recordType}`);
    const missing = required.filter((field) => !Object.prototype.hasOwnProperty.call(fields, field));
    const empty = (REQUIRED_NON_EMPTY[recordType] || []).filter((field) => !normalizeText(fields[field]));
    if (missing.length || empty.length) {
        throw new Error(`EJOURNAL_REQUIRED_FIELDS:${recordType}:${[...missing, ...empty].join(',')}`);
    }
};

const recordLine = (recordType, fields) => {
    requireFields(recordType, fields);
    const unknown = Object.keys(fields).filter((key) => !RECORD_FIELDS[recordType].includes(key));
    if (unknown.length) throw new Error(`EJOURNAL_UNKNOWN_FIELDS:${recordType}:${unknown.join(',')}`);
    return `${recordType}|${RECORD_FIELDS[recordType].map((field) => `${field}=${escapeEJournalValue(fields[field])}`).join('|')}\n`;
};

const stableSort = (rows, selectors = []) => [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    for (const selector of selectors) {
        const leftValue = selector(left);
        const rightValue = selector(right);
        const result = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true });
        if (result !== 0) return result;
    }
    return 0;
});

const normalizeId = (prefix, value) => `${prefix}-${normalizeText(value).replace(/[^A-Za-z0-9._-]+/g, '_')}`;

const sourceTransactionId = (transaction) => normalizeText(transaction?.pos_transaction_id || transaction?.transaction_id);

const readFiscalSnapshot = (transaction) => {
    const snapshot = parseFiscalSnapshot(transaction?.fiscal_document_snapshot);
    const validation = validateFiscalDocumentSnapshot(snapshot, {
        expectedHash: transaction?.fiscal_document_hash || null
    });
    if (!validation.valid) {
        const error = new Error(`EJOURNAL_FISCAL_SNAPSHOT_INVALID:${sourceTransactionId(transaction) || 'unknown'}`);
        error.code = 'EJOURNAL_FISCAL_SNAPSHOT_INVALID';
        error.details = validation;
        throw error;
    }
    return snapshot;
};

const normalizePaymentMethod = (value) => normalizeText(value || 'unknown').toUpperCase();

const buildDocumentRecords = ({ transactions = [] } = {}) => {
    const documents = [];
    const lines = [];
    const payments = [];
    const documentNumbers = new Set();

    const sortedTransactions = stableSort(transactions, [
        (row) => row?.fiscal_document_snapshot?.issued_at || row?.created_at,
        (row) => sourceTransactionId(row),
        (row) => row?.invoice_number
    ]);

    sortedTransactions.forEach((rawTransaction) => {
        const transaction = asPlain(rawTransaction) || {};
        const transactionId = sourceTransactionId(transaction);
        if (!transactionId) throw new Error('EJOURNAL_DOCUMENT_SOURCE_ID_MISSING');
        const snapshot = readFiscalSnapshot(transaction);
        const documentNo = normalizeText(snapshot?.document?.invoice_number || transaction.invoice_number);
        if (!documentNo) throw new Error(`EJOURNAL_DOCUMENT_NUMBER_MISSING:${transactionId}`);
        if (documentNumbers.has(documentNo)) throw new Error(`EJOURNAL_DUPLICATE_DOCUMENT:${documentNo}`);
        documentNumbers.add(documentNo);

        const recordId = normalizeId('DOC', transactionId);
        const totals = snapshot.totals || {};
        const gross = totals.gross_amount ?? totals.gross ?? totals.subtotal_amount ?? transaction.subtotal_amount;
        const net = totals.net_amount ?? totals.net ?? totals.total_amount ?? transaction.total_amount;
        const documentType = normalizeText(snapshot?.document?.document_type || transaction.document_type).toUpperCase() === 'FISCAL_INVOICE'
            ? 'INVOICE'
            : 'RECEIPT';
        documents.push({
            recordType: 'DOCUMENT',
            recordId,
            sourceTransactionId: transactionId,
            documentNo,
            fields: {
                record_id: recordId,
                document_type: documentType,
                source_transaction_id: transactionId,
                document_no: documentNo,
                issued_at: isoDateTime(snapshot.issued_at || transaction.created_at, `document.${transactionId}.issued_at`),
                gross: money(gross, `document.${transactionId}.gross`),
                discount: money(totals.discount_amount ?? transaction.discount_amount, `document.${transactionId}.discount`),
                vat: money(totals.vat_amount ?? transaction.vat_amount, `document.${transactionId}.vat`),
                net: money(net, `document.${transactionId}.net`)
            }
        });

        const snapshotLines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
        snapshotLines.forEach((line, index) => {
            const lineNo = Number.parseInt(line?.sequence || line?.line_no || index + 1, 10);
            const lineRecordId = `${recordId}-LINE-${String(lineNo).padStart(4, '0')}`;
            const itemCode = normalizeText(line?.sku_code || line?.item_code || line?.item_id);
            const description = normalizeText(line?.item_name || line?.item_name_snapshot || line?.description || line?.item_id);
            if (!itemCode || !description) throw new Error(`EJOURNAL_LINE_IDENTITY_MISSING:${transactionId}:${lineNo}`);
            lines.push({
                recordType: 'LINE',
                documentRecordId: recordId,
                lineNo,
                fields: {
                    record_id: lineRecordId,
                    document_record_id: recordId,
                    line_no: lineNo,
                    item_code: itemCode,
                    description,
                    quantity: quantity(line?.quantity, `line.${transactionId}.${lineNo}.quantity`),
                    unit_price: money(line?.sale_price ?? line?.unit_price, `line.${transactionId}.${lineNo}.unit_price`),
                    discount: money(line?.discount_amount ?? line?.discount, `line.${transactionId}.${lineNo}.discount`),
                    vat: money(line?.vat_amount ?? line?.vat, `line.${transactionId}.${lineNo}.vat`),
                    line_total: money(line?.line_subtotal ?? line?.line_total, `line.${transactionId}.${lineNo}.line_total`)
                }
            });
        });

        const snapshotPayments = stableSort(snapshot.payment_breakdown, [
            (row) => normalizePaymentMethod(row?.payment_type || row?.method),
            (row) => row?.payment_reference || row?.reference,
            (row) => row?.amount
        ]);
        snapshotPayments.forEach((payment, index) => {
            const paymentRecordId = `${recordId}-PAY-${String(index + 1).padStart(4, '0')}`;
            payments.push({
                recordType: 'PAYMENT',
                documentRecordId: recordId,
                fields: {
                    record_id: paymentRecordId,
                    document_record_id: recordId,
                    method: normalizePaymentMethod(payment?.payment_type || payment?.method),
                    amount: money(payment?.amount, `payment.${transactionId}.${index + 1}.amount`),
                    reference: normalizeText(payment?.payment_reference || payment?.reference || transaction.payment_reference)
                }
            });
        });
    });

    return { documents, lines, payments };
};

const buildAdjustmentRecords = ({ adjustments = [] } = {}) => {
    const records = [];
    const sortedAdjustments = stableSort(adjustments, [
        (row) => row?.completed_at || row?.created_at || row?.failed_at || row?.cancelled_at,
        (row) => row?.pos_transaction_id,
        (row) => row?.pos_transaction_adjustment_id || row?.adjustment_reference
    ]);
    sortedAdjustments.forEach((rawAdjustment) => {
        const adjustment = asPlain(rawAdjustment) || {};
        const transaction = asPlain(adjustment.transaction || adjustment.original_transaction) || {};
        const originalTransactionId = normalizeText(adjustment.pos_transaction_id || transaction.pos_transaction_id);
        const originalDocumentNo = normalizeText(transaction.invoice_number || adjustment.original_document_number);
        const adjustmentType = ADJUSTMENT_TYPE_MAP[normalizeText(adjustment.adjustment_type).toLowerCase()];
        if (!originalTransactionId || !originalDocumentNo || !adjustmentType) {
            const error = new Error(`EJOURNAL_ADJUSTMENT_ORIGINAL_MISSING:${adjustment.adjustment_reference || adjustment.pos_transaction_adjustment_id || 'unknown'}`);
            error.code = 'EJOURNAL_ADJUSTMENT_ORIGINAL_MISSING';
            throw error;
        }
        const occurredAt = adjustment.completed_at || adjustment.created_at || adjustment.failed_at || adjustment.cancelled_at;
        const adjustmentId = normalizeText(adjustment.adjustment_reference || adjustment.pos_transaction_adjustment_id);
        records.push({
            recordType: 'ADJUSTMENT',
            fields: {
                record_id: normalizeId('ADJ', adjustmentId),
                adjustment_type: adjustmentType,
                original_transaction_id: originalTransactionId,
                original_document_no: originalDocumentNo,
                adjustment_document_no: adjustmentId ? normalizeId('ADJ-DOC', adjustmentId) : normalizeId('ADJ-DOC', originalTransactionId),
                occurred_at: isoDateTime(occurredAt, `adjustment.${adjustmentId}.occurred_at`),
                amount: money(adjustment.amount, `adjustment.${adjustmentId}.amount`),
                status: normalizeText(adjustment.status || 'RECORDED').toUpperCase(),
                reason: normalizeText(adjustment.reason)
            }
        });
    });
    return records;
};

const readingSummaryValue = (summary, keys) => {
    for (const key of keys) {
        if (summary?.[key] !== undefined && summary?.[key] !== null) return summary[key];
    }
    return 0;
};

const buildReadingRecords = ({ events = [], zSnapshots = [] } = {}) => {
    const candidates = new Map();
    const add = (type, row, summaryOverride = null) => {
        const payload = parseJsonObject(row?.payload);
        const readingType = String(type || payload.reading_type || row?.reading_type || '').trim().toUpperCase();
        if (!['X', 'Z'].includes(readingType)) return;
        const readingNo = normalizeText(payload.reading_identifier || row?.reading_identifier || `${readingType}-${row?.pos_fiscal_event_id || row?.pos_z_reading_snapshot_id || row?.generated_at}`);
        const summary = summaryOverride || payload.summary || row?.summary || {};
        const key = `${readingType}|${readingNo}`;
        const existing = candidates.get(key) || {};
        candidates.set(key, {
            ...existing,
            record_id: normalizeId(`READING-${readingType}`, readingNo),
            reading_type: readingType,
            reading_no: readingNo,
            business_date: businessDate(payload.business_date || row?.business_date),
            generated_at: isoDateTime(row?.generated_at || row?.occurred_at || payload.generated_at, `reading.${readingNo}.generated_at`),
            gross: money(readingSummaryValue(summary, ['gross_sales', 'gross', 'total_amount']), `reading.${readingNo}.gross`),
            net: money(readingSummaryValue(summary, ['net_sales', 'net', 'total_amount']), `reading.${readingNo}.net`),
            transaction_count: Number.parseInt(readingSummaryValue(summary, ['transaction_count', 'total_transactions']), 10) || 0
        });
    };

    stableSort(events, [(row) => row?.occurred_at, (row) => row?.event_sequence]).forEach((event) => {
        const type = String(event?.event_type || '').replace('_reading', '').toUpperCase();
        add(type, event);
    });
    stableSort(zSnapshots, [(row) => row?.generated_at, (row) => row?.pos_z_reading_snapshot_id]).forEach((snapshot) => add('Z', snapshot, parseJsonObject(snapshot?.summary)));

    return stableSort([...candidates.values()], [(row) => row?.generated_at, (row) => row?.reading_type, (row) => row?.reading_no])
        .map((fields) => ({ recordType: 'READING', fields }));
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const buildEJournalRecords = ({
    tenantId,
    locationId,
    terminalId,
    businessDate: requestedBusinessDate,
    transactions = [],
    adjustments = [],
    events = [],
    zSnapshots = []
} = {}) => {
    const normalizedBusinessDate = businessDate(requestedBusinessDate);
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedLocationId = normalizeText(locationId);
    const normalizedTerminalId = normalizeText(terminalId).toUpperCase();
    if (!normalizedTenantId || !normalizedLocationId || !normalizedTerminalId) throw new Error('EJOURNAL_SCOPE_REQUIRED');

    const documentParts = buildDocumentRecords({ transactions });
    const adjustmentRecords = buildAdjustmentRecords({ adjustments });
    const readingRecords = buildReadingRecords({ events, zSnapshots });
    const lines = [recordLine('FILE', {
        sequence: 1,
        grammar_version: EJOURNAL_GRAMMAR_VERSION,
        business_date: normalizedBusinessDate,
        tenant_id: normalizedTenantId,
        location_id: normalizedLocationId,
        terminal_id: normalizedTerminalId
    })];
    let sequence = 2;
    const bodyRecords = [];
    const append = (recordType, fields) => {
        bodyRecords.push(recordLine(recordType, { sequence, ...fields }));
        sequence += 1;
    };

    documentParts.documents.forEach((record) => append('DOCUMENT', record.fields));
    documentParts.lines.forEach((record) => append('LINE', record.fields));
    documentParts.payments.forEach((record) => append('PAYMENT', record.fields));
    adjustmentRecords.forEach((record) => append('ADJUSTMENT', record.fields));
    readingRecords.forEach((record) => append('READING', record.fields));
    lines.push(...bodyRecords);

    const content = lines.join('');
    const recordCount = 1 + bodyRecords.length;
    const trailer = recordLine('TRAILER', {
        sequence,
        record_count: recordCount,
        first_sequence: 1,
        last_sequence: sequence - 1,
        content_sha256: sha256(content)
    });
    const rawText = `${content}${trailer}`;
    return {
        rawText,
        sourceCounts: {
            transactions: transactions.length,
            documents: documentParts.documents.length,
            lines: documentParts.lines.length,
            payments: documentParts.payments.length,
            adjustments: adjustmentRecords.length,
            readings: readingRecords.length,
            reprints: events.filter((event) => String(event?.event_type || '').toLowerCase() === 'print_reprint').length
        },
        recordCount,
        contentSha256: sha256(content),
        firstSequence: 1,
        lastSequence: sequence - 1,
        scope: {
            tenant_id: normalizedTenantId,
            location_id: normalizedLocationId,
            terminal_id: normalizedTerminalId,
            business_date: normalizedBusinessDate
        }
    };
};

const htmlEscape = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const buildEJournalExportPackage = ({
    tenantId,
    locationId,
    terminalId,
    businessDate: requestedBusinessDate,
    transactions = [],
    adjustments = [],
    events = [],
    zSnapshots = [],
    sourceRevision = 'local-runtime'
} = {}) => {
    const built = buildEJournalRecords({
        tenantId,
        locationId,
        terminalId,
        businessDate: requestedBusinessDate,
        transactions,
        adjustments,
        events,
        zSnapshots
    });
    const safeTenant = normalizeText(tenantId).replace(/[^A-Za-z0-9._-]+/g, '_') || 'tenant';
    const filename = `e-journal-${safeTenant}-${built.scope.location_id}-${built.scope.terminal_id}-${built.scope.business_date}.txt`;
    const manifest = {
        schema_version: 'annex-b-items-4-14-section-05-ejournal-manifest-v1',
        serializer_version: EJOURNAL_GRAMMAR_VERSION,
        source_revision: sourceRevision,
        source_filename: filename,
        hash_algorithm: EJOURNAL_HASH_ALGORITHM,
        scope: built.scope,
        record_count: built.recordCount,
        first_sequence: built.firstSequence,
        last_sequence: built.lastSequence,
        content_sha256: built.contentSha256,
        source_counts: built.sourceCounts,
        completeness: {
            one_document_per_source_transaction: built.sourceCounts.documents === built.sourceCounts.transactions,
            every_document_has_line_and_payment: built.sourceCounts.documents > 0
                ? built.sourceCounts.lines >= built.sourceCounts.documents && built.sourceCounts.payments >= built.sourceCounts.documents
                : true,
            adjustments_linked_to_original: true,
            readings_are_deduplicated: true,
            reprints_do_not_create_second_sale: true
        },
        external_review_status: 'required_before_external_submission',
        approval_claim: 'none'
    };
    const hardCopyText = [
        'E-JOURNAL HARD-COPY PROJECTION',
        `source_filename=${filename}`,
        `serializer_version=${EJOURNAL_GRAMMAR_VERSION}`,
        `record_count=${built.recordCount}`,
        `date_range=${built.scope.business_date}`,
        `checksum=${built.contentSha256}`,
        'external_review_status=required_before_external_submission',
        'approval_claim=none',
        '--- BEGIN E-JOURNAL ---',
        built.rawText,
        '--- END E-JOURNAL ---'
    ].join('\n');
    const printableHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(filename)}</title><style>body{font-family:Arial,sans-serif;color:#111827;margin:24px}h1{font-size:18px;margin:0 0 12px}dl{display:grid;grid-template-columns:180px 1fr;gap:4px 12px;font-size:12px}dt{font-weight:700}dd{margin:0}pre{margin-top:20px;border-top:1px solid #cbd5e1;padding-top:12px;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}</style></head><body><h1>E-Journal hard-copy projection</h1><dl><dt>Source filename</dt><dd>${htmlEscape(filename)}</dd><dt>Serializer version</dt><dd>${htmlEscape(EJOURNAL_GRAMMAR_VERSION)}</dd><dt>Record count</dt><dd>${built.recordCount}</dd><dt>Date range</dt><dd>${htmlEscape(built.scope.business_date)}</dd><dt>Checksum</dt><dd>${htmlEscape(built.contentSha256)}</dd><dt>External review</dt><dd>Required before external submission</dd></dl><pre>${htmlEscape(built.rawText)}</pre></body></html>`;
    return {
        filename,
        rawText: built.rawText,
        hardCopyText,
        printableHtml,
        manifest,
        summary: {
            filename,
            serializer_version: EJOURNAL_GRAMMAR_VERSION,
            business_date: built.scope.business_date,
            location_id: built.scope.location_id,
            terminal_id: built.scope.terminal_id,
            record_count: built.recordCount,
            content_sha256: built.contentSha256,
            source_counts: built.sourceCounts,
            external_review_status: manifest.external_review_status,
            approval_claim: manifest.approval_claim
        }
    };
};

export const parseEJournalText = (text) => {
    const source = String(text ?? '');
    if (source.charCodeAt(0) === 0xFEFF) throw new Error('EJOURNAL_BOM_NOT_ALLOWED');
    if (!source.endsWith('\n')) throw new Error('EJOURNAL_FINAL_LF_REQUIRED');
    const lines = source.slice(0, -1).split('\n');
    return lines.map((line) => {
        const [recordType, ...fieldParts] = splitEscapedFields(line);
        const fields = {};
        fieldParts.forEach((field) => {
            const separator = field.indexOf('=');
            if (separator <= 0) throw new Error('EJOURNAL_FIELD_SYNTAX');
            const key = field.slice(0, separator);
            const value = field.slice(separator + 1);
            if (Object.prototype.hasOwnProperty.call(fields, key)) throw new Error(`EJOURNAL_DUPLICATE_FIELD:${key}`);
            fields[key] = value;
        });
        requireFields(recordType, fields);
        return { recordType, fields };
    });
};

export const validateEJournalText = (text) => {
    const errors = [];
    let records;
    try {
        records = parseEJournalText(text);
    } catch (error) {
        return { valid: false, errors: [error.message], records: [] };
    }
    const fileRecords = records.filter((record) => record.recordType === 'FILE');
    const trailerRecords = records.filter((record) => record.recordType === 'TRAILER');
    if (fileRecords.length !== 1) errors.push('exactly one FILE record is required');
    if (trailerRecords.length !== 1) errors.push('exactly one TRAILER record is required');
    const sequences = records.map((record) => Number.parseInt(record.fields.sequence, 10));
    if (sequences.some((sequence, index) => sequence !== index + 1)) errors.push('record sequences must be contiguous and ascending');
    const documentIds = records.filter((record) => record.recordType === 'DOCUMENT').map((record) => record.fields.document_no);
    if (new Set(documentIds).size !== documentIds.length) errors.push('document numbers must be unique');
    const trailer = trailerRecords[0]?.fields;
    if (trailer) {
        const bodyRecords = records.slice(0, -1);
        if (Number.parseInt(trailer.record_count, 10) !== bodyRecords.length) errors.push('record_count does not match body records');
        const bodyText = String(text).slice(0, String(text).lastIndexOf('TRAILER|'));
        if (trailer.content_sha256 !== sha256(bodyText)) errors.push('content_sha256 does not match body bytes');
        if (Number.parseInt(trailer.last_sequence, 10) !== bodyRecords.length) errors.push('last_sequence does not match body records');
    }
    return { valid: errors.length === 0, errors, records };
};

export const buildEJournalSourceRevision = ({ registryHash = '', grammarHash = '' } = {}) => hashFiscalEvidence({
    registry_hash: registryHash,
    grammar_hash: grammarHash,
    serializer_version: EJOURNAL_GRAMMAR_VERSION
});
