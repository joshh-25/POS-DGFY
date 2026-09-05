import { resolveAssetUrl, resolveAssetVariantUrl } from '@/src/utils/assetUrl.js';
import { matchesPosHistorySearch } from './posHistorySearch.js';
import { getDiscountLineRef } from './posDiscountSelection.js';
import { matchesPosTransactionPaymentMethod } from './posPaymentMethods.js';

export const money = (value) => Number(value || 0).toFixed(2);
export const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
export const getCartLineSubtotal = (line) => round4(
    Number(line?.quantity || 0) * Number(line?.sale_price || 0)
);

export const getPriceOverrideReasonValidationMessage = ({ line = {}, effectiveDefaultSalePrice } = {}) => {
    const salePrice = Number(line?.sale_price);
    const defaultSalePrice = Number(effectiveDefaultSalePrice);
    if (!Number.isFinite(salePrice) || !Number.isFinite(defaultSalePrice)) return null;
    if (Math.abs(round4(salePrice) - round4(defaultSalePrice)) <= 0.0001) return null;
    if (String(line?.price_override_reason || '').trim().length >= 3) return null;

    const itemLabel = String(line?.item_name || '').trim()
        || (Number.isInteger(Number(line?.item_id)) && Number(line?.item_id) > 0
            ? `item ${Number(line.item_id)}`
            : 'this item');
    return `Enter a price override reason of at least 3 characters for ${itemLabel} before checkout.`;
};

export const SPLIT_PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    qrph: 'QR Ph'
};

// Payment colors are shared by the checkout summaries so a tender keeps the
// same visual identity when it appears in the single-payment or split-payment
// flow. Labels remain visible because color is an aid, not the only identifier.
export const PAYMENT_METHOD_COLOR_STYLES = Object.freeze({
    cash: Object.freeze({
        selectClassName: 'border-amber-400 bg-amber-100 text-amber-950',
        inactiveSelectClassName: 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100',
        activeRingClassName: 'ring-amber-300',
        rowClassName: 'border-amber-300 bg-amber-100',
        badgeClassName: 'border-amber-300 bg-amber-200 text-amber-950',
        dotClassName: 'bg-amber-700',
        amountClassName: 'text-amber-900'
    }),
    gcash: Object.freeze({
        selectClassName: 'border-blue-400 bg-blue-100 text-blue-950',
        inactiveSelectClassName: 'border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100',
        activeRingClassName: 'ring-blue-300',
        rowClassName: 'border-blue-300 bg-blue-100',
        badgeClassName: 'border-blue-300 bg-blue-200 text-blue-950',
        dotClassName: 'bg-blue-800',
        amountClassName: 'text-blue-950'
    }),
    maya: Object.freeze({
        selectClassName: 'border-emerald-400 bg-emerald-100 text-emerald-950',
        inactiveSelectClassName: 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100',
        activeRingClassName: 'ring-emerald-300',
        rowClassName: 'border-emerald-300 bg-emerald-100',
        badgeClassName: 'border-emerald-300 bg-emerald-200 text-emerald-950',
        dotClassName: 'bg-emerald-800',
        amountClassName: 'text-emerald-950'
    }),
    card: Object.freeze({
        selectClassName: 'border-[#A66A45] bg-[#E8D2BF] text-[#4A2C1A]',
        inactiveSelectClassName: 'border-[#C49A7C] bg-[#FAF3ED] text-[#4A2C1A] hover:bg-[#F3E3D5]',
        activeRingClassName: 'ring-[#C58B64]',
        rowClassName: 'border-[#B9825A] bg-[#E8D2BF]',
        badgeClassName: 'border-[#A66A45] bg-[#D7B191] text-[#4A2C1A]',
        dotClassName: 'bg-[#6B3F24]',
        amountClassName: 'text-[#4A2C1A]'
    }),
    // Bank Transfer uses a dark indigo family, distinct from Employee Credit's navy.
    bank_transfer: Object.freeze({
        selectClassName: 'border-[#7C3AED] bg-[#EDE9FE] text-[#3B0764]',
        inactiveSelectClassName: 'border-violet-300 bg-violet-50 text-[#3B0764] hover:bg-violet-100',
        activeRingClassName: 'ring-violet-300',
        rowClassName: 'border-[#8B5CF6] bg-[#EDE9FE]',
        badgeClassName: 'border-[#8B5CF6] bg-[#DDD6FE] text-[#4C1D95]',
        dotClassName: 'bg-[#6D28D9]',
        amountClassName: 'text-[#4C1D95]'
    }),
    employee_credit: Object.freeze({
        selectClassName: 'border-[#1A4E8D] bg-[#DBEAFE] text-[#0B2E59]',
        inactiveSelectClassName: 'border-[#9AB6D4] bg-[#EFF6FF] text-[#0B2E59] hover:bg-[#DBEAFE]',
        activeRingClassName: 'ring-[#6F95BF]',
        rowClassName: 'border-[#6F95BF] bg-[#DBEAFE]',
        badgeClassName: 'border-[#6F95BF] bg-[#BFDBFE] text-[#0B2E59]',
        dotClassName: 'bg-[#1A4E8D]',
        amountClassName: 'text-[#0B2E59]'
    }),
    qrph: Object.freeze({
        selectClassName: 'border-violet-400 bg-violet-100 text-violet-950',
        inactiveSelectClassName: 'border-violet-300 bg-violet-50 text-violet-950 hover:bg-violet-100',
        activeRingClassName: 'ring-violet-300',
        rowClassName: 'border-violet-300 bg-violet-100',
        badgeClassName: 'border-violet-300 bg-violet-200 text-violet-950',
        dotClassName: 'bg-violet-800',
        amountClassName: 'text-violet-950'
    }),
    default: Object.freeze({
        selectClassName: 'border-slate-300 bg-slate-50 text-slate-900',
        inactiveSelectClassName: 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
        activeRingClassName: 'ring-slate-300',
        rowClassName: 'border-slate-200 bg-slate-50/70',
        badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
        dotClassName: 'bg-slate-500',
        amountClassName: 'text-slate-800'
    })
});

export const resolvePaymentMethodColorStyles = (value) => {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return PAYMENT_METHOD_COLOR_STYLES[normalizedValue] || PAYMENT_METHOD_COLOR_STYLES.default;
};

export const formatSplitPaymentMethod = (value) => {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return SPLIT_PAYMENT_METHOD_LABELS[normalizedValue]
        || normalizedValue.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
        || 'Payment';
};

// Manual quantity typing sanitizer: integer-only items keep the pre-existing
// digits-only filter untouched; decimal-eligible items (weight/volume UOM,
// e.g. weighed_goods sold per kg) additionally allow a single decimal point.
export const sanitizeQuantityInput = (rawValue, allowDecimal) => {
    if (!allowDecimal) return String(rawValue || '').replace(/[^0-9]/g, '');
    const cleaned = String(rawValue || '').replace(/[^0-9.]/g, '');
    const firstDotIndex = cleaned.indexOf('.');
    if (firstDotIndex === -1) return cleaned;
    return cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
};

export const toArray = (value) => (Array.isArray(value) ? value : []);
export const isSeniorPwdDiscountEligible = (value) => value === true || value === 1 || value === '1';
export const normalizePromoCode = (value) => String(value || '').trim().toUpperCase().slice(0, 40);

export const resolveEmployeeDiscountCreditPreference = (appliedDiscount, cart = []) => {
    const employeeDirectoryIds = new Set();
    if (String(appliedDiscount?.type || '').trim().toLowerCase() === 'employee') {
        const employeeDirectoryId = Number(appliedDiscount?.employee_directory_id);
        if (Number.isInteger(employeeDirectoryId) && employeeDirectoryId > 0) employeeDirectoryIds.add(employeeDirectoryId);
    }
    toArray(cart).forEach((line) => {
        const itemDiscount = line?.item_discount;
        if (String(itemDiscount?.discount_type || '').trim().toLowerCase() !== 'employee') return;
        const employeeDirectoryId = Number(itemDiscount?.employee_directory_id);
        if (Number.isInteger(employeeDirectoryId) && employeeDirectoryId > 0) employeeDirectoryIds.add(employeeDirectoryId);
    });
    const uniqueEmployeeDirectoryIds = [...employeeDirectoryIds];
    return {
        preferredEmployeeId: uniqueEmployeeDirectoryIds.length === 1 ? uniqueEmployeeDirectoryIds[0] : null,
        hasConflict: uniqueEmployeeDirectoryIds.length > 1
    };
};

export const EMPTY_DISCOUNT_DRAFT = {
    type: 'employee', method: 'percentage', rate: '15', amount: '', customer_name: '',
    id_number: '', employee_name: '', employee_id: '', employee_directory_id: '', reason: '', manager_pin: '', approver_user_id: '', eligible_item_ids: [], eligible_items: [], beneficiaries: [], promo_code: '', voucher_code: ''
};

export const calculateGovernedDiscount = (cart, application) => {
    const cartRows = toArray(cart).map((line, index) => ({
        ...line,
        __discount_line_ref: getDiscountLineRef(line, index)
    }));
    const eligibleItemIds = toArray(application?.eligible_item_ids);
    const eligibleItems = toArray(application?.eligible_items);
    const getGlobalBase = (line) => line?.global_discount_base_amount == null
        ? Number(line.quantity || 0) * Number(line.sale_price || 0)
        : Math.max(0, Number(line.global_discount_base_amount) || 0);
    const subtotal = round4(cartRows.reduce((sum, line) => sum + getGlobalBase(line), 0));
    if (!application) {
        return {
            vatRemoved: 0,
            vatExemptAmount: 0,
            discountAmount: 0,
            total: subtotal,
            lines: cartRows.map((line) => ({
                line_key: line.line_key || line.line_id || null,
                item_id: Number(line.item_id),
                discount_amount: 0,
                vat_removed: 0,
                vat_exempt_amount: 0,
                eligible_quantity: 0
            }))
        };
    }
    const statutory = application.type === 'senior' || application.type === 'pwd';
    if (statutory && toArray(application.beneficiaries).length > 0) {
        const calculations = toArray(application.beneficiaries).map((beneficiary) => calculateGovernedDiscount(cart, {
            ...application,
            beneficiaries: [],
            eligible_item_ids: toArray(beneficiary.eligible_items).map((entry) => Number(entry.item_id)),
            eligible_items: toArray(beneficiary.eligible_items)
        }));
        const vatRemoved = round4(calculations.reduce((sum, calculation) => sum + calculation.vatRemoved, 0));
        const vatExemptAmount = round4(calculations.reduce((sum, calculation) => sum + calculation.vatExemptAmount, 0));
        const discountAmount = round4(calculations.reduce((sum, calculation) => sum + calculation.discountAmount, 0));
        return { vatRemoved, vatExemptAmount, discountAmount, total: round4(subtotal - vatRemoved - discountAmount) };
    }
    const selectedByLineRef = new Map(eligibleItems
        .map((entry) => [String(entry?.line_ref || '').trim(), entry])
        .filter(([lineRef]) => lineRef));
    const selectedByItemId = new Map(eligibleItems
        .filter((entry) => !String(entry?.line_ref || '').trim())
        .map((entry) => [Number(entry?.item_id), entry]));
    const selectedItemIds = new Set(eligibleItemIds.map(Number));
    const useLegacySelectedItemIds = selectedByLineRef.size === 0 && selectedByItemId.size === 0;
    const restrictToSelections = selectedByLineRef.size > 0 || selectedByItemId.size > 0 || selectedItemIds.size > 0;
    const getSelectedEntry = (line) => {
        const lineRef = String(line?.__discount_line_ref || '').trim();
        if (lineRef && selectedByLineRef.has(lineRef)) return selectedByLineRef.get(lineRef);
        if (selectedByItemId.has(Number(line?.item_id))) return selectedByItemId.get(Number(line?.item_id));
        if (useLegacySelectedItemIds && selectedItemIds.has(Number(line?.item_id))) {
            return { item_id: Number(line?.item_id), eligible_quantity: null };
        }
        return null;
    };
    if (!statutory) {
        const getEligibleQuantity = (line) => {
            const selected = getSelectedEntry(line);
            if (!restrictToSelections || selected) {
                const requested = Number(selected?.eligible_quantity);
                return selected?.eligible_quantity != null && Number.isFinite(requested)
                    ? Math.min(Number(line.quantity || 0), Math.max(0, requested))
                    : Number(line.quantity || 0);
            }
            return 0;
        };
        const discountBase = restrictToSelections
            ? round4(cartRows.reduce((sum, line) => (
                getSelectedEntry(line)
                    ? sum + round4(getGlobalBase(line) * (Number(line.quantity || 0) > 0
                        ? getEligibleQuantity(line) / Number(line.quantity || 0)
                        : 0))
                    : sum
            ), 0))
            : subtotal;
        const discountAmount = application.method === 'fixed'
            ? Math.min(discountBase, Math.max(0, Number(application.amount || 0)))
            : Math.min(discountBase, discountBase * Math.min(100, Math.max(0, Number(application.rate || 0))) / 100);
        const eligibleRows = cartRows.filter((line) => !restrictToSelections || getSelectedEntry(line));
        // Chrome 80-84 iMin POS WebView has no Array.prototype.at (ES2022 / Chrome 92+). See DGFY-POS-Y (#664).
        const lastEligibleLine = eligibleRows[eligibleRows.length - 1];
        let allocatedDiscount = 0;
        const lines = cartRows.map((line) => {
            const gross = round4(getGlobalBase(line));
            const eligible = !restrictToSelections || Boolean(getSelectedEntry(line));
            const eligibleQuantity = getEligibleQuantity(line);
            const eligibleGross = round4(gross * (Number(line.quantity || 0) > 0
                ? eligibleQuantity / Number(line.quantity || 0)
                : 0));
            const lineDiscount = !eligible
                ? 0
                : application.method === 'fixed'
                    ? line === lastEligibleLine
                        ? round4(discountAmount - allocatedDiscount)
                        : round4(Math.min(discountAmount - allocatedDiscount, discountBase > 0 ? (eligibleGross / discountBase) * discountAmount : 0))
                    : round4(eligibleGross * Math.min(100, Math.max(0, Number(application.rate || 0))) / 100);
            allocatedDiscount = round4(allocatedDiscount + lineDiscount);
            return {
                line_key: line.line_key || line.line_id || null,
                item_id: Number(line.item_id),
                discount_amount: lineDiscount,
                vat_removed: 0,
                vat_exempt_amount: 0,
                eligible_quantity: eligibleQuantity
            };
        });
        return { vatRemoved: 0, vatExemptAmount: 0, discountAmount: round4(discountAmount), total: round4(subtotal - discountAmount), lines };
    }
    let vatRemoved = 0;
    let vatExemptAmount = 0;
    const lines = cartRows.map((line) => {
        const selected = getSelectedEntry(line);
        if (!selected) {
            return {
                line_key: line.line_key || line.line_id || null,
                item_id: Number(line.item_id),
                discount_amount: 0,
                vat_removed: 0,
                vat_exempt_amount: 0,
                eligible_quantity: 0
            };
        }
        const selectedQuantity = Number(selected.eligible_quantity);
        const quantity = selected.eligible_quantity == null || !Number.isFinite(selectedQuantity)
            ? Number(line.quantity || 0)
            : Math.min(Number(line.quantity || 0), Math.max(0, selectedQuantity));
        const globalUnitPrice = Number(line.quantity || 0) > 0
            ? getGlobalBase(line) / Number(line.quantity || 0)
            : 0;
        const gross = round4(quantity * globalUnitPrice);
        const exempt = (line.vat_type || 'vatable') === 'vatable' ? round4(gross / 1.12) : gross;
        vatExemptAmount = round4(vatExemptAmount + exempt);
        vatRemoved = round4(vatRemoved + gross - exempt);
        return {
            line_key: line.line_key || line.line_id || null,
            item_id: Number(line.item_id),
            discount_amount: round4(exempt * 0.20),
            vat_removed: round4(gross - exempt),
            vat_exempt_amount: exempt,
            eligible_quantity: quantity
        };
    });
    const discountAmount = round4(vatExemptAmount * 0.20);
    return { vatRemoved, vatExemptAmount, discountAmount, total: round4(subtotal - vatRemoved - discountAmount), lines };
};

export const formatQuantity = (value) => {
    const quantity = Number(value || 0);
    if (!Number.isFinite(quantity)) return '0';
    return Number.isInteger(quantity) ? String(quantity) : String(round4(quantity));
};

export const toValidPercentage = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
};

export const VAT_RATE = 0.12;
export const VAT_TYPE_LABEL = {
    vatable: 'VATable',
    vat_exempt: 'VAT Exempt',
    zero_rated: 'Zero Rated'
};
export const OFFLINE_HISTORY_ROW_PREFIX = 'offline-checkout-';

export const normalizeDiscountProfiles = (rawProfiles) => {
    let profiles = rawProfiles;
    if (typeof profiles === 'string') {
        try {
            profiles = JSON.parse(profiles);
        } catch {
            profiles = [];
        }
    }
    if (!Array.isArray(profiles)) return [];
    return profiles
        .map((profile) => ({
            name: String(profile?.name || '').trim(),
            percentage: toValidPercentage(profile?.percentage),
            active: profile?.active !== false
        }))
        .filter((profile) => profile.name.length > 0);
};

export const buildMissingFieldsMessage = (error) => {
    const missingFields = error?.response?.data?.errors?.missing_fields
        || error?.response?.data?.details?.missing_fields
        || [];
    if (!Array.isArray(missingFields) || missingFields.length === 0) return null;
    return `Missing POS setup fields: ${missingFields.join(', ')}`;
};

export const COMPLIANCE_ACTION_TARGET_BY_REASON = Object.freeze({
    BSP_OPS_REGISTRATION_REQUIRED: '/settings?tab=compliance#section-profile',
    BSP_PAYMENT_CONTROL_REQUIRED: '/settings?tab=compliance#section-profile',
    NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED: '/settings?tab=compliance#section-final-review',
    COMPLIANT_ACTIVATION_PENDING: '/settings?tab=compliance#section-final-review'
});

export const buildCompliancePolicyBlockerMessage = (error) => {
    const complianceDecision = error?.response?.data?.errors?.compliance;
    if (!complianceDecision || typeof complianceDecision !== 'object') return null;

    const reasonCode = String(complianceDecision.reason_code || '').trim().toUpperCase();
    if (!reasonCode) return null;

    const obligations = Array.isArray(complianceDecision.obligations)
        ? complianceDecision.obligations.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    const actionTarget = COMPLIANCE_ACTION_TARGET_BY_REASON[reasonCode] || '/settings?tab=compliance';
    const guidance = obligations[0] || 'Complete settings.';
    const compactTarget = actionTarget.replace('/settings?tab=compliance', 'Settings > Compliance');

    return {
        reasonCode,
        actionTarget,
        message: `Compliance policy blocked checkout (${reasonCode}). ${guidance} Fix: ${compactTarget}.`
    };
};

export const normalizeHistoryFilterDate = (value, boundary = 'start') => {
    if (!value) return null;
    const date = new Date(boundary === 'end' ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export const buildOfflineCheckoutHistoryRow = ({
    payload,
    queuedAt,
    cartSubtotal,
    calculatedDiscountAmount,
    serviceFeeAmount,
    restaurantServiceChargeAmount,
    vatBreakdown,
    cartTotal,
    selectedDiscount,
    manualDiscountRate,
    manualDiscountMode
}) => {
    const intentId = String(payload?.idempotency_key || '').trim();
    if (!intentId) return null;
    const queuedTimestamp = String(queuedAt || new Date().toISOString()).trim() || new Date().toISOString();
    const invoiceSuffix = intentId.slice(-6).toUpperCase();
    const lines = Array.isArray(payload?.offline_line_items_snapshot)
        ? payload.offline_line_items_snapshot.map((line, index) => ({
            line_id: line?.line_id || line?.line_key || `offline-line-${index + 1}`,
            item_id: Number(line?.item_id || 0) || undefined,
            quantity: Number(line?.quantity || 0),
            sale_price: Number(line?.sale_price || 0),
            line_subtotal: round4(Number(line?.quantity || 0) * Number(line?.sale_price || 0)),
            item: {
                name: String(line?.item_name || `Item #${line?.item_id || index + 1}`)
            },
            fnb_modifiers_snapshot: Array.isArray(line?.fnb_modifiers_snapshot) ? line.fnb_modifiers_snapshot : [],
            fnb_special_instructions: line?.special_instructions || ''
        }))
        : [];
    return {
        pos_transaction_id: `${OFFLINE_HISTORY_ROW_PREFIX}${intentId}`,
        offline_intent_id: intentId,
        offline_sync_state: 'pending_sync',
        invoice_number: `PENDING-${invoiceSuffix}`,
        created_at: queuedTimestamp,
        order_source: 'in_store',
        payment_type: String(payload?.payment_type || '').trim() || 'cash',
        payment_breakdown: payload?.payment_breakdown || null,
        order_method: String(payload?.order_method || '').trim() || 'takeout',
        total_amount: Number(cartTotal || 0),
        subtotal_amount: Number(cartSubtotal || 0),
        discount_amount: Number(calculatedDiscountAmount || 0),
        discount_label_snapshot: selectedDiscount?.name || (calculatedDiscountAmount > 0 ? 'Other Discount' : null),
        discount_rate_snapshot: selectedDiscount
            ? Number(selectedDiscount.percentage || 0)
            : (manualDiscountMode === 'percentage' && manualDiscountRate > 0 ? Number(manualDiscountRate) : null),
        service_fee_amount: Number(serviceFeeAmount || 0),
        restaurant_service_charge_amount: Number(restaurantServiceChargeAmount || 0),
        vatable_sales: Number(vatBreakdown?.vatableSales || 0),
        vat_amount: Number(vatBreakdown?.vatAmount || 0),
        vat_exempt_sales: Number(vatBreakdown?.vatExemptSales || 0),
        zero_rated_sales: Number(vatBreakdown?.zeroRatedSales || 0),
        lines,
        cashier: {
            username: 'Offline cashier'
        }
    };
};

export const rowMatchesHistoryFilters = (row, filters) => {
    if (!matchesPosHistorySearch(row, filters?.historySearch)) return false;

    const paymentType = String(filters?.historyPaymentType || 'all').trim();
    if (!matchesPosTransactionPaymentMethod(row, paymentType)) {
        return false;
    }

    const orderMethod = String(filters?.historyOrderMethod || 'all').trim();
    if (orderMethod !== 'all' && String(row?.order_method || '').trim() !== orderMethod) {
        return false;
    }

    const orderSource = String(filters?.historyOrderSource || 'all').trim();
    if (orderSource !== 'all' && String(row?.order_source || '').trim() !== orderSource) {
        return false;
    }

    const cashierNameFilter = String(filters?.historyCashierName || '').trim().toLowerCase();
    if (cashierNameFilter) {
        const cashierNames = [
            row?.cashier?.username,
            row?.acceptedByUser?.username
        ].map((value) => String(value ?? '').trim().toLowerCase());
        if (!cashierNames.some((value) => value.includes(cashierNameFilter))) {
            return false;
        }
    }

    const dateValue = row?.created_at ? new Date(row.created_at).getTime() : Number.NaN;
    const fromTime = normalizeHistoryFilterDate(filters?.historyDateFrom, 'start');
    const toTime = normalizeHistoryFilterDate(filters?.historyDateTo, 'end');
    if (Number.isFinite(fromTime) && (!Number.isFinite(dateValue) || dateValue < fromTime)) {
        return false;
    }
    if (Number.isFinite(toTime) && (!Number.isFinite(dateValue) || dateValue > toTime)) {
        return false;
    }

    const statusFilter = String(filters?.historyStatus || 'all').trim();
    if (statusFilter === 'pending_sync') {
        return row?.offline_sync_state === 'pending_sync';
    }
    if (statusFilter === 'voided') {
        return false;
    }
    if (statusFilter === 'completed' && row?.offline_sync_state === 'pending_sync') {
        return false;
    }

    return true;
};

export const buildStockExceededMessage = ({ itemName, requestedQty, availableStock, unit }) => (
    `${itemName}: requested ${money(requestedQty)}${unit ? ` ${unit}` : ''}, only ${money(availableStock)}${unit ? ` ${unit}` : ''} in stock.`
);

export const getLineKey = (line = {}) => line.line_key || line.item_id;
export const createCartLineKey = (itemId) => `line-${itemId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const resolvePosCatalogImageSources = (item = {}) => {
    const variants = item?.storefront_image_variants || item?.pos_image_variants || {};
    const resolveVariantSet = (variantSet = {}) => {
        const thumbnailUrl = resolveAssetUrl(variantSet?.thumbnail_url || '');
        const mediumUrl = resolveAssetUrl(variantSet?.medium_url || '');
        const largeUrl = resolveAssetUrl(variantSet?.large_url || '');
        const candidates = new Map();

        [
            [thumbnailUrl, 400],
            [mediumUrl, 1024],
            [largeUrl, 1920]
        ].forEach(([url, width]) => {
            if (url && !candidates.has(url)) candidates.set(url, width);
        });

        return {
            thumbnailUrl,
            mediumUrl,
            largeUrl,
            srcSet: candidates.size > 1
                ? Array.from(candidates, ([url, width]) => `${url} ${width}w`).join(', ')
                : undefined
        };
    };
    const configuredSrc = resolveAssetVariantUrl(item?.storefront_image_url, 'thumbnail');
    const configuredLargeSrc = resolveAssetVariantUrl(item?.storefront_image_url, 'large');
    const fallbackVariants = resolveVariantSet(variants);
    const avifVariants = resolveVariantSet(variants?.avif);
    const webpVariants = resolveVariantSet(variants?.webp);
    return {
        configuredSrc,
        configuredLargeSrc,
        src: fallbackVariants.thumbnailUrl || configuredSrc || '',
        srcSet: fallbackVariants.srcSet,
        avifSrcSet: avifVariants.srcSet,
        webpSrcSet: webpVariants.srcSet,
        placeholderSrc: resolveAssetUrl(variants?.placeholder_url || '')
    };
};

export const inferReceiptContract = (transaction, fallbackContract = null) => {
    if (fallbackContract?.document_type) {
        return fallbackContract;
    }

    const documentType = String(transaction?.document_type || '').toLowerCase();
    if (documentType === 'non_fiscal_slip') {
        return {
            document_type: 'non_fiscal_slip',
            label: 'NON-FISCAL SLIP'
        };
    }
    if (documentType === 'fiscal_invoice') {
        return {
            document_type: 'fiscal_invoice',
            label: 'FISCAL INVOICE'
        };
    }

    const invoiceNumber = String(transaction?.invoice_number || '').toUpperCase();
    if (invoiceNumber.startsWith('NFS-')) {
        return {
            document_type: 'non_fiscal_slip',
            label: 'NON-FISCAL SLIP'
        };
    }
    if (invoiceNumber.startsWith('INV-')) {
        return {
            document_type: 'fiscal_invoice',
            label: 'FISCAL INVOICE'
        };
    }

    return null;
};
