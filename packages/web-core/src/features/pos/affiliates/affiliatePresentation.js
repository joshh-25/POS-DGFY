import {
    AFFILIATE_SELLING_PRICE_RULE_TYPES,
    calculateAffiliateSale,
    validateAffiliatePriceRule
} from '../utils/affiliatePricingPreview.js';

export { AFFILIATE_SELLING_PRICE_RULE_TYPES };

export const PRICE_RULE_TYPE_LABELS = {
    BASE_PRICE: 'Same as catalog price',
    PERCENTAGE_MARKUP: 'Add a percentage',
    FIXED_MARKUP: 'Add a fixed amount',
    PERCENTAGE_DISCOUNT: 'Take off a percentage',
    FIXED_DISCOUNT: 'Take off a fixed amount',
    EXACT_AFFILIATE_PRICE: 'Sell at an exact price'
};

export const RATE_BASED_RULE_TYPES = new Set(['PERCENTAGE_MARKUP', 'PERCENTAGE_DISCOUNT']);
export const AMOUNT_BASED_RULE_TYPES = new Set(['FIXED_MARKUP', 'FIXED_DISCOUNT', 'EXACT_AFFILIATE_PRICE']);
export const DISCOUNT_RULE_TYPES = new Set(['PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT']);
export const AFFILIATE_PAGE_SIZE_OPTIONS = [20, 40, 60];

export const money = (centavos) => `₱${(Number(centavos || 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;

export const phpMoney = (centavos, fallback = '—') => {
    if (centavos === null || centavos === undefined || !Number.isFinite(Number(centavos))) return fallback;
    return `PHP ${(Number(centavos) / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};

export const bpsToPercentString = (bps) => (bps === null || bps === undefined ? '' : String(Number(bps) / 100));

export const percentStringToBps = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};

export const centavosToPesoString = (centavos) => String(Number(centavos || 0) / 100);

export const pesoStringToCentavos = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));

export const formatAuditDateTime = (value) => {
    if (!value) return 'Unknown time';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown time';
    return parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

export const formatJoinedDate = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: '2-digit' });
};

export const formatAffiliateTableDate = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
};

export const affiliateDisplayName = (affiliate) => {
    const account = affiliate?.dgfyAccount || {};
    const fullName = [account.first_name, account.last_name]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    return fullName || account.username || account.email || affiliate?.invited_email || 'Affiliate';
};

export const affiliateEmail = (affiliate) => {
    const account = affiliate?.dgfyAccount || {};
    return account.email || affiliate?.invited_email || 'Email unavailable';
};

export const cashoutAffiliateDisplayName = (cashout) => affiliateDisplayName(cashout?.enrollment || {});

export const statusLabel = (status) => {
    const value = String(status || 'unknown');
    return value.charAt(0).toUpperCase() + value.slice(1);
};

export const statusTextClass = (status) => {
    switch (String(status || '').toLowerCase()) {
        case 'active':
        case 'approved':
        case 'paid':
            return 'text-emerald-700';
        case 'pending':
        case 'requested':
            return 'text-amber-700';
        case 'suspended':
            return 'text-orange-700';
        case 'revoked':
        case 'rejected':
        case 'cancelled':
            return 'text-rose-700';
        default:
            return 'text-slate-600';
    }
};

export const draftToRule = (draft) => ({
    type: draft.rule_type,
    rateBps: RATE_BASED_RULE_TYPES.has(draft.rule_type) ? percentStringToBps(draft.value) : null,
    amountCentavos: AMOUNT_BASED_RULE_TYPES.has(draft.rule_type) ? pesoStringToCentavos(draft.value) : null
});

export const priceRuleToDraft = (rule) => {
    if (!rule) return { rule_type: 'BASE_PRICE', value: '' };
    if (RATE_BASED_RULE_TYPES.has(rule.rule_type)) {
        return { rule_type: rule.rule_type, value: bpsToPercentString(rule.rate_bps) };
    }
    if (AMOUNT_BASED_RULE_TYPES.has(rule.rule_type)) {
        return { rule_type: rule.rule_type, value: centavosToPesoString(rule.amount_centavos) };
    }
    return { rule_type: rule.rule_type, value: '' };
};

export const resolveRulePreview = ({ draft, basePricePesos, commissionType, commissionRateBps }) => {
    const basePriceCentavos = pesoStringToCentavos(basePricePesos || '0');
    const rule = draftToRule(draft);
    const validity = validateAffiliatePriceRule({ rule, basePriceCentavos });

    if (!validity.valid) return { status: 'invalid', errorCode: validity.error_code };

    try {
        const breakdown = calculateAffiliateSale({
            basePriceCentavos,
            sellingPriceRule: rule,
            commissionRule: {
                type: commissionType || 'PERCENTAGE_OF_BASE',
                rateBps: commissionRateBps ?? 500
            }
        });
        return { status: 'ok', breakdown };
    } catch (error) {
        return { status: 'error', errorCode: error?.code };
    }
};

export const getAffiliateSalesCentavos = (affiliate) => {
    const candidates = [
        affiliate?.attributed_sales_centavos,
        affiliate?.sales_centavos,
        affiliate?.sales_total_centavos,
        affiliate?.sales?.total_centavos,
        affiliate?.earnings?.attributed_sales_centavos
    ];
    const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && Number.isFinite(Number(candidate)));
    return value === undefined ? null : Number(value);
};

export const getAffiliateEarnedCentavos = (affiliate) => {
    const earnings = affiliate?.earnings || {};
    return ['pending_centavos', 'available_centavos', 'paid_centavos']
        .reduce((total, key) => total + Number(earnings[key] || 0), 0);
};

export const getAffiliateUnpaidCentavos = (affiliate) => {
    const earnings = affiliate?.earnings || {};
    return Number(earnings.pending_centavos || 0) + Number(earnings.available_centavos || 0);
};

export const getAffiliateJoinedAt = (affiliate) => affiliate?.activated_at || affiliate?.created_at || affiliate?.updated_at;

export const normalizeSearch = (value) => String(value || '').trim().toLowerCase();

export const payoutSnapshotSummary = (snapshot) => {
    if (!snapshot) return 'Payout method unavailable';
    if (snapshot.method_type === 'bank') {
        const last4 = String(snapshot.account_number || '').slice(-4);
        return `${snapshot.bank_name || 'Bank'} •••• ${last4 || '----'} (${snapshot.account_name || 'account'})`;
    }
    const label = snapshot.method_type === 'gcash'
        ? 'GCash'
        : snapshot.method_type === 'maya'
            ? 'Maya'
            : (snapshot.method_type || 'Wallet');
    return `${label} ${snapshot.mobile_number || ''}`.trim();
};

export const formatCashoutRequestId = (cashout) => {
    const rawId = cashout?.cashout_id ?? cashout?.id;
    if (rawId === null || rawId === undefined || rawId === '') return 'CR-0000-0000';
    return `CR-${String(rawId).padStart(4, '0')}`;
};

export const csvCell = (value) => {
    const normalized = String(value ?? '');
    return `"${normalized.replace(/"/g, '""')}"`;
};

export const buildCashoutCsv = (cashouts) => {
    const rows = [
        ['Request ID', 'Affiliate', 'Requested Amount (PHP)', 'Requested Date', 'Status', 'Payment Reference'],
        ...cashouts.map((cashout) => [
            formatCashoutRequestId(cashout),
            cashoutAffiliateDisplayName(cashout),
            (Number(cashout.amount_centavos || 0) / 100).toFixed(2),
            formatJoinedDate(cashout.requested_at),
            statusLabel(cashout.status),
            cashout.external_payment_ref || ''
        ])
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
};
