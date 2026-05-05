import crypto from 'crypto';

export const BARCODE_SOURCES = Object.freeze([
    'manufacturer',
    'supplier',
    'tenant_generated',
    'legacy_import',
    'system_generated_reference'
]);

export const BARCODE_SCOPES = Object.freeze([
    'inventory',
    'pos',
    'storefront_qr',
    'batch',
    'service',
    'ticket',
    'package'
]);

export const BARCODE_SYMBOLOGIES = Object.freeze([
    'upc_a',
    'ean13',
    'code128',
    'qr',
    'gs1_datamatrix',
    'unknown'
]);

export const BARCODE_PACKAGING_LEVELS = Object.freeze([
    'unit',
    'pack',
    'case',
    'carton',
    'batch',
    'service',
    'ticket',
    'shelf'
]);

export const BARCODE_SURFACE_SCOPES = Object.freeze({
    inventory: new Set(['inventory', 'batch', 'package', 'service', 'ticket', 'pos', 'storefront_qr']),
    pos: new Set(['pos', 'package', 'service']),
    storefront: new Set(['storefront_qr', 'service', 'package'])
});

export const isBarcodeScopeAllowedForSurface = (scope, surface) => {
    const allowed = BARCODE_SURFACE_SCOPES[String(surface || '').trim().toLowerCase()];
    if (!allowed) return false;
    return allowed.has(String(scope || '').trim().toLowerCase());
};

export const parseBarcodeStructuredPayload = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const parsed = JSON.parse(raw);
            const type = String(parsed?.type || '').trim().toLowerCase();
            const reference = String(parsed?.reference || parsed?.public_reference || '').trim();
            const code = String(parsed?.code || parsed?.barcode || parsed?.bc || parsed?.qr || '').trim();
            if (type || reference || code) {
                return {
                    type: type || null,
                    reference: reference || null,
                    code: code || null,
                    raw: parsed
                };
            }
        } catch {
            return null;
        }
    }

    const prefixed = raw.match(/^([A-Z_]+)[:|](.+)$/i);
    if (prefixed?.[1] && prefixed?.[2]) {
        return {
            type: prefixed[1].trim().toLowerCase(),
            reference: prefixed[2].trim(),
            code: raw,
            raw
        };
    }

    return null;
};

const extractEmbeddedBarcodeValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const parsed = JSON.parse(raw);
            const candidate = parsed?.code || parsed?.barcode || parsed?.bc || parsed?.qr;
            if (candidate) return String(candidate).trim();
            const structured = parseBarcodeStructuredPayload(raw);
            if (structured?.type && structured?.reference) {
                return `${structured.type}:${structured.reference}`;
            }
        } catch {
            // Treat malformed JSON as a raw scan below.
        }
    }

    const prefixed = raw.match(/^QR[:|](.+)$/i) || raw.match(/^IMS[:|](.+)$/i);
    if (prefixed?.[1]) return prefixed[1].trim();

    if (/^https?:\/\//i.test(raw)) {
        try {
            const url = new URL(raw);
            for (const key of ['bc', 'barcode', 'code', 'qr']) {
                const candidate = url.searchParams.get(key);
                if (candidate) return candidate.trim();
            }
            const segments = url.pathname.split('/').filter(Boolean);
            const qrIndex = segments.findIndex((segment) => segment.toLowerCase() === 'qr');
            if (qrIndex >= 0 && segments[qrIndex + 1]) {
                return decodeURIComponent(segments[qrIndex + 1]).trim();
            }
        } catch {
            // Treat invalid URLs as raw scans below.
        }
    }

    return raw;
};

export const normalizeBarcodeValue = (value) => {
    const normalized = extractEmbeddedBarcodeValue(value)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .toUpperCase();
    return normalized || null;
};

export const detectBarcodeSymbology = (value) => {
    const normalized = normalizeBarcodeValue(value);
    if (!normalized) return 'unknown';
    if (parseBarcodeStructuredPayload(value)) return 'qr';
    if (/^https?:\/\//i.test(String(value || '').trim())) return 'qr';
    if (/^QR[:|]/.test(normalized) || normalized.includes('/QR/') || normalized.includes('?BC=')) return 'qr';
    if (/^\d{12}$/.test(normalized)) return 'upc_a';
    if (/^\d{13}$/.test(normalized)) return 'ean13';
    if (/^\]D2/.test(normalized)) return 'gs1_datamatrix';
    if (/^[A-Z0-9._:/-]{4,128}$/.test(normalized)) return 'code128';
    return 'unknown';
};

export const normalizeBarcodeSource = (value, fallback = 'manufacturer') => {
    const normalized = String(value || '').trim().toLowerCase();
    return BARCODE_SOURCES.includes(normalized) ? normalized : fallback;
};

export const normalizeBarcodeScope = (value, fallback = 'inventory') => {
    const normalized = String(value || '').trim().toLowerCase();
    return BARCODE_SCOPES.includes(normalized) ? normalized : fallback;
};

export const normalizeBarcodePackagingLevel = (value, fallback = 'unit') => {
    const normalized = String(value || '').trim().toLowerCase();
    return BARCODE_PACKAGING_LEVELS.includes(normalized) ? normalized : fallback;
};

export const normalizeBarcodeMultiplier = (value, fallback = 1) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.round(parsed * 10000) / 10000;
};

const sanitizeTenantToken = (value) => {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
    return normalized || 'TENANT';
};

export const generateInternalBarcodeValue = ({
    tenantToken = null,
    itemId,
    scope = 'inventory'
} = {}) => {
    const normalizedScope = normalizeBarcodeScope(scope, 'inventory').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const itemSegment = Number.isInteger(Number(itemId)) && Number(itemId) > 0
        ? String(Number(itemId)).padStart(6, '0')
        : '000000';
    const nonce = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `IMS-${sanitizeTenantToken(tenantToken)}-${normalizedScope}-${itemSegment}-${nonce}`;
};

export const buildBarcodeConflictPayload = (existing = null) => ({
    reason_code: 'BARCODE_CONFLICT',
    existing: existing
        ? {
            item_barcode_id: existing.item_barcode_id,
            item_id: existing.item_id,
            item_name: existing.item?.name || existing.item_name || null,
            sku_code: existing.item?.sku_code || existing.sku_code || null,
            code: existing.code,
            normalized_code: existing.normalized_code,
            source: existing.source,
            scope: existing.scope,
            packaging_level: existing.packaging_level,
            quantity_multiplier: existing.quantity_multiplier
        }
        : null
});
