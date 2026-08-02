import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Accessibility,
    AlertCircle,
    BadgeCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Delete,
    Filter,
    Folder,
    Gauge,
    Info,
    Lock,
    MessageSquare,
    Minus,
    Pencil,
    Plus,
    Percent,
    Printer,
    Search,
    ShieldCheck,
    Tag,
    UserRound,
    X,
    Eye,
    EyeOff,
    Receipt,
    ArrowLeft,
    Utensils,
    Trash2,
    LayoutGrid,
    ShoppingCart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
    fetchPosCatalog,
    createPosCheckout,
    closePosDay,
    fetchPosTransactions,
    fetchPosTransactionById,
    voidPosTransaction,
    fetchPosDeviceStatus,
    printPosReceipt,
    openPosDeviceDrawer,
    fetchPosDiscountApprovers,
    verifyPosDiscountApproval
} from '../services/posService';
import { fetchEmployeeCreditAccount } from '../services/employeeCreditService.js';
import {
    TERMINAL_QUEUE_STATUS,
    enqueueTerminalOperationIntent,
    getReplayCandidateEntries,
    hydrateTerminalOperationQueueStore,
    listTerminalOperationQueueEntries,
    markTerminalOperationFailedManualResolution,
    markTerminalOperationReplayed,
    markTerminalOperationReplaying,
    markTerminalOperationRetryScheduled
} from '../services/terminalOperationQueueStore.js';
import { loadOfflinePosSnapshot, saveOfflinePosSnapshot } from '../services/offlinePosSnapshotStore.js';
import { usePosCartDraft } from '../hooks/usePosCartDraft.js';
import EmployeeCreditPaymentPanel from './EmployeeCreditPaymentPanel.jsx';
import {
    DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD,
    getCatalogStockColorClassName,
    isSellAvailableCatalogItem,
    isServiceCatalogItem,
    normalizeLowStockDisplayThreshold
} from '../utils/posCatalogAvailability.js';
import { subscribeToPosCatalogUpdates } from '../utils/posCatalogRefresh.js';
import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';
import { getFolders } from '@/services/itemService.js';
import { getAllSettings } from '@/services/settingsService';
import {
    advanceAssetImageFallback,
    resolveAppAssetUrl,
    resolveAssetUrl,
    resolveAssetVariantUrl
} from '@/src/utils/assetUrl.js';
import { openSkupervisorPath } from '../utils/skupervisorHandoff.js';
import {
    notifyIminWebPosReady,
    openDrawerWithIminBridge,
    printOrderWithIminBridge,
    printReceiptWithIminBridge
} from '../utils/iminHardwareBridge.js';
import { PosAddToCartToastContainer } from './PosAddToCartToastContainer.jsx';
import { calculateCatalogGridCapacity } from '../utils/catalogGridCapacity.js';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';
import { FnbWorkflowPanel } from './FnbWorkflowPanel.jsx';
import { ServicesWorkflowPanel } from './ServicesWorkflowPanel.jsx';

const ReceiptPrintView = lazy(() => import('./ReceiptPrintView'));
const OrderPreviewView = lazy(() => import('./OrderPreviewView.jsx'));

const CATALOG_GRID_GAP_PX = 8;
const CATALOG_DESKTOP_CARD_HEIGHT_PX = 176;
const CATALOG_DESKTOP_CARD_MIN_WIDTH_PX = 176;
const CATALOG_MOBILE_CARD_HEIGHT_PX = 120;
const CATALOG_TABLET_CARD_HEIGHT_PX = 112;
const CATALOG_TABLET_CARD_MIN_WIDTH_PX = 160;
const POSBarcodeScanner = lazy(() => import('./POSBarcodeScanner.jsx'));
const POSTransactionHistoryPanel = lazy(() => import('./POSTransactionHistoryPanel.jsx'));
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const POS_ITEM_FALLBACK_IMAGE = '/dgfy-horizontal_logo-removebg-preview.png';
const POS_ITEM_IMAGE_MAP = [
    { match: ['coffee'], src: '/pos-items/coffee.jpg' },
    { match: ['juice'], src: '/pos-items/juice.jpg' },
    { match: ['mango float', 'mangofloat'], src: '/pos-items/mangofloat.jpg' },
    { match: ['siomai pork', 'siomai'], src: '/pos-items/siomai%20Pork.jpg' },
    { match: ['baked macaroni', 'macaroni'], src: '/pos-items/baked%20macaroni.jpg' },
    { match: ['cheese stick', 'cheese sticks'], src: '/pos-items/cheese%20Stick.jpg' },
    { match: ['pork sisig', 'sisig'], src: '/pos-items/pork%20sisig.jpg' },
    { match: ['sandwich', 'sandwitch'], src: '/pos-items/sandwich.jpg' },
    { match: ['ginger tea', 'ginger'], src: '/pos-items/ginger-tea.jpg' },
    { match: ['herbal tea', 'herbal'], src: '/pos-items/herbal-tea.jpg' },
    { match: ['burger'], src: '/pos-items/burger.jpg' },
    { match: ['chicken wings', 'wings'], src: '/pos-items/chicken%20wings.jpg' },
    { match: ['chicken tenders', 'tenders'], src: '/pos-items/chicken%20Tenders.jpg' }
];
const POS_FORM_INPUT_CLASS = 'mt-1 focus-visible:border-blue-400 focus-visible:ring-blue-500';
const POS_FORM_SELECT_CLASS = 'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
const RECEIPT_PAPER_OPTIONS = [
    { value: '80mm', label: '80mm (3 1/8 in)' },
    { value: '57mm', label: '57mm (2 1/4 in)' }
];

const money = (value) => Number(value || 0).toFixed(2);
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
// Manual quantity typing sanitizer: integer-only items keep the pre-existing
// digits-only filter untouched; decimal-eligible items (weight/volume UOM,
// e.g. weighed_goods sold per kg) additionally allow a single decimal point.
const sanitizeQuantityInput = (rawValue, allowDecimal) => {
    if (!allowDecimal) return String(rawValue || '').replace(/[^0-9]/g, '');
    const cleaned = String(rawValue || '').replace(/[^0-9.]/g, '');
    const firstDotIndex = cleaned.indexOf('.');
    if (firstDotIndex === -1) return cleaned;
    return cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
};
const toArray = (value) => (Array.isArray(value) ? value : []);
const isSeniorPwdDiscountEligible = (value) => value === true || value === 1 || value === '1';
const normalizePromoCode = (value) => String(value || '').trim().toUpperCase().slice(0, 40);
const normalizeCommercialPromoConfigs = (settings = {}) => {
    const promos = Array.isArray(settings?.storefront_promos?.value) ? settings.storefront_promos.value : [];
    const legacyPromo = settings?.storefront_promo?.value;
    const normalized = promos
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({ ...entry, promo_code: normalizePromoCode(entry.promo_code) }));
    if (legacyPromo && typeof legacyPromo === 'object' && !Array.isArray(legacyPromo)) {
        const legacyCode = normalizePromoCode(legacyPromo.promo_code);
        if (legacyCode && !normalized.some((entry) => normalizePromoCode(entry.promo_code) === legacyCode)) {
            normalized.push({ ...legacyPromo, promo_code: legacyCode });
        }
    }
    return normalized;
};
const resolveCompanyIconFallbackUrl = (settings = {}) => (
    resolveAssetUrl(settings?.storefront_profile_image_url || settings?.profile_image_url || '')
    || resolveAppAssetUrl(POS_ITEM_FALLBACK_IMAGE)
);
const EMPTY_DISCOUNT_DRAFT = {
    type: 'senior', method: 'percentage', rate: '20', amount: '', customer_name: '',
    id_number: '', employee_name: '', employee_id: '', reason: '', manager_pin: '', approver_user_id: '', eligible_item_ids: [], eligible_items: [], promo_code: ''
};
const DISCOUNT_TYPE_OPTIONS = [
    { value: 'senior', label: 'Senior Citizen', icon: UserRound },
    { value: 'pwd', label: 'PWD', icon: Accessibility },
    { value: 'employee', label: 'Employee', icon: BadgeCheck },
    { value: 'promo', label: 'Promo', icon: Tag },
    { value: 'manual', label: 'Manual', icon: Pencil }
];
const DISCOUNT_INFO_MESSAGES = {
    senior: 'Select a discount type to see the required fields. Other discount types will show different verification details.',
    pwd: 'Select a discount type to see the required fields. Other discount types will show different verification details.',
    employee: 'Employee discount requires valid employee verification and authorization.',
    promo: 'Provide the promo details below to apply the discount.',
    manual: 'Manual discounts require a valid reason and admin authorization.'
};
const calculateGovernedDiscount = (cart, application) => {
    const cartRows = toArray(cart);
    const eligibleItemIds = toArray(application?.eligible_item_ids);
    const eligibleItems = toArray(application?.eligible_items);
    const subtotal = round4(cartRows.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.sale_price || 0), 0));
    if (!application) return { vatRemoved: 0, vatExemptAmount: 0, discountAmount: 0, total: subtotal };
    const statutory = application.type === 'senior' || application.type === 'pwd';
    if (!statutory) {
        const selectedItemIds = new Set(eligibleItemIds.map(Number));
        const discountBase = application.type === 'promo' && selectedItemIds.size > 0
            ? round4(cartRows.reduce((sum, line) => (
                selectedItemIds.has(Number(line.item_id))
                    ? sum + Number(line.quantity || 0) * Number(line.sale_price || 0)
                    : sum
            ), 0))
            : subtotal;
        const discountAmount = application.method === 'fixed'
            ? Math.min(discountBase, Math.max(0, Number(application.amount || 0)))
            : Math.min(discountBase, discountBase * Math.min(100, Math.max(0, Number(application.rate || 0))) / 100);
        return { vatRemoved: 0, vatExemptAmount: 0, discountAmount: round4(discountAmount), total: round4(subtotal - discountAmount) };
    }
    const selected = new Map(eligibleItems.length > 0
        ? eligibleItems.map((entry) => [Number(entry?.item_id), Number(entry?.eligible_quantity)])
        : eligibleItemIds.map((itemId) => [Number(itemId), null]));
    let vatRemoved = 0;
    let vatExemptAmount = 0;
    cartRows.forEach((line) => {
        const selectedQuantity = selected.get(Number(line.item_id));
        if (selectedQuantity === undefined) return;
        const quantity = selectedQuantity == null
            ? Number(line.quantity || 0)
            : Math.min(Number(line.quantity || 0), Math.max(0, selectedQuantity));
        const gross = round4(quantity * Number(line.sale_price || 0));
        const exempt = (line.vat_type || 'vatable') === 'vatable' ? round4(gross / 1.12) : gross;
        vatExemptAmount = round4(vatExemptAmount + exempt);
        vatRemoved = round4(vatRemoved + gross - exempt);
    });
    const discountAmount = round4(vatExemptAmount * 0.20);
    return { vatRemoved, vatExemptAmount, discountAmount, total: round4(subtotal - vatRemoved - discountAmount) };
};
const formatQuantity = (value) => {
    const quantity = Number(value || 0);
    if (!Number.isFinite(quantity)) return '0';
    return Number.isInteger(quantity) ? String(quantity) : String(round4(quantity));
};
// Mobile-only "fly to checkout bar" animation. Fires after the cart update (never blocks or
// delays it), animates a cloned .product-image from the tapped card to #checkout-bar, and
// removes itself on finish/cancel. Skips silently if not mobile, no image, or no target -
// never throws, never touches cart/backend state.
const flyImageToCheckoutBar = (cardElement) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.matchMedia('(max-width: 639.98px)').matches) return;
    if (!cardElement) return;

    const sourceImg = cardElement.querySelector('.product-image');
    if (!sourceImg || typeof sourceImg.animate !== 'function') return;

    const checkoutBar = document.getElementById('checkout-bar');
    if (!checkoutBar) return;
    // Land on the Checkout button (right side of the bar) instead of the bar's midpoint;
    // falls back to the bar itself if the button isn't in the DOM for some reason.
    const checkoutTarget = document.getElementById('checkout-bar-button') || checkoutBar;

    const sourceRect = sourceImg.getBoundingClientRect();
    if (sourceRect.width === 0 || sourceRect.height === 0) return;
    const targetRect = checkoutTarget.getBoundingClientRect();

    const size = 44;
    const clone = sourceImg.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.cssText = [
        'position: fixed',
        `left: ${sourceRect.left + (sourceRect.width / 2) - (size / 2)}px`,
        `top: ${sourceRect.top + (sourceRect.height / 2) - (size / 2)}px`,
        `width: ${size}px`,
        `height: ${size}px`,
        'border-radius: 9999px',
        'object-fit: cover',
        'pointer-events: none',
        'z-index: 2147483647',
        'will-change: transform, opacity'
    ].join(';');
    document.body.appendChild(clone);

    const deltaX = (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2);
    const deltaY = (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2);

    const animation = clone.animate(
        [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
            { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.35}px) scale(0.7)`, opacity: 1, offset: 0.6 },
            { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.15)`, opacity: 0, offset: 1 }
        ],
        { duration: 550, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' }
    );

    const cleanup = () => clone.remove();
    if (animation.finished && typeof animation.finished.then === 'function') {
        animation.finished.then(cleanup).catch(cleanup);
    } else {
        animation.onfinish = cleanup;
        animation.oncancel = cleanup;
    }
};

const toValidPercentage = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
};
const VAT_RATE = 0.12;
const VAT_TYPE_LABEL = {
    vatable: 'VATable',
    vat_exempt: 'VAT Exempt',
    zero_rated: 'Zero Rated'
};
const OFFLINE_HISTORY_ROW_PREFIX = 'offline-checkout-';
const normalizeDiscountProfiles = (rawProfiles) => {
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

const buildMissingFieldsMessage = (error) => {
    const missingFields = error?.response?.data?.errors?.missing_fields
        || error?.response?.data?.details?.missing_fields
        || [];
    if (!Array.isArray(missingFields) || missingFields.length === 0) return null;
    return `Missing POS setup fields: ${missingFields.join(', ')}`;
};
const buildFnbRecipeBlockerMessage = (error) => {
    const details = error?.response?.data?.errors || error?.response?.data?.details || {};
    const reasonCode = String(details?.reason_code || '').trim().toUpperCase();
    if (reasonCode === 'FNB_RECIPE_INGREDIENT_SHORTFALL') {
        const product = details.product_name || 'Selected menu item';
        const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
        const unit = details.unit_of_measure ? ` ${details.unit_of_measure}` : '';
        const location = details.location_id ? ` at location ${details.location_id}` : '';
        return `${product}: ${ingredient} short${location}. Avail ${details.available ?? 0}${unit}; req ${details.requested ?? ''}${unit}.`;
    }
    if (reasonCode === 'FNB_RECIPE_UOM_INCOMPATIBLE') {
        const product = details.product_name || 'Selected menu item';
        const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
        return `${product}: ${ingredient} unit mismatch (${details.recipe_uom || 'recipe'} to ${details.ingredient_uom || 'stock'}). Update UOM.`;
    }
    if (reasonCode === 'FNB_KITCHEN_ORDER_UNAVAILABLE') {
        return 'Kitchen order unavailable. Refresh F&B setup.';
    }
    return null;
};
const buildValidationDetailMessage = (error) => {
    const fnbRecipeBlocker = buildFnbRecipeBlockerMessage(error);
    if (fnbRecipeBlocker) return fnbRecipeBlocker;
    if (error?.response?.status !== 422) return null;

    const validationErrors = error?.response?.data?.errors;
    if (Array.isArray(validationErrors) && validationErrors.length > 0) {
        const summarized = validationErrors
            .map((entry) => {
                const field = String(entry?.field || '').trim();
                const message = String(entry?.message || '').trim();
                if (!message) return null;
                return field ? `${field}: ${message}` : message;
            })
            .filter(Boolean);

        if (summarized.length > 0) {
            return summarized.slice(0, 2).join(' | ');
        }
    }

    const fallback = String(error?.response?.data?.message || '').trim();
    return fallback || null;
};
const COMPLIANCE_ACTION_TARGET_BY_REASON = Object.freeze({
    BSP_OPS_REGISTRATION_REQUIRED: '/settings?tab=compliance#section-profile',
    BSP_PAYMENT_CONTROL_REQUIRED: '/settings?tab=compliance#section-profile',
    NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED: '/settings?tab=compliance#section-final-review',
    COMPLIANT_ACTIVATION_PENDING: '/settings?tab=compliance#section-final-review'
});
const buildCompliancePolicyBlockerMessage = (error) => {
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

const normalizeHistoryFilterDate = (value, boundary = 'start') => {
    if (!value) return null;
    const date = new Date(boundary === 'end' ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const buildOfflineCheckoutHistoryRow = ({
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
        order_method: String(payload?.order_method || '').trim() || 'takeout',
        total_amount: Number(cartTotal || 0),
        subtotal_amount: Number(cartSubtotal || 0),
        discount_amount: Number(calculatedDiscountAmount || 0),
        discount_label_snapshot: selectedDiscount?.name || (calculatedDiscountAmount > 0 ? 'Manual Discount' : null),
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

const rowMatchesHistoryFilters = (row, filters) => {
    const search = String(filters?.historySearch || '').trim().toLowerCase();
    if (search) {
        const haystack = [
            row?.invoice_number,
            row?.offline_intent_id,
            row?.cashier?.username,
            row?.acceptedByUser?.username
        ].map((value) => String(value || '').toLowerCase());
        if (!haystack.some((value) => value.includes(search))) {
            return false;
        }
    }

    const paymentType = String(filters?.historyPaymentType || 'all').trim();
    if (paymentType !== 'all' && String(row?.payment_type || '').trim() !== paymentType) {
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

    const cashierIdFilter = String(filters?.historyCashierId || '').trim();
    if (cashierIdFilter) {
        const cashierId = String(row?.cashier_id || row?.cashier?.id || row?.acceptedByUser?.id || '').trim();
        if (!cashierId.includes(cashierIdFilter)) {
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
const buildStockExceededMessage = ({ itemName, requestedQty, availableStock, unit }) => (
    `${itemName}: requested ${money(requestedQty)}${unit ? ` ${unit}` : ''}, only ${money(availableStock)}${unit ? ` ${unit}` : ''} in stock.`
);
const getLineKey = (line = {}) => line.line_key || line.item_id;
const createCartLineKey = (itemId) => `line-${itemId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const CatalogItemBadges = ({
    isServiceItem = false,
    isAlwaysAvailable = false,
    isBestSeller = false,
    overlay = false
}) => {
    if (!isServiceItem && !isAlwaysAvailable && !isBestSeller) return null;

    const sharedClassName = overlay
        ? 'border-white/30 bg-slate-950/55 text-white'
        : 'border-blue-200 bg-blue-50 text-[#1A4E8D]';
    const bestSellerClassName = overlay
        ? 'border-amber-200/70 bg-amber-500/85 text-white'
        : 'border-amber-200 bg-amber-50 text-amber-700';

    return (
        <div data-pos-catalog-badges="true" className="flex min-w-0 flex-wrap items-center gap-1">
            {isServiceItem && (
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${sharedClassName}`}>
                    Service
                </span>
            )}
            {isAlwaysAvailable && (
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${sharedClassName}`}>
                    Always available
                </span>
            )}
            {isBestSeller && (
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${bestSellerClassName}`}>
                    Best seller
                </span>
            )}
        </div>
    );
};
const getFnbModifierGroups = (item = {}) => (
    Array.isArray(item.fnbModifierGroups) ? item.fnbModifierGroups : []
);
const getActiveModifierOptions = (group = {}) => (
    (Array.isArray(group.options) ? group.options : []).filter((option) => option?.is_active !== false)
);
const getModifierGroupMin = (group = {}) => {
    const through = group.FnbItemModifierGroup || group.fnbItemModifierGroup || {};
    const required = through.is_required_override == null ? group.required === true : through.is_required_override === true;
    const min = Number.parseInt(group.min_select || 0, 10) || 0;
    return required ? Math.max(1, min) : min;
};
const buildDefaultLineModifiers = (item = {}) => getFnbModifierGroups(item).flatMap((group) => {
    const minSelect = getModifierGroupMin(group);
    if (minSelect <= 0) return [];
    const activeOptions = getActiveModifierOptions(group);
    const defaultOptions = activeOptions.filter((option) => option?.is_default === true);
    const selected = (defaultOptions.length > 0 ? defaultOptions : activeOptions).slice(0, minSelect);
    return selected.map((option) => ({
        modifier_group_id: Number(group.modifier_group_id),
        modifier_option_id: Number(option.modifier_option_id)
    }));
});
const resolveModifierSnapshot = (line = {}, modifiers = line.line_modifiers || []) => {
    const groups = Array.isArray(line.modifier_groups) ? line.modifier_groups : [];
    return (Array.isArray(modifiers) ? modifiers : []).map((modifier) => {
        const group = groups.find((entry) => Number(entry.modifier_group_id) === Number(modifier.modifier_group_id));
        const option = getActiveModifierOptions(group).find((entry) => Number(entry.modifier_option_id) === Number(modifier.modifier_option_id));
        if (!group || !option) return null;
        return {
            modifier_group_id: Number(group.modifier_group_id),
            modifier_option_id: Number(option.modifier_option_id),
            group_name: group.display_name || group.name || null,
            option_name: option.name || null,
            price_delta: round4(option.price_delta || 0)
        };
    }).filter(Boolean);
};
const resolveModifierDelta = (line = {}, modifiers = line.line_modifiers || []) => (
    resolveModifierSnapshot(line, modifiers).reduce((sum, modifier) => round4(sum + Number(modifier.price_delta || 0)), 0)
);
const buildKitchenStationSnapshot = (item = {}) => {
    const route = Array.isArray(item.fnbKitchenRoutes) ? item.fnbKitchenRoutes.find((entry) => entry?.is_primary !== false) : null;
    return {
        kitchen_station_id: route?.kitchen_station_id || null,
        course: route?.default_course || null
    };
};

const CHECKOUT_QUEUE_OPERATION = 'checkout';
const CHECKOUT_QUEUE_MAX_RETRIES = 5;
const CHECKOUT_REPLAY_BATCH_SIZE = 20;
const RETRYABLE_CHECKOUT_REPLAY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const CHECKOUT_RETRY_BACKOFF_BASE_MS = 1500;

const isCheckoutQueueEntry = (entry) => (
    String(entry?.operation || '').trim() === CHECKOUT_QUEUE_OPERATION
);

const isRetryableCheckoutReplayError = (error) => {
    if (!error?.response) return true;
    const status = Number(error?.response?.status || 0);
    return RETRYABLE_CHECKOUT_REPLAY_STATUS_CODES.has(status);
};

const resolveCheckoutReplayErrorDetails = (error) => ({
      message: String(error?.response?.data?.message || error?.message || 'Replay failed').trim(),
    code: String(error?.response?.data?.error_code || error?.code || '').trim() || undefined,
    status: Number(error?.response?.status || 0) || undefined
});

const computeCheckoutReplayBackoffMs = (attemptCount = 1) => {
    const jitterMs = Math.floor(Math.random() * 250);
    return Math.min(90_000, (CHECKOUT_RETRY_BACKOFF_BASE_MS * (2 ** Math.max(0, attemptCount - 1))) + jitterMs);
};

const createIdempotencyKey = () => {
    if (window?.crypto?.randomUUID) return window.crypto.randomUUID();
    return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const resolveMappedPosItemImage = (item = {}) => {
    const itemName = String(item?.name || item?.item_name || item?.itemName || item?.title || '').trim().toLowerCase();
    if (!itemName) return '';
    const mapped = POS_ITEM_IMAGE_MAP.find((entry) => (
        Array.isArray(entry.match) && entry.match.some((token) => itemName.includes(String(token).toLowerCase()))
    ));
    return mapped?.src || '';
};

const resolvePosCatalogImageSources = (item = {}, settings = {}) => {
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
    const mappedSrc = resolveAssetVariantUrl(resolveAppAssetUrl(resolveMappedPosItemImage(item)), 'thumbnail');
    const fallbackSrc = resolveCompanyIconFallbackUrl(settings);
    const fallbackVariants = resolveVariantSet(variants);
    const avifVariants = resolveVariantSet(variants?.avif);
    const webpVariants = resolveVariantSet(variants?.webp);
    return {
        configuredSrc,
        configuredLargeSrc,
        mappedSrc,
        fallbackSrc,
        src: fallbackVariants.thumbnailUrl || configuredSrc || mappedSrc || fallbackSrc,
        srcSet: fallbackVariants.srcSet,
        avifSrcSet: avifVariants.srcSet,
        webpSrcSet: webpVariants.srcSet,
        placeholderSrc: resolveAssetUrl(variants?.placeholder_url || '')
    };
};

const PosResponsiveImage = React.memo(({
    sources = {},
    style,
    onError,
    ...imageProps
}) => (
    <picture style={{ display: 'contents' }}>
        {sources.avifSrcSet ? <source type="image/avif" srcSet={sources.avifSrcSet} sizes={imageProps.sizes} /> : null}
        {sources.webpSrcSet ? <source type="image/webp" srcSet={sources.webpSrcSet} sizes={imageProps.sizes} /> : null}
        <img
            {...imageProps}
            src={sources.src}
            srcSet={sources.srcSet}
            style={{
                backgroundColor: '#F1F5F9',
                backgroundImage: sources.placeholderSrc ? `url(${sources.placeholderSrc})` : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                ...style
            }}
            onError={(event) => {
                event.currentTarget.parentElement
                    ?.querySelectorAll('source')
                    .forEach((source) => source.remove());
                onError?.(event);
            }}
        />
    </picture>
));
PosResponsiveImage.displayName = 'PosResponsiveImage';

const inferReceiptContract = (transaction, fallbackContract = null) => {
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

const CartItemThumbnail = React.memo(({ catalog, line, receiptSettings }) => {
    const item = (Array.isArray(catalog) ? catalog.find((i) => i.item_id === line.item_id) : null) || line;
    const imageSources = resolvePosCatalogImageSources(item, receiptSettings);
    const [imageFailed, setImageFailed] = useState(false);

    if (imageSources.src && !imageFailed) {
        return (
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200/80 shadow-xs flex items-center justify-center">
                <PosResponsiveImage
                    sources={imageSources}
                    alt={line.item_name || 'Item'}
                    loading="lazy"
                    decoding="async"
                    width={36}
                    height={36}
                    sizes="36px"
                    className="h-full w-full object-cover object-center"
                    onError={() => setImageFailed(true)}
                />
            </div>
        );
    }

    return (
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-400">
            <Utensils className="h-4 w-4" aria-hidden="true" />
        </div>
    );
});
CartItemThumbnail.displayName = 'CartItemThumbnail';

export default function POSCheckoutTerminal({
    sessionLocked = false,
    isMsmeMode = false,
    sidebarCollapsed = false,
    canViewHistory = true,
    terminalUser = null,
    selectedLocationId = null,
    activeShiftId = null,
    terminalId = '',
    terminalMeta = null,
    offlineSnapshotScope: providedOfflineSnapshotScope = {},
    onCheckoutCompleted = null,
    checkoutBlockedReason = '',
    onManualUniversalSync = async () => ({ allowed: false }),
    manualSyncPolicy = {},
    universalPendingSyncCount = 0,
    complianceBlockerDetails = null,
    modalOnly = false,
    viewMode: controlledViewMode = null,
    onViewModeChange = null,
    externalReceiptTransactionId = null,
    onExternalReceiptHydrated = null,
    onExternalReceiptClosed = null,
    externalHistoryQuery = '',
    onExternalHistoryHydrated = null,
    externalCatalogSearch = '',
    onExternalCatalogHydrated = null,
    fnbContext = null,
    workflowMode = null
}) {
    useEffect(() => {
        notifyIminWebPosReady();
    }, []);

    const [viewMode, setViewMode] = useState('checkout');
    const [catalog, setCatalog] = useState([]);
    const [catalogImageErrors, setCatalogImageErrors] = useState(() => new Set());
    const [catalogError, setCatalogError] = useState('');
    const [editingQuantityItemId, setEditingQuantityItemId] = useState(null);
    const [quantityInputValue, setQuantityInputValue] = useState('');
    const [addToCartToasts, setAddToCartToasts] = useState([]);
    const [receiptSettings, setReceiptSettings] = useState({});

    const triggerAddToCartToast = useCallback((item, addedQty = 1) => {
        if (!item) return;
        const itemId = item.item_id;
        const itemName = item.name || 'Item';
        const { src: imageSrc } = resolvePosCatalogImageSources(item, receiptSettings);

        setAddToCartToasts((prev) => {
            const existingIndex = prev.findIndex((t) => t.itemId === itemId);
            if (existingIndex !== -1) {
                const updated = [...prev];
                const existing = updated[existingIndex];
                updated[existingIndex] = {
                    ...existing,
                    quantity: existing.quantity + addedQty,
                    timestamp: Date.now()
                };
                return updated;
            }
            const newToast = {
                id: `toast-${itemId}-${Date.now()}`,
                itemId,
                itemName,
                imageSrc: imageSrc || null,
                quantity: addedQty,
                timestamp: Date.now()
            };
            return [newToast, ...prev].slice(0, 4);
        });
    }, [receiptSettings]);

    const handleDismissToast = useCallback((toastId) => {
        setAddToCartToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, []);

    useEffect(() => {
        if (addToCartToasts.length === 0) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setAddToCartToasts((prev) => prev.filter((t) => now - t.timestamp < 2500));
        }, 250);
        return () => clearInterval(timer);
    }, [addToCartToasts.length]);
    // "+" button long-press quantity meter (mobile only): qtyMeterState drives the visible
    // overlay; qtyMeterGestureRef holds the live, synchronously-updated gesture data so
    // pointerup always reads the exact latest quantity regardless of render timing.
    const [qtyMeterState, setQtyMeterState] = useState(null);
    const qtyMeterTimerRef = useRef(null);
    const qtyMeterGestureRef = useRef(null);
    const [posFolders, setPosFolders] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
    const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
    const [posFoldersLoading, setPosFoldersLoading] = useState(true);
    const [posFoldersError, setPosFoldersError] = useState('');
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogRefreshing, setCatalogRefreshing] = useState(false);
    const posWorkflow = useMemo(() => resolvePosWorkflow(workflowMode), [workflowMode]);
    const [search, setSearch] = useState('');
    const [orderMethod, setOrderMethod] = useState(() => posWorkflow.allowedMethods[0] || 'dine_in');
    const [tableNumber, setTableNumber] = useState('');
    const [kitchenNotes, setKitchenNotes] = useState('');
    const [servicesClientName, setServicesClientName] = useState('');
    const [servicesDateTime, setServicesDateTime] = useState('');
    const [servicesProvider, setServicesProvider] = useState('');
    const [servicesResource, setServicesResource] = useState('');
    const [servicesNotes, setServicesNotes] = useState('');

    useEffect(() => {
        if (posWorkflow && !posWorkflow.allowedMethods.includes(orderMethod)) {
            setOrderMethod(posWorkflow.allowedMethods[0] || (posWorkflow.mode === 'services' ? 'walk_in' : 'dine_in'));
        }
    }, [posWorkflow, orderMethod]);
    const isCheckoutWorkflowValid = posWorkflow.allowedMethods.includes(orderMethod)
        && (posWorkflow.mode !== 'services' || servicesClientName.trim().length > 0)
        && (orderMethod !== 'appointment' || Boolean(servicesDateTime));
    const [paymentType, setPaymentType] = useState('cash');
    const [employeeCreditAccountCode, setEmployeeCreditAccountCode] = useState('');
    const [employeeCreditAccount, setEmployeeCreditAccount] = useState(null);
    const [selectedEmployeeCreditOption, setSelectedEmployeeCreditOption] = useState(null);
    const [employeeCreditLookupLoading, setEmployeeCreditLookupLoading] = useState(false);
    const employeeCreditValidationSequenceRef = useRef(0);
    const [discountProfiles, setDiscountProfiles] = useState([]);
    const [selectedDiscountProfile, setSelectedDiscountProfile] = useState('');
    const [manualDiscountMode, setManualDiscountMode] = useState('none');
    const [manualDiscountRateInput, setManualDiscountRateInput] = useState('');
    const [manualDiscountAmountInput, setManualDiscountAmountInput] = useState('');
    const [discountModalOpen, setDiscountModalOpen] = useState(false);
    const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT);
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const [discountApplying, setDiscountApplying] = useState(false);
    const [affiliateCodeInput, setAffiliateCodeInput] = useState('');
    const [showDiscountPin, setShowDiscountPin] = useState(false);
    const [cart, setCart] = useState([]);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [queuedCheckouts, setQueuedCheckouts] = useState([]);
    const [replayingQueuedCheckouts, setReplayingQueuedCheckouts] = useState(false);
    const [closingDay, setClosingDay] = useState(false);
    const [lastReceipt, setLastReceipt] = useState(null);
    const [lastReceiptContract, setLastReceiptContract] = useState(null);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPagination, setHistoryPagination] = useState(null);
    const [historySearch, setHistorySearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState('all');
    const [historyPaymentType, setHistoryPaymentType] = useState('all');
    const [historyOrderMethod, setHistoryOrderMethod] = useState('all');
    const [historyOrderSource, setHistoryOrderSource] = useState('all');
    const [historyCashierId, setHistoryCashierId] = useState('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
    const [voidingTransactionId, setVoidingTransactionId] = useState(null);
    const [lowStockDisplayThreshold, setLowStockDisplayThreshold] = useState(DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD);
    const [commercialPromoConfig, setCommercialPromoConfig] = useState([]);
    const [discountApprovers, setDiscountApprovers] = useState([]);
    const [discountApproversLoading, setDiscountApproversLoading] = useState(false);
    const [deviceStatus, setDeviceStatus] = useState(null);
    const [deviceStatusLoading, setDeviceStatusLoading] = useState(false);
    const [receiptPrinting, setReceiptPrinting] = useState(false);
    const [receiptPaperWidth, setReceiptPaperWidth] = useState('80mm');
    const [drawerOpening, setDrawerOpening] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [receiptPreviewModalOpen, setReceiptPreviewModalOpen] = useState(false);
    const [receiptPreviewSource, setReceiptPreviewSource] = useState('receipt_preview');
    const [setupSnapshotModalOpen, setSetupSnapshotModalOpen] = useState(false);
    const [externalReceiptModalActive, setExternalReceiptModalActive] = useState(false);
    const catalogSnapshotRef = useRef([]);
    const receiptSettingsSnapshotRef = useRef({});
    const catalogHasLoadedRef = useRef(false);

    useEffect(() => {
        catalogSnapshotRef.current = catalog;
    }, [catalog]);

    useEffect(() => {
        receiptSettingsSnapshotRef.current = receiptSettings;
    }, [receiptSettings]);

    useEffect(() => {
        if (!sessionLocked) return;
        setCatalog([]);
        setCatalogError('');
        setCatalogLoading(false);
        setCatalogRefreshing(false);
        catalogHasLoadedRef.current = false;
    }, [sessionLocked]);

    const closeReceiptPreviewModal = useCallback(() => {
        setReceiptPreviewModalOpen(false);
        setReceiptPreviewSource('receipt_preview');
        if (externalReceiptModalActive) {
            setExternalReceiptModalActive(false);
            if (typeof onExternalReceiptClosed === 'function') {
                onExternalReceiptClosed();
            }
        }
    }, [externalReceiptModalActive, onExternalReceiptClosed]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const shouldEnablePrintMode = receiptPreviewModalOpen && Boolean(lastReceipt);
        document.body.classList.toggle('pos-receipt-print-mode', shouldEnablePrintMode);
        return () => {
            document.body.classList.remove('pos-receipt-print-mode');
        };
    }, [receiptPreviewModalOpen, lastReceipt]);
    const [checkoutConfirmModalOpen, setCheckoutConfirmModalOpen] = useState(false);
    const [mobileCheckoutPanelOpen, setMobileCheckoutPanelOpen] = useState(false);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const shouldLockModalScroll = receiptPreviewModalOpen || checkoutConfirmModalOpen || discountModalOpen || mobileCheckoutPanelOpen;
        document.body.classList.toggle('pos-modal-scroll-lock', shouldLockModalScroll);
        return () => {
            document.body.classList.remove('pos-modal-scroll-lock');
        };
    }, [checkoutConfirmModalOpen, discountModalOpen, mobileCheckoutPanelOpen, receiptPreviewModalOpen]);

    const [customerPaymentAmountInput, setCustomerPaymentAmountInput] = useState('');
    const [currentSaleHelpOpen, setCurrentSaleHelpOpen] = useState(false);
    const [isTabletViewport, setIsTabletViewport] = useState(false);
    const [catalogPage, setCatalogPage] = useState(1);
    const [catalogGridLayout, setCatalogGridLayout] = useState({
        columns: 1,
        rows: 1,
        pageSize: 1,
        minimumCardWidth: CATALOG_DESKTOP_CARD_MIN_WIDTH_PX,
        cardHeight: CATALOG_DESKTOP_CARD_HEIGHT_PX
    });
    const catalogSectionRef = useRef(null);
    const catalogViewportRef = useRef(null);
    const catalogCapacityViewportRef = useRef(null);
    const catalogGridRef = useRef(null);
    const searchBackspaceTimeoutRef = useRef(null);
    const searchBackspaceIntervalRef = useRef(null);
    const catalogSwipeStartXRef = useRef(null);
    const catalogSwipePointerIdRef = useRef(null);
    const shellClassName = 'h-full min-h-0 overflow-hidden';
    const checkoutGridClassName = 'grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_325px] md:pb-0 2xl:gap-6';
    const catalogGridClassName = 'grid';
    const catalogViewportClassName = 'flex min-h-0 flex-1 flex-col overflow-hidden';
    const currentSaleBodyClassName = 'dgfy-pos-current-sale-panel-scroll grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto_auto] gap-2 overflow-hidden md:grid-rows-[auto_auto_auto] md:overflow-y-auto md:overscroll-contain md:pr-1 md:touch-pan-y';
    const currentSaleItemsListClassName = 'dgfy-pos-scroll-region h-full min-h-0 overflow-y-auto overscroll-contain pr-1 touch-pan-y';
    const checkoutPaneClassName = 'flex h-full min-h-0 max-h-full flex-col overflow-hidden';
    const catalogPaneHeightClassName = 'h-full max-h-full';
    const currentSalePaneHeightClassName = 'h-full max-h-full';
    const safeCatalog = toArray(catalog);
    const safePosFolders = toArray(posFolders);
    // This is a POS-only presentation filter. The API remains the stock authority and checkout
    // revalidates inventory server-side; services and Always Available items are intentionally exempt.
    const availableCatalog = useMemo(() => (
        safeCatalog.filter(isSellAvailableCatalogItem)
    ), [safeCatalog]);
    const availableCategories = useMemo(() => {
        return safePosFolders.filter((folder) => {
            const folderId = Number(folder?.folder_id);
            if (!Number.isInteger(folderId) || folderId <= 0) return false;
            return availableCatalog.some((item) => Number(item?.folder_id) === folderId);
        });
    }, [availableCatalog, safePosFolders]);
    const safeDiscountProfiles = toArray(discountProfiles);
    const safeCommercialPromoConfig = toArray(commercialPromoConfig);
    const safeDiscountApprovers = toArray(discountApprovers);
    const safeCart = toArray(cart);
    const safeQueuedCheckouts = toArray(queuedCheckouts);
    const safeHistoryRows = toArray(historyRows);
    const safeEligibleDiscountItemIds = toArray(discountDraft?.eligible_item_ids);
    const safeEligibleDiscountItems = toArray(discountDraft?.eligible_items);
    const isCartLineSeniorPwdEligible = (line) => (
        isSeniorPwdDiscountEligible(line?.senior_pwd_discount_eligible)
        || isSeniorPwdDiscountEligible(safeCatalog.find((item) => Number(item?.item_id) === Number(line?.item_id))?.senior_pwd_discount_eligible)
    );
    const signedInUserIsAdminLike = terminalUser?.is_master_admin === true
        || String(terminalUser?.role || '').trim().toLowerCase() === 'admin';
    const currentUserIsConfiguredDiscountApprover = safeDiscountApprovers.some((approver) => (
        Number(approver?.user_id) > 0
        && Number(approver.user_id) === Number(terminalUser?.user_id)
    ));
    const signedInUserCanApproveManualDiscount = currentUserIsConfiguredDiscountApprover;
    const terminalPermissionList = useMemo(() => {
        if (Array.isArray(terminalUser?.permissions)) return terminalUser.permissions;
        if (typeof terminalUser?.permissions !== 'string') return [];
        try {
            const parsed = JSON.parse(terminalUser.permissions);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, [terminalUser?.permissions]);
    const canVoidTransactions = terminalUser?.is_master_admin === true || terminalPermissionList.includes('pos:void');
    const safeAppliedDiscount = appliedDiscount && typeof appliedDiscount === 'object'
        ? { ...appliedDiscount, eligible_item_ids: toArray(appliedDiscount.eligible_item_ids), eligible_items: toArray(appliedDiscount.eligible_items) }
        : null;
    const catalogCardClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
        : isTabletViewport
            ? 'group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
            : 'group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-2 text-left transition-all shadow-sm shadow-slate-200/70 max-sm:w-full max-sm:flex-row max-sm:p-0 md:p-1.5';
    const catalogCardImageWrapClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
        : isTabletViewport
            ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
            : 'flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md max-sm:h-full max-sm:w-24 max-sm:self-stretch max-sm:rounded-r-none max-sm:rounded-l-[calc(0.5rem-1px)] md:h-16 xl:h-24';
    const isViewModeControlled = typeof controlledViewMode === 'string' && controlledViewMode.length > 0;
    const currentViewMode = isViewModeControlled ? controlledViewMode : viewMode;
    const normalizedTerminalId = String(terminalId || '').trim();
    const terminalIdentityLabel = normalizedTerminalId
        ? `Terminal ${normalizedTerminalId}`
        : 'No terminal selected';
    // Keep pagination for predictable loading while rendering two measured viewports per page.
    // That guarantees the product-card region remains the catalog's only scroll owner.
    const catalogPageSize = Math.max(1, catalogGridLayout.pageSize * 2);
    const selectedFolder = useMemo(() => (
        safePosFolders.find((folder) => Number(folder.folder_id) === Number(selectedFolderId)) || null
    ), [safePosFolders, selectedFolderId]);
    const catalogForDisplay = useMemo(() => {
        if (!selectedFolderId) return availableCatalog;
        return availableCatalog.filter((item) => Number(item?.folder_id) === Number(selectedFolderId));
    }, [availableCatalog, selectedFolderId]);
    const totalCatalogPages = useMemo(() => (
        Math.max(1, Math.ceil(catalogForDisplay.length / catalogPageSize))
    ), [catalogForDisplay.length, catalogPageSize]);
    const visibleCatalogItems = useMemo(() => {
        const pageStart = (catalogPage - 1) * catalogPageSize;
        return catalogForDisplay.slice(pageStart, pageStart + catalogPageSize);
    }, [catalogForDisplay, catalogPage, catalogPageSize]);
    const nextCatalogImageUrls = useMemo(() => {
        if (catalogPage >= totalCatalogPages) return [];
        const nextPageStart = catalogPage * catalogPageSize;
        return Array.from(new Set(
            catalogForDisplay
                .slice(nextPageStart, nextPageStart + catalogPageSize)
                .map((item) => resolvePosCatalogImageSources(item, receiptSettings).src)
                .filter(Boolean)
        ));
    }, [catalogForDisplay, catalogPage, catalogPageSize, receiptSettings, totalCatalogPages]);
    const visibleCatalogRange = useMemo(() => {
        if (catalogForDisplay.length === 0) return { start: 0, end: 0 };
        const start = (catalogPage - 1) * catalogPageSize + 1;
        const end = start + visibleCatalogItems.length - 1;
        return { start, end };
    }, [catalogForDisplay.length, catalogPage, catalogPageSize, visibleCatalogItems.length]);
    const handleCatalogPageChange = useCallback((direction) => {
        setCatalogPage((previous) => {
            if (direction === 'previous') {
                return Math.max(1, previous - 1);
            }
            return Math.min(totalCatalogPages, previous + 1);
        });
    }, [totalCatalogPages]);

    useEffect(() => {
        if (typeof window === 'undefined' || nextCatalogImageUrls.length === 0) return undefined;

        const preloadNextPageImages = () => {
            nextCatalogImageUrls.forEach((imageUrl) => {
                const image = new window.Image();
                image.decoding = 'async';
                image.fetchPriority = 'low';
                image.src = imageUrl;
            });
        };

        if (typeof window.requestIdleCallback === 'function') {
            const idleCallbackId = window.requestIdleCallback(preloadNextPageImages, { timeout: 1200 });
            return () => window.cancelIdleCallback?.(idleCallbackId);
        }

        const timeoutId = window.setTimeout(preloadNextPageImages, 200);
        return () => window.clearTimeout(timeoutId);
    }, [nextCatalogImageUrls]);

    const handleCatalogSwipeStart = useCallback((clientX, pointerId = null) => {
        catalogSwipeStartXRef.current = clientX;
        catalogSwipePointerIdRef.current = pointerId;
    }, []);

    const handleCatalogSwipeEnd = useCallback((clientX, pointerId = null) => {
        if (
            pointerId != null
            && catalogSwipePointerIdRef.current != null
            && pointerId !== catalogSwipePointerIdRef.current
        ) {
            return;
        }

        const swipeStartX = catalogSwipeStartXRef.current;
        catalogSwipeStartXRef.current = null;
        catalogSwipePointerIdRef.current = null;

        if (typeof swipeStartX !== 'number') return;

        const deltaX = clientX - swipeStartX;
        const swipeThreshold = 48;
        if (Math.abs(deltaX) < swipeThreshold) return;

        if (deltaX < 0 && catalogPage < totalCatalogPages) {
            handleCatalogPageChange('next');
            return;
        }

        if (deltaX > 0 && catalogPage > 1) {
            handleCatalogPageChange('previous');
        }
    }, [catalogPage, handleCatalogPageChange, totalCatalogPages]);
    const setupMeta = terminalMeta && typeof terminalMeta === 'object' ? terminalMeta : {};
    const setupCurrency = String(setupMeta.pettyCashSymbol || 'PHP').trim() || 'PHP';
    const setupReadiness = setupMeta.locationBindingReadiness && typeof setupMeta.locationBindingReadiness === 'object'
        ? setupMeta.locationBindingReadiness
        : null;
    const bindingReadinessLabel = setupReadiness
        ? (setupReadiness.ready_for_strict_mode === true ? 'Ready' : 'Needs remediation')
        : 'Not checked';
    const isGlobalFeePolicyActive = Array.isArray(setupMeta.enabledFeeMethods)
        && setupMeta.enabledFeeMethods.includes('dgfy_global_1pct');
    const queuedCheckoutPendingCount = useMemo(() => (
        safeQueuedCheckouts.filter((entry) => (
            String(entry?.status || '') === TERMINAL_QUEUE_STATUS.QUEUED
            || String(entry?.status || '') === TERMINAL_QUEUE_STATUS.REPLAYING
        )).length
    ), [safeQueuedCheckouts]);
    const queuedCheckoutBlockedCount = useMemo(() => (
        safeQueuedCheckouts.filter((entry) => (
            String(entry?.status || '') === TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
        )).length
    ), [safeQueuedCheckouts]);
    const offlineHistoryRows = useMemo(() => (
        safeQueuedCheckouts
            .filter((entry) => isCheckoutQueueEntry(entry))
            .map((entry) => {
                const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};
                if (payload?.offline_history_snapshot && typeof payload.offline_history_snapshot === 'object') {
                    return payload.offline_history_snapshot;
                }
                return buildOfflineCheckoutHistoryRow({
                    payload,
                    queuedAt: entry?.queued_at,
                    cartSubtotal: Number(payload?.offline_totals?.cartSubtotal || 0),
                    calculatedDiscountAmount: Number(payload?.offline_totals?.calculatedDiscountAmount || 0),
                    serviceFeeAmount: Number(payload?.offline_totals?.serviceFeeAmount || 0),
                    restaurantServiceChargeAmount: Number(payload?.offline_totals?.restaurantServiceChargeAmount || 0),
                    vatBreakdown: payload?.offline_totals?.vatBreakdown || {},
                    cartTotal: Number(payload?.offline_totals?.cartTotal || 0),
                    selectedDiscount: payload?.offline_discount_snapshot || null,
                    manualDiscountRate: Number(payload?.offline_totals?.manualDiscountRate || 0),
                    manualDiscountMode: payload?.offline_totals?.manualDiscountMode || payload?.discount_mode || 'none'
                });
            })
            .filter(Boolean)
            .filter((row) => rowMatchesHistoryFilters(row, {
                historySearch,
                historyStatus,
                historyPaymentType,
                historyOrderMethod,
                historyOrderSource,
                historyCashierId,
                historyDateFrom,
                historyDateTo
            }))
            .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    ), [
        historyCashierId,
        historyDateFrom,
        historyDateTo,
        historyOrderMethod,
        historyOrderSource,
        historyPaymentType,
        historySearch,
        historyStatus,
        safeQueuedCheckouts
    ]);
    const visibleHistoryRows = useMemo(() => (
        historyPage === 1
            ? [...toArray(offlineHistoryRows), ...safeHistoryRows]
            : safeHistoryRows
    ), [historyPage, safeHistoryRows, offlineHistoryRows]);
    const visibleHistoryPagination = useMemo(() => {
        const baseLimit = Number(historyPagination?.limit || safeHistoryRows.length || 20) || 20;
        const baseTotal = Number(historyPagination?.total || safeHistoryRows.length || 0);
        const offlineCount = historyPage === 1 ? offlineHistoryRows.length : 0;
        const total = baseTotal + offlineCount;
        return {
            ...(historyPagination || {}),
            page: historyPage,
            limit: baseLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / baseLimit))
        };
    }, [historyPage, historyPagination, safeHistoryRows.length, offlineHistoryRows.length]);
    const detectedPrinterCount = Number(deviceStatus?.bridge?.printersDetected || 0);
    const isPrinterAvailable = detectedPrinterCount > 0;
    const lastReceiptPendingSync = lastReceipt?.offline_sync_state === 'pending_sync';

    const setCurrentViewMode = useCallback((nextMode) => {
        if (!isViewModeControlled) {
            setViewMode(nextMode);
        }
        if (typeof onViewModeChange === 'function') {
            onViewModeChange(nextMode);
        }
    }, [isViewModeControlled, onViewModeChange]);

    const offlineSnapshotScope = useMemo(() => ({
        tenantId: providedOfflineSnapshotScope?.tenantId,
        terminalId: providedOfflineSnapshotScope?.terminalId || normalizedTerminalId,
        locationId: providedOfflineSnapshotScope?.locationId || selectedLocationId,
        userId: providedOfflineSnapshotScope?.userId
            || terminalUser?.user_id
            || terminalUser?.id
            || terminalUser?.email
    }), [
        normalizedTerminalId,
        providedOfflineSnapshotScope?.locationId,
        providedOfflineSnapshotScope?.tenantId,
        providedOfflineSnapshotScope?.terminalId,
        providedOfflineSnapshotScope?.userId,
        selectedLocationId,
        terminalUser?.email,
        terminalUser?.id,
        terminalUser?.user_id
    ]);

    usePosCartDraft({
        activeShiftId,
        cart,
        catalog,
        catalogReady: !catalogLoading,
        enabled: !sessionLocked && Boolean(activeShiftId),
        scope: offlineSnapshotScope,
        setCart
    });

    const syncQueuedCheckoutsState = useCallback(async () => {
        const rows = await listTerminalOperationQueueEntries({
            includeResolved: false,
            scope: offlineSnapshotScope,
            statuses: [
                TERMINAL_QUEUE_STATUS.QUEUED,
                TERMINAL_QUEUE_STATUS.REPLAYING,
                TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
            ]
        });
        const checkoutRows = (Array.isArray(rows) ? rows : []).filter((entry) => isCheckoutQueueEntry(entry));
        setQueuedCheckouts(checkoutRows);
    }, [offlineSnapshotScope]);

    const enqueueCheckoutIntent = useCallback(async (payload, source = 'unknown') => {
        const idempotencyKey = String(payload?.idempotency_key || createIdempotencyKey()).trim();
        if (!idempotencyKey) return null;
        const nowIso = new Date().toISOString();
        const entry = await enqueueTerminalOperationIntent({
            intent_id: idempotencyKey,
            operation: CHECKOUT_QUEUE_OPERATION,
            queue_scope: offlineSnapshotScope,
            payload: {
                ...payload,
                idempotency_key: idempotencyKey
            },
            queued_at: nowIso,
            updated_at: nowIso,
            source
        }, source);
        await syncQueuedCheckoutsState();
        return entry;
    }, [offlineSnapshotScope, syncQueuedCheckoutsState]);

    const saveCatalogSnapshot = useCallback((nextCatalog, nextReceiptSettings = receiptSettingsSnapshotRef.current) => {
        saveOfflinePosSnapshot(offlineSnapshotScope, {
            catalog: Array.isArray(nextCatalog) ? nextCatalog : [],
            receiptSettings: nextReceiptSettings
        });
    }, [offlineSnapshotScope]);

    const loadCatalog = useCallback(async () => {
        if (sessionLocked) {
            setCatalog([]);
            setCatalogError('');
            setCatalogLoading(false);
            setCatalogRefreshing(false);
            catalogHasLoadedRef.current = false;
            return;
        }
        if (!canViewHistory) {
            setCatalog([]);
            setCatalogError('You need POS view permission to load the POS catalog.');
            setCatalogLoading(false);
            setCatalogRefreshing(false);
            catalogHasLoadedRef.current = false;
            return;
        }
        const isInitialLoad = !catalogHasLoadedRef.current;
        setCatalogLoading(isInitialLoad);
        setCatalogRefreshing(!isInitialLoad);
        setCatalogError('');
        try {
            const params = { search: search || '', limit: 200 };
            if (selectedLocationId) params.location_id = selectedLocationId;
            const data = await fetchPosCatalog(params);
            setCatalog(data || []);
            setCatalogImageErrors(new Set());
            if (!search) {
                saveCatalogSnapshot(data || []);
            }
        } catch (error) {
            const offlineSnapshot = loadOfflinePosSnapshot(offlineSnapshotScope);
            if (!error?.response && offlineSnapshot?.catalog?.length) {
                setCatalog(offlineSnapshot.catalog);
                setReceiptSettings((current) => Object.keys(current || {}).length > 0
                    ? current
                    : (offlineSnapshot.receipt_settings || {}));
                setLowStockDisplayThreshold(normalizeLowStockDisplayThreshold(
                    offlineSnapshot.receipt_settings?.inventory_low_stock_display_threshold
                ));
                setCatalogError('Offline mode: showing the last synced catalog. Stock is verified again when transactions sync.');
                return;
            }
            const apiMessage = error?.response?.data?.message;
            const message = error?.response?.status === 403
                ? (apiMessage || 'You need POS view permission to load the POS catalog.')
                : (apiMessage || 'Failed to load POS catalog');
            setCatalogError(message);
            toast.error(message);
        } finally {
            catalogHasLoadedRef.current = true;
            setCatalogLoading(false);
            setCatalogRefreshing(false);
        }
    }, [canViewHistory, offlineSnapshotScope, saveCatalogSnapshot, search, selectedLocationId, sessionLocked]);

    const loadHistory = useCallback(async (page = 1) => {
        if (sessionLocked || !canViewHistory) {
            setHistoryRows([]);
            setHistoryPagination(null);
            return;
        }
        setHistoryLoading(true);
        try {
            const result = await fetchPosTransactions({
                page,
                limit: 20,
                search: historySearch || undefined,
                status: historyStatus === 'all' ? undefined : historyStatus,
                payment_type: historyPaymentType === 'all' ? undefined : historyPaymentType,
                order_method: historyOrderMethod === 'all' ? undefined : historyOrderMethod,
                order_source: historyOrderSource === 'all' ? undefined : historyOrderSource,
                cashier_id: historyCashierId || undefined,
                date_from: historyDateFrom || undefined,
                date_to: historyDateTo || undefined,
                location_id: selectedLocationId || undefined
            });
            const rows = Array.isArray(result?.transactions) ? result.transactions : [];
            setHistoryRows(rows);
            setHistoryPagination(result?.pagination || null);
            setHistoryPage(page);
        } catch (error) {
            if (!error?.response) {
                setHistoryRows([]);
                setHistoryPagination({
                    page,
                    limit: 20,
                    total: 0,
                    totalPages: 1
                });
                setHistoryPage(page);
            }
            toast.error(error?.response?.data?.message || 'Failed to load POS transaction history');
        } finally {
            setHistoryLoading(false);
        }
    }, [
        canViewHistory,
        historyCashierId,
        historyDateFrom,
        historyDateTo,
        historyOrderMethod,
        historyOrderSource,
        historyPaymentType,
        historySearch,
        historyStatus,
        selectedLocationId,
        sessionLocked
    ]);

    const replayQueuedCheckouts = useCallback(async ({ toastIfEmpty = false } = {}) => {
        if (sessionLocked) return;
        if (checkoutBlockedReason) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (toastIfEmpty) {
                toast.error('Reconnect to the internet before syncing pending transactions.');
            }
            return;
        }

        const candidates = (await getReplayCandidateEntries({
            scope: offlineSnapshotScope,
            limit: CHECKOUT_REPLAY_BATCH_SIZE
        }))
            .filter((entry) => isCheckoutQueueEntry(entry));
        if (!Array.isArray(candidates) || candidates.length === 0) {
            await syncQueuedCheckoutsState();
            if (toastIfEmpty) {
                toast.message('No queued checkouts.');
            }
            return;
        }

        setReplayingQueuedCheckouts(true);
        let replayedCount = 0;
        let retryScheduledCount = 0;
        let failedManualCount = 0;

        try {
            for (const entry of candidates) {
                const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};
                const intentId = String(entry?.intent_id || payload?.idempotency_key || '').trim();
                if (!payload?.idempotency_key || !intentId) {
                    failedManualCount += 1;
                    await markTerminalOperationFailedManualResolution(intentId, {
                        error: {
      message: 'Queued payload is malformed.',
                            code: 'POS_CHECKOUT_QUEUE_MALFORMED_ENTRY'
                        }
                    });
                    continue;
                }

                try {
                    await markTerminalOperationReplaying(intentId);
                    const data = await createPosCheckout(payload);
                    replayedCount += 1;
                    setLastReceipt(data?.transaction || null);
                    setLastReceiptContract(inferReceiptContract(data?.transaction, data?.receipt_contract));
                    if (typeof onCheckoutCompleted === 'function') {
                        onCheckoutCompleted(data?.transaction || null);
                    }
                    await markTerminalOperationReplayed(intentId);
                } catch (error) {
                    const errorDetails = resolveCheckoutReplayErrorDetails(error);
                    if (isRetryableCheckoutReplayError(error)) {
                        const nextAttemptCount = (Number(entry?.attempt_count) || 0) + 1;
                        if (nextAttemptCount < CHECKOUT_QUEUE_MAX_RETRIES) {
                            const nextRetryAt = Date.now() + computeCheckoutReplayBackoffMs(nextAttemptCount);
                            await markTerminalOperationRetryScheduled(intentId, {
                                attemptCount: nextAttemptCount,
                                nextRetryAt,
                                error: errorDetails
                            });
                            retryScheduledCount += 1;
                            continue;
                        }
                    }

                    await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
                    failedManualCount += 1;
                    if (!error?.response) {
                        continue;
                    }
                }
            }
        } finally {
            setReplayingQueuedCheckouts(false);
        }

        await syncQueuedCheckoutsState();

        if (replayedCount > 0) {
            toast.success(`${replayedCount} queued checkout${replayedCount === 1 ? '' : 's'} replayed successfully.`);
            loadCatalog();
            loadHistory(historyPage);
        } else if (toastIfEmpty) {
            toast.message('No queued checkouts were replayed.');
        }

        if (retryScheduledCount > 0) {
            toast.message(
                `${retryScheduledCount} queued checkout${retryScheduledCount === 1 ? '' : 's'} scheduled for retry.`
            );
        }

        if (failedManualCount > 0) {
            toast.error(
                `${failedManualCount} pending transaction${failedManualCount === 1 ? '' : 's'} could not sync. Try again from History.`
            );
        }
    }, [
        checkoutBlockedReason,
        historyPage,
        loadHistory,
        loadCatalog,
        offlineSnapshotScope,
        onCheckoutCompleted,
        sessionLocked,
        syncQueuedCheckoutsState
    ]);

    const handleManualUniversalSync = useCallback(async () => {
        const syncPermit = await onManualUniversalSync();
        if (!syncPermit?.allowed) return;
        await replayQueuedCheckouts({ toastIfEmpty: true });
    }, [onManualUniversalSync, replayQueuedCheckouts]);

    const loadPosFolders = useCallback(async () => {
        if (sessionLocked) {
            setPosFolders([]);
            setPosFoldersLoading(false);
            setPosFoldersError('');
            return;
        }
        setPosFoldersLoading(true);
        setPosFoldersError('');
        try {
            const rows = await getFolders();
            const visible = (Array.isArray(rows) ? rows : [])
                .filter((folder) => folder?.show_in_pos_filter !== false)
                .map((folder) => ({
                    ...folder,
                    folder_id: Number(folder?.folder_id)
                }))
                .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0)
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            setPosFolders(visible);
        } catch (error) {
            setPosFolders([]);
            setPosFoldersError(error?.response?.data?.message || 'Failed to load POS categories.');
        } finally {
            setPosFoldersLoading(false);
        }
    }, [sessionLocked]);

    const loadReceiptSettings = useCallback(async () => {
        if (sessionLocked) {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setCommercialPromoConfig([]);
            return;
        }
        try {
            const allSettings = await getAllSettings();
            const nextReceiptSettings = {
                pos_registered_name: allSettings?.pos_registered_name?.value || '',
                pos_business_name: allSettings?.pos_business_name?.value || '',
                storefront_profile_image_url: allSettings?.storefront_profile_image_url?.value || '',
                pos_taxpayer_type: allSettings?.pos_taxpayer_type?.value || '',
                pos_tin_branch: allSettings?.pos_tin_branch?.value || '',
                pos_address: allSettings?.pos_address?.value || '',
                pos_ptu_number: allSettings?.pos_ptu_number?.value || '',
                pos_min_number: allSettings?.pos_min_number?.value || '',
                pos_accreditation_number: allSettings?.pos_accreditation_number?.value || '',
                pos_software_name: allSettings?.pos_software_name?.value || '',
                pos_software_version: allSettings?.pos_software_version?.value || '',
                pos_software_serial_number: allSettings?.pos_software_serial_number?.value || '',
                pos_receipt_footer_message: allSettings?.pos_receipt_footer_message?.value || '',
                inventory_low_stock_display_threshold: normalizeLowStockDisplayThreshold(
                    allSettings?.inventory_low_stock_display_threshold?.value
                )
            };
            setReceiptSettings(nextReceiptSettings);
            setLowStockDisplayThreshold(nextReceiptSettings.inventory_low_stock_display_threshold);
            const currentSnapshot = loadOfflinePosSnapshot(offlineSnapshotScope);
            saveOfflinePosSnapshot(offlineSnapshotScope, {
                catalog: currentSnapshot?.catalog || catalogSnapshotRef.current,
                receiptSettings: nextReceiptSettings
            });
            setDiscountProfiles(normalizeDiscountProfiles(allSettings?.pos_discount_profiles?.value));
            setCommercialPromoConfig(normalizeCommercialPromoConfigs(allSettings));
        } catch {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setCommercialPromoConfig([]);
        }
    }, [offlineSnapshotScope, sessionLocked]);

    const loadDeviceStatus = useCallback(async ({ notifyOnError = false } = {}) => {
        if (sessionLocked) {
            setDeviceStatus(null);
            return;
        }

        setDeviceStatusLoading(true);
        try {
            const result = await fetchPosDeviceStatus();
            setDeviceStatus(result || null);
        } catch (error) {
            setDeviceStatus(null);
            if (notifyOnError) {
                toast.error(error?.response?.data?.message || 'Failed to load POS device status.');
            }
        } finally {
            setDeviceStatusLoading(false);
        }
    }, [sessionLocked]);

    const openHistoryDetail = async (historyRowOrId, { switchToReceipt = false, openModal = true } = {}) => {
        setHistoryDetailLoading(true);
        setLastReceipt(null);
        setLastReceiptContract(null);
        setExternalReceiptModalActive(false);
        if (switchToReceipt) {
            setCurrentViewMode('receipt');
            setReceiptPreviewModalOpen(false);
        } else if (openModal) {
            setReceiptPreviewSource('receipt_preview');
            setReceiptPreviewModalOpen(true);
        }

        try {
            const historyRow = historyRowOrId && typeof historyRowOrId === 'object' ? historyRowOrId : null;
            const posTransactionId = historyRow?.pos_transaction_id ?? historyRowOrId;
            if (historyRow?.offline_sync_state === 'pending_sync') {
                setLastReceipt(historyRow);
                setLastReceiptContract(inferReceiptContract(historyRow));
                return;
            }
            const detail = await fetchPosTransactionById(posTransactionId);
            setLastReceipt(detail || null);
            setLastReceiptContract(inferReceiptContract(detail));
        } catch (error) {
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load selected transaction');
        } finally {
            setHistoryDetailLoading(false);
        }
    };

    const handleVoidHistoryTransaction = useCallback(async (historyRow, reason) => {
        const posTransactionId = Number(historyRow?.pos_transaction_id);
        if (!Number.isInteger(posTransactionId) || posTransactionId <= 0) {
            toast.error('Invalid POS transaction reference.');
            return;
        }
        if (!canVoidTransactions) {
            toast.error('You do not have permission to void POS transactions.');
            return;
        }
        if (!activeShiftId) {
            toast.error('Open a shift before voiding a POS transaction.');
            return;
        }

        setVoidingTransactionId(posTransactionId);
        try {
            await voidPosTransaction(posTransactionId, {
                reason,
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId || undefined
            });
            toast.success('POS transaction voided.');
            await loadHistory(historyPage);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to void POS transaction.');
            throw error;
        } finally {
            setVoidingTransactionId(null);
        }
    }, [activeShiftId, canVoidTransactions, historyPage, loadHistory, normalizedTerminalId]);

    const buildSalesReportQuery = useCallback((row = null) => {
        const params = new URLSearchParams();
        params.set('source', 'POS');
        params.set('source_context', 'pos_history');
        if (historySearch) params.set('search', historySearch);
        if (historyStatus !== 'all') params.set('status', historyStatus);
        if (historyPaymentType !== 'all') params.set('payment_type', historyPaymentType);
        if (historyOrderMethod !== 'all') params.set('order_method', historyOrderMethod);
        if (historyOrderSource !== 'all') params.set('pos_order_source', historyOrderSource);
        if (historyDateFrom) params.set('date_from', historyDateFrom);
        if (historyDateTo) params.set('date_to', historyDateTo);
        const sourceId = Number.parseInt(row?.pos_transaction_id || row?.source_id, 10);
        if (Number.isInteger(sourceId) && sourceId > 0) {
            params.set('source_id', String(sourceId));
        }
        if (row?.invoice_number || row?.reference_no) {
            params.set('reference', String(row.invoice_number || row.reference_no));
        }
        return params.toString();
    }, [historyDateFrom, historyDateTo, historyOrderMethod, historyOrderSource, historyPaymentType, historySearch, historyStatus]);

    const openInSalesReport = useCallback((row = null) => {
        const query = buildSalesReportQuery(row);
        openSkupervisorPath('/sales', query);
    }, [buildSalesReportQuery]);

    useEffect(() => {
        if (sessionLocked) return;
        const id = Number(externalReceiptTransactionId);
        if (!Number.isInteger(id) || id <= 0) return;

        let cancelled = false;
        const loadExternalReceipt = async () => {
            setHistoryDetailLoading(true);
            try {
                const detail = await fetchPosTransactionById(id);
                if (cancelled) return;
                setLastReceipt(detail || null);
                setLastReceiptContract(inferReceiptContract(detail));
                setExternalReceiptModalActive(true);
                setReceiptPreviewSource('receipt_preview');
                setReceiptPreviewModalOpen(true);
            } catch (error) {
                if (!cancelled) {
                    toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load selected transaction');
                }
            } finally {
                if (!cancelled) {
                    setHistoryDetailLoading(false);
                    if (typeof onExternalReceiptHydrated === 'function') {
                        onExternalReceiptHydrated();
                    }
                }
            }
        };
        loadExternalReceipt();

        return () => {
            cancelled = true;
        };
    }, [externalReceiptTransactionId, onExternalReceiptHydrated, sessionLocked]);

    useEffect(() => {
        if (sessionLocked) return;
        const query = String(externalHistoryQuery || '').trim();
        if (!query) return;
        setHistorySearch(query);
        setCurrentViewMode('history');
        if (typeof onExternalHistoryHydrated === 'function') {
            onExternalHistoryHydrated();
        }
    }, [externalHistoryQuery, onExternalHistoryHydrated, sessionLocked, setCurrentViewMode]);

    useEffect(() => {
        if (sessionLocked) return;
        const query = String(externalCatalogSearch || '').trim();
        if (!query) return;
        setSearch(query);
        setSelectedFolderId(null);
        setCurrentViewMode('checkout');
        if (typeof onExternalCatalogHydrated === 'function') {
            onExternalCatalogHydrated();
        }
    }, [externalCatalogSearch, onExternalCatalogHydrated, sessionLocked, setCurrentViewMode]);

    useEffect(() => {
        if (sessionLocked) return;
        loadReceiptSettings();
        loadPosFolders();
        loadDeviceStatus();
    }, [loadDeviceStatus, loadReceiptSettings, loadPosFolders, sessionLocked]);

    // Folders/catalog are otherwise only loaded once on mount, so a category added or edited
    // elsewhere (e.g. Items management) after this terminal session started would never appear.
    // Re-fetch both whenever the category filter panel is opened, so it's always current.
    useEffect(() => {
        if (sessionLocked || !catalogFiltersOpen) return;
        loadPosFolders();
        loadCatalog();
    }, [catalogFiltersOpen, loadPosFolders, loadCatalog, sessionLocked]);

    useEffect(() => {
        if (sessionLocked) return undefined;
        return subscribeToPosCatalogUpdates(() => {
            loadPosFolders();
            loadCatalog();
        });
    }, [loadCatalog, loadPosFolders, sessionLocked]);

    useEffect(() => {
        let active = true;
        const bootstrapQueueStore = async () => {
            await hydrateTerminalOperationQueueStore();
            if (!active) return;
            await syncQueuedCheckoutsState();
        };
        bootstrapQueueStore();
        return () => {
            active = false;
        };
    }, [syncQueuedCheckoutsState]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        if (typeof window.matchMedia !== 'function') return undefined;

        const tabletMedia = window.matchMedia(
            IS_DGFY_POS_SURFACE
                ? '(min-width: 640px) and (max-width: 1023px)'
                : '(min-width: 768px) and (max-width: 1279px)'
        );
        const syncTabletViewport = (event) => {
            setIsTabletViewport(Boolean(event.matches));
        };
        syncTabletViewport(tabletMedia);

        if (typeof tabletMedia.addEventListener === 'function') {
            tabletMedia.addEventListener('change', syncTabletViewport);
            return () => tabletMedia.removeEventListener('change', syncTabletViewport);
        }
        tabletMedia.addListener(syncTabletViewport);
        return () => tabletMedia.removeListener(syncTabletViewport);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || currentViewMode !== 'checkout') return undefined;
        const viewport = catalogCapacityViewportRef.current;
        if (!viewport) return undefined;

        let animationFrameId = null;
        const measureCapacity = () => {
            animationFrameId = null;
            const width = viewport.clientWidth;
            const height = viewport.clientHeight;
            if (width <= 0 || height <= 0) return;

            const isMobileViewport = window.matchMedia?.('(max-width: 639px)')?.matches === true;
            const usesCompactTabletCards = IS_DGFY_POS_SURFACE && isTabletViewport;
            const minimumCardWidth = isMobileViewport
                ? width
                : isTabletViewport
                    ? CATALOG_TABLET_CARD_MIN_WIDTH_PX
                    : CATALOG_DESKTOP_CARD_MIN_WIDTH_PX;
            const cardHeight = isMobileViewport
                ? CATALOG_MOBILE_CARD_HEIGHT_PX
                : usesCompactTabletCards
                    ? CATALOG_TABLET_CARD_HEIGHT_PX
                    : CATALOG_DESKTOP_CARD_HEIGHT_PX;
            const capacity = calculateCatalogGridCapacity({
                width,
                height,
                minimumCardWidth,
                cardHeight,
                gap: CATALOG_GRID_GAP_PX
            });

            setCatalogGridLayout((previous) => {
                if (
                    previous.columns === capacity.columns
                    && previous.rows === capacity.rows
                    && previous.pageSize === capacity.pageSize
                    && previous.minimumCardWidth === minimumCardWidth
                    && previous.cardHeight === cardHeight
                ) {
                    return previous;
                }
                return { ...capacity, minimumCardWidth, cardHeight };
            });
        };
        const scheduleCapacityMeasurement = () => {
            if (animationFrameId !== null) return;
            animationFrameId = window.requestAnimationFrame(measureCapacity);
        };
        const resizeObserver = typeof window.ResizeObserver === 'function'
            ? new window.ResizeObserver(scheduleCapacityMeasurement)
            : null;

        resizeObserver?.observe(viewport);
        window.addEventListener('resize', scheduleCapacityMeasurement);
        scheduleCapacityMeasurement();

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleCapacityMeasurement);
            if (animationFrameId !== null) {
                window.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [catalogFiltersOpen, currentViewMode, isTabletViewport, sidebarCollapsed]);

    useEffect(() => {
        setCatalogPage(1);
    }, [catalogGridLayout.columns, catalogGridLayout.rows, catalogPageSize]);

    useEffect(() => {
        setCatalogPage(1);
    }, [search, selectedFolderId, selectedLocationId]);

    useEffect(() => {
        if (catalogPage > totalCatalogPages) {
            setCatalogPage(totalCatalogPages);
        }
    }, [catalogPage, totalCatalogPages]);

    useEffect(() => {
        const viewport = catalogCapacityViewportRef.current;
        if (!viewport) return;
        viewport.scrollTo({ top: 0, behavior: 'smooth' });
    }, [catalogPage, search, selectedFolderId, selectedLocationId]);

    useEffect(() => {
        if (sessionLocked) return undefined;
        const timeout = setTimeout(() => {
            loadCatalog();
        }, 250);
        return () => clearTimeout(timeout);
    }, [loadCatalog, sessionLocked]);

    useEffect(() => {
        if (!sessionLocked && currentViewMode === 'history') {
            loadHistory(1);
        }
    }, [currentViewMode, loadHistory, sessionLocked]);

    useEffect(() => {
        if (!canViewHistory && currentViewMode === 'history') {
            setCurrentViewMode('checkout');
        }
    }, [canViewHistory, currentViewMode, setCurrentViewMode]);

    useEffect(() => {
        if (!selectedFolderId) return;
        const stillExists = availableCategories.some((folder) => Number(folder.folder_id) === Number(selectedFolderId));
        if (!stillExists) {
            setSelectedFolderId(null);
        }
    }, [availableCategories, selectedFolderId]);

    useEffect(() => {
        if (!imagePreview) return undefined;
        const handleEscClose = (event) => {
            if (event.key === 'Escape') {
                setImagePreview(null);
            }
        };
        window.addEventListener('keydown', handleEscClose);
        return () => window.removeEventListener('keydown', handleEscClose);
    }, [imagePreview]);

    useEffect(() => () => {
        if (searchBackspaceTimeoutRef.current) {
            window.clearTimeout(searchBackspaceTimeoutRef.current);
            searchBackspaceTimeoutRef.current = null;
        }
        if (searchBackspaceIntervalRef.current) {
            window.clearInterval(searchBackspaceIntervalRef.current);
            searchBackspaceIntervalRef.current = null;
        }
    }, []);

    const cartSubtotal = useMemo(
        () => safeCart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.sale_price)), 0),
        [safeCart]
    );

    const governedDiscountTotals = useMemo(
        () => calculateGovernedDiscount(safeCart, safeAppliedDiscount),
        [safeAppliedDiscount, safeCart]
    );

    const selectedDiscount = useMemo(
        () => safeDiscountProfiles.find((profile) => profile.name === selectedDiscountProfile) || null,
        [safeDiscountProfiles, selectedDiscountProfile]
    );

    const manualDiscountRate = useMemo(() => {
        const parsed = Number(manualDiscountRateInput);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        return round4(Math.min(parsed, 100));
    }, [manualDiscountRateInput]);

    const manualDiscountAmount = useMemo(
        () => {
            if (manualDiscountMode === 'amount') {
                const parsed = Number(manualDiscountAmountInput);
                if (!Number.isFinite(parsed) || parsed <= 0) return 0;
                return round4(Math.min(parsed, cartSubtotal));
            }
            if (manualDiscountMode !== 'percentage') {
                return 0;
            }
            return round4(Math.min((cartSubtotal * manualDiscountRate) / 100, cartSubtotal));
        },
        [cartSubtotal, manualDiscountAmountInput, manualDiscountMode, manualDiscountRate]
    );

    const calculatedDiscountAmount = appliedDiscount
        ? governedDiscountTotals.discountAmount
        : (selectedDiscount ? round4(Math.min((cartSubtotal * selectedDiscount.percentage) / 100, cartSubtotal)) : manualDiscountAmount);

    useEffect(() => {
        if (selectedDiscountProfile && (manualDiscountRateInput || manualDiscountAmountInput)) {
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
        }
    }, [manualDiscountAmountInput, manualDiscountRateInput, selectedDiscountProfile]);

    const serviceFeeAmount = 0;

    const netItemsTotal = useMemo(
        () => round4(Math.max(0, cartSubtotal - calculatedDiscountAmount - governedDiscountTotals.vatRemoved)),
        [cartSubtotal, calculatedDiscountAmount, governedDiscountTotals.vatRemoved]
    );

    const normalizedFnbContext = useMemo(() => (
        fnbContext && typeof fnbContext === 'object' ? fnbContext : null
    ), [fnbContext]);

    const restaurantServiceChargeAmount = useMemo(() => {
        const charge = normalizedFnbContext?.restaurant_service_charge;
        if (!charge || charge.enabled !== true) return 0;
        const explicitAmount = Number(charge.amount);
        if (Number.isFinite(explicitAmount) && explicitAmount >= 0) {
            return round4(explicitAmount);
        }
        const rate = Math.min(100, Math.max(0, Number(charge.rate || 0)));
        return round4(netItemsTotal * (rate / 100));
    }, [netItemsTotal, normalizedFnbContext]);

    const vatBreakdown = useMemo(() => {
        const factor = cartSubtotal > 0 ? netItemsTotal / cartSubtotal : 1;
        const adjustedLines = safeCart.map((line) => ({
            vat_type: line.vat_type || 'vatable',
            gross: round4((Number(line.quantity) * Number(line.sale_price)) * factor)
        }));

        const adjustedTotal = round4(adjustedLines.reduce((sum, line) => sum + line.gross, 0));
        const lineDiff = round4(netItemsTotal - adjustedTotal);
        if (adjustedLines.length > 0 && Math.abs(lineDiff) > 0) {
            adjustedLines[adjustedLines.length - 1].gross = round4(adjustedLines[adjustedLines.length - 1].gross + lineDiff);
        }

        let vatableGross = 0;
        let vatExemptSales = 0;
        let zeroRatedSales = 0;
        adjustedLines.forEach((line) => {
            if (line.vat_type === 'vatable') {
                vatableGross = round4(vatableGross + line.gross);
            } else if (line.vat_type === 'vat_exempt') {
                vatExemptSales = round4(vatExemptSales + line.gross);
            } else if (line.vat_type === 'zero_rated') {
                zeroRatedSales = round4(zeroRatedSales + line.gross);
            }
        });
        if (
            restaurantServiceChargeAmount > 0
            && normalizedFnbContext?.restaurant_service_charge?.taxable === true
        ) {
            vatableGross = round4(vatableGross + restaurantServiceChargeAmount);
        }

        const vatableSales = round4(vatableGross / (1 + VAT_RATE));
        const vatAmount = round4(vatableGross - vatableSales);
        return {
            vatableSales,
            vatAmount,
            vatExemptSales,
            zeroRatedSales
        };
    }, [safeCart, cartSubtotal, netItemsTotal, normalizedFnbContext, restaurantServiceChargeAmount]);

    const cartTotal = useMemo(
        () => round4(netItemsTotal + serviceFeeAmount + restaurantServiceChargeAmount),
        [netItemsTotal, restaurantServiceChargeAmount, serviceFeeAmount]
    );
    const cartTotalQuantity = useMemo(
        () => safeCart.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        [safeCart]
    );
    const isCashPayment = paymentType === 'cash';
    const isEmployeeCreditPayment = paymentType === 'employee_credit';
    const customerPaymentAmount = useMemo(() => {
        const parsed = Number(customerPaymentAmountInput);
        if (!Number.isFinite(parsed) || parsed < 0) return 0;
        return round4(parsed);
    }, [customerPaymentAmountInput]);
    const customerPaymentFieldLabel = 'Total Payment';
    const customerPaymentShortfall = useMemo(
        () => round4(Math.max(0, cartTotal - customerPaymentAmount)),
        [cartTotal, customerPaymentAmount]
    );
    const customerPaymentChange = useMemo(
        () => round4(Math.max(0, customerPaymentAmount - cartTotal)),
        [cartTotal, customerPaymentAmount]
    );
    const employeeCreditReady = Boolean(
        employeeCreditAccount
        && selectedEmployeeCreditOption?.account_configured
        && selectedEmployeeCreditOption?.is_eligible
    );
    const isCustomerPaymentSufficient = isEmployeeCreditPayment
        ? employeeCreditReady
        : customerPaymentAmount >= cartTotal;
    const posActionsBlocked = Boolean(checkoutBlockedReason);
    const notifyPosActionBlocked = () => {
        toast.error(checkoutBlockedReason || 'You cannot use the POS because the shift is closed.');
    };
    const itemStockById = useMemo(
        () => new Map((catalog || []).map((item) => {
            if (isServiceCatalogItem(item) || item?.pos_always_available === true) {
                return [Number(item?.item_id), Number.POSITIVE_INFINITY];
            }
            const stock = Number(item?.current_stock);
            return [
                Number(item?.item_id),
                Number.isFinite(stock) ? Math.max(0, stock) : 0
            ];
        })),
        [catalog]
    );

    const addToCart = (item, options = {}) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const requestedAddQty = Math.max(0.0001, Number(options.quantity || 1));
        const stockFromCatalog = itemStockById.get(Number(item.item_id));
        const maxStock = Number.isFinite(stockFromCatalog)
            ? stockFromCatalog
            : (stockFromCatalog === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, Number(item.current_stock) || 0));
        if (Number.isFinite(maxStock) && maxStock <= 0) {
            toast.error(buildStockExceededMessage({
                itemName: item.name,
                requestedQty: requestedAddQty,
                availableStock: maxStock,
                unit: item.unit_of_measure || ''
            }));
            return;
        }

        const defaultPrice = Number(item.default_sale_price ?? 0);
        if (!Number.isFinite(defaultPrice) || defaultPrice <= 0) {
            toast.error(`${item.name || 'Item'} needs a selling price before it can be sold in POS.`);
            return;
        }
        const modifierGroups = getFnbModifierGroups(item);
        const defaultModifiers = buildDefaultLineModifiers(item);
        const routed = buildKitchenStationSnapshot(item);
        const modifierLineSeed = {
            modifier_groups: modifierGroups,
            line_modifiers: defaultModifiers
        };
        const linePrice = round4(defaultPrice + resolveModifierDelta(modifierLineSeed, defaultModifiers));
        // Only default order_method to 'appointment' when this service is the
        // very first line in an empty basket. Previously this fired on every
        // service add regardless of what else was already in the cart, so
        // ringing up a service alongside unrelated retail lines silently
        // reclassified the whole mixed-basket transaction as an appointment.
        if (isServiceCatalogItem(item) && cart.length === 0) {
            setOrderMethod('appointment');
        }
        let stockWarning = '';
        setCart((prev) => {
            const existing = modifierGroups.length > 0 ? null : prev.find((line) => line.item_id === item.item_id);
            if (existing) {
                const requestedQty = Number(existing.quantity) + requestedAddQty;
                const safeQty = Number.isFinite(maxStock) ? round4(Math.min(requestedQty, maxStock)) : round4(requestedQty);
                if (Number.isFinite(maxStock) && requestedQty > maxStock) {
                    stockWarning = buildStockExceededMessage({
                        itemName: item.name,
                        requestedQty,
                        availableStock: maxStock,
                        unit: item.unit_of_measure || ''
                    });
                }
                return prev.map((line) => (
                    line.item_id === item.item_id
                        ? {
                            ...line,
                            quantity: safeQty,
                            vat_type: line.vat_type || item.vat_type || 'vatable',
                            senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible),
                            scan_metadata: options.scanMetadata || line.scan_metadata || null
                        }
                        : line
                ));
            }
            return [
                ...prev,
                {
                    line_key: createCartLineKey(item.item_id),
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: Number.isFinite(maxStock) ? round4(Math.min(requestedAddQty, maxStock)) : round4(requestedAddQty),
                    base_sale_price: defaultPrice,
                    sale_price: linePrice,
                    price_override_reason: '',
                    unit_of_measure: item.unit_of_measure,
                    category: item.category,
                    vat_type: item.vat_type || 'vatable',
                    senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible),
                    course: routed.course || normalizedFnbContext?.default_course || 'main',
                    kitchen_station_id: routed.kitchen_station_id || null,
                    fnbKitchenRoutes: Array.isArray(item.fnbKitchenRoutes) ? item.fnbKitchenRoutes : [],
                    modifier_groups: modifierGroups,
                    line_modifiers: defaultModifiers,
                    special_instructions: '',
                    scan_metadata: options.scanMetadata || null
                }
            ];
        });
        if (stockWarning) {
            toast.error(stockWarning);
        }
        triggerAddToCartToast(item, requestedAddQty);
    };

    const updateCartLine = (lineKey, patch) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        setCart((prev) => prev.map((line) => (
            getLineKey(line) === lineKey
                ? { ...line, ...patch }
                : line
        )));
    };

    const updateCartQuantity = (lineKey, requestedQuantity) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const parsedQty = Number(requestedQuantity);
        if (!Number.isFinite(parsedQty)) return;

        let stockWarning = '';
        setCart((prev) => prev
            .map((line) => {
                if (getLineKey(line) !== lineKey) return line;
                const maxStock = itemStockById.get(Number(line.item_id));
                const safeMax = Number.isFinite(maxStock) ? maxStock : Number.POSITIVE_INFINITY;
                const safeQty = round4(Math.max(0, Math.min(parsedQty, safeMax)));
                if (Number.isFinite(safeMax) && parsedQty > safeMax) {
                    stockWarning = buildStockExceededMessage({
                        itemName: line.item_name,
                        requestedQty: parsedQty,
                        availableStock: safeMax,
                        unit: line.unit_of_measure || ''
                    });
                }
                if (safeQty <= 0) return null;
                return { ...line, quantity: safeQty };
            })
            .filter(Boolean));

        if (stockWarning) {
            toast.error(stockWarning);
        }
    };

    // Mobile catalog stepper: +/- adjust the existing cart line (or create it on first +),
    // reusing addToCart/updateCartQuantity so stock clamping and 0-removal stay centralized.
    const adjustCartQuantity = (item, delta) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const existing = safeCart.find((line) => line.item_id === item.item_id);
        if (!existing) {
            if (delta > 0) addToCart(item, { quantity: delta });
            return;
        }
        updateCartQuantity(getLineKey(existing), Number(existing.quantity || 0) + delta);
    };

    // Mobile catalog stepper: commits the typed value from tapping the item-count label.
    // Weight/volume-UOM items (e.g. weighed_goods sold per kg) keep up to 4 decimal
    // places instead of being floored to a whole number - see allowsDecimalQuantity.
    const commitManualCartQuantity = (item) => {
        const parsedQuantity = allowsDecimalQuantity(item.unit_of_measure)
            ? Math.max(0, round4(Number(quantityInputValue)) || 0)
            : Math.max(0, Math.floor(Number(quantityInputValue)) || 0);
        setEditingQuantityItemId(null);
        const existing = safeCart.find((line) => line.item_id === item.item_id);
        if (existing) {
            updateCartQuantity(getLineKey(existing), parsedQuantity);
        } else if (parsedQuantity > 0) {
            addToCart(item, { quantity: parsedQuantity });
        }
    };

    // "+" button long-press-to-drag quantity meter (mobile only). Tap (< 300ms, no drag) still
    // adds exactly +1 with zero added delay. Holding past 300ms shows a vertical .qty-meter;
    // dragging up (never down past 1) scales the pending quantity 1 -> 20 over ~96px, and the
    // full amount is added in a single adjustCartQuantity call on release.
    const QTY_METER_LONG_PRESS_MS = 300;
    const QTY_METER_MOVE_CANCEL_PX = 10;
    const QTY_METER_MAX_DRAG_PX = 96;
    const QTY_METER_MIN_QTY = 0;
    const QTY_METER_MAX_QTY = 20;

    const clearQtyMeterTimer = () => {
        if (qtyMeterTimerRef.current) {
            clearTimeout(qtyMeterTimerRef.current);
            qtyMeterTimerRef.current = null;
        }
    };

    const handleQtyButtonPointerDown = (event, item) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Anchor point is the button itself (left edge, vertically centered), not the finger -
        // the meter must stay put even as the finger drags around.
        const buttonRect = event.currentTarget.getBoundingClientRect();
        qtyMeterGestureRef.current = {
            itemId: item.item_id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            anchorX: buttonRect.left,
            anchorY: buttonRect.top + (buttonRect.height / 2),
            activated: false,
            cancelled: false,
            quantity: QTY_METER_MIN_QTY
        };
        clearQtyMeterTimer();
        qtyMeterTimerRef.current = setTimeout(() => {
            const gesture = qtyMeterGestureRef.current;
            if (!gesture || gesture.itemId !== item.item_id || gesture.cancelled) return;
            gesture.activated = true;
            setQtyMeterState({ quantity: gesture.quantity, x: gesture.anchorX, y: gesture.anchorY });
        }, QTY_METER_LONG_PRESS_MS);
    };

    const handleQtyButtonPointerMove = (event, item) => {
        const gesture = qtyMeterGestureRef.current;
        if (!gesture || gesture.itemId !== item.item_id || gesture.cancelled) return;

        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;

        if (!gesture.activated) {
            if (Math.hypot(deltaX, deltaY) > QTY_METER_MOVE_CANCEL_PX) {
                gesture.cancelled = true;
                clearQtyMeterTimer();
            }
            return;
        }

        // Upward drag only increases quantity; quantity never scales below 1.
        // Position is intentionally NOT updated here - the meter stays fixed at the button
        // anchor set on pointerdown regardless of where the finger moves.
        const upwardPx = Math.min(QTY_METER_MAX_DRAG_PX, Math.max(0, -deltaY));
        const ratio = upwardPx / QTY_METER_MAX_DRAG_PX;
        const quantity = QTY_METER_MIN_QTY + Math.round(ratio * (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY));
        gesture.quantity = quantity;
        setQtyMeterState({ quantity, x: gesture.anchorX, y: gesture.anchorY });
    };

    const handleQtyButtonPointerUp = (event, item) => {
        const gesture = qtyMeterGestureRef.current;
        clearQtyMeterTimer();

        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);

        if (!gesture || gesture.itemId !== item.item_id || gesture.cancelled) return;

        const cardElement = event.currentTarget.closest('[data-pos-catalog-card]');
        if (gesture.activated) {
            // Dragged back down to 0 = cancel the bulk-add; nothing to add, nothing to fly.
            if (gesture.quantity <= 0) return;
            adjustCartQuantity(item, gesture.quantity);
        } else {
            // Released before the long-press threshold with no cancelling movement = a tap.
            adjustCartQuantity(item, 1);
        }
        flyImageToCheckoutBar(cardElement);
    };

    const handleQtyButtonPointerCancel = () => {
        clearQtyMeterTimer();
        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);
    };

    const handleCartQtyButtonPointerDown = (event, line) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const lineKey = getLineKey(line);
        const buttonRect = event.currentTarget.getBoundingClientRect();
        qtyMeterGestureRef.current = {
            itemId: lineKey,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            anchorX: buttonRect.left,
            anchorY: buttonRect.top + (buttonRect.height / 2),
            activated: false,
            cancelled: false,
            quantity: QTY_METER_MIN_QTY
        };
        clearQtyMeterTimer();
        qtyMeterTimerRef.current = setTimeout(() => {
            const gesture = qtyMeterGestureRef.current;
            if (!gesture || gesture.itemId !== lineKey || gesture.cancelled) return;
            gesture.activated = true;
            setQtyMeterState({ quantity: gesture.quantity, x: gesture.anchorX, y: gesture.anchorY });
        }, QTY_METER_LONG_PRESS_MS);
    };

    const handleCartQtyButtonPointerMove = (event, line) => {
        const lineKey = getLineKey(line);
        const gesture = qtyMeterGestureRef.current;
        if (!gesture || gesture.itemId !== lineKey || gesture.cancelled) return;

        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;

        if (!gesture.activated) {
            if (Math.hypot(deltaX, deltaY) > QTY_METER_MOVE_CANCEL_PX) {
                gesture.cancelled = true;
                clearQtyMeterTimer();
            }
            return;
        }

        const upwardPx = Math.min(QTY_METER_MAX_DRAG_PX, Math.max(0, -deltaY));
        const ratio = upwardPx / QTY_METER_MAX_DRAG_PX;
        const quantity = QTY_METER_MIN_QTY + Math.round(ratio * (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY));
        gesture.quantity = quantity;
        setQtyMeterState({ quantity, x: gesture.anchorX, y: gesture.anchorY });
    };

    const handleCartQtyButtonPointerUp = (event, line) => {
        const lineKey = getLineKey(line);
        const gesture = qtyMeterGestureRef.current;
        clearQtyMeterTimer();

        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);

        if (!gesture || gesture.itemId !== lineKey || gesture.cancelled) return;

        const currentQuantity = Number(line.quantity || 0);
        if (gesture.activated) {
            if (gesture.quantity <= 0) return;
            updateCartQuantity(lineKey, currentQuantity + gesture.quantity);
        } else {
            updateCartQuantity(lineKey, currentQuantity + 1);
        }
    };

    const handleCartQtyButtonPointerCancel = () => {
        clearQtyMeterTimer();
        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);
    };

    const removeCartLine = (lineKey) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        setCart((prev) => prev.filter((line) => getLineKey(line) !== lineKey));
    };

    const toggleFolderFilter = (folderId) => {
        setSelectedFolderId((prev) => (prev === folderId ? null : folderId));
    };

    const clearSearchBackspaceTimers = useCallback(() => {
        if (searchBackspaceTimeoutRef.current) {
            window.clearTimeout(searchBackspaceTimeoutRef.current);
            searchBackspaceTimeoutRef.current = null;
        }
        if (searchBackspaceIntervalRef.current) {
            window.clearInterval(searchBackspaceIntervalRef.current);
            searchBackspaceIntervalRef.current = null;
        }
    }, []);

    const handleSearchBackspaceStart = useCallback((event) => {
        event.preventDefault();
        if (!search) return;
        setSearch((previous) => (previous ? previous.slice(0, -1) : previous));
        clearSearchBackspaceTimers();
        searchBackspaceTimeoutRef.current = window.setTimeout(() => {
            searchBackspaceIntervalRef.current = window.setInterval(() => {
                setSearch((previous) => {
                    if (!previous) {
                        clearSearchBackspaceTimers();
                        return previous;
                    }
                    return previous.slice(0, -1);
                });
            }, 70);
        }, 280);
    }, [clearSearchBackspaceTimers, search]);

    const handleSearchBackspaceEnd = useCallback(() => {
        clearSearchBackspaceTimers();
    }, [clearSearchBackspaceTimers]);

    const openCheckoutConfirmModal = useCallback(() => {
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before checkout.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }
        if (!isCheckoutWorkflowValid) {
            toast.error(orderMethod === 'appointment'
                ? 'Enter the client name and appointment time before checkout.'
                : 'Enter the client name before checkout.');
            setCheckoutConfirmModalOpen(true);
            return;
        }
        if (
            paymentType === 'employee_credit'
            && typeof navigator !== 'undefined'
            && navigator.onLine === false
        ) {
            toast.error('Employee Credit requires an online connection.');
            return;
        }
        setCustomerPaymentAmountInput('0');
        setCheckoutConfirmModalOpen(true);
        setMobileCheckoutPanelOpen(false);
    }, [safeCart.length, checkoutBlockedReason, normalizedTerminalId, paymentType]);

    const handleSelectEmployeeCredit = async (employeeOption) => {
        const accountCode = String(employeeOption?.account_code || '').trim().toUpperCase();
        const sameSelectedAccount = Boolean(
            accountCode
            && accountCode === employeeCreditAccountCode
            && (employeeCreditLookupLoading || employeeCreditAccount)
        );

        // The combobox can emit the current option again while it re-renders. Keep a
        // verified account visible instead of briefly resetting the credit evidence card.
        if (sameSelectedAccount) {
            setSelectedEmployeeCreditOption(employeeOption || null);
            return;
        }

        const requestId = employeeCreditValidationSequenceRef.current + 1;
        employeeCreditValidationSequenceRef.current = requestId;
        setSelectedEmployeeCreditOption(employeeOption || null);
        setEmployeeCreditAccountCode(accountCode);
        setEmployeeCreditAccount(null);
        setEmployeeCreditLookupLoading(false);
        if (!employeeOption?.account_configured || !accountCode) {
            toast.error('Employee Credit is not configured for this employee.');
            return;
        }
        if (!employeeOption?.is_eligible) {
            toast.error('This employee is not eligible for Employee Credit.');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Employee Credit requires an online connection.');
            return;
        }
        setEmployeeCreditLookupLoading(true);
        try {
            const account = await fetchEmployeeCreditAccount(accountCode);
            if (employeeCreditValidationSequenceRef.current === requestId) {
                setEmployeeCreditAccount(account);
                toast.success(`Employee Credit account verified for ${account?.employee_name || 'employee'}.`);
            }
        } catch (error) {
            if (employeeCreditValidationSequenceRef.current === requestId) {
                toast.error(error?.response?.data?.message || 'Eligible Employee Credit account was not found.');
            }
        } finally {
            if (employeeCreditValidationSequenceRef.current === requestId) {
                setEmployeeCreditLookupLoading(false);
            }
        }
    };

    const openDiscountModal = async () => {
        setDiscountDraft(appliedDiscount ? { ...EMPTY_DISCOUNT_DRAFT, ...appliedDiscount, manager_pin: '' } : {
            ...EMPTY_DISCOUNT_DRAFT
        });
        setDiscountModalOpen(true);
        setDiscountApproversLoading(true);
        try {
            setDiscountApprovers(await fetchPosDiscountApprovers());
        } catch (error) {
            setDiscountApprovers([]);
            toast.error(error?.response?.data?.message || 'Failed to load POS discount approvers.');
        } finally {
            setDiscountApproversLoading(false);
        }
    };

    const handleApplyGovernedDiscount = async () => {
        const type = discountDraft.type;
        const statutory = type === 'senior' || type === 'pwd';
        const employeeDiscountRequiresApproval = type === 'employee' && !signedInUserIsAdminLike;
        const manualDiscountRequiresApproval = type === 'manual';
        const discountRequiresApproval = employeeDiscountRequiresApproval || manualDiscountRequiresApproval;
        const manualDiscountUsesCurrentPosApprover = type === 'manual' && signedInUserCanApproveManualDiscount;
        const approvalUserId = manualDiscountUsesCurrentPosApprover
            ? Number(terminalUser?.user_id)
            : Number(discountDraft.approver_user_id);
        if (discountRequiresApproval && (!Number.isInteger(approvalUserId) || approvalUserId <= 0)) {
            toast.error('Select a configured POS discount approver, or ask the Master Admin to configure an approval PIN.');
            return;
        }
        if (!statutory && !discountDraft.customer_name.trim()) {
            toast.error('Customer name is required for this discount.');
            return;
        }
        if (type === 'manual' && discountDraft.reason.trim().length < 3) {
            toast.error('Enter a reason of at least 3 characters for this manual discount.');
            return;
        }
        if (statutory && (!discountDraft.customer_name.trim() || !discountDraft.id_number.trim())) {
            toast.error('Customer name and Senior/PWD ID number are required.');
            return;
        }
        if (statutory && safeEligibleDiscountItemIds.length === 0) {
            toast.error('Select at least one eligible item.');
            return;
        }
        if (type === 'promo' && (!discountDraft.promo_code || !discountDraft.promo_code.trim())) {
            toast.error('Promo code is required.');
            return;
        }
        const rate = Number(discountDraft.rate || 0);
        const amount = Number(discountDraft.amount || 0);
        if (!statutory && type !== 'promo' && discountDraft.method === 'percentage' && (!(rate > 0) || rate > 100)) {
            toast.error('Enter a discount rate from 0.01 to 100.');
            return;
        }
        if (!statutory && type !== 'promo' && discountDraft.method === 'fixed' && !(amount > 0)) {
            toast.error('Enter a fixed discount amount.');
            return;
        }
        setDiscountApplying(true);
        try {
            const verifiedApprover = discountRequiresApproval
                ? await verifyPosDiscountApproval({
                    discount_type: type,
                    approver_user_id: approvalUserId,
                    manager_pin: discountDraft.manager_pin,
                    employee_user_id: type === 'employee' ? Number(discountDraft.employee_id) : null
                })
                : (type === 'employee' && signedInUserIsAdminLike
                    ? {
                        user_id: Number(terminalUser?.user_id) || null,
                        username: String(terminalUser?.username || '').trim() || null,
                        bypassed_pin: true
                    }
                    : null);
            const labels = { senior: 'Senior Citizen', pwd: 'PWD', employee: 'Employee Discount', promo: 'Promo Discount', manual: 'Manual Discount' };
            const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);
            const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0
                ? resolvedApproverUserId
                : null;
            const enteredPromoCode = normalizePromoCode(discountDraft.promo_code);
            const matchedPromoConfig = type === 'promo'
                ? safeCommercialPromoConfig.find((entry) => normalizePromoCode(entry?.promo_code) === enteredPromoCode)
                : null;
            const configuredPromoRate = Number(matchedPromoConfig?.discount_percent || 0);
            if (type === 'promo' && (
                matchedPromoConfig?.active !== true
                || !(configuredPromoRate > 0 && configuredPromoRate <= 100)
            )) {
                toast.error('Promo code is invalid or inactive.');
                return;
            }
            const configuredTargetIds = type === 'promo'
                ? [...new Set((Array.isArray(matchedPromoConfig?.target_item_ids) ? matchedPromoConfig.target_item_ids : [])
                    .map(Number)
                    .filter((itemId) => Number.isInteger(itemId) && itemId > 0))]
                : [];
            const cartItemIds = new Set(safeCart.map((line) => Number(line.item_id)));
            const promoEligibleItemIds = configuredTargetIds.filter((itemId) => cartItemIds.has(itemId));
            if (type === 'promo' && configuredTargetIds.length > 0 && promoEligibleItemIds.length === 0) {
                toast.error('Promo code does not apply to the items in this order.');
                return;
            }
            setAppliedDiscount({
                ...discountDraft,
                label: labels[type],
                method: type === 'promo' ? 'percentage' : discountDraft.method,
                rate: statutory ? 20 : (type === 'promo' ? configuredPromoRate : rate),
                amount: type !== 'promo' && discountDraft.method === 'fixed' ? amount : null,
                promo_code: type === 'promo' ? enteredPromoCode : discountDraft.promo_code,
                approver_user_id: governedDiscountApproverUserId,
                approver_name: verifiedApprover?.username || null,
                eligible_item_ids: type === 'promo' ? promoEligibleItemIds : safeEligibleDiscountItemIds,
                eligible_items: statutory ? safeEligibleDiscountItems : []
            });
            setSelectedDiscountProfile('');
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setDiscountModalOpen(false);
            toast.success(`${labels[type]} applied.`);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Admin PIN approval failed.');
        } finally {
            setDiscountApplying(false);
        }
    };

    const handleCheckout = async () => {
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before checkout.');
            return;
        }

        if (safeCart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }
        if (!isCustomerPaymentSufficient) {
            toast.error(isEmployeeCreditPayment
                ? 'Verify an active, eligible employee account with enough available balance.'
                : `${customerPaymentFieldLabel} must cover the total due.`);
            setCheckoutConfirmModalOpen(true);
            return;
        }
        const offlineCheckout = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offlineCheckout && !isCashPayment) {
            toast.error('Only cash transactions can be recorded offline. Reconnect before using an external payment method.');
            return;
        }

        const payload = {
            idempotency_key: createIdempotencyKey(),
            terminal_id: normalizedTerminalId || undefined,
            location_id: selectedLocationId || undefined,
            order_method: orderMethod,
            payment_type: paymentType,
            payment_handoff_mode: ['cash', 'employee_credit'].includes(paymentType) ? 'internal' : 'external',
            cash_received: isCashPayment ? Number(customerPaymentAmount || 0) : undefined,
            change_amount: isCashPayment ? Number(customerPaymentChange || 0) : undefined,
            employee_credit: isEmployeeCreditPayment ? {
                account_code: employeeCreditAccountCode.trim().toUpperCase()
            } : undefined,
            discount_mode: appliedDiscount ? 'amount' : (selectedDiscount ? 'preset' : (manualDiscountAmount > 0 ? manualDiscountMode : 'none')),
            discount_amount: Number(calculatedDiscountAmount || 0),
            discount_profile_name: appliedDiscount ? undefined : (selectedDiscount?.name || null),
            discount_rate: appliedDiscount
                ? undefined
                : selectedDiscount
                ? Number(selectedDiscount.percentage)
                : (manualDiscountMode === 'percentage' && manualDiscountRate > 0 ? Number(manualDiscountRate) : null),
            discount_beneficiary: appliedDiscount && ['senior', 'pwd'].includes(appliedDiscount.type) ? {
                category: appliedDiscount.type,
                name: appliedDiscount.customer_name,
                id_number: appliedDiscount.id_number
            } : undefined,
            governed_discount: appliedDiscount ? {
                ...appliedDiscount,
                vat_removed: governedDiscountTotals.vatRemoved,
                vat_exempt_amount: governedDiscountTotals.vatExemptAmount,
                discount_amount: governedDiscountTotals.discountAmount
            } : undefined,
            affiliate_code: affiliateCodeInput.trim() || undefined,
            shift_id: activeShiftId || undefined,
            fnb_check_id: normalizedFnbContext?.fnb_check_id || undefined,
            fnb_table_id: normalizedFnbContext?.fnb_table_id || undefined,
            fnb_table_label_snapshot: normalizedFnbContext?.fnb_table_label_snapshot || undefined,
            fnb_guest_count: normalizedFnbContext?.fnb_guest_count || undefined,
            fnb_server_id: normalizedFnbContext?.fnb_server_id || undefined,
            restaurant_service_charge: normalizedFnbContext?.restaurant_service_charge || undefined,
            lines: safeCart.map((line) => ({
                item_id: line.item_id,
                quantity: Number(line.quantity),
                sale_price: Number(line.sale_price),
                price_override_reason: String(line.price_override_reason || '').trim() || undefined,
                course: line.course || normalizedFnbContext?.default_course || undefined,
                line_modifiers: line.line_modifiers || undefined,
                special_instructions: line.special_instructions || undefined,
                kitchen_station_id: line.kitchen_station_id || undefined,
                scan_metadata: line.scan_metadata || undefined
            }))
        };
        payload.offline_line_items_snapshot = safeCart.map((line) => ({
            line_id: line.line_key,
            line_key: line.line_key,
            item_id: line.item_id,
            item_name: line.item_name,
            quantity: Number(line.quantity),
            sale_price: Number(line.sale_price),
            special_instructions: line.special_instructions || '',
            fnb_modifiers_snapshot: resolveModifierSnapshot(line, line.line_modifiers || [])
        }));
        payload.offline_discount_snapshot = selectedDiscount
            ? {
                name: selectedDiscount.name,
                percentage: Number(selectedDiscount.percentage || 0)
            }
            : null;
        payload.offline_totals = {
            cartSubtotal: Number(cartSubtotal || 0),
            calculatedDiscountAmount: Number(calculatedDiscountAmount || 0),
            manualDiscountMode,
            manualDiscountRate: Number(manualDiscountRate || 0),
            manualDiscountAmount: Number(manualDiscountAmount || 0),
            serviceFeeAmount: Number(serviceFeeAmount || 0),
            restaurantServiceChargeAmount: Number(restaurantServiceChargeAmount || 0),
            vatBreakdown: {
                vatableSales: Number(vatBreakdown.vatableSales || 0),
                vatAmount: Number(vatBreakdown.vatAmount || 0),
                vatExemptSales: Number(vatBreakdown.vatExemptSales || 0),
                zeroRatedSales: Number(vatBreakdown.zeroRatedSales || 0)
            },
            cartTotal: Number(cartTotal || 0)
        };
        payload.offline_history_snapshot = buildOfflineCheckoutHistoryRow({
            payload,
            queuedAt: new Date().toISOString(),
            cartSubtotal,
            calculatedDiscountAmount,
            serviceFeeAmount,
            restaurantServiceChargeAmount,
            vatBreakdown,
            cartTotal,
            selectedDiscount,
            manualDiscountRate,
            manualDiscountMode
        });

        const queueCheckoutIntentLocally = async (source) => {
            if (appliedDiscount) {
                toast.error('Governed discounts require an online checkout so eligibility and the selected approver can be verified securely.');
                return;
            }
            try {
                await enqueueCheckoutIntent(payload, source);
            } catch (error) {
                toast.error(
                    error?.message
                    || 'Offline sale was not saved. Keep the cart open and retry after freeing device storage or reconnecting.'
                );
                return false;
            }
            setLastReceipt(payload.offline_history_snapshot);
            setLastReceiptContract({ document_type: 'non_fiscal_slip', document_context: 'non_fiscal', label: 'PENDING SYNC' });
            setReceiptPreviewSource('order_preview');
            setReceiptPreviewModalOpen(true);
            const nextCatalog = catalog.map((item) => {
                if (item?.pos_always_available === true || isServiceCatalogItem(item)) return item;
                const soldQuantity = safeCart
                    .filter((line) => Number(line.item_id) === Number(item?.item_id))
                    .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
                if (soldQuantity <= 0) return item;
                return {
                    ...item,
                    current_stock: Math.max(0, Number(item.current_stock || 0) - soldQuantity)
                };
            });
            setCatalog(nextCatalog);
            saveCatalogSnapshot(nextCatalog);
            setCart([]);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            setAffiliateCodeInput('');
            setEmployeeCreditAccountCode('');
            setEmployeeCreditAccount(null);
            setSelectedEmployeeCreditOption(null);
            setEmployeeCreditLookupLoading(false);
            employeeCreditValidationSequenceRef.current += 1;
            setCustomerPaymentAmountInput('');
            setCheckoutConfirmModalOpen(false);
            const refreshedQueue = await listTerminalOperationQueueEntries({
                includeResolved: false,
                scope: offlineSnapshotScope,
                statuses: [
                    TERMINAL_QUEUE_STATUS.QUEUED,
                    TERMINAL_QUEUE_STATUS.REPLAYING,
                    TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
                ]
            });
            const nextQueueCount = (Array.isArray(refreshedQueue) ? refreshedQueue : [])
                .filter((entry) => isCheckoutQueueEntry(entry))
                .length;
            toast.message(
                `Offline transaction saved locally. Press Sync after reconnecting (${nextQueueCount} queued).`
            );
            return true;
        };

        if (offlineCheckout) {
            await queueCheckoutIntentLocally('offline_preflight');
            return;
        }

        setCheckoutLoading(true);
        try {
            const data = await createPosCheckout(payload);
            setLastReceipt(data?.transaction || null);
            setLastReceiptContract(inferReceiptContract(data?.transaction, data?.receipt_contract));
            setCart([]);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            setAffiliateCodeInput('');
            setCustomerPaymentAmountInput('');
            setCheckoutConfirmModalOpen(false);
            setReceiptPreviewSource('order_preview');
            setReceiptPreviewModalOpen(true);
        if (typeof onCheckoutCompleted === 'function') {
                onCheckoutCompleted(data?.transaction || null);
            }
            try {
                const completedTransaction = data?.transaction || null;
                const receiptContract = inferReceiptContract(completedTransaction, data?.receipt_contract);
                const iminPrintResult = printReceiptWithIminBridge({
                    transaction: completedTransaction,
                    businessSettings: receiptSettings,
                    receiptContract,
                    openDrawerAfterPrint: isCashPayment
                });
                if (iminPrintResult.handled) {
                    toast.success(isCashPayment ? 'Receipt printed and cash drawer opened.' : 'Receipt printed.');
                } else if (isCashPayment) {
                    const iminDrawerResult = openDrawerWithIminBridge();
                    if (iminDrawerResult.handled) {
                        toast.success('Cash drawer opened.');
                    }
                }
            } catch (hardwareError) {
                toast.error(hardwareError?.message || 'Checkout completed, but the receipt printer or cash drawer failed.');
            }
            toast.success(
                data?.idempotent_replay
                    ? `Replayed (${inferReceiptContract(data?.transaction, data?.receipt_contract)?.label || 'receipt loaded'})`
                    : `Done (${inferReceiptContract(data?.transaction, data?.receipt_contract)?.label || 'receipt ready'})`
            );
            if (data?.terminal_identity_policy?.warning?.message) {
                toast.message(`Terminal policy warning: ${data.terminal_identity_policy.warning.message}`);
            }
            await markTerminalOperationReplayed(payload.idempotency_key, {
                resolution_source: 'network_success',
                resolution_note: 'Checkout completed while online'
            });
            await syncQueuedCheckoutsState();
            loadCatalog();
            loadHistory(historyPage);
        } catch (error) {
            if (!error?.response) {
                if (appliedDiscount) {
                    toast.error('Connection lost. Reconnect before completing a discounted sale.');
                } else {
                    await queueCheckoutIntentLocally('network_failure');
                }
                return;
            }
            const compliancePolicyBlocker = buildCompliancePolicyBlockerMessage(error);
            toast.error(
                compliancePolicyBlocker?.message
                || buildMissingFieldsMessage(error)
                || buildFnbRecipeBlockerMessage(error)
                || buildValidationDetailMessage(error)
                || error?.response?.data?.message
                || 'POS checkout failed'
            );
            if (compliancePolicyBlocker?.actionTarget) {
                toast.message(`Resolve blocker in ${compliancePolicyBlocker.actionTarget}`);
            }
        } finally {
            setCheckoutLoading(false);
        }
    };

    const handleCloseDay = async () => {
        setClosingDay(true);
        try {
            const result = await closePosDay();
            toast.success(
                `Z-reading generated: ${result?.summary?.transaction_count || 0} sale(s), PHP ${money(result?.summary?.total_amount)}`
            );
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to generate Z-reading');
        } finally {
            setClosingDay(false);
        }
    };

    const handlePrintReceipt = useCallback(async (transaction, reason = 'manual_reprint') => {
        const transactionId = Number(transaction?.pos_transaction_id);
        if (!Number.isInteger(transactionId) || transactionId <= 0) {
            toast.error('Select a saved receipt first.');
            return;
        }

        setReceiptPrinting(true);
        try {
            const shouldOpenDrawer = String(transaction?.payment_type || '').trim().toLowerCase() === 'cash';
            const iminPrintResult = printReceiptWithIminBridge({
                transaction,
                businessSettings: receiptSettings,
                receiptContract: inferReceiptContract(transaction),
                openDrawerAfterPrint: shouldOpenDrawer
            });
            if (iminPrintResult.handled) {
                toast.success(shouldOpenDrawer ? 'Receipt printed and cash drawer opened.' : 'Receipt printed.');
                return;
            }

            const result = await printPosReceipt({
                idempotency_key: createIdempotencyKey(),
                transaction_id: transactionId,
                terminal_id: normalizedTerminalId || undefined,
                reason
            });
            toast.success(
                result?.transaction?.invoice_number
                    ? `Print sent for ${result.transaction.invoice_number}.`
                    : 'Receipt print request sent.'
            );
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to send receipt to printer.');
        } finally {
            setReceiptPrinting(false);
            loadDeviceStatus();
        }
    }, [loadDeviceStatus, normalizedTerminalId, receiptSettings]);

    const handlePrintOrder = useCallback(() => {
        if (safeCart.length === 0) {
            toast.error('Add at least one item before printing an order.');
            return;
        }

        try {
            const result = printOrderWithIminBridge({
                cart: safeCart,
                terminalId: normalizedTerminalId,
                orderMethod,
                fnbContext: normalizedFnbContext
            });
            if (result.handled) {
                toast.success('Order ticket sent to printer.');
                return;
            }
            toast.error('Order printing is available only inside the iMin APK.');
        } catch (error) {
            toast.error(error?.message || 'Failed to print order ticket.');
        } finally {
            loadDeviceStatus();
        }
    }, [safeCart, loadDeviceStatus, normalizedFnbContext, normalizedTerminalId, orderMethod]);

    const printHistoryReceipt = useCallback(async (posTransactionId) => {
        const transactionId = Number(posTransactionId);
        if (!Number.isInteger(transactionId) || transactionId <= 0) {
            toast.error('Select a saved receipt first.');
            return;
        }

        setHistoryDetailLoading(true);
        try {
            const detail = await fetchPosTransactionById(transactionId);
            setLastReceipt(detail || null);
            setLastReceiptContract(inferReceiptContract(detail));
            setReceiptPreviewSource('receipt_preview');
            setReceiptPreviewModalOpen(true);
        } catch (error) {
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load selected receipt.');
        } finally {
            setHistoryDetailLoading(false);
        }
    }, []);

    const handleOpenDrawer = useCallback(async ({ transactionId = null, reason = 'manual_ui_open' } = {}) => {
        if (!activeShiftId) {
            toast.error('Open a shift first before opening the cash drawer.');
            return;
        }

        setDrawerOpening(true);
        try {
            const iminDrawerResult = openDrawerWithIminBridge();
            if (iminDrawerResult.handled) {
                toast.success('Cash drawer opened.');
                return;
            }

            await openPosDeviceDrawer({
                idempotency_key: createIdempotencyKey(),
                shift_id: activeShiftId,
                transaction_id: transactionId || undefined,
                terminal_id: normalizedTerminalId || undefined,
                reason
            });
            toast.success('Cash drawer open request sent.');
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Failed to open the cash drawer.');
        } finally {
            setDrawerOpening(false);
            loadDeviceStatus();
        }
    }, [activeShiftId, loadDeviceStatus, normalizedTerminalId]);

    const renderViewModeControls = ({ sectionTitle = '', action = null } = {}) => {
        if (!sectionTitle && !action) return null;

        return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
            {sectionTitle && (
                <h2 className="min-w-0 text-[22px] font-black tracking-tight text-[#0F172A]">
                    {sectionTitle}
                </h2>
            )}
                {action}
            </div>
            {sectionTitle && (
                <p className="text-[13px] leading-5 text-[#334155]">Tap an item card to add it to the current cart.</p>
            )}
        </div>
        );
    };

    return (
        <div className={modalOnly ? 'hidden' : shellClassName} aria-hidden={modalOnly ? 'true' : undefined}>
            <section
                className={
                    currentViewMode === 'checkout'
                        ? 'contents'
                        : (currentViewMode === 'history'
                            ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5'
                            : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5')
                }
            >
            {currentViewMode === 'history' && (
                <div key="view-history" className="catalog-slide-enter h-full min-h-0 max-sm:animate-pos-slide-in">
                <Suspense fallback={<section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">Loading POS sales history...</section>}>
                    <POSTransactionHistoryPanel
                        historySearch={historySearch}
                        setHistorySearch={setHistorySearch}
                        historyStatus={historyStatus}
                        setHistoryStatus={setHistoryStatus}
                        historyPaymentType={historyPaymentType}
                        setHistoryPaymentType={setHistoryPaymentType}
                        historyOrderMethod={historyOrderMethod}
                        setHistoryOrderMethod={setHistoryOrderMethod}
                        historyOrderSource={historyOrderSource}
                        setHistoryOrderSource={setHistoryOrderSource}
                        historyCashierId={historyCashierId}
                        setHistoryCashierId={setHistoryCashierId}
                        historyDateFrom={historyDateFrom}
                        setHistoryDateFrom={setHistoryDateFrom}
                        historyDateTo={historyDateTo}
                        setHistoryDateTo={setHistoryDateTo}
                        historyLoading={historyLoading}
                        historyRows={visibleHistoryRows}
                        historyDetailLoading={historyDetailLoading}
                        openHistoryDetail={openHistoryDetail}
                        canVoidTransactions={canVoidTransactions}
                        onVoidTransaction={handleVoidHistoryTransaction}
                        voidingTransactionId={voidingTransactionId}
                        loadHistory={loadHistory}
                        historyPage={historyPage}
                        historyPagination={visibleHistoryPagination}
                        pendingSyncCount={queuedCheckoutPendingCount}
                        pendingSyncBlockedCount={queuedCheckoutBlockedCount}
                        syncPendingTransactions={handleManualUniversalSync}
                        syncingPendingTransactions={replayingQueuedCheckouts}
                        syncDisabled={sessionLocked || Boolean(checkoutBlockedReason) || manualSyncPolicy?.remaining <= 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)}
                        syncRemaining={manualSyncPolicy?.remaining}
                        syncResetAt={manualSyncPolicy?.resetAt}
                        universalPendingSyncCount={universalPendingSyncCount}
                    />
                </Suspense>
                </div>
            )}

            {currentViewMode === 'checkout' && (
                <div key="view-checkout" className="h-full min-h-0 overflow-hidden catalog-slide-enter">
                <>
                <div className={checkoutGridClassName}>
            <section ref={catalogSectionRef} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-6 ${catalogPaneHeightClassName} flex min-h-0 flex-col`}>
                    {isTabletViewport && renderViewModeControls()}
                    <div ref={catalogViewportRef} className={catalogViewportClassName} role="region" aria-label="POS catalog contents">
                <div data-testid="pos-catalog-controls" className={`${isTabletViewport ? 'mb-3 gap-2.5' : 'mb-5 gap-4'} flex min-w-0 shrink-0 flex-col ${IS_DGFY_POS_SURFACE ? 'xl:flex-row xl:items-start' : 'lg:flex-row lg:items-start'}`}>
                    <div className={`${isTabletViewport ? 'flex-col items-stretch sm:flex-col' : 'flex-wrap items-center sm:flex-nowrap'} flex min-w-0 flex-1 gap-3 max-sm:relative`}>
                        {/* Mobile: collapsed search icon button */}
                        {!isTabletViewport && !(mobileSearchExpanded || search) && (
                            <button
                                type="button"
                                aria-label="Search POS-visible items"
                                onClick={() => setMobileSearchExpanded(true)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white shadow-sm transition hover:bg-slate-50 sm:hidden"
                            >
                                <Search size={20} className="text-[#1A4E8D]" />
                            </button>
                        )}
                        {/* Mobile: expanded full-width search with correction icon inside */}
                        {!isTabletViewport && (mobileSearchExpanded || Boolean(search)) && (
                            <div className="absolute inset-0 z-10 flex items-center sm:hidden">
                                <Search size={16} className="pointer-events-none absolute left-3 text-[#1A4E8D]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search POS-visible items..."
                                    autoFocus
                                    onBlur={() => {
                                        if (!search) setMobileSearchExpanded(false);
                                    }}
                                    className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-[13px] text-[#0F172A] shadow-sm placeholder:text-[#64748B] transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                                />
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setSearch('');
                                        setMobileSearchExpanded(false);
                                    }}
                                    className={`absolute right-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${search ? 'hover:bg-slate-100' : ''}`}
                                >
                                    <Delete
                                        className="h-4 w-4"
                                        style={{ color: search ? '#000000' : '#cbd5e1' }}
                                    />
                                </button>
                            </div>
                        )}
                        {/* Desktop / tablet: original search label */}
                        <label className={`flex h-11 min-w-0 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-[13px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 max-sm:hidden ${isTabletViewport ? 'w-full' : 'flex-1'}`}>
                            <Search size={20} className="shrink-0 text-[#1A4E8D]" />
                            <span className="sr-only">Search POS-visible items</span>
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search POS-visible items..."
                                className="h-auto min-w-0 w-full border-0 bg-transparent p-0 text-[13px] text-[#0F172A] shadow-none outline-none ring-0 placeholder:text-[#64748B] focus:outline-none focus:ring-0"
                            />
                            <button
                                type="button"
                                aria-label="Backspace search"
                                onMouseDown={handleSearchBackspaceStart}
                                onMouseUp={handleSearchBackspaceEnd}
                                onMouseLeave={handleSearchBackspaceEnd}
                                onTouchStart={handleSearchBackspaceStart}
                                onTouchEnd={handleSearchBackspaceEnd}
                                onTouchCancel={handleSearchBackspaceEnd}
                                className={`shrink-0 rounded-md p-1 transition ${search ? 'hover:bg-slate-100' : ''}`}
                                disabled={!search}
                            >
                                <Delete
                                    className="h-4 w-4"
                                    style={{ color: search ? '#000000' : '#cbd5e1' }}
                                />
                            </button>
                        </label>
                        {isTabletViewport ? (
                            <div className="grid grid-cols-2 gap-3">
                                <Suspense fallback={(
                                    <button
                                        type="button"
                                        disabled
                                        className="flex h-11 w-full shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-bold text-slate-400"
                                    >
                                        Scan
                                    </button>
                                )}>
                                    <POSBarcodeScanner
                                        sessionLocked={sessionLocked}
                                        selectedLocationId={selectedLocationId}
                                        terminalId={normalizedTerminalId}
                                        onAddToCart={addToCart}
                                        className="w-full"
                                    />
                                </Suspense>
                                <button
                                    type="button"
                                    className={`flex h-11 w-full shrink-0 items-center justify-center gap-3 rounded-lg border px-5 text-[13px] font-bold shadow-sm transition ${
                                        catalogFiltersOpen || selectedFolder
                                            ? 'border-[#1A4E8D] bg-blue-50 text-[#1A4E8D] hover:bg-blue-100'
                                            : 'border-slate-300 bg-white text-[#0F172A] hover:bg-slate-50'
                                    }`}
                                    onClick={() => setCatalogFiltersOpen((open) => !open)}
                                    aria-expanded={catalogFiltersOpen}
                                    aria-controls="pos-catalog-category-filters"
                                    title="Show or hide catalog filters"
                                >
                                    <Filter size={18} />
                                    {selectedFolder ? selectedFolder.name : 'Filter'}
                                    <ChevronDown className={`h-4 w-4 transition-transform ${catalogFiltersOpen ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className={`flex h-11 shrink-0 items-center justify-center gap-3 rounded-lg border px-5 text-[13px] font-bold shadow-sm transition max-sm:flex-1 max-sm:min-w-0 ${
                                        catalogFiltersOpen || selectedFolder
                                            ? 'border-[#1A4E8D] bg-blue-50 text-[#1A4E8D] hover:bg-blue-100'
                                            : 'border-slate-300 bg-white text-[#0F172A] hover:bg-slate-50'
                                    }`}
                                    onClick={() => setCatalogFiltersOpen((open) => !open)}
                                    aria-expanded={catalogFiltersOpen}
                                    aria-controls="pos-catalog-category-filters"
                                    title="Show or hide catalog filters"
                                >
                                    <Filter size={18} />
                                    {selectedFolder ? selectedFolder.name : 'Filter'}
                                    <ChevronDown className={`h-4 w-4 transition-transform ${catalogFiltersOpen ? 'rotate-180' : ''}`} />
                                </button>
                            <Suspense fallback={(
                                <button
                                    type="button"
                                    disabled
                                    className="flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-bold text-slate-400 max-sm:flex-1 max-sm:min-w-0"
                                >
                                    Scan
                                </button>
                            )}>
                                <POSBarcodeScanner
                                    sessionLocked={sessionLocked}
                                    selectedLocationId={selectedLocationId}
                                    terminalId={normalizedTerminalId}
                                    onAddToCart={addToCart}
                                    className="max-sm:flex-1 max-sm:min-w-0"
                                />
                            </Suspense>
                            </>
                        )}
                </div>
                </div>
                <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 dgfy-pos-scrollbar-hidden">
                    <button
                        type="button"
                        onClick={() => setSelectedFolderId(null)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-extrabold transition-all shadow-xs ${
                            !selectedFolderId
                                ? 'border border-[#0B449C] bg-[#0B449C] text-white shadow-blue-900/15'
                                : 'border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span>All Items</span>
                    </button>
                    {availableCategories.map((folder) => {
                        const active = Number(selectedFolderId) === Number(folder.folder_id);
                        return (
                            <button
                                key={folder.folder_id}
                                type="button"
                                onClick={() => toggleFolderFilter(folder.folder_id)}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-extrabold transition-all shadow-xs ${
                                    active
                                        ? 'border border-[#0B449C] bg-[#0B449C] text-white shadow-blue-900/15'
                                        : 'border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <Folder className="h-3.5 w-3.5" />
                                <span>{folder.name}</span>
                            </button>
                        );
                    })}
                </div>
                {catalogFiltersOpen && (
                <div id="pos-catalog-category-filters" className="mb-4">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#0F172A]">POS Categories</h3>
                        {selectedFolderId && (
                            <button
                                type="button"
                                onClick={() => setSelectedFolderId(null)}
                                className="text-xs font-semibold text-[#1A4E8D] hover:text-[#143F73]"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-[#64748B]">Click category to filter. Click again to cancel.</p>
                    <div className={`${isTabletViewport ? 'mt-2 gap-2' : 'mt-3 gap-3'} flex flex-wrap`}>
                        <button
                            type="button"
                            onClick={() => setSelectedFolderId(null)}
                            className={`inline-flex h-9 min-w-[112px] items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-extrabold transition sm:min-w-[120px] ${
                                !selectedFolderId
                                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-lg shadow-blue-900/10'
                                    : 'border-slate-200 bg-slate-50 text-[#0F172A] hover:border-blue-200 hover:bg-white'
                            }`}
                        >
                            <span>All Items</span>
                            {!selectedFolderId && <X className="h-3.5 w-3.5 opacity-70" />}
                        </button>
                        {availableCategories.map((folder) => {
                            const active = selectedFolderId === folder.folder_id;
                            return (
                                <button
                                    key={folder.folder_id}
                                    type="button"
                                    onClick={() => toggleFolderFilter(folder.folder_id)}
                                    className={`inline-flex h-9 min-w-[112px] items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-extrabold transition sm:min-w-[120px] ${
                                        active
                                            ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-lg shadow-blue-900/10'
                                            : 'border-slate-200 bg-slate-50 text-[#0F172A] hover:border-blue-200 hover:bg-white'
                                    }`}
                                >
                                    <Folder className="h-3.5 w-3.5" />
                                    <span>{folder.name}</span>
                                    {active && <X className="h-3.5 w-3.5 opacity-70" />}
                                </button>
                            );
                        })}
                    </div>
                    {posFoldersLoading && (
                        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                            Loading POS categories...
                        </p>
                    )}
                    {!posFoldersLoading && posFoldersError && (
                        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                            <p>{posFoldersError}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2 h-7 px-2 text-[11px]"
                                onClick={loadPosFolders}
                            >
                                Retry
                            </Button>
                        </div>
                    )}
                    {!posFoldersLoading && !posFoldersError && !canViewHistory && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                            You need POS view permission to load POS categories.
                        </p>
                    )}
                    {!posFoldersLoading && !posFoldersError && canViewHistory && safePosFolders.length === 0 && (
                        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                            No POS folder filters available yet.
                        </p>
                    )}
                    {!posFoldersLoading && !posFoldersError && canViewHistory && safePosFolders.length > 0 && availableCategories.length === 0 && (
                        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                            No categories currently have available items.
                        </p>
                    )}
                </div>
                )}
                <div
                    ref={catalogCapacityViewportRef}
                    data-testid="pos-catalog-scroll"
                    className="dgfy-pos-scroll-region relative mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y select-none"
                    onTouchStart={(event) => {
                        const touch = event.touches?.[0];
                        if (!touch) return;
                        handleCatalogSwipeStart(touch.clientX);
                    }}
                    onTouchEnd={(event) => {
                        const touch = event.changedTouches?.[0];
                        if (!touch) return;
                        handleCatalogSwipeEnd(touch.clientX);
                    }}
                    onPointerDown={(event) => {
                        if (event.pointerType !== 'pen') return;
                        handleCatalogSwipeStart(event.clientX, event.pointerId);
                    }}
                    onPointerUp={(event) => {
                        if (event.pointerType !== 'pen') return;
                        handleCatalogSwipeEnd(event.clientX, event.pointerId);
                    }}
                    onPointerCancel={() => {
                        catalogSwipeStartXRef.current = null;
                        catalogSwipePointerIdRef.current = null;
                    }}
                >
                {catalogLoading ? (
                    <p className="text-sm text-slate-500">Loading catalog...</p>
                ) : (
                    <>
                    {catalogRefreshing && (
                        <p role="status" className="absolute right-2 top-2 z-20 rounded-md bg-blue-50/95 px-2 py-1 text-xs font-semibold text-blue-700 shadow-sm">
                            Refreshing catalog...
                        </p>
                    )}
                    <div
                        ref={catalogGridRef}
                        className={`${catalogGridClassName} ${catalogRefreshing ? 'pointer-events-none opacity-70' : ''}`}
                        data-catalog-columns={catalogGridLayout.columns}
                        data-catalog-rows={catalogGridLayout.rows}
                        data-catalog-page-size={catalogPageSize}
                        style={{
                            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${catalogGridLayout.minimumCardWidth}px), 1fr))`,
                            gridAutoRows: `${catalogGridLayout.cardHeight}px`,
                            gap: `${CATALOG_GRID_GAP_PX}px`
                        }}
                        aria-busy={catalogRefreshing}
                    >
                        {visibleCatalogItems.map((item, itemIndex) => {
                            const isServiceItem = isServiceCatalogItem(item);
                            const isAlwaysAvailable = item?.pos_always_available === true;
                            const isBestSeller = item?.is_best_seller === true;
                            const isOutOfStock = !isServiceItem && !isAlwaysAvailable && Number(item.current_stock || 0) <= 0;
                            const imageSources = resolvePosCatalogImageSources(item, receiptSettings);
                            const {
                                configuredLargeSrc: largePosImageSrc,
                                fallbackSrc: fallbackPosImageSrc,
                                src: posImageSrc
                            } = imageSources;
                            const hasImage = Boolean(posImageSrc) && !catalogImageErrors.has(item.item_id);
                            const cartLineForItem = safeCart.find((line) => line.item_id === item.item_id);
                            const cartQuantityForItem = cartLineForItem ? Number(cartLineForItem.quantity) || 0 : 0;
                            const isEditingThisQuantity = editingQuantityItemId === item.item_id;
                            const stockColorClassName = getCatalogStockColorClassName(item, lowStockDisplayThreshold);
                            return (
                                <div
                                    key={item.item_id}
                                    data-pos-catalog-card="true"
                                    onClick={(event) => {
                                        if (isOutOfStock || posActionsBlocked) {
                                            if (posActionsBlocked) notifyPosActionBlocked();
                                            return;
                                        }
                                        addToCart(item);
                                        flyImageToCheckoutBar(event.currentTarget);
                                    }}
                                    onKeyDown={(event) => {
                                        if (isOutOfStock || posActionsBlocked) return;
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            addToCart(item);
                                            flyImageToCheckoutBar(event.currentTarget);
                                        }
                                    }}
                                    role={isOutOfStock || posActionsBlocked ? 'group' : 'button'}
                                    tabIndex={isOutOfStock || posActionsBlocked ? -1 : 0}
                                    aria-disabled={isOutOfStock || posActionsBlocked}
                                    className={`${catalogCardClassName} ${
                                        isOutOfStock || posActionsBlocked
                                            ? 'cursor-not-allowed opacity-75 blur-[0.5px]'
                                            : 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
                                    }`}
                                >
                                <div className="mb-1 max-sm:mb-0 max-sm:self-stretch">
                                    <div
                                        className={`${catalogCardImageWrapClassName} relative`}
                                        aria-hidden="true"
                                    >
                                        {hasImage ? (
                                            <PosResponsiveImage
                                                sources={imageSources}
                                                alt={`${item.name} menu`}
                                                loading={itemIndex < 4 ? 'eager' : 'lazy'}
                                                decoding="async"
                                                fetchpriority={itemIndex < 4 ? 'high' : 'auto'}
                                                width={400}
                                                height={400}
                                                sizes="(max-width: 640px) 118px, (max-width: 1024px) 33vw, 25vw"
                                                className="product-image h-full w-full object-cover object-center"
                                                onError={(event) => {
                                                    if (advanceAssetImageFallback(event, [largePosImageSrc, fallbackPosImageSrc])) return;
                                                    setCatalogImageErrors((previous) => {
                                                        const next = new Set(previous);
                                                        next.add(item.item_id);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-center">
                                                <span className="px-2 text-xs font-semibold text-[#64748B]">No POS Image</span>
                                            </div>
                                        )}
                                        {isOutOfStock && (
                                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-rose-200 bg-rose-50/95 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                                                Out of stock
                                            </span>
                                        )}
                                        {IS_DGFY_POS_SURFACE && isTabletViewport && (
                                            <>
                                                <div className="absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)]">
                                                    <CatalogItemBadges
                                                        isServiceItem={isServiceItem}
                                                        isAlwaysAvailable={isAlwaysAvailable}
                                                        isBestSeller={isBestSeller}
                                                        overlay
                                                    />
                                                </div>
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent px-2 py-1.5">
                                                    <p className="min-w-0 text-[11px] font-black leading-tight text-white line-clamp-2">
                                                        {item.name}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {!(IS_DGFY_POS_SURFACE && isTabletViewport) && (
                                    <>
                                        {/* Mobile layout (<640px): name on top (full text, no clamp), with
                                            price/availability/quantity-control encased in one div below it. */}
                                        {/* Mobile-only simplification: VAT row, stock dot indicator, and product
                                            code (sku_code) removed. "Always available" renders only when true —
                                            no placeholder when it doesn't apply. */}
                                        <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5 p-2.5 sm:hidden">
                                            <p className={`min-w-0 text-[13px] font-black leading-tight ${stockColorClassName}`}>{item.name}</p>
                                            <div className="flex items-center justify-between gap-x-2 gap-y-1.5">
                                                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                                                    <CatalogItemBadges
                                                        isServiceItem={isServiceItem}
                                                        isAlwaysAvailable={isAlwaysAvailable}
                                                        isBestSeller={isBestSeller}
                                                    />
                                                    <span className="font-black text-[#1A4E8D] whitespace-nowrap text-[10.5px]">
                                                        {Number(item.default_sale_price || 0) > 0 ? `PHP ${money(item.default_sale_price)}` : 'Not set'}
                                                    </span>
                                                </div>
                                                {/* Quantity control, laid out horizontally as [ - ] [ item count ] [ + ].
                                                    stopPropagation keeps taps here from also firing the card's own
                                                    onClick (which would otherwise double-add the item). Manual entry
                                                    uses a sanitized text input (not type="number") so no native
                                                    increment/decrement spinner buttons render inside the field. */}
                                                <div
                                                    className="flex shrink-0 items-center gap-1"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustCartQuantity(item, -1)}
                                                        disabled={cartQuantityForItem <= 0 || posActionsBlocked}
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base font-black leading-none text-slate-500 active:scale-95 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                        aria-label={`Decrease quantity for ${item.name}`}
                                                    >
                                                        −
                                                    </button>
                                                    {isEditingThisQuantity ? (
                                                        <input
                                                            type="text"
                                                            inputMode={allowsDecimalQuantity(item.unit_of_measure) ? 'decimal' : 'numeric'}
                                                            pattern={allowsDecimalQuantity(item.unit_of_measure) ? '[0-9]*\\.?[0-9]*' : '[0-9]*'}
                                                            autoFocus
                                                            value={quantityInputValue}
                                                            onChange={(event) => setQuantityInputValue(sanitizeQuantityInput(event.target.value, allowsDecimalQuantity(item.unit_of_measure)))}
                                                            onBlur={() => commitManualCartQuantity(item)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    // Without this, the keydown bubbles to the card's
                                                                    // own onKeyDown (Enter/Space -> addToCart), which
                                                                    // would re-add the item right after committing.
                                                                    event.stopPropagation();
                                                                    commitManualCartQuantity(item);
                                                                }
                                                            }}
                                                            className="h-8 w-9 shrink-0 rounded-md border border-slate-200 text-center text-[13px] font-black text-[#0F172A]"
                                                            aria-label={`Set quantity for ${item.name}`}
                                                        />
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (isOutOfStock || posActionsBlocked) return;
                                                                setEditingQuantityItemId(item.item_id);
                                                                setQuantityInputValue(String(cartQuantityForItem));
                                                            }}
                                                            disabled={isOutOfStock || posActionsBlocked}
                                                            className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-black text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-40"
                                                            aria-label={`Quantity for ${item.name}, tap to type a value`}
                                                        >
                                                            {cartQuantityForItem}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onPointerDown={(event) => {
                                                            if (isOutOfStock || posActionsBlocked) return;
                                                            handleQtyButtonPointerDown(event, item);
                                                        }}
                                                        onPointerMove={(event) => handleQtyButtonPointerMove(event, item)}
                                                        onPointerUp={(event) => {
                                                            if (isOutOfStock || posActionsBlocked) return;
                                                            handleQtyButtonPointerUp(event, item);
                                                        }}
                                                        onPointerCancel={handleQtyButtonPointerCancel}
                                                        disabled={isOutOfStock || posActionsBlocked}
                                                        className="flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-black leading-none text-[#1A4E8D] active:scale-95 active:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                        aria-label={`Increase quantity for ${item.name}. Tap to add one, or press and hold then drag up to add more.`}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex min-w-0 flex-col gap-1.5 max-sm:hidden">
                                            <div className="flex min-w-0 items-start gap-1.5">
                                                <p className={`min-w-0 flex-1 text-[13.5px] font-black leading-tight line-clamp-2 ${stockColorClassName}`}>{item.name}</p>
                                                {isBestSeller && (
                                                    <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-700">
                                                        Best seller
                                                    </span>
                                                )}
                                            </div>
                                            <CatalogItemBadges
                                                isServiceItem={isServiceItem}
                                                isAlwaysAvailable={isAlwaysAvailable}
                                                isBestSeller={false}
                                            />
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px] font-extrabold tracking-wide text-[#64748B] max-sm:hidden">{item.sku_code}</p>
                                    </>
                                )}
                                {IS_DGFY_POS_SURFACE && isTabletViewport ? (
                                    <div className="mt-1 flex items-center justify-center rounded-md px-1 py-0.5">
                                        <span className={`text-[11px] font-black ${isOutOfStock ? 'text-rose-700' : 'text-[#1A4E8D]'}`}>
                                            {isOutOfStock
                                                ? 'Unavailable'
                                                : `PHP ${money(item.default_sale_price)}`}
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`${isTabletViewport ? 'mt-1.5' : 'mt-3'} grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10.5px] text-[#64748B] max-sm:hidden`}>
                                            <span className="font-semibold">Stock:</span>
                                            <span className={`text-right font-bold whitespace-nowrap ${stockColorClassName}`}>
                                                {isServiceItem ? 'Service' : isAlwaysAvailable ? 'Always available' : Number(item.current_stock || 0).toFixed(2)}
                                            </span>
                                            <span className="font-semibold">Price:</span>
                                            <span className="text-right font-black text-[#1A4E8D] whitespace-nowrap">
                                                {Number(item.default_sale_price || 0) > 0
                                                    ? `PHP ${money(item.default_sale_price)}`
                                                    : 'Not set'}
                                            </span>
                                            <span className="font-semibold">VAT:</span>
                                            <span className="text-right font-extrabold text-[#334155] whitespace-nowrap">
                                                {VAT_TYPE_LABEL[item.vat_type || 'vatable'] || 'VATable'}
                                            </span>
                                        </div>
                                        {isOutOfStock && (
                                            <p className="mt-auto pt-1 text-[10.5px] font-medium text-slate-500 max-sm:hidden">
                                                Unavailable for checkout.
                                            </p>
                                        )}
                                    </>
                                )}
                                </div>
                            );
                        })}
                        {catalogError && (
                            <p className="text-sm text-amber-700 col-span-full rounded-xl border border-amber-200 bg-amber-50 p-4">
                                {catalogError}
                            </p>
                        )}
                        {!catalogError && visibleCatalogItems.length === 0 && (
                            <p className="text-sm text-slate-600 col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                                No POS-visible items.
                            </p>
                        )}
                    </div>
                    </>
                )}
                    </div>
                    </div>
                    <div
                        data-testid="pos-catalog-footer"
                        className="mt-auto shrink-0 border-t border-slate-200 bg-slate-50/80 px-1 py-2 supports-[backdrop-filter]:bg-white/80"
                    >
                            <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
                                <div className="text-center sm:text-left">
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">Catalog Footer</p>
                                    <p className="text-xs font-semibold text-[#334155]">
                                    Showing {visibleCatalogRange.start}-{visibleCatalogRange.end} of {catalogForDisplay.length || 0} items
                                    </p>
                                </div>
                                <div className="flex items-center justify-center gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCatalogPageChange('previous')}
                                    disabled={catalogPage <= 1}
                                    aria-label="Go to previous catalog page"
                                >
                                    <ChevronLeft className="mr-1 h-4 w-4" />
                                    Previous
                                </Button>
                                <span className="text-xs font-semibold text-[#334155]">
                                    Page {catalogPage} of {totalCatalogPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCatalogPageChange('next')}
                                    disabled={catalogPage >= totalCatalogPages}
                                    aria-label="Go to next catalog page"
                                >
                                    Next
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                </Button>
                            </div>
                            </div>
                        </div>
            </section>

            {mobileCheckoutPanelOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-950/45 md:hidden"
                    onClick={() => setMobileCheckoutPanelOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                data-testid="pos-current-sale-panel"
                className={`${checkoutPaneClassName} ${mobileCheckoutPanelOpen
                    ? 'fixed inset-x-0 bottom-0 z-50 h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] translate-y-0 pointer-events-auto'
                    : 'fixed inset-x-0 bottom-0 z-50 h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] translate-y-full pointer-events-none'
                } transition-transform duration-300 ease-out md:static md:z-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto md:transition-none`}
            >
            <section className={`relative flex min-h-0 flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70 sm:p-4 md:rounded-xl ${currentSalePaneHeightClassName}`}>
                    <div role="region" aria-label="Current sale contents" className="flex h-full min-h-0 flex-col">
                <div data-testid="pos-current-sale-header" className="relative mb-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-[21px] font-black tracking-tight text-[#0F172A]">Current Sale</h2>
                        <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCurrentSaleHelpOpen((open) => !open)}
                            className="inline-flex items-center justify-center p-0.5 text-amber-600 hover:text-amber-700"
                            aria-label="Toggle current sale help"
                            title="Show current sale help"
                        >
                            <AlertCircle className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileCheckoutPanelOpen(false)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
                            aria-label="Close current sale panel"
                            title="Close"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        </div>
                    </div>
                    {currentSaleHelpOpen && (
                        <div className="absolute right-0 top-9 z-20 w-full max-w-[16rem] rounded-lg border border-amber-200 bg-white p-3 text-[12px] leading-5 text-slate-700 shadow-xl shadow-slate-900/10">
                            <p className="break-words font-semibold text-slate-800">Review cart, VAT, and total before checkout.</p>
                            <p className="mt-2 break-words text-slate-600">Online-order platform fees are not applied to in-store POS checkout.</p>
                        </div>
                    )}
                </div>
                <div data-testid="pos-current-sale-scroll" className={currentSaleBodyClassName}>
                <div className="col-span-2 flex min-h-0 flex-col overflow-hidden md:h-[clamp(18rem,46vh,26rem)] md:flex-none">
                <div className="min-h-0 flex-1 overflow-hidden border-b border-slate-200 pb-2">
                    <div data-testid="pos-current-sale-items" className={`space-y-2.5 ${currentSaleItemsListClassName}`}>
                        {safeCart.length > 0 ? safeCart.map((line) => {
                            const lineKey = getLineKey(line);
                            return (
                                <div key={lineKey} className="rounded-lg border border-slate-200 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <CartItemThumbnail catalog={catalog} line={line} receiptSettings={receiptSettings} />
                                            <p className="text-[13px] font-extrabold text-[#0F172A] truncate">{line.item_name}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeCartLine(lineKey)}
                                            disabled={posActionsBlocked}
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                            aria-label={`Remove ${line.item_name}`}
                                            title="Remove item"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <label className="text-[11px] text-slate-500">
                                            Qty
                                            {/* Mobile: read-only, qty is managed from the catalog card's stepper. */}
                                            <p className="mt-1 flex h-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-[13px] font-extrabold text-[#0F172A] sm:hidden">
                                                {formatQuantity(line.quantity)}
                                            </p>
                                            {/* Tablet/desktop: +/- controls restored here. Tablet's row uses the
                                                same taller h-10 sizing as the "+" button below (for touch-target
                                                consistency/alignment - not itself a functional change), desktop
                                                keeps the original h-8. */}
                                            <div className="mt-1 hidden items-center gap-1 sm:flex">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={isTabletViewport ? 'h-10 px-3 text-[13px]' : 'h-8 px-2 text-[13px]'}
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) - 1)}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                                <span className={`flex min-w-0 flex-1 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-[13px] font-extrabold text-[#0F172A] ${isTabletViewport ? 'h-10' : 'h-8'}`}>
                                                    {formatQuantity(line.quantity)}
                                                </span>
                                                {/* Desktop and tablet: long-press-then-drag-up shows the same
                                                    bulk-add meter the mobile catalog "+" button uses (see
                                                    handleCartQtyButtonPointerDown and friends, and the shared
                                                    qtyMeterState/.qty-meter portal render below) - same gesture
                                                    timing, drag scaling, and 0-20 limit as desktop/mobile, no
                                                    logic duplicated. A plain tap still adds exactly +1, handled
                                                    inside the pointerUp handler itself, so no onClick here (would
                                                    double-add on tap). Tablet gets a slightly larger touch target
                                                    (h-10/px-3) than desktop's h-8/px-2 for easier touch input;
                                                    mobile is unaffected - it never renders this stepper (its cart
                                                    line qty is read-only, managed from the catalog card instead). */}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={`${isTabletViewport ? 'h-10 px-3 text-[13px]' : 'h-8 px-2 text-[13px]'} hidden sm:inline-flex`}
                                                    onPointerDown={(event) => handleCartQtyButtonPointerDown(event, line)}
                                                    onPointerMove={(event) => handleCartQtyButtonPointerMove(event, line)}
                                                    onPointerUp={(event) => handleCartQtyButtonPointerUp(event, line)}
                                                    onPointerCancel={handleCartQtyButtonPointerCancel}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-[13px] sm:hidden"
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) + 1)}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </label>
                                        <div className="text-[11px] text-slate-500">
                                            <span>Price</span>
                                            <p className="mt-1 h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[13px] font-extrabold leading-8 text-[#0F172A]">
                                                {money(line.sale_price)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/70">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-[13px] font-black text-[#0F172A]">Current Sale</p>
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">
                                        Empty
                                    </span>
                                </div>
                                <div className="flex h-14 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
                                    <span className="px-2 text-center text-[12px] font-semibold text-slate-500">
                                        No items in cart yet.
                                    </span>
                                </div>
                                <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
                                    Add items to start this sale.
                                </p>
                            </div>
                        )}
                </div>
                </div>
                </div>

                <div className="col-span-2 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <label className="block text-[11px] font-extrabold text-[#0F172A]" htmlFor="pos-affiliate-code-input">Affiliate Code (optional)</label>
                    <div className="relative mt-1">
                        <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <Input
                            id="pos-affiliate-code-input"
                            className="h-8 rounded-lg border-slate-200 bg-white pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
                            placeholder="e.g. AF-K7QP2X"
                            value={affiliateCodeInput}
                            onChange={(e) => setAffiliateCodeInput(e.target.value)}
                        />
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">Validated at checkout.</p>
                </div>

                <div data-testid="pos-current-sale-totals" className="col-span-2 border-b border-slate-200 pb-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 md:hidden">
                        <div className="flex justify-between">
                            <span className="text-[#334155]">Items Subtotal</span>
                            <span className="font-extrabold text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}
                            </span>
                            <span className="font-extrabold text-rose-600">- PHP {money(calculatedDiscountAmount)}</span>
                        </div>
                        {governedDiscountTotals.vatRemoved > 0 && <div className="flex justify-between"><span className="text-[#334155]">VAT Removed</span><span className="font-extrabold text-rose-600">- PHP {money(governedDiscountTotals.vatRemoved)}</span></div>}
                        {governedDiscountTotals.vatExemptAmount > 0 && <div className="flex justify-between"><span className="text-[#334155]">VAT-Exempt Amount</span><span className="font-extrabold text-[#0F172A]">PHP {money(governedDiscountTotals.vatExemptAmount)}</span></div>}
                        <div className="flex justify-between">
                            <span className="text-[#334155]">Net Items</span>
                            <span className="font-extrabold text-[#0F172A]">PHP {money(netItemsTotal)}</span>
                        </div>
                        <div className="col-span-2 my-1 border-t border-dashed border-slate-200" />
                        <div className="flex justify-between">
                            <span className="text-slate-600">Vatable Sales</span>
                            <span className="font-medium">PHP {money(vatBreakdown.vatableSales)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">VAT Amount</span>
                            <span className="font-medium">PHP {money(vatBreakdown.vatAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">VAT Exempt Sales</span>
                            <span className="font-medium">PHP {money(vatBreakdown.vatExemptSales)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Zero Rated Sales</span>
                            <span className="font-medium">PHP {money(vatBreakdown.zeroRatedSales)}</span>
                        </div>
                        <div className="col-span-2 mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
                            <span className="text-[15px] font-black text-[#0F172A]">Total</span>
                            <span className="text-[18px] font-black text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                        </div>
                    </div>

                    <div data-testid="pos-current-sale-desktop-summary" className="hidden gap-y-0.5 md:grid">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Items Subtotal</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Net Items</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">PHP {money(netItemsTotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Discount</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(calculatedDiscountAmount)}</span>
                        </div>
                        {governedDiscountTotals.vatRemoved > 0 && (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                                <span className="min-w-0 text-[#334155]">VAT Removed</span>
                                <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(governedDiscountTotals.vatRemoved)}</span>
                            </div>
                        )}
                        {governedDiscountTotals.vatExemptAmount > 0 && (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                                <span className="min-w-0 text-[#334155]">VAT-Exempt Amount</span>
                                <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">PHP {money(governedDiscountTotals.vatExemptAmount)}</span>
                            </div>
                        )}
                        <div className="my-1 border-t border-dashed border-slate-200" />
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VATable Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.vatableSales)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VAT Exempt Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.vatExemptSales)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VAT Amount</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.vatAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">Zero Rated Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.zeroRatedSales)}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
                            <span className="text-[15px] font-black text-[#0F172A]">Total</span>
                            <span className="whitespace-nowrap text-[18px] font-black tabular-nums text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                        </div>
                    </div>
                </div>
                </div>

                {(checkoutBlockedReason || safeCart.length === 0) && (
                    <div className="shrink-0 border-t border-slate-200 pt-2">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                            {checkoutBlockedReason || 'Add at least one item before checkout.'}
                        </div>
                    </div>
                )}

                <div data-testid="pos-current-sale-actions" className="dgfy-pos-current-sale-actions grid shrink-0 grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-200 pt-2">
                    <Button
                        type="button"
                        onClick={openCheckoutConfirmModal}
                        disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-xl bg-[#0B449C] p-1.5 text-center text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <ShoppingCart size={14} className="mb-0.5 shrink-0" />
                        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">
                            {checkoutLoading ? 'Processing...' : `Checkout (${safeCart.length} ${safeCart.length === 1 ? 'Item' : 'Items'})`}
                        </span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrintOrder}
                        disabled={posActionsBlocked || safeCart.length === 0}
                        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Printer size={14} className="mb-0.5 shrink-0" />
                        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">Print Order</span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseDay}
                        disabled={closingDay}
                        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-[#1A4E8D] bg-white p-1.5 text-center text-[#1A4E8D] hover:bg-blue-50"
                    >
                        <Gauge size={14} className="mb-0.5 shrink-0" />
                        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">{closingDay ? 'Generating...' : 'Close Day / Z-Reading'}</span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePrintReceipt(lastReceipt, 'last_receipt_panel')}
                        disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync}
                        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border p-1.5 text-center"
                    >
                        <Printer size={14} className="mb-0.5 shrink-0" />
                        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">{receiptPrinting ? 'Printing...' : 'Print Last Receipt'}</span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleOpenDrawer({
                            transactionId: Number(lastReceipt?.pos_transaction_id) || null,
                            reason: 'manual_drawer_panel'
                        })}
                        disabled={!activeShiftId || drawerOpening}
                        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border p-1.5 text-center"
                    >
                        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">{drawerOpening ? 'Opening...' : 'Open Cash Drawer'}</span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-[#1A4E8D] bg-white p-1.5 text-center text-[#1A4E8D] hover:bg-blue-50"
                        onClick={openDiscountModal}
                        disabled={posActionsBlocked || safeCart.length === 0}
                    >
                        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">Apply Discount</span>
                    </Button>
                </div>
                    </div>
            </section>
            </aside>

                </div>

                <div
                    id="checkout-bar"
                    className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pt-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] md:hidden"
                    style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
                    role="region"
                    aria-label="Current sale summary"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                {cartTotalQuantity} item{cartTotalQuantity === 1 ? '' : 's'} selected
                            </p>
                            <p className="truncate text-[18px] font-black text-[#1A4E8D]">
                                PHP {money(cartTotal)}
                            </p>
                        </div>
                        <Button
                            id="checkout-bar-button"
                            type="button"
                            onClick={() => setMobileCheckoutPanelOpen(true)}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                            className="h-11 shrink-0 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Lock size={16} className="mr-1.5" />
                            {checkoutLoading ? 'Processing...' : 'Checkout'}
                        </Button>
                    </div>
                </div>
                </>
                </div>
            )}

            {currentViewMode === 'receipt' && (
                <div>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Order Preview</h2>
                            <p className="text-sm text-slate-600">Review the selected order summary.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid="pos-receipt-open-sales-report"
                                onClick={() => openInSalesReport(lastReceipt)}
                            >
                                Open in Sales Report
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handlePrintReceipt(lastReceipt, 'receipt_preview')}
                                disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync}
                            >
                                {receiptPrinting ? 'Printing...' : 'Send to Printer'}
                            </Button>
                        </div>
                    </div>
                    {lastReceipt ? (
                        <div className="space-y-3">
                            <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading order preview...</div>}>
                                <OrderPreviewView
                                    transaction={lastReceipt}
                                />
                            </Suspense>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                            <p className="text-base font-semibold text-slate-900">No receipt selected yet.</p>
                            <p className="mt-1 text-sm text-slate-600">
                                Select a history record to preview.
                            </p>
                            <Button
                                type="button"
                                className="mt-4"
                                onClick={() => setCurrentViewMode('history')}
                                disabled={!canViewHistory}
                            >
                                Go to History
                        </Button>
                    </div>
                    )}
                </div>
            )}
            </section>

            <Dialog open={discountModalOpen} onOpenChange={setDiscountModalOpen}>
                <DialogContent className="relative flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[480px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-0 shadow-xl shadow-slate-950/20 sm:w-[calc(100vw-2rem)]">
                    <button
                        type="button"
                        onClick={() => setDiscountModalOpen(false)}
                        className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none"
                        aria-label="Close discount modal"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 text-left">
                        <DialogTitle className="text-base font-bold tracking-tight text-[#0F172A]">Apply Discount</DialogTitle>
                        <DialogDescription className="mt-0.5 text-[11px] text-[#64748B]">Select the discount and complete all required verification details.</DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                        <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="Discount Type">
                            {DISCOUNT_TYPE_OPTIONS.map((option) => {
                                const TypeIcon = option.icon;
                                const active = discountDraft.type === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        aria-controls="discount-type-panel"
                                        className={`flex h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border p-1 text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                                            active
                                                ? 'border-teal-600 bg-teal-50/20 text-teal-600 font-extrabold shadow-sm'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-slate-50/50'
                                        }`}
                                        onClick={() => setDiscountDraft((previous) => ({
                                            ...previous,
                                            type: option.value,
                                            rate: ['senior', 'pwd'].includes(option.value) ? '20' : previous.rate
                                        }))}
                                    >
                                        <TypeIcon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-teal-600' : 'text-slate-500'}`} aria-hidden="true" />
                                        <span className="truncate w-full text-center">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2 text-[11px] text-blue-700 font-medium leading-normal">
                            <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" aria-hidden="true" />
                            <p>{DISCOUNT_INFO_MESSAGES[discountDraft.type]}</p>
                        </div>

                        <div id="discount-type-panel" role="tabpanel" className="space-y-3">
                            <div className="grid gap-2.5 grid-cols-2">
                                <div className={`space-y-1 ${['senior', 'pwd', 'promo'].includes(discountDraft.type) ? 'col-span-1' : 'col-span-2'}`}>
                                    <label className="text-xs font-semibold text-[#0F172A]">Customer Name <span className="text-rose-500">*</span></label>
                                    <div className="relative">
                                        <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                        <Input
                                            className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
                                            placeholder="Enter customer name"
                                            value={discountDraft.customer_name}
                                            onChange={(e) => setDiscountDraft((p) => ({ ...p, customer_name: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                {['senior', 'pwd'].includes(discountDraft.type) && (
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Senior/PWD ID Number <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter ID number" value={discountDraft.id_number} onChange={(e) => setDiscountDraft((p) => ({ ...p, id_number: e.target.value }))} />
                                        </div>
                                    </div>
                                )}

                                {discountDraft.type === 'promo' && (
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Promo Code <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input
                                                className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
                                                placeholder="Enter promo code"
                                                value={discountDraft.promo_code || ''}
                                                onChange={(e) => setDiscountDraft((p) => ({ ...p, promo_code: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {['senior', 'pwd'].includes(discountDraft.type) && (
                                <div className="space-y-2.5">
                                    <div>
                                        <p className="mb-1 text-xs font-semibold text-[#0F172A]">Eligible Items</p>
                                        <p className="mb-2 text-[11px] text-slate-500">Select only items and quantities for this Senior/PWD customer.</p>
                                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                            {safeCart.some(isCartLineSeniorPwdEligible) ? safeCart.filter(isCartLineSeniorPwdEligible).map((line) => {
                                                const checked = safeEligibleDiscountItemIds.includes(Number(line.item_id));
                                                const selectedEntry = safeEligibleDiscountItems.find((entry) => Number(entry?.item_id) === Number(line.item_id));
                                                const selectedQuantity = selectedEntry?.eligible_quantity ?? 1;
                                                const catalogItem = safeCatalog.find((item) => item.item_id === line.item_id);
                                                const imageSrc = catalogItem?.pos_image_url || catalogItem?.image_url || line.pos_image_url || '';
                                                const resolvedSrc = imageSrc ? resolveAssetVariantUrl(imageSrc, 'thumbnail') : '';

                                                return (
                                                    <label
                                                        key={`discount-line-${line.item_id}`}
                                                        className={`flex min-h-[32px] items-center justify-between gap-2.5 rounded-lg border px-2 py-1 text-xs transition-all cursor-pointer ${
                                                            checked
                                                                ? 'border-teal-200 bg-teal-50/10'
                                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500 accent-teal-600 cursor-pointer"
                                                                checked={checked}
                                                                onChange={(e) =>
                                                                    setDiscountDraft((p) => ({
                                                                        ...p,
                                                                        eligible_item_ids: e.target.checked
                                                                            ? [...new Set([...toArray(p.eligible_item_ids), Number(line.item_id)])]
                                                                            : toArray(p.eligible_item_ids).filter((id) => id !== Number(line.item_id)),
                                                                        eligible_items: e.target.checked
                                                                            ? [...toArray(p.eligible_items).filter((entry) => Number(entry?.item_id) !== Number(line.item_id)), { item_id: Number(line.item_id), eligible_quantity: 1 }]
                                                                            : toArray(p.eligible_items).filter((entry) => Number(entry?.item_id) !== Number(line.item_id))
                                                                    }))
                                                                }
                                                            />

                                                            <div className="h-6 w-6 shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50 flex items-center justify-center">
                                                                {resolvedSrc ? (
                                                                    <img
                                                                        src={resolvedSrc}
                                                                        alt={line.item_name}
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase">
                                                                        {line.item_name ? line.item_name.substring(0, 2) : 'IT'}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <span className="truncate font-semibold text-slate-700">{line.item_name}</span>
                                                        </div>

                                                        {checked ? (
                                                            <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-600">
                                                                <span>Eligible:</span>
                                                                <Input
                                                                    aria-label={`Eligible quantity for ${line.item_name}`}
                                                                    className="h-6 w-14 rounded-md px-1 text-center text-[10px]"
                                                                    type="number"
                                                                    min="1"
                                                                    max={line.quantity}
                                                                    step="0.001"
                                                                    value={selectedQuantity}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    onChange={(event) => {
                                                                        const requestedQuantity = Number(event.target.value);
                                                                        const cartQuantity = Number(line.quantity || 0);
                                                                        const eligibleQuantity = Number.isFinite(requestedQuantity)
                                                                            ? Math.min(Math.max(requestedQuantity, 1), cartQuantity)
                                                                            : 1;
                                                                        setDiscountDraft((previous) => ({
                                                                            ...previous,
                                                                            eligible_items: toArray(previous.eligible_items).map((entry) => (
                                                                                Number(entry?.item_id) === Number(line.item_id)
                                                                                    ? { ...entry, eligible_quantity: eligibleQuantity }
                                                                                    : entry
                                                                            ))
                                                                        }));
                                                                    }}
                                                                />
                                                                <span>of {formatQuantity(line.quantity)}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                                                Qty: {formatQuantity(line.quantity)}
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            }) : (
                                                <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800" role="status">
                                                    No eligible items are in this cart. In Items, enable Senior/PWD Eligible and save the item, then remove and re-add it to this cart.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {discountDraft.type === 'employee' && (
                                <div className="grid gap-2.5 grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Employee Name <span className="font-medium text-slate-400">(optional)</span></label>
                                        <div className="relative">
                                            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter employee name" value={discountDraft.employee_name} onChange={(e) => setDiscountDraft((p) => ({ ...p, employee_name: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Employee ID <span className="font-medium text-slate-400">(optional)</span></label>
                                        <div className="relative">
                                            <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter employee ID" value={discountDraft.employee_id} onChange={(e) => setDiscountDraft((p) => ({ ...p, employee_id: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {['employee', 'manual'].includes(discountDraft.type) && (
                                <div className="grid gap-2.5 grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Method <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <select
                                                value={discountDraft.method}
                                                onChange={(e) => setDiscountDraft((p) => ({ ...p, method: e.target.value }))}
                                                className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                                            >
                                                <option value="percentage">Percentage</option>
                                                <option value="fixed">Fixed Amount</option>
                                            </select>
                                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">
                                            {discountDraft.method === 'fixed' ? 'Amount' : 'Rate (%)'} <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            {discountDraft.method === 'fixed' ? (
                                                <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            ) : (
                                                <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            )}
                                            <Input
                                                className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
                                                placeholder={discountDraft.method === 'fixed' ? 'Enter amount' : 'Enter rate'}
                                                type="number"
                                                min="0"
                                                max={discountDraft.method === 'percentage' ? 100 : undefined}
                                                value={discountDraft.method === 'fixed' ? discountDraft.amount : discountDraft.rate}
                                                onChange={(e) => setDiscountDraft((p) => ({ ...p, [p.method === 'fixed' ? 'amount' : 'rate']: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {discountDraft.type === 'promo' && (
                                <div className="text-[10px] text-[#64748B] font-medium -mt-1">
                                    Enter a valid promo or campaign code
                                </div>
                            )}

                            {['employee', 'manual'].includes(discountDraft.type) && (
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#0F172A]">
                                        Reason {discountDraft.type === 'manual'
                                            ? <span className="text-rose-500">*</span>
                                            : <span className="font-medium text-slate-400">(optional)</span>}
                                    </label>
                                    <div className="relative">
                                        <MessageSquare className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                        <Input className="h-8 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder={discountDraft.type === 'manual' ? 'Enter manual discount reason' : 'Enter reason'} value={discountDraft.reason} onChange={(e) => setDiscountDraft((p) => ({ ...p, reason: e.target.value }))} />
                                    </div>
                                </div>
                            )}
                            {(discountDraft.type === 'manual' || (discountDraft.type === 'employee' && !signedInUserIsAdminLike)) && (
                                <div className="grid gap-2.5 grid-cols-2">
                                    {discountDraft.type === 'manual' && signedInUserCanApproveManualDiscount ? (
                                        <div className="space-y-1 col-span-2">
                                            <label className="text-xs font-semibold text-[#0F172A]">Approving as</label>
                                            <div className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold leading-8 text-slate-700">
                                                {String(terminalUser?.username || 'Current POS approver').trim() || 'Current POS approver'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 col-span-2">
                                            <label className="text-xs font-semibold text-[#0F172A]">Approver <span className="text-rose-500">*</span></label>
                                            <div className="relative">
                                                <BadgeCheck className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                                <select value={discountDraft.approver_user_id} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, approver_user_id: event.target.value }))} disabled={discountApproversLoading} className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
                                                    <option value="">{discountApproversLoading ? 'Loading approvers...' : 'Select configured manager or admin'}</option>
                                                    {safeDiscountApprovers.map((approver) => <option key={approver.user_id} value={approver.user_id}>{approver.username} ({approver.role})</option>)}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            </div>
                                            {!discountApproversLoading && safeDiscountApprovers.length === 0 && <p className="text-[10px] font-medium text-amber-700 mt-0.5">No POS approval PIN is configured. Ask the Master Admin to configure one.</p>}
                                        </div>
                                    )}
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-xs font-semibold text-[#0F172A]">Approver PIN <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-8 rounded-lg border-slate-200 pl-8 pr-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter approver PIN" type={showDiscountPin ? 'text' : 'password'} inputMode="numeric" value={discountDraft.manager_pin} onChange={(e) => setDiscountDraft((p) => ({ ...p, manager_pin: e.target.value }))} />
                                            <button type="button" onClick={() => setShowDiscountPin((prev) => !prev)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none">
                                                {showDiscountPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-[11px] text-[#334155] space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-500">VAT Removed</span>
                                <span className="font-semibold tabular-nums text-slate-800">PHP {money(calculateGovernedDiscount(safeCart, { ...discountDraft, eligible_item_ids: safeEligibleDiscountItemIds }).vatRemoved)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-500">Discount</span>
                                <span className="font-semibold tabular-nums text-slate-800">PHP {money(calculateGovernedDiscount(safeCart, { ...discountDraft, eligible_item_ids: safeEligibleDiscountItemIds }).discountAmount)}</span>
                            </div>

                            <div className="border-t border-slate-200/60 my-1" />

                            <div className="flex justify-between items-center pt-0.5">
                                <span className="font-extrabold text-slate-800">Total Amount Due</span>
                                <span className="text-sm font-bold tabular-nums text-teal-600">
                                    PHP {money(calculateGovernedDiscount(safeCart, { ...discountDraft, eligible_item_ids: safeEligibleDiscountItemIds }).total)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 border-t border-slate-100 bg-white px-4 py-2.5 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50 transition-colors"
                            onClick={() => setDiscountModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="h-8 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700 transition-colors flex items-center justify-center"
                            onClick={handleApplyGovernedDiscount}
                            disabled={discountApplying}
                        >
                            <Tag className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {discountApplying ? 'Verifying...' : 'Apply Discount'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={checkoutConfirmModalOpen} onOpenChange={setCheckoutConfirmModalOpen}>
                <DialogContent className="pos-checkout-confirm-dialog flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full">
                    <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle id="pos-checkout-confirm-modal-title" className="text-[17px] font-black text-[#0F172A]">
                                        Confirm Checkout
                                    </DialogTitle>
                                    <DialogDescription className="mt-0.5 text-[12px] font-medium text-[#475569]">
                                        Review the items and enter the customer payment before finalizing this sale.
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCheckoutConfirmModalOpen(false)}
                                disabled={checkoutLoading}
                                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none disabled:opacity-50"
                                aria-label="Close checkout confirmation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </DialogHeader>

                    <div className="pos-modal-scroll-content min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" data-testid="pos-checkout-order-settings">
                            <p className="text-[11px] font-black uppercase tracking-wide text-[#64748B]">
                                {posWorkflow.mode === 'services' ? 'Service details' : 'Order details'}
                            </p>
                            {posWorkflow.mode === 'fnb' && (
                                <FnbWorkflowPanel
                                    orderMethod={orderMethod}
                                    setOrderMethod={setOrderMethod}
                                    tableNumber={tableNumber}
                                    setTableNumber={setTableNumber}
                                    kitchenNotes={kitchenNotes}
                                    setKitchenNotes={setKitchenNotes}
                                    disabled={posActionsBlocked || checkoutLoading}
                                />
                            )}
                            {posWorkflow.mode === 'services' && (
                                <ServicesWorkflowPanel
                                    visitType={orderMethod}
                                    setVisitType={setOrderMethod}
                                    clientName={servicesClientName}
                                    setClientName={setServicesClientName}
                                    appointmentDateTime={servicesDateTime}
                                    setAppointmentDateTime={setServicesDateTime}
                                    provider={servicesProvider}
                                    setProvider={setServicesProvider}
                                    resource={servicesResource}
                                    setResource={setServicesResource}
                                    serviceNotes={servicesNotes}
                                    setServiceNotes={setServicesNotes}
                                    disabled={posActionsBlocked || checkoutLoading}
                                />
                            )}
                            <label className="block text-[11px] font-medium text-slate-500">
                                Payment Type
                                <select
                                    value={paymentType}
                                    onChange={(event) => {
                                        setPaymentType(event.target.value);
                                        setEmployeeCreditAccountCode('');
                                        setEmployeeCreditAccount(null);
                                        setSelectedEmployeeCreditOption(null);
                                        setEmployeeCreditLookupLoading(false);
                                        employeeCreditValidationSequenceRef.current += 1;
                                    }}
                                    disabled={posActionsBlocked || checkoutLoading}
                                    className={`mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px] ${POS_FORM_SELECT_CLASS}`}
                                >
                                    <option value="cash">Cash</option>
                                    <option value="gcash">{isMsmeMode ? 'GCash (Manual)' : 'GCash'}</option>
                                    <option value="maya">{isMsmeMode ? 'Maya (Manual)' : 'Maya'}</option>
                                    <option value="card">{isMsmeMode ? 'Card (Manual)' : 'Card'}</option>
                                    <option value="bank_transfer">{isMsmeMode ? 'Bank Transfer (Manual)' : 'Bank Transfer'}</option>
                                    <option value="employee_credit">Employee Credit</option>
                                </select>
                            </label>
                        </div>

                        {!isEmployeeCreditPayment && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
                            <div className="flex justify-between gap-2">
                                <span className="font-semibold text-[#334155]">Total Due</span>
                                <span className="font-black text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                            </div>
                        </div>}

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                                {safeCart.map((line) => {
                                    const lineTotal = round4(Number(line.quantity || 0) * Number(line.sale_price || 0));
                                    const catalogItem = safeCatalog.find((ci) => (
                                        (ci?.item_id && line?.item_id && Number(ci.item_id) === Number(line.item_id)) ||
                                        (ci?.id && line?.id && Number(ci.id) === Number(line.id))
                                    )) || null;

                                    const imageSources = catalogItem ? resolvePosCatalogImageSources(catalogItem, receiptSettings) : null;
                                    const rawImage = line.thumbnail_url || line.thumbnail || line.storefront_image_url || line.image_url || line.imageUrl || line.image
                                        || catalogItem?.storefront_image_url || catalogItem?.pos_image_url || catalogItem?.image_url || catalogItem?.imageUrl || catalogItem?.image
                                        || imageSources?.src || '';

                                    const mappedAsset = resolveMappedPosItemImage(line) || resolveMappedPosItemImage(catalogItem);
                                    const mappedSrc = mappedAsset ? resolveAssetVariantUrl(resolveAppAssetUrl(mappedAsset), 'thumbnail') : '';

                                    const thumbnailSrc = rawImage ? resolveAssetVariantUrl(rawImage, 'thumbnail') : mappedSrc;
                                    return (
                                        <div key={getLineKey(line)} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-blue-50/60">
                                                    {thumbnailSrc ? (
                                                        <>
                                                            <img
                                                                src={thumbnailSrc}
                                                                alt={line.item_name || 'Item'}
                                                                loading="lazy"
                                                                decoding="async"
                                                                className="h-full w-full object-cover rounded-lg"
                                                                onError={(event) => {
                                                                    event.currentTarget.style.display = 'none';
                                                                    if (event.currentTarget.nextElementSibling) {
                                                                        event.currentTarget.nextElementSibling.style.display = 'flex';
                                                                    }
                                                                }}
                                                            />
                                                            <div className="hidden h-full w-full items-center justify-center bg-blue-50/60">
                                                                <Utensils className="h-4 w-4 text-blue-600" />
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Utensils className="h-4 w-4 text-blue-600" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{line.item_name}</p>
                                                    <p className="mt-0.5 text-[11px] font-medium text-[#64748B]">
                                                        {formatQuantity(line.quantity)} x PHP {money(line.sale_price)}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="shrink-0 text-[13px] font-black text-[#1A4E8D]">PHP {money(lineTotal)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {isEmployeeCreditPayment && (
                            <EmployeeCreditPaymentPanel
                                selectedEmployee={selectedEmployeeCreditOption}
                                onSelectEmployee={handleSelectEmployeeCredit}
                                lookupLoading={employeeCreditLookupLoading}
                                account={employeeCreditAccount}
                                totalDue={cartTotal}
                                locationId={selectedLocationId}
                            />
                        )}
                        {!isEmployeeCreditPayment && (
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                            {customerPaymentFieldLabel}
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={customerPaymentAmountInput}
                                onChange={(event) => setCustomerPaymentAmountInput(event.target.value)}
                                placeholder="0.00"
                                className="mt-2 h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] font-extrabold text-[#0F172A] focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-blue-100"
                                autoFocus
                            />
                        </label>
                        )}

                        {!isEmployeeCreditPayment && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
                            <div className="flex justify-between gap-2">
                                <span className="text-[#334155]">{isCashPayment ? 'Change' : 'Excess Payment'}</span>
                                <span className="font-bold text-emerald-700">PHP {money(customerPaymentChange)}</span>
                            </div>
                            <div className="mt-2 flex justify-between gap-2">
                                <span className="text-[#334155]">Remaining Balance</span>
                                <span className={`font-bold ${customerPaymentShortfall > 0 ? 'text-rose-700' : 'text-[#0F172A]'}`}>
                                    PHP {money(customerPaymentShortfall)}
                                </span>
                            </div>
                        </div>
                        )}

                        {!isCustomerPaymentSufficient && (
                            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                {isEmployeeCreditPayment
                                    ? 'Verify an active, eligible employee account with enough available balance.'
                                    : `${customerPaymentFieldLabel} must be at least PHP ${money(cartTotal)}.`}
                            </p>
                        )}
                    </div>

                    <DialogFooter className="shrink-0 grid grid-cols-3 gap-2 border-t border-slate-200 px-4 py-3 bg-white">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCheckoutConfirmModalOpen(false)}
                            disabled={checkoutLoading}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePrintOrder}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                            className="h-10 rounded-lg border border-[#1A4E8D] bg-white px-2 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Printer className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Print Order
                        </Button>
                        <Button
                            type="button"
                            onClick={handleCheckout}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isCheckoutWorkflowValid || !isCustomerPaymentSufficient}
                            className="h-10 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#143F73] disabled:cursor-not-allowed disabled:bg-[#1A4E8D] disabled:opacity-60"
                        >
                            {checkoutLoading ? 'Processing...' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={receiptPreviewModalOpen} onOpenChange={(open) => {
                if (!open) {
                    closeReceiptPreviewModal();
                }
            }}>
                <DialogContent className={`pos-receipt-print-dialog flex h-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 p-0 shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100dvh-3rem)] sm:w-full print:h-auto print:max-h-none print:max-w-none print:rounded-none print:border-none print:shadow-none ${
                    receiptPreviewSource === 'order_preview' ? 'max-w-3xl bg-white' : 'max-w-xl bg-slate-50'
                }`}>
                    <DialogHeader className="relative border-b border-slate-200 bg-white px-5 py-3.5 print:hidden">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                <Receipt className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle id="pos-history-receipt-modal-title" className="text-lg font-black text-[#0F172A]">
                                    {receiptPreviewSource === 'order_preview' ? 'Order Preview' : 'Receipt Preview'}
                                </DialogTitle>
                                <DialogDescription className="mt-0.5 text-xs text-[#64748B]">
                                    {receiptPreviewSource === 'order_preview'
                                        ? (lastReceiptPendingSync
                                            ? 'Review the offline order summary. Sync the transaction before printing.'
                                            : 'Review the selected order summary.')
                                        : (lastReceiptPendingSync
                                            ? 'Review the offline receipt. Sync the transaction before printing.'
                                            : 'Review the selected receipt from history.')}
                                </DialogDescription>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeReceiptPreviewModal}
                            className="absolute right-5 top-1/2 -translate-y-1/2 rounded-xl border border-slate-300 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A4E8D] focus:ring-offset-2 transition-colors"
                            aria-label="Close receipt preview"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </DialogHeader>
                    <div className="pos-receipt-print-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 print:overflow-visible print:p-0">
                        {lastReceiptPendingSync && (
                            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 print:hidden">
                                Pending sync: this is a provisional offline order record, not a final fiscal receipt.
                            </div>
                        )}
                        {lastReceipt ? (
                            receiptPreviewSource === 'order_preview' ? (
                                <div className="space-y-3 print:space-y-0">
                                    <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading order preview...</div>}>
                                        <OrderPreviewView
                                            transaction={lastReceipt}
                                        />
                                    </Suspense>
                                </div>
                            ) : (
                                <div className="flex justify-center space-y-3 print:space-y-0">
                                    <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading receipt preview...</div>}>
                                        <div className="pos-receipt-print-paper w-full max-w-[80mm] border border-slate-200 bg-white p-4 shadow-sm">
                                            <ReceiptPrintView
                                                transaction={lastReceipt}
                                                businessSettings={receiptSettings}
                                                receiptContract={lastReceiptContract}
                                                paperWidth={receiptPaperWidth}
                                            />
                                        </div>
                                    </Suspense>
                                </div>
                            )
                        ) : historyDetailLoading ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                                Loading receipt details...
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
                                Failed to load receipt details. Please try again.
                            </div>
                        )}
                    </div>
                    <DialogFooter className={`flex flex-wrap items-center border-t border-slate-200 bg-white px-5 py-3 print:hidden ${
                        receiptPreviewSource === 'order_preview' ? 'justify-end' : 'justify-between gap-3'
                    }`}>
                        {receiptPreviewSource !== 'order_preview' && (
                            <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                                Paper
                                <select
                                    value={receiptPaperWidth}
                                    onChange={(event) => setReceiptPaperWidth(event.target.value)}
                                    className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0F172A] focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D]"
                                >
                                    {RECEIPT_PAPER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync}
                                onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}
                                className="h-9 rounded-lg bg-[#1A4E8D] px-4 text-xs font-bold text-white shadow-md shadow-blue-900/20 hover:bg-[#143F73]"
                            >
                                {receiptPrinting ? 'Printing...' : 'Print'}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {setupSnapshotModalOpen && createPortal((
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 px-4 py-6"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pos-setup-snapshot-modal-title"
                    onClick={() => setSetupSnapshotModalOpen(false)}
                >
                    <div
                        className="flex max-h-[88dvh] w-full max-w-[28rem] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/25 sm:max-w-[30rem] sm:p-4"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                            <div className="mb-3 flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Terminal Setup Context</p>
                                    <h2 id="pos-setup-snapshot-modal-title" className="mt-1 text-[21px] font-black tracking-tight text-[#0F172A]">
                                        POS readiness snapshot
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#334155]">
                                        Setup
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSetupSnapshotModalOpen(false)}
                                        className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
                                        aria-label="Close setup snapshot"
                                    >
                                        <X className="h-4.5 w-4.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 text-[13px]">
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Petty Cash</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">{setupCurrency} {money(setupMeta.pettyCashAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Active Discounts</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">{Number(setupMeta.activeDiscountCount || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">DGFY Global Fee Policy</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">
                                        {isGlobalFeePolicyActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Compliance Policy</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">Dual-mode</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Binding Readiness</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">{bindingReadinessLabel}</span>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            ), document.body)}

            {imagePreview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
                    onClick={() => setImagePreview(null)}
                >
                    <div
                        className="w-full max-w-xl rounded-xl bg-white p-4 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">POS Menu Image Preview</h3>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setImagePreview(null)}
                            >
                                Cancel
                            </Button>
                        </div>
                        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                            {imagePreview.hasImage ? (
                                <img
                                    src={imagePreview.src}
                                    alt={imagePreview.alt}
                                    className="max-h-[70vh] w-full rounded-lg object-contain"
                                    onError={() => {
                                        setImagePreview((previous) => (
                                            previous ? { ...previous, hasImage: false } : previous
                                        ));
                                    }}
                                />
                            ) : (
                                <div className="flex h-72 w-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
                                    <span className="text-sm font-medium text-slate-500">No POS image uploaded</span>
                                </div>
                            )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Tip: press ESC or click outside to close.</p>
                    </div>
                </div>
            )}
            {qtyMeterState && createPortal((
                <div
                    className="qty-meter"
                    style={{ left: `${qtyMeterState.x}px`, top: `${qtyMeterState.y - 24}px` }}
                    aria-live="polite"
                >
                    <span className="qty-meter__value">{qtyMeterState.quantity}</span>
                    <div className="qty-meter__track">
                        <div
                            className="qty-meter__fill"
                            style={{ height: `${((qtyMeterState.quantity - QTY_METER_MIN_QTY) / (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY)) * 100}%` }}
                        />
                    </div>
                </div>
            ), document.body)}
            <PosAddToCartToastContainer toasts={addToCartToasts} onDismiss={handleDismissToast} />
        </div>
    );
}
