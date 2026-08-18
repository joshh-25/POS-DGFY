import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { createPortal } from 'react-dom';
import {
    Accessibility,
    AlertCircle,
    BadgeCheck,
    CarTaxiFront,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Delete,
    Folder,
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
    Trash2,
    LayoutGrid
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
    createPosParkedSale,
    reparkPosParkedSale,
    fetchPosTransactions,
    fetchPosTransactionById,
    voidPosTransaction,
    fetchPosDiscountApprovers,
    verifyPosDiscountApproval,
    authorizePosDrawerOpen,
    fetchPosItemOptionGroups,
    cancelPosPaymentAllocation,
    cancelPosPaymentSession,
    completePosPaymentSession
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
import { clearPosCartDraft } from '../services/posCartDraftStore.js';
import {
    DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD,
    getCatalogStockColorClassName,
    isSellAvailableCatalogItem,
    isServiceCatalogItem,
    normalizeLowStockDisplayThreshold
} from '../utils/posCatalogAvailability.js';
import { subscribeToPosCatalogUpdates, subscribeToRemotePosCatalogUpdates } from '../utils/posCatalogRefresh.js';
import { buildPosHistoryQuery } from '../utils/posHistoryQuery.js';
import { formatParkedSaleDisplayName } from '../utils/posParkedSaleDisplay.js';
import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';
import { getFolders } from '@/services/itemService.js';
import { getAllSettings } from '@/services/settingsService';
import {
    advanceAssetImageFallback,
    resolveAssetUrl,
    resolveAssetVariantUrl
} from '@/src/utils/assetUrl.js';
import { notifyIminWebPosReady } from '../utils/iminHardwareBridge.js';
import { usePosHardware } from '../hardware/usePosHardware.js';
import { calculateCatalogGridCapacity } from '../utils/catalogGridCapacity.js';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';
import { resolvePosPresentationBundle } from '../utils/posPresentationBundle.js';
import { clearPosSplitPaymentSessionPointer } from '../services/posSplitPaymentSessionStore.js';
import { buildFnbGlobalOrderNote, buildFnbPrintContext } from '../utils/posOrderNotes.js';
import { calculatePosItemDiscounts, getItemDiscountDraft } from '../utils/posItemDiscount.js';

const ReceiptPrintView = lazyWithChunkRetry(() => import('./ReceiptPrintView'));
const OrderPreviewView = lazyWithChunkRetry(() => import('./OrderPreviewView.jsx'));
const EmployeeCreditPaymentPanel = lazyWithChunkRetry(() => import('./EmployeeCreditPaymentPanel.jsx'));
const ServiceOptionsModal = lazyWithChunkRetry(() => import('./ServiceOptionsModal.jsx').then(({ ServiceOptionsModal: Component }) => ({ default: Component })));
const POSParkedSalesDialog = lazyWithChunkRetry(() => import('./POSParkedSalesDialog.jsx'));
const POSSplitPaymentWorkflow = lazyWithChunkRetry(() => import('./POSSplitPaymentWorkflow.jsx'));
const ItemOptionsDialog = lazyWithChunkRetry(() => import('./ItemOptionsDialog.jsx'));
const BillRequestDialog = lazyWithChunkRetry(() => import('./BillRequestDialog.jsx'));
const PosAddToCartToastContainer = lazyWithChunkRetry(() => import('./PosAddToCartToastContainer.jsx').then(({ PosAddToCartToastContainer: Component }) => ({ default: Component })));
const PosCheckoutDetailsSlot = lazyWithChunkRetry(() => import('./PosCheckoutDetailsSlot.jsx').then(({ PosCheckoutDetailsSlot: Component }) => ({ default: Component })));
const PosCurrentSaleActions = lazyWithChunkRetry(() => import('./PosCurrentSaleActions.jsx').then(({ PosCurrentSaleActions: Component }) => ({ default: Component })));

const CATALOG_GRID_GAP_PX = 8;
const CATALOG_DESKTOP_CARD_HEIGHT_PX = 176;
const CATALOG_DESKTOP_CARD_MIN_WIDTH_PX = 176;
const CATALOG_MOBILE_CARD_HEIGHT_PX = 120;
const CATALOG_TABLET_CARD_HEIGHT_PX = 112;
const CATALOG_TABLET_CARD_MIN_WIDTH_PX = 160;
const POSBarcodeScanner = lazyWithChunkRetry(() => import('./POSBarcodeScanner.jsx'));
const POSTransactionHistoryPanel = lazyWithChunkRetry(() => import('./POSTransactionHistoryPanel.jsx'));
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const POS_FORM_INPUT_CLASS = 'mt-1 focus-visible:border-blue-400 focus-visible:ring-blue-500';
const POS_FORM_SELECT_CLASS = 'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
const CASH_PAYMENT_SUGGESTIONS = [50, 100, 200, 500, 1000, 2000];
const RECEIPT_PAPER_OPTIONS = [
    { value: '80mm', label: '80mm (3 1/8 in)' },
    { value: '57mm', label: '57mm (2 1/4 in)' }
];

const money = (value) => Number(value || 0).toFixed(2);
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const SPLIT_PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    qrph: 'QR Ph'
};
const formatSplitPaymentMethod = (value) => {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return SPLIT_PAYMENT_METHOD_LABELS[normalizedValue]
        || normalizedValue.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
        || 'Payment';
};
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
const EMPTY_DISCOUNT_DRAFT = {
    type: 'employee', method: 'percentage', rate: '15', amount: '', customer_name: '',
    id_number: '', employee_name: '', employee_id: '', reason: '', manager_pin: '', approver_user_id: '', eligible_item_ids: [], eligible_items: [], promo_code: ''
};
const DISCOUNT_TYPE_OPTIONS = [
    { value: 'employee', label: 'Employee', icon: BadgeCheck },
    { value: 'senior', label: 'Senior Citizen', icon: UserRound },
    { value: 'pwd', label: 'PWD', icon: Accessibility },
    { value: 'promo', label: 'Promo', icon: Tag },
    // Keep `manual` as the API/database value for backward compatibility.
    // The cashier-facing name is "Other" so the option is understandable
    // without exposing an implementation term.
    { value: 'manual', label: 'Other', icon: Pencil }
];
const calculateGovernedDiscount = (cart, application) => {
    const cartRows = toArray(cart);
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
    if (!statutory) {
        const selectedItemIds = new Set(eligibleItemIds.map(Number));
        const restrictToSelections = selectedItemIds.size > 0;
        const discountBase = restrictToSelections
            ? round4(cartRows.reduce((sum, line) => (
                selectedItemIds.has(Number(line.item_id))
                    ? sum + getGlobalBase(line)
                    : sum
            ), 0))
            : subtotal;
        const discountAmount = application.method === 'fixed'
            ? Math.min(discountBase, Math.max(0, Number(application.amount || 0)))
            : Math.min(discountBase, discountBase * Math.min(100, Math.max(0, Number(application.rate || 0))) / 100);
        const eligibleRows = cartRows.filter((line) => !restrictToSelections || selectedItemIds.has(Number(line.item_id)));
        const lastEligibleLine = eligibleRows.at(-1);
        let allocatedDiscount = 0;
        const lines = cartRows.map((line) => {
            const gross = round4(getGlobalBase(line));
            const eligible = !restrictToSelections || selectedItemIds.has(Number(line.item_id));
            const lineDiscount = !eligible
                ? 0
                : application.method === 'fixed'
                    ? line === lastEligibleLine
                        ? round4(discountAmount - allocatedDiscount)
                        : round4(Math.min(discountAmount - allocatedDiscount, discountBase > 0 ? (gross / discountBase) * discountAmount : 0))
                    : round4(gross * Math.min(100, Math.max(0, Number(application.rate || 0))) / 100);
            allocatedDiscount = round4(allocatedDiscount + lineDiscount);
            return {
                line_key: line.line_key || line.line_id || null,
                item_id: Number(line.item_id),
                discount_amount: lineDiscount,
                vat_removed: 0,
                vat_exempt_amount: 0,
                eligible_quantity: eligible ? Number(line.quantity || 0) : 0
            };
        });
        return { vatRemoved: 0, vatExemptAmount: 0, discountAmount: round4(discountAmount), total: round4(subtotal - discountAmount), lines };
    }
    const selected = new Map(eligibleItems.length > 0
        ? eligibleItems.map((entry) => [Number(entry?.item_id), Number(entry?.eligible_quantity)])
        : eligibleItemIds.map((itemId) => [Number(itemId), null]));
    let vatRemoved = 0;
    let vatExemptAmount = 0;
    const lines = cartRows.map((line) => {
        const selectedQuantity = selected.get(Number(line.item_id));
        if (selectedQuantity === undefined) {
            return {
                line_key: line.line_key || line.line_id || null,
                item_id: Number(line.item_id),
                discount_amount: 0,
                vat_removed: 0,
                vat_exempt_amount: 0,
                eligible_quantity: 0
            };
        }
        const quantity = selectedQuantity == null
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
            price_delta: round4(option.price_delta || 0),
            quantity: Math.min(99, Math.max(1, Number.parseInt(modifier.quantity || 1, 10) || 1))
        };
    }).filter(Boolean);
};
const resolveModifierDelta = (line = {}, modifiers = line.line_modifiers || []) => (
    resolveModifierSnapshot(line, modifiers).reduce((sum, modifier) => round4(sum + (Number(modifier.price_delta || 0) * Number(modifier.quantity || 1))), 0)
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

const resolvePosCatalogImageSources = (item = {}) => {
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


export default function POSCheckoutTerminal({
    sessionLocked = false,
    isMsmeMode = false,
    sidebarCollapsed = false,
    canViewHistory = true,
    terminalUser = null,
    selectedLocationId = null,
    activeShiftId = null,
    activeShiftCashierId = null,
    terminalId = '',
    terminalMeta = null,
    offlineSnapshotScope: providedOfflineSnapshotScope = {},
    onCheckoutCompleted = null,
    checkoutBlockedReason = '',
    onManualUniversalSync = async () => ({ allowed: false }),
    onQueueOfflineOperation = async () => null,
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
    workflowMode = null,
    effectiveCapabilities = null
}) {
    useEffect(() => {
        notifyIminWebPosReady();
    }, []);

    const [viewMode, setViewMode] = useState('checkout');
    const [catalog, setCatalog] = useState([]);
    const [catalogImageErrors, setCatalogImageErrors] = useState(() => new Set());
    const [catalogError, setCatalogError] = useState('');
    const [serviceOptionsModal, setServiceOptionsModal] = useState({ open: false, item: null, groups: [] });
    const [itemOptionsLineKey, setItemOptionsLineKey] = useState(null);
    const [serviceOptionsLoadingItemId, setServiceOptionsLoadingItemId] = useState(null);
    const serviceOptionsRequestRef = useRef(0);
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
    const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
    const [posFoldersLoading, setPosFoldersLoading] = useState(true);
    const [posFoldersError, setPosFoldersError] = useState('');
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogRefreshing, setCatalogRefreshing] = useState(false);
    // Issue #178 Phase 21: effectiveCapabilities (the tenant's Store Profile
    // modules list, when supplied by the caller) lets a curated
    // fnb_counter_service-style store resolve the counter workflow instead
    // of the full fnb one - without it, a template's subtraction was
    // enforced by the API (Phase 19) but still rendered tables/kitchen
    // buttons the API would then 403. Omitting the prop keeps every other
    // caller (and every test) on today's mode-only behavior.
    const posWorkflow = useMemo(
        () => resolvePosWorkflow(workflowMode, effectiveCapabilities),
        [workflowMode, effectiveCapabilities]
    );
    const posPresentationBundle = useMemo(
        () => resolvePosPresentationBundle(posWorkflow),
        [posWorkflow]
    );
    const isFnbWorkflow = posWorkflow.mode === 'fnb';
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
    const discountReturnToCheckoutRef = useRef(false);
    const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT);
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const discountApprovalRef = useRef(null);
    const itemDiscountApprovalRef = useRef(new Map());
    const itemDiscountApproversRequestedRef = useRef(false);
    const [discountApplying, setDiscountApplying] = useState(false);
    const [affiliateCodeInput, setAffiliateCodeInput] = useState('');
    const [showDiscountPin, setShowDiscountPin] = useState(false);
    const [cart, setCart] = useState([]);
    const [activeParkedSale, setActiveParkedSale] = useState(null);
    const [parkedSalePayContext, setParkedSalePayContext] = useState(null);
    const [parkedSaleReleaseLoading, setParkedSaleReleaseLoading] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [parkLoading, setParkLoading] = useState(false);
    const [parkedSalesDialogOpen, setParkedSalesDialogOpen] = useState(false);
    const [headerParkedSalesHistorySlot, setHeaderParkedSalesHistorySlot] = useState(null);
    const [parkSaleNameDialogOpen, setParkSaleNameDialogOpen] = useState(false);
    const [parkSaleNameInput, setParkSaleNameInput] = useState('');
    const [queuedCheckouts, setQueuedCheckouts] = useState([]);
    const [replayingQueuedCheckouts, setReplayingQueuedCheckouts] = useState(false);
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
    const posHardware = usePosHardware();
    const [receiptPrinting, setReceiptPrinting] = useState(false);
    const [receiptPaperWidth, setReceiptPaperWidth] = useState('80mm');
    const [drawerOpening, setDrawerOpening] = useState(false);
    const [drawerAuthorizationModalOpen, setDrawerAuthorizationModalOpen] = useState(false);
    const [drawerAuthorizationContext, setDrawerAuthorizationContext] = useState({ transactionId: null });
    const [drawerAuthorizationReason, setDrawerAuthorizationReason] = useState('');
    const [drawerAuthorizationPin, setDrawerAuthorizationPin] = useState('');
    const [drawerAuthorizationSubmitting, setDrawerAuthorizationSubmitting] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [receiptPreviewModalOpen, setReceiptPreviewModalOpen] = useState(false);
    const [receiptPreviewSource, setReceiptPreviewSource] = useState('receipt_preview');
    const [setupSnapshotModalOpen, setSetupSnapshotModalOpen] = useState(false);
    const [externalReceiptModalActive, setExternalReceiptModalActive] = useState(false);
    const catalogSnapshotRef = useRef([]);
    const receiptSettingsSnapshotRef = useRef({});
    const catalogHasLoadedRef = useRef(false);
    const catalogRefreshDebounceRef = useRef(null);
    const catalogRequestInFlightKeyRef = useRef('');
    const catalogRequestSequenceRef = useRef(0);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        setHeaderParkedSalesHistorySlot(document.querySelector('[data-testid="pos-header-park-slot"]'));
        return undefined;
    }, []);

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
        catalogRequestInFlightKeyRef.current = '';
        catalogRequestSequenceRef.current += 1;
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
    const [billRequestDraft, setBillRequestDraft] = useState(null);
    const [billRequestPrinting, setBillRequestPrinting] = useState(false);
    const [splitPaymentDialogOpen, setSplitPaymentDialogOpen] = useState(false);
    const [splitPaymentSession, setSplitPaymentSession] = useState(null);
    const [splitPaymentCancelModalOpen, setSplitPaymentCancelModalOpen] = useState(false);
    const [splitPaymentCancelLoading, setSplitPaymentCancelLoading] = useState(false);
    const [splitPaymentWorkflowVersion, setSplitPaymentWorkflowVersion] = useState(0);
    const [mobileCheckoutPanelOpen, setMobileCheckoutPanelOpen] = useState(false);
    const splitPaymentReturnToCheckoutRef = useRef(false);

    const handleSplitPaymentOpenChange = useCallback((nextOpen) => {
        setSplitPaymentDialogOpen(nextOpen);
        if (nextOpen) {
            setCheckoutConfirmModalOpen(false);
            return;
        }
        setCheckoutConfirmModalOpen(splitPaymentReturnToCheckoutRef.current);
        splitPaymentReturnToCheckoutRef.current = false;
    }, []);
    const handleSplitPaymentSessionStateChange = useCallback((nextState) => {
        setSplitPaymentSession(nextState?.active && nextState?.session ? nextState.session : null);
    }, []);

    const splitPaymentStorageScopeKey = useMemo(() => (
        [
            providedOfflineSnapshotScope?.tenantId || 'tenant',
            terminalUser?.user_id || terminalUser?.id || terminalUser?.email || 'cashier',
            terminalId || 'terminal',
            activeShiftId || 'shift',
            selectedLocationId || 'location'
        ].map((value) => String(value)).join(':')
    ), [
        activeShiftId,
        terminalId,
        providedOfflineSnapshotScope?.tenantId,
        selectedLocationId,
        terminalUser?.email,
        terminalUser?.id,
        terminalUser?.user_id
    ]);
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const shouldLockModalScroll = receiptPreviewModalOpen || checkoutConfirmModalOpen || splitPaymentDialogOpen || discountModalOpen || mobileCheckoutPanelOpen || drawerAuthorizationModalOpen;
        document.body.classList.toggle('pos-modal-scroll-lock', shouldLockModalScroll);
        return () => {
            document.body.classList.remove('pos-modal-scroll-lock');
        };
    }, [checkoutConfirmModalOpen, discountModalOpen, drawerAuthorizationModalOpen, mobileCheckoutPanelOpen, receiptPreviewModalOpen, splitPaymentDialogOpen]);

    const [customerPaymentAmountInput, setCustomerPaymentAmountInput] = useState('');
    const [currentSaleHelpOpen, setCurrentSaleHelpOpen] = useState(false);
    const [clearSaleConfirmOpen, setClearSaleConfirmOpen] = useState(false);
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
    const folderStripRef = useRef(null);
    const folderStripDragStateRef = useRef(null);
    const folderStripDragMovedRef = useRef(false);
    const catalogGridRef = useRef(null);
    const searchBackspaceTimeoutRef = useRef(null);
    const searchBackspaceIntervalRef = useRef(null);
    const catalogSwipeStartXRef = useRef(null);
    const catalogSwipePointerIdRef = useRef(null);
    const shellClassName = 'h-full min-h-0 overflow-hidden';
    const checkoutGridClassName = isTabletViewport
        ? 'grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] md:pb-0 2xl:gap-4'
        : 'grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_325px] md:pb-0 2xl:gap-6';
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
    const activeShiftCashierApprover = safeDiscountApprovers.find((approver) => (
        Number(approver?.user_id) === Number(activeShiftCashierId)
    )) || null;
    const safeCart = toArray(cart);
    const safeQueuedCheckouts = toArray(queuedCheckouts);
    const safeHistoryRows = toArray(historyRows);
    const safeEligibleDiscountItemIds = toArray(discountDraft?.eligible_item_ids);
    const safeEligibleDiscountItems = toArray(discountDraft?.eligible_items);
    const employeeDiscountRateOptions = Array.from(new Set([
        ...safeDiscountProfiles
            .filter((profile) => profile?.active !== false)
            .map((profile) => Number(profile?.percentage))
            .filter((percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100),
        Number(discountDraft?.rate || 15),
        15
    ])).sort((left, right) => left - right);
    const isCartLineSeniorPwdEligible = (line) => (
        isSeniorPwdDiscountEligible(line?.senior_pwd_discount_eligible)
        || isSeniorPwdDiscountEligible(safeCatalog.find((item) => Number(item?.item_id) === Number(line?.item_id))?.senior_pwd_discount_eligible)
    );
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
    const folderButtonClassName = isTabletViewport
        ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-extrabold transition-all shadow-xs'
        : 'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-extrabold transition-all shadow-xs';
    const isViewModeControlled = typeof controlledViewMode === 'string' && controlledViewMode.length > 0;
    const currentViewMode = isViewModeControlled ? controlledViewMode : viewMode;
    const normalizedTerminalId = String(terminalId || '').trim();
    const terminalIdentityLabel = normalizedTerminalId
        ? `Terminal ${normalizedTerminalId}`
        : 'No terminal selected';
    // Keep pagination for predictable loading while rendering two measured viewports per page.
    // That guarantees the product-card region remains the catalog's only scroll owner.
    const catalogPageSize = Math.max(1, catalogGridLayout.pageSize * 2);
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

    const handleFolderStripPointerDown = useCallback((event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;

        const strip = event.currentTarget;
        if (strip.scrollWidth <= strip.clientWidth) return;

        folderStripDragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: strip.scrollLeft,
            hasPointerCapture: false
        };
        folderStripDragMovedRef.current = false;
    }, []);

    const handleFolderStripPointerMove = useCallback((event) => {
        const drag = folderStripDragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - drag.startX;
        if (!folderStripDragMovedRef.current && Math.abs(deltaX) < 4) return;

        folderStripDragMovedRef.current = true;
        if (!drag.hasPointerCapture) {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.hasPointerCapture = true;
        }
        event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX;
        event.preventDefault();
    }, []);

    const handleFolderStripPointerEnd = useCallback((event) => {
        const drag = folderStripDragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        folderStripDragStateRef.current = null;

        if (folderStripDragMovedRef.current && typeof window !== 'undefined') {
            window.setTimeout(() => {
                folderStripDragMovedRef.current = false;
            }, 0);
        }
    }, []);

    const handleFolderStripClickCapture = useCallback((event) => {
        if (!folderStripDragMovedRef.current) return;

        event.preventDefault();
        event.stopPropagation();
        folderStripDragMovedRef.current = false;
    }, []);

    const handleFolderStripWheel = useCallback((event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

        const strip = event.currentTarget;
        const maxScrollLeft = strip.scrollWidth - strip.clientWidth;
        if (maxScrollLeft <= 0) return;

        const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, strip.scrollLeft + event.deltaY));
        if (nextScrollLeft === strip.scrollLeft) return;

        strip.scrollLeft = nextScrollLeft;
        event.preventDefault();
    }, []);

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
    const isPrinterAvailable = posHardware.isPrinterAvailable;
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
        activeParkedSale,
        cart,
        catalog,
        catalogReady: !catalogLoading,
        enabled: !sessionLocked && Boolean(activeShiftId),
        scope: offlineSnapshotScope,
        setActiveParkedSale,
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
            catalogRequestInFlightKeyRef.current = '';
            catalogRequestSequenceRef.current += 1;
            setCatalog([]);
            setCatalogError('');
            setCatalogLoading(false);
            setCatalogRefreshing(false);
            catalogHasLoadedRef.current = false;
            return;
        }
        if (!canViewHistory) {
            catalogRequestInFlightKeyRef.current = '';
            catalogRequestSequenceRef.current += 1;
            setCatalog([]);
            setCatalogError('You need POS view permission to load the POS catalog.');
            setCatalogLoading(false);
            setCatalogRefreshing(false);
            catalogHasLoadedRef.current = false;
            return;
        }
        const requestKey = `${String(search || '').trim()}::${String(selectedLocationId || '')}`;
        if (catalogRequestInFlightKeyRef.current === requestKey) return;
        catalogRequestInFlightKeyRef.current = requestKey;
        const requestSequence = catalogRequestSequenceRef.current + 1;
        catalogRequestSequenceRef.current = requestSequence;
        const isInitialLoad = !catalogHasLoadedRef.current;
        setCatalogLoading(isInitialLoad);
        setCatalogRefreshing(!isInitialLoad);
        setCatalogError('');
        try {
            const params = { search: search || '', limit: 200 };
            if (selectedLocationId) params.location_id = selectedLocationId;
            const data = await fetchPosCatalog(params);
            if (catalogRequestSequenceRef.current !== requestSequence) return;
            setCatalog(data || []);
            setCatalogImageErrors(new Set());
            if (!search) {
                saveCatalogSnapshot(data || []);
            }
        } catch (error) {
            if (catalogRequestSequenceRef.current !== requestSequence) return;
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
            if (catalogRequestSequenceRef.current === requestSequence) {
                catalogHasLoadedRef.current = true;
                setCatalogLoading(false);
                setCatalogRefreshing(false);
            }
            if (catalogRequestInFlightKeyRef.current === requestKey) {
                catalogRequestInFlightKeyRef.current = '';
            }
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
            const historyQuery = buildPosHistoryQuery({
                historyStatus,
                page,
                limit: 20,
                search: historySearch || undefined,
                paymentType: historyPaymentType === 'all' ? undefined : historyPaymentType,
                orderMethod: historyOrderMethod === 'all' ? undefined : historyOrderMethod,
                orderSource: historyOrderSource === 'all' ? undefined : historyOrderSource,
                cashierId: historyCashierId || undefined,
                dateFrom: historyDateFrom || undefined,
                dateTo: historyDateTo || undefined,
                locationId: selectedLocationId || undefined
            });
            if (!historyQuery) {
                setHistoryRows([]);
                setHistoryPagination({
                    page,
                    limit: 20,
                    total: 0,
                    totalPages: 1
                });
                setHistoryPage(page);
                return;
            }
            const result = await fetchPosTransactions(historyQuery);
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
            const { normalizeCommercialPromoConfigs } = await import('../utils/posCommercialPromoConfig.js');
            setCommercialPromoConfig(normalizeCommercialPromoConfigs(allSettings));
        } catch {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setCommercialPromoConfig([]);
        }
    }, [offlineSnapshotScope, sessionLocked]);

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

    const isCashierRole = String(terminalUser?.role || '').trim().toLowerCase() === 'cashier';
    const openInPosReport = useCallback(() => {
        setCurrentViewMode(isCashierRole ? 'history' : 'reports');
    }, [isCashierRole, setCurrentViewMode]);
    const posReportActionLabel = isCashierRole ? 'Open POS History' : 'Open POS Report';

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
        // POS hardware resolution is owned by usePosHardware itself (resolved
        // once per tab, memoized) — it must not be re-triggered by this
        // effect's own dependency churn the way the old direct device-status
        // fetch was.
    }, [loadReceiptSettings, loadPosFolders, sessionLocked]);

    const refreshCatalogAfterInvalidation = useCallback(() => {
        if (catalogRefreshDebounceRef.current) {
            window.clearTimeout(catalogRefreshDebounceRef.current);
        }
        catalogRefreshDebounceRef.current = window.setTimeout(() => {
            catalogRefreshDebounceRef.current = null;
            loadPosFolders();
            loadCatalog();
        }, 150);
    }, [loadCatalog, loadPosFolders]);

    useEffect(() => {
        if (sessionLocked) return undefined;
        return subscribeToPosCatalogUpdates(refreshCatalogAfterInvalidation);
    }, [refreshCatalogAfterInvalidation, sessionLocked]);

    useEffect(() => {
        if (sessionLocked || !canViewHistory) return undefined;
        return subscribeToRemotePosCatalogUpdates();
    }, [canViewHistory, sessionLocked]);

    useEffect(() => {
        if (sessionLocked || !canViewHistory) return undefined;
        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') refreshCatalogAfterInvalidation();
        };
        const refreshWhenOnline = () => refreshCatalogAfterInvalidation();
        const fallbackRefresh = window.setInterval(refreshIfVisible, 60000);
        document.addEventListener('visibilitychange', refreshIfVisible);
        window.addEventListener('online', refreshWhenOnline);
        return () => {
            window.clearInterval(fallbackRefresh);
            document.removeEventListener('visibilitychange', refreshIfVisible);
            window.removeEventListener('online', refreshWhenOnline);
            if (catalogRefreshDebounceRef.current) {
                window.clearTimeout(catalogRefreshDebounceRef.current);
                catalogRefreshDebounceRef.current = null;
            }
        };
    }, [canViewHistory, refreshCatalogAfterInvalidation, sessionLocked]);

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
    }, [currentViewMode, isTabletViewport, sidebarCollapsed]);

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

    const itemDiscountTotals = useMemo(
        () => calculatePosItemDiscounts(safeCart),
        [safeCart]
    );

    const globalDiscountCart = useMemo(
        () => safeCart.map((line, index) => ({
            ...line,
            global_discount_base_amount: itemDiscountTotals.lines[index]?.global_discount_base_amount
        })),
        [itemDiscountTotals.lines, safeCart]
    );

    const governedDiscountTotals = useMemo(
        () => calculateGovernedDiscount(globalDiscountCart, safeAppliedDiscount),
        [globalDiscountCart, safeAppliedDiscount]
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
                return round4(Math.min(parsed, itemDiscountTotals.totalAmount));
            }
            if (manualDiscountMode !== 'percentage') {
                return 0;
            }
            return round4(Math.min((itemDiscountTotals.totalAmount * manualDiscountRate) / 100, itemDiscountTotals.totalAmount));
        },
        [itemDiscountTotals.totalAmount, manualDiscountAmountInput, manualDiscountMode, manualDiscountRate]
    );

    const globalDiscountAmount = appliedDiscount
        ? governedDiscountTotals.discountAmount
        : (selectedDiscount ? round4(Math.min((itemDiscountTotals.totalAmount * selectedDiscount.percentage) / 100, itemDiscountTotals.totalAmount)) : manualDiscountAmount);
    const calculatedDiscountAmount = appliedDiscount
        ? round4(itemDiscountTotals.discountAmount + governedDiscountTotals.discountAmount)
        : round4(itemDiscountTotals.discountAmount + globalDiscountAmount);
    const checkoutDiscountLabel = safeAppliedDiscount?.label
        || selectedDiscount?.name
        || (calculatedDiscountAmount > 0 ? 'Discount' : '');
    const discountPreviewTotals = calculateGovernedDiscount(globalDiscountCart, {
        ...discountDraft,
        eligible_item_ids: safeEligibleDiscountItemIds
    });
    const itemOptionsLine = itemOptionsLineKey
        ? safeCart.find((line) => getLineKey(line) === itemOptionsLineKey) || null
        : null;
    const itemOptionsGlobalDiscountAllocation = itemOptionsLine
        ? governedDiscountTotals.lines?.find((entry) => (
            entry.line_key && entry.line_key === itemOptionsLineKey
        )) || governedDiscountTotals.lines?.find((entry) => Number(entry.item_id) === Number(itemOptionsLine.item_id))
        : null;
    const itemOptionsDiscountIds = toArray(safeAppliedDiscount?.eligible_item_ids).map(Number);
    const itemOptionsDiscountIncluded = safeAppliedDiscount
        ? safeAppliedDiscount.type === 'promo'
            ? itemOptionsDiscountIds.length === 0 || itemOptionsDiscountIds.includes(Number(itemOptionsLine?.item_id))
            : ['senior', 'pwd'].includes(safeAppliedDiscount.type)
                ? itemOptionsDiscountIds.includes(Number(itemOptionsLine?.item_id))
                : itemOptionsDiscountIds.length === 0 || itemOptionsDiscountIds.includes(Number(itemOptionsLine?.item_id))
        : false;
    const itemOptionsItemDiscount = itemOptionsLine ? getItemDiscountDraft(itemOptionsLine) : null;
    const itemOptionsGlobalDiscount = safeAppliedDiscount && Number(itemOptionsGlobalDiscountAllocation?.discount_amount || 0) > 0
        ? {
            label: safeAppliedDiscount.label || 'Approved discount',
            type: safeAppliedDiscount.type,
            rate: safeAppliedDiscount.method === 'fixed' ? null : safeAppliedDiscount.rate,
            amount: Number(itemOptionsGlobalDiscountAllocation?.discount_amount || 0),
            applies_to_all: itemOptionsDiscountIncluded,
            can_edit: false
        }
        : null;

    useEffect(() => {
        if (selectedDiscountProfile && (manualDiscountRateInput || manualDiscountAmountInput)) {
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
        }
    }, [manualDiscountAmountInput, manualDiscountRateInput, selectedDiscountProfile]);

    const serviceFeeAmount = 0;

    const netItemsTotal = useMemo(
        () => round4(Math.max(0, itemDiscountTotals.totalAmount - globalDiscountAmount - governedDiscountTotals.vatRemoved)),
        [governedDiscountTotals.vatRemoved, globalDiscountAmount, itemDiscountTotals.totalAmount]
    );

    useEffect(() => {
        if (!itemOptionsLineKey || safeDiscountApprovers.length > 0 || itemDiscountApproversRequestedRef.current) return undefined;
        let mounted = true;
        itemDiscountApproversRequestedRef.current = true;
        setDiscountApproversLoading(true);
        fetchPosDiscountApprovers()
            .then((approvers) => {
                if (mounted) setDiscountApprovers(toArray(approvers));
            })
            .catch(() => {
                if (mounted) toast.error('Unable to load discount approvers.');
            })
            .finally(() => {
                if (mounted) setDiscountApproversLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [itemOptionsLineKey, safeDiscountApprovers.length]);

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
        const adjustedLines = safeCart.map((line, index) => {
            const itemLine = itemDiscountTotals.lines[index] || {};
            const base = Number(itemLine.global_discount_base_amount || 0);
            const governedLine = governedDiscountTotals.lines?.[index] || {};
            const globalVatRemoved = safeAppliedDiscount
                ? Number(governedLine.vat_removed || 0)
                : 0;
            const governedLineDiscount = safeAppliedDiscount
                ? Number(governedLine.discount_amount || 0)
                : (itemDiscountTotals.totalAmount > 0
                    ? round4((base / itemDiscountTotals.totalAmount) * globalDiscountAmount)
                    : 0);
            return {
                vat_type: line.vat_type || 'vatable',
                governed_vat_exempt: safeAppliedDiscount && Number(governedLine.vat_exempt_amount || 0) > 0,
                gross: round4(Math.max(0, base - globalVatRemoved - governedLineDiscount))
            };
        });

        const adjustedTotal = round4(adjustedLines.reduce((sum, line) => sum + line.gross, 0));
        const lineDiff = round4(netItemsTotal - adjustedTotal);
        if (adjustedLines.length > 0 && Math.abs(lineDiff) > 0) {
            adjustedLines[adjustedLines.length - 1].gross = round4(adjustedLines[adjustedLines.length - 1].gross + lineDiff);
        }

        let vatableGross = 0;
        let vatExemptSales = 0;
        let zeroRatedSales = 0;
        adjustedLines.forEach((line) => {
            if (line.governed_vat_exempt) {
                vatExemptSales = round4(vatExemptSales + line.gross);
            } else if (line.vat_type === 'vatable') {
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
    }, [globalDiscountAmount, governedDiscountTotals.lines, itemDiscountTotals.lines, itemDiscountTotals.totalAmount, netItemsTotal, normalizedFnbContext, restaurantServiceChargeAmount, safeAppliedDiscount, safeCart]);

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
    const splitPaymentReady = splitPaymentSession?.status === 'ready_to_complete'
        && round4(splitPaymentSession?.remaining_amount) === 0;
    const splitPaymentAllocations = Array.isArray(splitPaymentSession?.allocations)
        ? splitPaymentSession.allocations
        : [];
    const splitPaymentSummaryAllocations = splitPaymentAllocations.filter((allocation) => (
        !['failed', 'cancelled', 'reversed'].includes(String(allocation?.status || '').toLowerCase())
    ));
    const hasSplitPaymentSummary = splitPaymentSummaryAllocations.length > 0;
    const splitPaymentSummaryPaidAmount = round4(splitPaymentSession?.paid_amount);
    const splitPaymentSummaryRemainingAmount = round4(splitPaymentSession?.remaining_amount);
    const splitPaymentSummaryChangeAmount = round4(splitPaymentSummaryAllocations.reduce(
        (sum, allocation) => sum + Number(allocation?.change_amount || 0),
        0
    ));
    const splitPaymentSuccessfulAllocations = splitPaymentAllocations.filter((allocation) => (
        String(allocation?.status || '').toLowerCase() === 'successful'
    ));
    const posActionsBlocked = Boolean(checkoutBlockedReason) || parkedSaleReleaseLoading;
    const notifyPosActionBlocked = () => {
        toast.error(
            parkedSaleReleaseLoading
                ? 'Returning the parked sale to the queue. Please wait.'
                : (checkoutBlockedReason || 'You cannot use the POS because the shift is closed.')
        );
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
        const serviceOptionIds = [...new Set((Array.isArray(options.selectedOptionIds) ? options.selectedOptionIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0))]
            .sort((left, right) => left - right);
        const serviceOptionDetails = (Array.isArray(options.selectedOptionDetails) ? options.selectedOptionDetails : [])
            .filter((option) => Number(option?.option_id) > 0)
            .map((option) => ({
                option_id: Number(option.option_id),
                group_id: Number(option.group_id || 0) || null,
                group_name: String(option.groupName || option.group_name || '').trim() || null,
                group_type: String(option.groupType || option.group_type || 'addon').trim() || 'addon',
                name: String(option.name || '').trim(),
                price_adjustment_centavos: Number(option.price_adjustment_centavos) || 0,
                duration_adjustment_minutes: Number(option.duration_adjustment_minutes) || 0
            }));
        const modifierGroups = getFnbModifierGroups(item);
        const defaultModifiers = buildDefaultLineModifiers(item);
        const routed = buildKitchenStationSnapshot(item);
        const modifierLineSeed = {
            modifier_groups: modifierGroups,
            line_modifiers: defaultModifiers
        };
        const serviceOptionPriceDelta = serviceOptionDetails.reduce(
            (sum, option) => sum + ((Number(option.price_adjustment_centavos) || 0) / 100),
            0
        );
        const linePrice = round4(defaultPrice + resolveModifierDelta(modifierLineSeed, defaultModifiers) + serviceOptionPriceDelta);
        if (!Number.isFinite(linePrice) || linePrice <= 0) {
            toast.error(`${item.name || 'Service'} has an invalid price after applying its options.`);
            return;
        }
        const serviceOptionSignature = serviceOptionIds.join(',');
        // Only default order_method to 'appointment' when this service is the
        // very first line in an empty basket. Previously this fired on every
        // service add regardless of what else was already in the cart, so
        // ringing up a service alongside unrelated retail lines silently
        // reclassified the whole mixed-basket transaction as an appointment.
        if (isServiceCatalogItem(item) && cart.length === 0 && posWorkflow.allowedMethods.includes('appointment')) {
            setOrderMethod('appointment');
        }
        let stockWarning = '';
        setCart((prev) => {
            const existing = modifierGroups.length > 0 || serviceOptionIds.length > 0
                ? prev.find((line) => (
                    line.item_id === item.item_id
                    && [...new Set((Array.isArray(line.service_option_ids) ? line.service_option_ids : [])
                        .map((id) => Number(id))
                        .filter((id) => Number.isInteger(id) && id > 0))]
                        .sort((left, right) => left - right)
                        .join(',') === serviceOptionSignature
                ))
                : prev.find((line) => line.item_id === item.item_id);
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
                            scan_metadata: options.scanMetadata || line.scan_metadata || null,
                            service_option_ids: serviceOptionIds.length > 0 ? serviceOptionIds : (line.service_option_ids || []),
                            service_option_details: serviceOptionDetails.length > 0 ? serviceOptionDetails : (line.service_option_details || [])
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
                    course: isFnbWorkflow ? (routed.course || normalizedFnbContext?.default_course || 'main') : null,
                    kitchen_station_id: isFnbWorkflow ? (routed.kitchen_station_id || null) : null,
                    fnbKitchenRoutes: isFnbWorkflow && Array.isArray(item.fnbKitchenRoutes) ? item.fnbKitchenRoutes : [],
                    modifier_groups: isFnbWorkflow ? modifierGroups : [],
                    line_modifiers: isFnbWorkflow ? defaultModifiers : [],
                    service_option_ids: serviceOptionIds,
                    service_option_details: serviceOptionDetails,
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

    const addCatalogItemToCart = async (item, options = {}) => {
        if (!isServiceCatalogItem(item)) {
            addToCart(item, options);
            return true;
        }

        const requestId = serviceOptionsRequestRef.current + 1;
        serviceOptionsRequestRef.current = requestId;
        setServiceOptionsLoadingItemId(Number(item.item_id));
        try {
            const response = await fetchPosItemOptionGroups(item.item_id);
            if (requestId !== serviceOptionsRequestRef.current) return false;
            const groups = Array.isArray(response?.groups) ? response.groups : [];
            if (groups.length === 0) {
                addToCart(item, options);
                return true;
            }
            setServiceOptionsModal({ open: true, item, groups, quantity: options.quantity || 1 });
            return false;
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load service options.');
            return false;
        } finally {
            if (requestId === serviceOptionsRequestRef.current) {
                setServiceOptionsLoadingItemId(null);
            }
        }
    };

    const handleConfirmServiceOptions = ({ serviceItem, selectedOptionIds, selectedOptionDetails }) => {
        const quantity = Math.max(0.0001, Number(serviceOptionsModal.quantity || 1));
        addToCart(serviceItem, {
            quantity,
            selectedOptionIds,
            selectedOptionDetails
        });
        setServiceOptionsModal({ open: false, item: null, groups: [] });
    };

    const updateCartLine = (lineKey, patch, { allowWhenCheckoutBlocked = false } = {}) => {
        if (sessionLocked) {
            notifyPosActionBlocked();
            return false;
        }
        if (posActionsBlocked && !allowWhenCheckoutBlocked) {
            notifyPosActionBlocked();
            return false;
        }
        setCart((prev) => prev.map((line) => (
            getLineKey(line) === lineKey
                ? { ...line, ...patch }
                : line
        )));
        return true;
    };

    const updateCartQuantity = (lineKey, requestedQuantity) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const parsedQty = Number(requestedQuantity);
        if (!Number.isFinite(parsedQty)) return;

        let stockWarning = '';
        const nextCart = safeCart
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
            .filter(Boolean);

        if (nextCart.length === 0 && activeParkedSale?.pos_parked_sale_id) {
            void cancelActiveParkedSaleEditingAfterCartEmpty();
            return;
        }
        setCart(nextCart);

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
            if (delta > 0) addCatalogItemToCart(item, { quantity: delta });
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
            addCatalogItemToCart(item, { quantity: parsedQuantity });
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
        const nextCart = safeCart.filter((line) => getLineKey(line) !== lineKey);
        if (nextCart.length === 0 && activeParkedSale?.pos_parked_sale_id) {
            void cancelActiveParkedSaleEditingAfterCartEmpty();
            return;
        }
        if (itemOptionsLineKey === lineKey) setItemOptionsLineKey(null);
        itemDiscountApprovalRef.current.delete(lineKey);
        setCart(nextCart);
    };

    const saveItemOptions = async ({ note, selections, item_discount: itemDiscount }) => {
        const lineKey = itemOptionsLineKey;
        const currentLine = safeCart.find((line) => getLineKey(line) === lineKey);
        if (!lineKey || !currentLine || sessionLocked) return false;
        const basePrice = Number(currentLine.base_sale_price || currentLine.sale_price || 0);
        const serviceDelta = (currentLine.service_option_details || []).reduce(
            (sum, option) => sum + ((Number(option.price_adjustment_centavos) || 0) / 100),
            0
        );
        let normalizedItemDiscount = null;
        if (itemDiscount?.enabled) {
            const discountType = ['senior', 'pwd', 'employee', 'promo', 'manual'].includes(String(itemDiscount.discount_type || '').trim().toLowerCase())
                ? String(itemDiscount.discount_type).trim().toLowerCase()
                : 'manual';
            const method = String(itemDiscount.method || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
            const rate = Number(itemDiscount.rate);
            const amount = Number(itemDiscount.amount);
            if (['senior', 'pwd'].includes(discountType)
                && ![true, 1, '1'].includes(currentLine.senior_pwd_discount_eligible)) {
                toast.error('This item is not configured as eligible for Senior/PWD discounts.');
                return false;
            }
            if (['senior', 'pwd'].includes(discountType) && (!String(itemDiscount.customer_name || '').trim() || !String(itemDiscount.id_number || '').trim())) {
                toast.error('Customer name and Senior/PWD ID number are required.');
                return false;
            }
            if (discountType === 'promo' && !String(itemDiscount.customer_name || '').trim()) {
                toast.error('Customer name is required for a promo item discount.');
                return false;
            }
            if (discountType === 'promo' && !String(itemDiscount.promo_code || '').trim()) {
                toast.error('Enter a promo code for this item discount.');
                return false;
            }
            if (discountType === 'employee' && !String(itemDiscount.employee_name || '').trim()) {
                toast.error('Employee name is required for an employee discount.');
                return false;
            }
            if (!['senior', 'pwd', 'promo'].includes(discountType) && method === 'percentage' && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
                toast.error('Item discount rate must be from 0.01% to 100%.');
                return false;
            }
            if (!['senior', 'pwd', 'promo'].includes(discountType) && method === 'fixed' && (!Number.isFinite(amount) || amount <= 0)) {
                toast.error('Item fixed discount amount must be greater than zero.');
                return false;
            }
            const approverId = Number(itemDiscount.approver_user_id);
            const currentDiscount = currentLine.item_discount;
            const sameDiscount = currentDiscount
                && String(currentDiscount.discount_type || 'manual').toLowerCase() === discountType
                && String(currentDiscount.method || '').toLowerCase() === method
                && Number(currentDiscount.rate || 0) === (method === 'percentage' ? rate : 0)
                && Number(currentDiscount.amount || 0) === (method === 'fixed' ? amount : 0)
                && String(currentDiscount.customer_name || '') === String(itemDiscount.customer_name || '').trim()
                && String(currentDiscount.id_number || '') === String(itemDiscount.id_number || '').trim()
                && String(currentDiscount.employee_name || '') === String(itemDiscount.employee_name || '').trim()
                && String(currentDiscount.employee_id || '') === String(itemDiscount.employee_id || '').trim()
                && String(currentDiscount.promo_code || '') === String(itemDiscount.promo_code || '').trim().toUpperCase()
                && String(currentDiscount.reason || '') === String(itemDiscount.reason || '').trim();
            let approval = itemDiscountApprovalRef.current.get(lineKey);
            if (!sameDiscount || !approval || Number(approval.approver_user_id) !== approverId) {
                if (!Number.isInteger(approverId) || approverId <= 0 || !String(itemDiscount.manager_pin || '').trim()) {
                    toast.error('Select an authorized approver and enter the approval PIN for this item discount.');
                    return false;
                }
                try {
                    const verifiedApprover = await verifyPosDiscountApproval({
                        discount_type: discountType,
                        approver_user_id: approverId,
                        manager_pin: String(itemDiscount.manager_pin || '').trim()
                    });
                    approval = {
                        approver_user_id: verifiedApprover?.user_id || approverId,
                        manager_pin: String(itemDiscount.manager_pin || '').trim()
                    };
                    itemDiscountApprovalRef.current.set(lineKey, approval);
                } catch (error) {
                    toast.error(error?.response?.data?.message || error?.message || 'Item discount approval failed.');
                    return false;
                }
            }
            const approver = safeDiscountApprovers.find((entry) => Number(entry?.user_id) === Number(approval?.approver_user_id));
            const labels = { senior: 'Senior Discount', pwd: 'PWD Discount', employee: 'Employee Discount', promo: 'Promo Discount', manual: 'Other Discount' };
            normalizedItemDiscount = {
                discount_type: discountType,
                label: labels[discountType],
                method,
                rate: ['senior', 'pwd', 'promo'].includes(discountType) ? null : (method === 'percentage' ? round4(rate) : null),
                amount: ['senior', 'pwd', 'promo'].includes(discountType) ? null : (method === 'fixed' ? round4(amount) : null),
                customer_name: String(itemDiscount.customer_name || '').trim().slice(0, 255) || null,
                id_number: String(itemDiscount.id_number || '').trim().slice(0, 100) || null,
                employee_name: String(itemDiscount.employee_name || '').trim().slice(0, 255) || null,
                employee_id: String(itemDiscount.employee_id || '').trim().slice(0, 100) || null,
                promo_code: String(itemDiscount.promo_code || '').trim().toUpperCase().slice(0, 40) || null,
                reason: String(itemDiscount.reason || '').trim().slice(0, 500) || null,
                approver_user_id: Number(approval.approver_user_id),
                approver_name: String(approver?.username || '').trim() || null,
                approved_at: currentDiscount?.approved_at || new Date().toISOString()
            };
        } else {
            itemDiscountApprovalRef.current.delete(lineKey);
        }
        const updated = updateCartLine(lineKey, {
            line_modifiers: selections,
            special_instructions: String(note || '').trim().slice(0, 1000),
            sale_price: round4(basePrice + serviceDelta + resolveModifierDelta(currentLine, selections)),
            item_discount: normalizedItemDiscount
        }, { allowWhenCheckoutBlocked: true });
        if (!updated) return false;
        setItemOptionsLineKey(null);
        return true;
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

    const openCheckoutConfirmModal = useCallback(async () => {
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
        const { validateFnbModifierSelections } = await import('../utils/fnbModifierValidation.js');
        const invalidModifierLine = safeCart.find((line) => validateFnbModifierSelections(line.modifier_groups || [], line.line_modifiers || [], selectedLocationId));
        if (invalidModifierLine) {
            toast.error(`${invalidModifierLine.item_name}: ${validateFnbModifierSelections(invalidModifierLine.modifier_groups || [], invalidModifierLine.line_modifiers || [], selectedLocationId)}`);
            setItemOptionsLineKey(getLineKey(invalidModifierLine));
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
    }, [safeCart, checkoutBlockedReason, normalizedTerminalId, paymentType, selectedLocationId, isCheckoutWorkflowValid, orderMethod]);

    const openSplitPaymentModal = useCallback(async () => {
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before recording payment.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before recording payment.');
            return;
        }
        if (isEmployeeCreditPayment) {
            toast.error('Employee Credit cannot be combined with split payment.');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Split Payment requires an online connection.');
            return;
        }
        const { validateFnbModifierSelections } = await import('../utils/fnbModifierValidation.js');
        const invalidModifierLine = safeCart.find((line) => validateFnbModifierSelections(line.modifier_groups || [], line.line_modifiers || [], selectedLocationId));
        if (invalidModifierLine) {
            toast.error(`${invalidModifierLine.item_name}: ${validateFnbModifierSelections(invalidModifierLine.modifier_groups || [], invalidModifierLine.line_modifiers || [], selectedLocationId)}`);
            setItemOptionsLineKey(getLineKey(invalidModifierLine));
            return;
        }
        if (!isCheckoutWorkflowValid) {
            toast.error(orderMethod === 'appointment'
                ? 'Enter the client name and appointment time before recording payment.'
                : 'Enter the client name before recording payment.');
            return;
        }
        splitPaymentReturnToCheckoutRef.current = false;
        handleSplitPaymentOpenChange(true);
        setMobileCheckoutPanelOpen(false);
    }, [
        checkoutBlockedReason,
        handleSplitPaymentOpenChange,
        isCheckoutWorkflowValid,
        isEmployeeCreditPayment,
        normalizedTerminalId,
        orderMethod,
        safeCart,
        selectedLocationId
    ]);

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

    const closeDiscountModal = useCallback(() => {
        setDiscountModalOpen(false);
        if (discountReturnToCheckoutRef.current) {
            discountReturnToCheckoutRef.current = false;
            setCheckoutConfirmModalOpen(true);
        }
    }, []);

    const openDiscountModal = async ({ returnToCheckout = false } = {}) => {
        discountReturnToCheckoutRef.current = returnToCheckout;
        if (returnToCheckout) {
            setCheckoutConfirmModalOpen(false);
        }
        const draftToOpen = appliedDiscount
            ? { ...EMPTY_DISCOUNT_DRAFT, ...appliedDiscount, manager_pin: '' }
            : { ...EMPTY_DISCOUNT_DRAFT };
        setShowDiscountPin(false);
        setDiscountModalOpen(true);
        setDiscountApproversLoading(true);
        try {
            const approvers = await fetchPosDiscountApprovers();
            setDiscountApprovers(approvers);
            if (!appliedDiscount) {
                const shiftCashierId = Number(activeShiftCashierId);
                const shiftCashierApprover = Number.isInteger(shiftCashierId) && shiftCashierId > 0
                    ? toArray(approvers).find((approver) => (
                        Number(approver?.user_id) === shiftCashierId
                        && approver?.pos_approval_pin_configured === true
                    ))
                    : null;
                draftToOpen.approver_user_id = shiftCashierApprover?.user_id || '';
            }
            setDiscountDraft(draftToOpen);
        } catch (error) {
            setDiscountApprovers([]);
            setDiscountDraft(draftToOpen);
            toast.error(error?.response?.data?.message || 'Failed to load POS discount approvers.');
        } finally {
            setDiscountApproversLoading(false);
        }
    };

    const handleApplyGovernedDiscount = async () => {
        const type = discountDraft.type;
        const statutory = type === 'senior' || type === 'pwd';
        const approvalUserId = Number(discountDraft.approver_user_id);
        if (!Number.isInteger(approvalUserId) || approvalUserId <= 0) {
            toast.error('Select the employee who is authorizing this discount.');
            return;
        }
        const selectedApprover = safeDiscountApprovers.find((approver) => Number(approver?.user_id) === approvalUserId);
        if (!selectedApprover?.pos_approval_pin_configured) {
            toast.error('This employee does not have a POS approval PIN configured yet.');
            return;
        }
        if (!/^\d{4,12}$/.test(String(discountDraft.manager_pin || '').trim())) {
            toast.error('Enter the authorizing employee PIN.');
            return;
        }
        if (type === 'employee' && !discountDraft.employee_name.trim()) {
            toast.error('Employee name is required.');
            return;
        }
        if (!statutory && type !== 'employee' && !discountDraft.customer_name.trim()) {
            toast.error('Customer name is required for this discount.');
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
            const parsedEmployeeUserId = type === 'employee'
                ? Number(discountDraft.employee_id)
                : null;
            const employeeUserId = Number.isInteger(parsedEmployeeUserId) && parsedEmployeeUserId > 0
                ? parsedEmployeeUserId
                : null;
            const verifiedApprover = await verifyPosDiscountApproval({
                discount_type: type,
                approver_user_id: approvalUserId,
                manager_pin: discountDraft.manager_pin,
                employee_user_id: employeeUserId
            });
            const labels = { senior: 'Senior Citizen', pwd: 'PWD', employee: 'Employee Discount', promo: 'Promo Discount', manual: 'Other Discount' };
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
                manager_pin: undefined,
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
            discountApprovalRef.current = {
                discount_type: type,
                approver_user_id: governedDiscountApproverUserId,
                employee_user_id: type === 'employee' ? Number(discountDraft.employee_id) || null : null,
                manager_pin: String(discountDraft.manager_pin || '').trim()
            };
            setSelectedDiscountProfile('');
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            closeDiscountModal();
            toast.success(`${labels[type]} applied.`);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Employee PIN authorization failed.');
        } finally {
            setDiscountApplying(false);
        }
    };

    const clearAppliedDiscount = useCallback(() => {
        if (splitPaymentDialogOpen || hasSplitPaymentSummary) {
            toast.error('Finish or cancel the active payment before changing the discount.');
            return;
        }
        setAppliedDiscount(null);
        discountApprovalRef.current = null;
        setSelectedDiscountProfile('');
        setManualDiscountMode('none');
        setManualDiscountRateInput('');
        setManualDiscountAmountInput('');
        setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
        toast.success('Discount removed.');
    }, [hasSplitPaymentSummary, splitPaymentDialogOpen]);

    const resetCurrentSaleForNewSale = useCallback(() => {
        setCart([]);
        itemDiscountApprovalRef.current.clear();
        setOrderMethod(posWorkflow.allowedMethods[0] || (posWorkflow.mode === 'services' ? 'walk_in' : 'dine_in'));
        setTableNumber('');
        setKitchenNotes('');
        setServicesClientName('');
        setServicesDateTime('');
        setServicesProvider('');
        setServicesResource('');
        setServicesNotes('');
        setPaymentType('cash');
        setEmployeeCreditAccountCode('');
        setEmployeeCreditAccount(null);
        setSelectedEmployeeCreditOption(null);
        setEmployeeCreditLookupLoading(false);
        employeeCreditValidationSequenceRef.current += 1;
        setSelectedDiscountProfile('');
        setManualDiscountMode('none');
        setManualDiscountRateInput('');
        setManualDiscountAmountInput('');
        setAppliedDiscount(null);
        discountApprovalRef.current = null;
        setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
        discountReturnToCheckoutRef.current = false;
        setDiscountModalOpen(false);
        setShowDiscountPin(false);
        setAffiliateCodeInput('');
        setCustomerPaymentAmountInput('');
        setCheckoutConfirmModalOpen(false);
        setParkedSalePayContext(null);
        setItemOptionsLineKey(null);
        setServiceOptionsModal({ open: false, item: null, groups: [] });
    }, [posWorkflow]);

    const cancelActiveParkedSaleEditingAfterCartEmpty = useCallback(async () => {
        const parkedSaleId = Number(activeParkedSale?.pos_parked_sale_id);
        const snapshot = activeParkedSale?.snapshot;
        if (!parkedSaleId || parkedSaleReleaseLoading) return false;
        if (!activeShiftId || !normalizedTerminalId) {
            toast.error('Open the active POS shift before cancelling parked-sale editing.');
            return false;
        }
        if (!snapshot || !Array.isArray(snapshot.lines) || snapshot.lines.length === 0) {
            toast.error('Unable to return this parked sale because its original items are unavailable.');
            return false;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Reconnect before cancelling parked-sale editing. The parked sale is still claimed and the current items were kept.');
            return false;
        }

        const parkedSaleLabel = formatParkedSaleDisplayName(activeParkedSale);
        setParkedSaleReleaseLoading(true);
        try {
            await reparkPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                expected_revision: Number(activeParkedSale.revision),
                snapshot,
                subtotal_amount: Number(activeParkedSale.subtotal_amount || 0),
                total_amount: Number(activeParkedSale.total_amount || 0)
            });
            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
            setActiveParkedSale(null);
            resetCurrentSaleForNewSale();
            toast.info(`${parkedSaleLabel} remains available for the next cashier. Editing was cancelled because all items were removed.`);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to release this parked sale. The current items were kept.');
            return false;
        } finally {
            setParkedSaleReleaseLoading(false);
        }
    }, [activeParkedSale, activeShiftId, normalizedTerminalId, offlineSnapshotScope, parkedSaleReleaseLoading, resetCurrentSaleForNewSale, selectedLocationId]);

    const openClearCurrentSale = () => {
        if (posActionsBlocked || safeCart.length === 0 || activeParkedSale?.pos_parked_sale_id) return;
        setCurrentSaleHelpOpen(false);
        setClearSaleConfirmOpen(true);
    };

    const confirmClearCurrentSale = () => {
        if (posActionsBlocked || safeCart.length === 0 || activeParkedSale?.pos_parked_sale_id) {
            setClearSaleConfirmOpen(false);
            return;
        }
        clearPosCartDraft(offlineSnapshotScope, activeShiftId);
        setActiveParkedSale(null);
        resetCurrentSaleForNewSale();
        setClearSaleConfirmOpen(false);
        toast.success('Current sale cleared.');
    };

    const validateParkedSaleForResume = useCallback(async (parkedSale, action = 'pay') => {
        const normalizedAction = action === 'resume' ? 'resume' : 'pay';
        const [{ validateParkedSaleResume }, { validateFnbModifierSelections }] = await Promise.all([
            import('../utils/posParkedSaleResume.js'),
            import('../utils/fnbModifierValidation.js')
        ]);
        const validation = validateParkedSaleResume({
            parkedSale,
            catalog: safeCatalog,
            locationId: selectedLocationId,
            allowedOrderMethods: posWorkflow.allowedMethods,
            discountProfiles: safeDiscountProfiles,
            commercialPromoConfig: safeCommercialPromoConfig,
            modifierValidator: ({ item, line, locationId }) => {
                const currentGroups = getFnbModifierGroups(item);
                const savedModifiers = toArray(line?.line_modifiers);
                if (savedModifiers.length > 0 && currentGroups.length === 0) {
                    return 'modifier selections are no longer available.';
                }
                const currentOptionIds = new Set(currentGroups.flatMap((group) => getActiveModifierOptions(group).map((option) => Number(option?.modifier_option_id))));
                if (savedModifiers.some((modifier) => !currentOptionIds.has(Number(modifier?.modifier_option_id)))) {
                    return 'one or more modifier selections are no longer available.';
                }
                return validateFnbModifierSelections(currentGroups, savedModifiers, locationId);
            }
        });
        if (activeParkedSale?.pos_parked_sale_id
            && Number(activeParkedSale.pos_parked_sale_id) !== Number(parkedSale?.pos_parked_sale_id)) {
            return {
                ok: false,
                message: 'Finish, update, or cancel the currently resumed parked sale before opening another one.'
            };
        }
        if (normalizedAction === 'resume'
            && activeParkedSale?.pos_parked_sale_id
            && Number(activeParkedSale.pos_parked_sale_id) === Number(parkedSale?.pos_parked_sale_id)) {
            return {
                ok: false,
                message: 'This parked sale is already active in the current cart.'
            };
        }
        if (safeCart.length > 0) {
            return {
                ok: false,
                message: normalizedAction === 'resume'
                    ? 'Resume requires an empty current sale. Park or clear the current sale first.'
                    : 'Pay requires an empty current sale. Park or clear the current sale first.'
            };
        }
        if (!validation.ok) {
            return {
                ok: false,
                message: `This parked sale needs review before it can be resumed: ${validation.conflicts.slice(0, 3).join(' ')}`
            };
        }
        return { ok: true };
    }, [activeParkedSale?.pos_parked_sale_id, posWorkflow, safeCart.length, safeCatalog, safeCommercialPromoConfig, safeDiscountProfiles, selectedLocationId]);

    const handleParkedSaleClaimed = useCallback(async (claimedSale, action = 'pay') => {
        const normalizedAction = action === 'resume' ? 'resume' : 'pay';
        const { buildResumedCartLines } = await import('../utils/posParkedSaleResume.js');
        const snapshot = claimedSale?.snapshot && typeof claimedSale.snapshot === 'object'
            ? claimedSale.snapshot
            : {};
        const resumedLines = buildResumedCartLines({ parkedSale: claimedSale, catalog: safeCatalog });
        const services = snapshot.services && typeof snapshot.services === 'object' ? snapshot.services : {};
        const discountContext = snapshot.discount_context && typeof snapshot.discount_context === 'object'
            ? snapshot.discount_context
            : {};
        const selectedProfile = discountContext.selected_profile && typeof discountContext.selected_profile === 'object'
            ? discountContext.selected_profile
            : null;
        const applied = discountContext.applied && typeof discountContext.applied === 'object'
            ? discountContext.applied
            : null;
        const defaultOrderMethod = posWorkflow.allowedMethods[0] || (posWorkflow.mode === 'services' ? 'walk_in' : 'dine_in');
        const resumedOrderMethod = posWorkflow.allowedMethods.includes(snapshot.order_method)
            ? snapshot.order_method
            : defaultOrderMethod;
        itemDiscountApprovalRef.current.clear();
        setCart(resumedLines);
        setPaymentType('cash');
        setEmployeeCreditAccountCode('');
        setEmployeeCreditAccount(null);
        setSelectedEmployeeCreditOption(null);
        setEmployeeCreditLookupLoading(false);
        employeeCreditValidationSequenceRef.current += 1;
        setCustomerPaymentAmountInput('');
        setCheckoutConfirmModalOpen(false);
        setMobileCheckoutPanelOpen(false);
        setItemOptionsLineKey(null);
        setServiceOptionsModal({ open: false, item: null, groups: [] });
        setActiveParkedSale({
            pos_parked_sale_id: Number(claimedSale?.pos_parked_sale_id),
            park_reference: claimedSale?.park_reference || null,
            revision: Number(claimedSale?.revision || 1),
            parked_sale_name: String(snapshot.parked_sale_name || '').trim() || null,
            snapshot,
            subtotal_amount: Number(claimedSale?.subtotal_amount || 0),
            total_amount: Number(claimedSale?.total_amount || 0)
        });
        setParkedSalePayContext(normalizedAction === 'pay'
            ? {
                snapshot,
                subtotalAmount: Number(claimedSale?.subtotal_amount || 0),
                totalAmount: Number(claimedSale?.total_amount || 0)
            }
            : null);

        let approvalResetMessage = '';
        setOrderMethod(resumedOrderMethod);
        setTableNumber(String(snapshot.table_number || ''));
        setKitchenNotes(String(snapshot.kitchen_notes || ''));
        setServicesClientName(String(services.client_name || ''));
        setServicesDateTime(String(services.scheduled_for || '').slice(0, 16));
        setServicesProvider(String(services.provider || ''));
        setServicesResource(String(services.resource || ''));
        setServicesNotes(String(services.notes || ''));
        setAffiliateCodeInput('');

        if (applied) {
            setAppliedDiscount(null);
            discountApprovalRef.current = null;
            setDiscountDraft({ ...EMPTY_DISCOUNT_DRAFT, ...applied, manager_pin: '' });
            setSelectedDiscountProfile('');
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            approvalResetMessage = ' Re-enter discount approval before checkout.';
        } else if (selectedProfile?.name) {
            setAppliedDiscount(null);
            discountApprovalRef.current = null;
            setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
            setSelectedDiscountProfile(String(selectedProfile.name));
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
        } else {
            setAppliedDiscount(null);
            discountApprovalRef.current = null;
            setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
            setSelectedDiscountProfile('');
            setManualDiscountMode(String(discountContext.manual_mode || 'none'));
            setManualDiscountRateInput(discountContext.manual_rate ? String(discountContext.manual_rate) : '');
            setManualDiscountAmountInput(discountContext.manual_amount ? String(discountContext.manual_amount) : '');
        }
        if (normalizedAction === 'pay') {
            setCurrentViewMode('checkout');
            setCustomerPaymentAmountInput('0');
            setCheckoutConfirmModalOpen(true);
            setMobileCheckoutPanelOpen(false);
            toast.success(`Ready to pay ${formatParkedSaleDisplayName(claimedSale)}. Review the cart before checkout.${approvalResetMessage}`);
        } else {
            toast.success(`Resumed ${formatParkedSaleDisplayName(claimedSale)}. Add items as needed, then checkout.`);
        }
    }, [posWorkflow, safeCatalog, setCurrentViewMode]);

    const openParkSaleNameDialog = () => {
        if (activeParkedSale?.pos_parked_sale_id) {
            void handleParkAndNewSale(activeParkedSale.parked_sale_name || formatParkedSaleDisplayName(activeParkedSale));
            return;
        }
        const suggestedName = activeParkedSale?.parked_sale_name
            || servicesClientName.trim()
            || (tableNumber.trim() ? `Table ${tableNumber.trim()}` : '');
        setParkSaleNameInput(suggestedName);
        setParkSaleNameDialogOpen(true);
    };

    const openParkedSalesHistory = () => {
        setCurrentSaleHelpOpen(false);
        setParkedSalesDialogOpen(true);
    };

    const handleParkAndNewSale = async (nameOverride = null) => {
        const parkedSaleName = String(nameOverride ?? parkSaleNameInput).trim();
        if (!parkedSaleName) {
            toast.error('Enter a customer or order name before parking this sale.');
            return;
        }
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!activeShiftId) {
            toast.error('Open a POS shift before parking a sale.');
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before parking a sale.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before parking a sale.');
            return;
        }
        const snapshot = {
            schema_version: 1,
            parked_sale_name: parkedSaleName,
            order_method: orderMethod,
            table_number: tableNumber.trim() || null,
            kitchen_notes: kitchenNotes.trim() || null,
            services: posWorkflow.mode === 'services'
                ? {
                    client_name: servicesClientName.trim() || null,
                    scheduled_for: servicesDateTime || null,
                    provider: servicesProvider.trim() || null,
                    resource: servicesResource.trim() || null,
                    notes: servicesNotes.trim() || null
                }
                : null,
            fnb_context: normalizedFnbContext || null,
            discount_context: {
                selected_profile: selectedDiscount ? {
                    name: selectedDiscount.name || null,
                    percentage: Number(selectedDiscount.percentage || 0)
                } : null,
                manual_mode: manualDiscountMode,
                manual_rate: Number(manualDiscountRate || 0),
                manual_amount: Number(manualDiscountAmount || 0),
                applied: appliedDiscount ? {
                    type: appliedDiscount.type || null,
                    label: appliedDiscount.label || null,
                    method: appliedDiscount.method || null,
                    rate: Number(appliedDiscount.rate || 0),
                    amount: appliedDiscount.amount == null ? null : Number(appliedDiscount.amount),
                    customer_name: appliedDiscount.customer_name || null,
                    id_number: appliedDiscount.id_number || null,
                    approver_user_id: appliedDiscount.approver_user_id || null,
                    approver_name: appliedDiscount.approver_name || null,
                    promo_code: appliedDiscount.promo_code || null,
                    eligible_item_ids: toArray(appliedDiscount.eligible_item_ids),
                    eligible_items: toArray(appliedDiscount.eligible_items)
                } : null
            },
            lines: safeCart.map((line) => ({
                line_key: line.line_key || null,
                item_id: Number(line.item_id),
                item_name: line.item_name || null,
                quantity: Number(line.quantity),
                base_sale_price: Number(line.base_sale_price || 0),
                sale_price: Number(line.sale_price),
                price_override_reason: line.price_override_reason || null,
                unit_of_measure: line.unit_of_measure || null,
                category: line.category || null,
                vat_type: line.vat_type || null,
                senior_pwd_discount_eligible: line.senior_pwd_discount_eligible === true,
                course: line.course || null,
                kitchen_station_id: line.kitchen_station_id || null,
                service_option_ids: toArray(line.service_option_ids),
                service_option_details: toArray(line.service_option_details),
                modifier_groups: toArray(line.modifier_groups),
                line_modifiers: toArray(line.line_modifiers),
                special_instructions: line.special_instructions || null,
                item_discount: line.item_discount ? {
                    discount_type: line.item_discount.discount_type || 'manual',
                    label: line.item_discount.label || 'Item Discount',
                    method: line.item_discount.method,
                    rate: line.item_discount.rate == null ? null : Number(line.item_discount.rate),
                    amount: line.item_discount.amount == null ? null : Number(line.item_discount.amount),
                    customer_name: line.item_discount.customer_name || null,
                    id_number: line.item_discount.id_number || null,
                    employee_name: line.item_discount.employee_name || null,
                    employee_id: line.item_discount.employee_id || null,
                    promo_code: line.item_discount.promo_code || null,
                    reason: line.item_discount.reason || null,
                    approver_user_id: line.item_discount.approver_user_id || null,
                    approver_name: line.item_discount.approver_name || null,
                    approved_at: line.item_discount.approved_at || null
                } : null,
                scan_metadata: line.scan_metadata || null
            }))
        };

        const parkPayload = {
            idempotency_key: createIdempotencyKey('pos-parked-sale'),
            shift_id: Number(activeShiftId),
            terminal_id: normalizedTerminalId,
            location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
            snapshot,
            subtotal_amount: Number(cartSubtotal || 0),
            total_amount: Number(cartTotal || 0)
        };
        const offlinePark = typeof navigator !== 'undefined' && navigator.onLine === false;

        if (offlinePark && activeParkedSale?.pos_parked_sale_id) {
            toast.error('Reconnect before parking this resumed sale again. Your cart is still open.');
            return;
        }

        setParkLoading(true);
        try {
            if (offlinePark) {
                const queuedIntentId = await onQueueOfflineOperation({
                    intent_id: parkPayload.idempotency_key,
                    operation: 'parked_sale',
                    shift_id: Number(activeShiftId),
                    payload: parkPayload
                }, 'offline_parked_sale');
                if (!queuedIntentId) {
                    throw new Error('Offline parked-sale queue is unavailable. Your current cart is still open.');
                }
                clearPosCartDraft(offlineSnapshotScope, activeShiftId);
                resetCurrentSaleForNewSale();
                setParkSaleNameDialogOpen(false);
                setParkSaleNameInput('');
                toast.message('Sale saved locally as a pending parked sale. Press Sync after reconnecting to send it.');
                return;
            }

            const parkedSale = activeParkedSale?.pos_parked_sale_id
                ? await reparkPosParkedSale(activeParkedSale.pos_parked_sale_id, {
                    ...parkPayload,
                    idempotency_key: undefined,
                    expected_revision: Number(activeParkedSale.revision)
                })
                : await createPosParkedSale(parkPayload);
            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
            setActiveParkedSale(null);
            resetCurrentSaleForNewSale();
            setParkSaleNameDialogOpen(false);
            setParkSaleNameInput('');
            toast.success(`${formatParkedSaleDisplayName(parkedSale)} ${activeParkedSale ? 'updated' : 'saved'}. New sale ready.`);
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Sale was not parked. Your current cart is still open.');
        } finally {
            setParkLoading(false);
        }
    };

    const clearSplitPaymentState = useCallback(() => {
        clearPosSplitPaymentSessionPointer(splitPaymentStorageScopeKey);
        splitPaymentReturnToCheckoutRef.current = false;
        setSplitPaymentSession(null);
        setSplitPaymentDialogOpen(false);
        setSplitPaymentWorkflowVersion((version) => version + 1);
    }, [splitPaymentStorageScopeKey]);

    const releaseClaimedParkedSaleAfterPayCancel = useCallback(async () => {
        const parkedSaleId = Number(activeParkedSale?.pos_parked_sale_id);
        const snapshot = parkedSalePayContext?.snapshot;
        if (!parkedSaleId || !parkedSalePayContext) {
            setCheckoutConfirmModalOpen(false);
            return true;
        }
        if (!activeShiftId || !normalizedTerminalId) {
            toast.error('Open the active POS shift before cancelling this payment.');
            return false;
        }
        if (!snapshot || !Array.isArray(snapshot.lines) || snapshot.lines.length === 0) {
            toast.error('Unable to return this parked sale because its original items are unavailable.');
            return false;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Reconnect before cancelling payment. The parked sale is still claimed and the current items were kept.');
            return false;
        }

        const parkedSaleLabel = formatParkedSaleDisplayName(activeParkedSale);
        setParkedSaleReleaseLoading(true);
        try {
            await reparkPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                expected_revision: Number(activeParkedSale.revision),
                snapshot,
                subtotal_amount: Number(parkedSalePayContext.subtotalAmount || 0),
                total_amount: Number(parkedSalePayContext.totalAmount || 0)
            });
            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
            setActiveParkedSale(null);
            resetCurrentSaleForNewSale();
            toast.success(`${parkedSaleLabel} payment cancelled. The parked sale is available again.`);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to cancel payment. The current items were kept.');
            return false;
        } finally {
            setParkedSaleReleaseLoading(false);
        }
    }, [activeParkedSale, activeShiftId, normalizedTerminalId, offlineSnapshotScope, parkedSalePayContext, resetCurrentSaleForNewSale, selectedLocationId]);

    const handleCancelCheckout = useCallback(async () => {
        const sessionId = Number(splitPaymentSession?.pos_payment_session_id || splitPaymentSession?.id || 0);
        if (!sessionId) {
            if (parkedSalePayContext && activeParkedSale?.pos_parked_sale_id) {
                await releaseClaimedParkedSaleAfterPayCancel();
            } else {
                setCheckoutConfirmModalOpen(false);
            }
            return;
        }
        if (splitPaymentSuccessfulAllocations.length > 0) {
            setSplitPaymentCancelModalOpen(true);
            return;
        }

        setSplitPaymentCancelLoading(true);
        try {
            await cancelPosPaymentSession(sessionId, {
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId || undefined,
                reason: 'Cashier cancelled split-payment checkout before payment was recorded.'
            });
            clearSplitPaymentState();
            setCheckoutConfirmModalOpen(false);
            toast.success('Split-payment draft cancelled. New checkout ready.');
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to cancel the split-payment draft.');
        } finally {
            setSplitPaymentCancelLoading(false);
        }
    }, [activeParkedSale?.pos_parked_sale_id, activeShiftId, clearSplitPaymentState, normalizedTerminalId, parkedSalePayContext, releaseClaimedParkedSaleAfterPayCancel, selectedLocationId, splitPaymentSession, splitPaymentSuccessfulAllocations.length]);

    const handleKeepSplitPaymentAndClose = useCallback(() => {
        setSplitPaymentCancelModalOpen(false);
        setCheckoutConfirmModalOpen(false);
        toast.message('Saved split payment kept. Resume it from checkout to finish the sale.');
    }, []);

    const handleReverseSplitPaymentAndStartNew = useCallback(async () => {
        const sessionId = Number(splitPaymentSession?.pos_payment_session_id || splitPaymentSession?.id || 0);
        if (!sessionId || splitPaymentSuccessfulAllocations.length === 0) return;

        setSplitPaymentCancelLoading(true);
        try {
            for (const allocation of splitPaymentSuccessfulAllocations) {
                const allocationId = Number(allocation?.pos_payment_allocation_id || allocation?.id || 0);
                if (!allocationId) throw new Error('A split-payment allocation identifier is missing.');
                await cancelPosPaymentAllocation(sessionId, allocationId, {
                    shift_id: activeShiftId,
                    terminal_id: normalizedTerminalId,
                    location_id: selectedLocationId || undefined,
                    reason: 'Cashier cancelled split-payment checkout before sale completion.'
                });
            }
            await cancelPosPaymentSession(sessionId, {
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId || undefined,
                reason: 'All split-payment allocations were reversed before starting a new checkout.'
            });
            clearSplitPaymentState();
            setSplitPaymentCancelModalOpen(false);
            setCheckoutConfirmModalOpen(false);
            toast.success('Split payment reversed and cancelled. New checkout ready.');
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to reverse the split payment. Review the saved payment and try again.');
        } finally {
            setSplitPaymentCancelLoading(false);
        }
    }, [activeShiftId, clearSplitPaymentState, normalizedTerminalId, selectedLocationId, splitPaymentSession, splitPaymentSuccessfulAllocations]);

    const handleCompletePreparedSplitPayment = useCallback(async (preparedSession = null) => {
        const sessionToComplete = preparedSession || splitPaymentSession;
        const sessionId = Number(sessionToComplete?.pos_payment_session_id || sessionToComplete?.id || 0);
        const isReady = round4(sessionToComplete?.remaining_amount) === 0;
        if (!sessionId || !isReady) {
            toast.error('Complete the split payment allocation before confirming.');
            return false;
        }

        setCheckoutLoading(true);
        try {
            const result = await completePosPaymentSession(sessionId, {
                idempotency_key: `split-complete:${sessionId}`,
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId || undefined
            });
            const transaction = result?.transaction || null;
            if (!transaction) {
                throw new Error('The server completed no transaction. Resume the saved payment and try again.');
            }
            clearSplitPaymentState();
            setLastReceipt(transaction);
            setLastReceiptContract(inferReceiptContract(transaction, result?.receipt_contract));
            setCart([]);
            itemDiscountApprovalRef.current.clear();
            setActiveParkedSale(null);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            discountApprovalRef.current = null;
            setAffiliateCodeInput('');
            setCustomerPaymentAmountInput('');
            setCheckoutConfirmModalOpen(false);
            setReceiptPreviewSource('order_preview');
            setReceiptPreviewModalOpen(true);
            loadCatalog();
            loadHistory(historyPage);
            if (typeof onCheckoutCompleted === 'function') onCheckoutCompleted(transaction);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to finish the split payment. Review the payment and try again.');
            return false;
        } finally {
            setCheckoutLoading(false);
        }
    }, [activeShiftId, clearSplitPaymentState, historyPage, loadCatalog, loadHistory, normalizedTerminalId, onCheckoutCompleted, selectedLocationId, splitPaymentSession]);

    const splitPaymentCheckoutContext = useMemo(() => ({
        orderMethod,
        posWorkflowMode: posWorkflow.mode,
        servicesClientName,
        servicesNotes,
        servicesDateTime,
        tableNumber,
        kitchenNotes,
        appliedDiscount,
        discountApproval: discountApprovalRef.current,
        itemDiscountApproval: itemDiscountApprovalRef.current,
        selectedDiscount,
        manualDiscountAmount,
        manualDiscountMode,
        manualDiscountRate,
        calculatedDiscountAmount,
        affiliateCodeInput,
        fnbContext: normalizedFnbContext,
        cart: safeCart
    }), [
        affiliateCodeInput,
        appliedDiscount,
        calculatedDiscountAmount,
        manualDiscountAmount,
        manualDiscountMode,
        manualDiscountRate,
        normalizedFnbContext,
        orderMethod,
        posWorkflow.mode,
        safeCart,
        selectedDiscount,
        servicesClientName,
        servicesDateTime,
        servicesNotes,
        tableNumber,
        kitchenNotes
    ]);

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
        if (offlineCheckout && activeParkedSale?.pos_parked_sale_id) {
            toast.error('Reconnect before checking out this resumed parked sale. Your cart is still open.');
            return;
        }
        if (offlineCheckout && !isCashPayment) {
            toast.error('Only cash transactions can be recorded offline. Reconnect before using an external payment method.');
            return;
        }

        const payload = {
            idempotency_key: createIdempotencyKey(),
            terminal_id: normalizedTerminalId || undefined,
            location_id: selectedLocationId || undefined,
            order_method: orderMethod,
            table_number: isFnbWorkflow && orderMethod === 'dine_in' ? tableNumber.trim() || undefined : undefined,
            customer_name: posWorkflow.mode === 'services' ? servicesClientName.trim() || undefined : undefined,
            special_instructions: posWorkflow.mode === 'services'
                ? servicesNotes.trim() || undefined
                : (isFnbWorkflow
                    ? buildFnbGlobalOrderNote({ kitchenNotes }) || undefined
                    : undefined),
            scheduled_for: posWorkflow.mode === 'services' && servicesDateTime
                ? new Date(servicesDateTime).toISOString()
                : undefined,
            payment_type: paymentType,
            payment_handoff_mode: ['cash', 'employee_credit'].includes(paymentType) ? 'internal' : 'external',
            cash_received: isCashPayment ? Number(customerPaymentAmount || 0) : undefined,
            change_amount: isCashPayment ? Number(customerPaymentChange || 0) : undefined,
            employee_credit: isEmployeeCreditPayment ? {
                account_code: employeeCreditAccountCode.trim().toUpperCase()
            } : undefined,
            discount_mode: appliedDiscount ? 'amount' : (selectedDiscount ? 'preset' : (manualDiscountAmount > 0 ? manualDiscountMode : 'none')),
            discount_amount: Number(calculatedDiscountAmount || 0),
            item_discount_amount: Number(itemDiscountTotals.discountAmount || 0),
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
            discount_approval: appliedDiscount && discountApprovalRef.current ? {
                discount_type: appliedDiscount.type,
                approver_user_id: appliedDiscount.approver_user_id,
                employee_user_id: appliedDiscount.type === 'employee' ? Number(appliedDiscount.employee_id) || null : null,
                manager_pin: discountApprovalRef.current.manager_pin
            } : undefined,
            governed_discount: appliedDiscount ? {
                ...appliedDiscount,
                vat_removed: governedDiscountTotals.vatRemoved,
                vat_exempt_amount: governedDiscountTotals.vatExemptAmount,
                discount_amount: governedDiscountTotals.discountAmount
            } : undefined,
            affiliate_code: affiliateCodeInput.trim() || undefined,
            shift_id: activeShiftId || undefined,
            parked_sale_id: activeParkedSale?.pos_parked_sale_id || undefined,
            fnb_check_id: normalizedFnbContext?.fnb_check_id || undefined,
            fnb_table_id: normalizedFnbContext?.fnb_table_id || undefined,
            fnb_table_label_snapshot: normalizedFnbContext?.fnb_table_label_snapshot
                || (isFnbWorkflow && orderMethod === 'dine_in' ? tableNumber.trim() || undefined : undefined),
            fnb_guest_count: normalizedFnbContext?.fnb_guest_count || undefined,
            fnb_server_id: normalizedFnbContext?.fnb_server_id || undefined,
            restaurant_service_charge: normalizedFnbContext?.restaurant_service_charge || undefined,
            lines: safeCart.map((line) => ({
                item_id: line.item_id,
                quantity: Number(line.quantity),
                sale_price: Number(line.sale_price),
                ...(line.item_discount ? {
                    item_discount: {
                        discount_type: line.item_discount.discount_type || 'manual',
                        label: line.item_discount.label || 'Item Discount',
                        method: line.item_discount.method,
                        rate: line.item_discount.rate == null ? null : Number(line.item_discount.rate),
                        amount: line.item_discount.amount == null ? null : Number(line.item_discount.amount),
                        customer_name: line.item_discount.customer_name || null,
                        id_number: line.item_discount.id_number || null,
                        employee_name: line.item_discount.employee_name || null,
                        employee_id: line.item_discount.employee_id || null,
                        promo_code: line.item_discount.promo_code || null,
                        reason: line.item_discount.reason || null,
                        approver_user_id: line.item_discount.approver_user_id || null
                    },
                    ...(itemDiscountApprovalRef.current.get(getLineKey(line))?.manager_pin ? {
                        item_discount_approval: {
                            approver_user_id: itemDiscountApprovalRef.current.get(getLineKey(line)).approver_user_id,
                            manager_pin: itemDiscountApprovalRef.current.get(getLineKey(line)).manager_pin
                        }
                    } : {})
                } : {}),
                price_override_reason: String(line.price_override_reason || '').trim() || undefined,
                ...(isFnbWorkflow ? {
                    course: line.course || normalizedFnbContext?.default_course || undefined,
                    line_modifiers: line.line_modifiers || undefined,
                    special_instructions: line.special_instructions || undefined,
                    kitchen_station_id: line.kitchen_station_id || undefined
                } : {}),
                ...(Array.isArray(line.service_option_ids) && line.service_option_ids.length > 0
                    ? { selected_option_ids: line.service_option_ids }
                    : {}),
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
            item_discount: line.item_discount || null,
            special_instructions: line.special_instructions || '',
            selected_option_ids: Array.isArray(line.service_option_ids) ? line.service_option_ids : [],
            service_options_snapshot: Array.isArray(line.service_option_details) ? line.service_option_details : [],
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
            if (appliedDiscount || itemDiscountTotals.discountAmount > 0) {
                toast.error('Approved discounts require an online checkout so eligibility and the selected approver can be verified securely.');
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
            itemDiscountApprovalRef.current.clear();
            setActiveParkedSale(null);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            discountApprovalRef.current = null;
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
            itemDiscountApprovalRef.current.clear();
            setActiveParkedSale(null);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            discountApprovalRef.current = null;
            setAffiliateCodeInput('');
            setCustomerPaymentAmountInput('');
            setCheckoutConfirmModalOpen(false);
            setReceiptPreviewSource('order_preview');
            setReceiptPreviewModalOpen(true);
        if (typeof onCheckoutCompleted === 'function') {
                onCheckoutCompleted(data?.transaction || null);
            }
            try {
                // Auto-print-on-checkout only ever ran on the iMin native
                // printer — a terminal with no printer, or the LAN bridge, has
                // always required the cashier to press Print Receipt manually.
                // Keep that behavior; only the transport moved to the driver.
                if (posHardware.driverId === 'imin_native') {
                    const completedTransaction = data?.transaction || null;
                    const receiptContract = inferReceiptContract(completedTransaction, data?.receipt_contract);
                    const printOutcome = await posHardware.printReceipt({
                        transaction: completedTransaction,
                        businessSettings: receiptSettings,
                        receiptContract,
                        openDrawerAfterPrint: isCashPayment,
                        shiftId: activeShiftId,
                        transactionId: completedTransaction?.pos_transaction_id,
                        terminalId: normalizedTerminalId,
                        reason: 'checkout_auto_print'
                    });
                    if (printOutcome.success) {
                        toast.success(isCashPayment ? 'Receipt printed and cash drawer opened.' : 'Receipt printed.');
                    } else if (isCashPayment) {
                        const drawerOutcome = await posHardware.openDrawer({
                            shiftId: activeShiftId,
                            transactionId: completedTransaction?.pos_transaction_id,
                            terminalId: normalizedTerminalId,
                            reason: 'checkout_auto_open_drawer'
                        });
                        if (drawerOutcome.success) {
                            toast.success('Cash drawer opened.');
                        }
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
            const {
                buildFnbRecipeBlockerMessage,
                buildValidationDetailMessage
            } = await import('../utils/posCheckoutErrorMessages.js');
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

    const handlePrintReceipt = useCallback(async (transaction, reason = 'manual_reprint') => {
        const transactionId = Number(transaction?.pos_transaction_id);
        if (!Number.isInteger(transactionId) || transactionId <= 0) {
            toast.error('Select a saved receipt first.');
            return;
        }

        setReceiptPrinting(true);
        try {
            // Reprinting a cash receipt must not silently pulse the drawer.
            // Cashier-initiated drawer opens go through the PIN/reason modal.
            const shouldOpenDrawer = false;
            const outcome = await posHardware.printReceipt({
                transaction,
                businessSettings: receiptSettings,
                receiptContract: inferReceiptContract(transaction),
                openDrawerAfterPrint: shouldOpenDrawer,
                shiftId: activeShiftId,
                transactionId,
                terminalId: normalizedTerminalId || undefined,
                reason,
                idempotencyKey: createIdempotencyKey()
            });

            if (outcome.success) {
                toast.success(
                    outcome.message || 'Receipt printed.'
                );
            } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED') {
                toast.message(outcome.message || 'No printer is configured for this terminal. The receipt is available for on-screen preview.');
            } else {
                toast.error(outcome.message || 'Failed to send receipt to printer.');
            }
        } finally {
            setReceiptPrinting(false);
        }
    }, [activeShiftId, normalizedTerminalId, posHardware, receiptSettings]);

    const handleBillRequest = useCallback(async () => {
        if (safeCart.length === 0) {
            toast.error('Add at least one item before requesting a bill.');
            return;
        }

        const draft = {
            lines: safeCart.map((line) => ({
                lineKey: getLineKey(line),
                itemId: line.item_id,
                itemName: line.item_name,
                quantity: Number(line.quantity || 0),
                unitPrice: Number(line.sale_price || 0)
            })),
            total: Number(cartTotal || 0)
        };
        setBillRequestDraft(draft);
        setCheckoutConfirmModalOpen(false);
        setBillRequestPrinting(true);
        try {
            const outcome = await posHardware.printOrderTicket({
                cart: safeCart,
                terminalId: normalizedTerminalId,
                orderMethod,
                fnbContext: buildFnbPrintContext({
                    fnbContext: normalizedFnbContext,
                    tableNumber,
                    orderMethod
                }),
                orderNotes: isFnbWorkflow
                    ? buildFnbGlobalOrderNote({ kitchenNotes })
                    : kitchenNotes,
                billRequest: true,
                billTotal: cartTotal
            });

            if (outcome.success) {
                toast.success(outcome.message || 'Bill request sent to printer.');
            } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED' || outcome.reasonCode === 'NOT_SUPPORTED') {
                toast.error('Bill request printing is not available on this terminal.');
            } else {
                toast.error(outcome.message || 'Failed to print bill request.');
            }
        } finally {
            setBillRequestPrinting(false);
        }
    }, [cartTotal, isFnbWorkflow, kitchenNotes, normalizedFnbContext, normalizedTerminalId, orderMethod, posHardware, safeCart, tableNumber]);

    const handlePrintOrder = useCallback(async () => {
        if (safeCart.length === 0) {
            toast.error('Add at least one item before printing an order.');
            return;
        }

        const outcome = await posHardware.printOrderTicket({
            cart: safeCart,
            terminalId: normalizedTerminalId,
            orderMethod,
            fnbContext: buildFnbPrintContext({
                fnbContext: normalizedFnbContext,
                tableNumber,
                orderMethod
            }),
            orderNotes: isFnbWorkflow
                ? buildFnbGlobalOrderNote({ kitchenNotes })
                : kitchenNotes
        });

        if (outcome.success) {
            toast.success(outcome.message || 'Order ticket sent to printer.');
        } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED' || outcome.reasonCode === 'NOT_SUPPORTED') {
            toast.error('Order ticket printing is not available on this terminal.');
        } else {
            toast.error(outcome.message || 'Failed to print order ticket.');
        }
    }, [isFnbWorkflow, kitchenNotes, safeCart, normalizedFnbContext, normalizedTerminalId, orderMethod, posHardware, tableNumber]);

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

    const handleOpenDrawer = useCallback(({ transactionId = null } = {}) => {
        if (!activeShiftId) {
            toast.error('Open a shift first before opening the cash drawer.');
            return;
        }
        setDrawerAuthorizationContext({ transactionId });
        setDrawerAuthorizationReason('');
        setDrawerAuthorizationPin('');
        setDrawerAuthorizationModalOpen(true);
    }, [activeShiftId]);

    const drawerAdminBypass = terminalUser?.is_master_admin === true
        || ['admin', 'manager'].includes(String(terminalUser?.role || '').trim().toLowerCase());

    const submitDrawerAuthorization = useCallback(async () => {
        const reason = String(drawerAuthorizationReason || '').trim();
        if (reason.length < 3) {
            toast.error('Enter a reason before opening the cash drawer.');
            return;
        }
        if (!drawerAdminBypass && !/^[0-9]{4,12}$/.test(String(drawerAuthorizationPin || '').trim())) {
            toast.error('Enter your 4–12 digit POS PIN before opening the cash drawer.');
            return;
        }
        if (!activeShiftId) {
            toast.error('Open a shift first before opening the cash drawer.');
            return;
        }

        const idempotencyKey = createIdempotencyKey();
        setDrawerAuthorizationSubmitting(true);
        setDrawerOpening(true);
        try {
            const authorization = await authorizePosDrawerOpen({
                idempotency_key: idempotencyKey,
                shift_id: activeShiftId,
                transaction_id: drawerAuthorizationContext.transactionId || undefined,
                terminal_id: normalizedTerminalId || undefined,
                reason,
                authorization_pin: drawerAdminBypass ? undefined : String(drawerAuthorizationPin).trim()
            });
            const outcome = await posHardware.openDrawer({
                shiftId: activeShiftId,
                transactionId: drawerAuthorizationContext.transactionId || null,
                terminalId: normalizedTerminalId || undefined,
                reason,
                idempotencyKey,
                drawerAuthorizationToken: authorization?.authorization_token
            });

            if (outcome.success) {
                setDrawerAuthorizationModalOpen(false);
                toast.success(outcome.message || 'Cash drawer opened.');
            } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED') {
                toast.message(outcome.message || 'No cash drawer is configured for this terminal.');
            } else {
                toast.error(outcome.message || 'Failed to open the cash drawer.');
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Cash drawer authorization failed.');
        } finally {
            setDrawerAuthorizationSubmitting(false);
            setDrawerOpening(false);
        }
    }, [activeShiftId, drawerAdminBypass, drawerAuthorizationContext.transactionId, drawerAuthorizationPin, drawerAuthorizationReason, normalizedTerminalId, posHardware]);

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
            {currentViewMode === 'checkout'
                && !sessionLocked
                && posPresentationBundle.currentSaleActions.showParkedSaleControls
                && headerParkedSalesHistorySlot
                && createPortal(
                    <button
                        type="button"
                        data-testid="pos-header-parked-sales-history-button"
                        onClick={openParkedSalesHistory}
                        disabled={!canViewHistory || !activeShiftId || !normalizedTerminalId}
                        className="inline-flex h-full w-full items-center justify-center rounded-xl text-[#1A4E8D] transition-colors hover:bg-blue-50 hover:text-[#143F73] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Open parked sales history"
                        title="Open parked sales history"
                    >
                        <CarTaxiFront className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden="true" />
                        <span className="sr-only">Open parked sales history</span>
                    </button>,
                    headerParkedSalesHistorySlot
                )}
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
                    <div className={`${isTabletViewport ? 'flex-row items-center' : 'flex-wrap items-center sm:flex-nowrap'} flex min-w-0 flex-1 gap-3 max-sm:relative`}>
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
                        <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-[13px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 max-sm:hidden">
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
                            <div className="flex shrink-0">
                                <Suspense fallback={(
                                    <button
                                        type="button"
                                        disabled
                                        className="flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-bold text-slate-400"
                                    >
                                        Scan
                                    </button>
                                )}>
                                    <POSBarcodeScanner
                                        sessionLocked={sessionLocked}
                                        selectedLocationId={selectedLocationId}
                                        terminalId={normalizedTerminalId}
                                        onAddToCart={addToCart}
                                        className="w-auto"
                                    />
                                </Suspense>
                            </div>
                        ) : (
                            <>
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
                <div
                    ref={folderStripRef}
                    className="mb-4 flex cursor-grab items-center gap-2 overflow-x-auto pb-1 pt-0.5 dgfy-pos-scrollbar-hidden"
                    onPointerDown={handleFolderStripPointerDown}
                    onPointerMove={handleFolderStripPointerMove}
                    onPointerUp={handleFolderStripPointerEnd}
                    onPointerCancel={handleFolderStripPointerEnd}
                    onClickCapture={handleFolderStripClickCapture}
                    onWheel={handleFolderStripWheel}
                >
                    <button
                        type="button"
                        onClick={() => setSelectedFolderId(null)}
                        className={`${folderButtonClassName} ${
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
                                className={`${folderButtonClassName} ${
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
                {posFoldersLoading && (
                    <span className="sr-only" role="status">Loading POS categories...</span>
                )}
                {!posFoldersLoading && posFoldersError && (
                    <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        <span>{posFoldersError}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-[11px]"
                            onClick={loadPosFolders}
                        >
                            Retry categories
                        </Button>
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
                        <p role="status" className="sr-only">
                            Refreshing catalog...
                        </p>
                    )}
                    <div
                        ref={catalogGridRef}
                        className={catalogGridClassName}
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
                                src: posImageSrc
                            } = imageSources;
                            const hasImage = Boolean(posImageSrc) && !catalogImageErrors.has(item.item_id);
                            const cartQuantityForItem = safeCart
                                .filter((line) => line.item_id === item.item_id)
                                .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
                            const isEditingThisQuantity = editingQuantityItemId === item.item_id;
                            const isLoadingServiceOptions = serviceOptionsLoadingItemId === Number(item.item_id);
                            const stockColorClassName = getCatalogStockColorClassName(item, lowStockDisplayThreshold);
                            return (
                                <div
                                    key={item.item_id}
                                    data-pos-catalog-card="true"
                                    onClick={async (event) => {
                                        if (isOutOfStock || posActionsBlocked || isLoadingServiceOptions) {
                                            if (posActionsBlocked) notifyPosActionBlocked();
                                            return;
                                        }
                                        const addedDirectly = await addCatalogItemToCart(item);
                                        if (addedDirectly) flyImageToCheckoutBar(event.currentTarget);
                                    }}
                                    onKeyDown={async (event) => {
                                        if (isOutOfStock || posActionsBlocked || isLoadingServiceOptions) return;
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            const addedDirectly = await addCatalogItemToCart(item);
                                            if (addedDirectly) flyImageToCheckoutBar(event.currentTarget);
                                        }
                                    }}
                                    role={isOutOfStock || posActionsBlocked || isLoadingServiceOptions ? 'group' : 'button'}
                                    tabIndex={isOutOfStock || posActionsBlocked || isLoadingServiceOptions ? -1 : 0}
                                    aria-disabled={isOutOfStock || posActionsBlocked || isLoadingServiceOptions}
                                    aria-label={item.name}
                                    className={`${catalogCardClassName} ${
                                        isOutOfStock || posActionsBlocked || isLoadingServiceOptions
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
                                                    if (advanceAssetImageFallback(event, [largePosImageSrc])) return;
                                                    setCatalogImageErrors((previous) => {
                                                        const next = new Set(previous);
                                                        next.add(item.item_id);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-center">
                                                {isLoadingServiceOptions ? (
                                                    <span className="px-2 text-xs font-semibold text-[#64748B]">Loading options…</span>
                                                ) : null}
                                            </div>
                                        )}
                                        {isOutOfStock && (
                                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-rose-200 bg-rose-50/95 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                                                Out of stock
                                            </span>
                                        )}
                                        {IS_DGFY_POS_SURFACE && (
                                            <>
                                                <div className="absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)]">
                                                    <CatalogItemBadges
                                                        isServiceItem={isServiceItem}
                                                        isAlwaysAvailable={isAlwaysAvailable}
                                                        isBestSeller={isBestSeller}
                                                        overlay
                                                    />
                                                </div>
                                                <div className={`absolute inset-0 flex items-center justify-center px-2 py-1.5 ${hasImage ? 'bg-transparent' : 'bg-[#1A4E8D]/85'}`}>
                                                    <p className="min-w-0 text-center text-[14px] font-black leading-tight text-white line-clamp-2 drop-shadow-sm">
                                                        {item.name}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5 p-2.5 sm:hidden">
                                    {!IS_DGFY_POS_SURFACE && (
                                        <p className={`min-w-0 text-[13px] font-black leading-tight ${stockColorClassName}`}>{item.name}</p>
                                    )}
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
                                {!IS_DGFY_POS_SURFACE && (
                                    <>
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
                        className="mt-auto shrink-0 border-t border-slate-200 bg-slate-50/80 px-1 py-1.5 supports-[backdrop-filter]:bg-white/80"
                    >
                            <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
                                <div className="text-center sm:text-left">
                                    <p className="text-[11px] font-semibold text-[#334155]">
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
                            data-testid="pos-clear-current-sale"
                            onClick={openClearCurrentSale}
                            disabled={posActionsBlocked || safeCart.length === 0 || Boolean(activeParkedSale?.pos_parked_sale_id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Clear all items from current sale"
                            title={activeParkedSale?.pos_parked_sale_id ? 'Finish or cancel the active parked sale first' : 'Clear current sale'}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
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
                    {activeParkedSale?.pos_parked_sale_id && (
                        <div
                            data-testid="pos-active-parked-sale"
                            className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900"
                        >
                            Editing {formatParkedSaleDisplayName(activeParkedSale)} · changes will update this same parked sale
                        </div>
                    )}
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
                                <div
                                    key={lineKey}
                                    role="button"
                                    tabIndex={sessionLocked ? -1 : 0}
                                    aria-disabled={sessionLocked}
                                    aria-label={`Customize ${line.item_name}`}
                                    data-testid={`pos-item-options-trigger-${lineKey}`}
                                    onClick={() => {
                                        if (!sessionLocked) setItemOptionsLineKey(lineKey);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.target !== event.currentTarget) return;
                                        if ((event.key === 'Enter' || event.key === ' ') && !sessionLocked) {
                                            event.preventDefault();
                                            setItemOptionsLineKey(lineKey);
                                        }
                                    }}
                                    className="cursor-pointer rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex min-w-0 items-center gap-2.5 text-left">
                                                <span className="min-w-0">
                                                    <span className="block truncate text-[13px] font-extrabold text-[#0F172A]">{line.item_name}</span>
                                                    <span className="mt-0.5 block text-[10px] font-bold text-blue-700">Tap item to customize</span>
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                {Array.isArray(line.service_option_details) && line.service_option_details.length > 0 ? (
                                                    <p className="mt-0.5 truncate text-[10px] font-semibold text-blue-700">
                                                        Options: {line.service_option_details.map((option) => option.name).filter(Boolean).join(', ')}
                                                    </p>
                                                ) : null}
                                                {line.special_instructions ? (
                                                    <p className="mt-1 max-w-full truncate text-[10px] font-semibold text-slate-600">
                                                        Note: {line.special_instructions}
                                                    </p>
                                                ) : null}
                                                {line.item_discount ? (
                                                    <p className="mt-1 max-w-full truncate text-[10px] font-extrabold text-rose-600">
                                                        {(line.item_discount.discount_type === 'pwd'
                                                            ? 'PWD discount'
                                                            : line.item_discount.discount_type === 'senior'
                                                                ? 'Senior discount'
                                                                : line.item_discount.discount_type === 'promo'
                                                                    ? 'Promo discount'
                                                                    : line.item_discount.discount_type === 'employee'
                                                                        ? 'Employee discount'
                                                                    : 'Other discount')}: {line.item_discount.discount_type === 'promo'
                                                            ? 'configured rate'
                                                            : line.item_discount.method === 'fixed'
                                                            ? `-PHP ${money(line.item_discount.amount)}`
                                                            : `-${money(line.item_discount.rate)}%`}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                removeCartLine(lineKey);
                                            }}
                                            disabled={posActionsBlocked}
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                            aria-label={`Remove ${line.item_name}`}
                                            title="Remove item"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div
                                        className="mt-2 grid grid-cols-2 gap-2"
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                    >
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
                            <span className="text-[13px] text-[#334155]">Items Subtotal</span>
                            <span className="text-[13px] font-extrabold text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Item discount
                            </span>
                            <span className="font-extrabold text-rose-600">- PHP {money(itemDiscountTotals.discountAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Global discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}
                            </span>
                            <span className="font-extrabold text-rose-600">- PHP {money(globalDiscountAmount)}</span>
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
                            <span className="text-[18px] font-black text-[#0F172A]">Total</span>
                            <span className="text-[18px] font-black text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                        </div>
                    </div>

                    <div data-testid="pos-current-sale-desktop-summary" className="hidden gap-y-0.5 md:grid">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[13px] text-[#334155]">Items Subtotal</span>
                            <span className="whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Net Items</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">PHP {money(netItemsTotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Item discount</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(itemDiscountTotals.discountAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Global discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(globalDiscountAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Total discounts</span>
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
                            <span className="text-[18px] font-black text-[#0F172A]">Total</span>
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

                {!posHardware.loading && !isPrinterAvailable && (
                    <div className="shrink-0 border-t border-slate-200 pt-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">
                            <span>No printer detected on this device.</span>
                            <button
                                type="button"
                                onClick={() => posHardware.refresh()}
                                disabled={posHardware.loading}
                                className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Recheck printer
                            </button>
                        </div>
                    </div>
                )}

                {Number(universalPendingSyncCount || 0) > 0 && (
                    <div
                        className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-2"
                        data-testid="pos-pending-sync-banner"
                    >
                        <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-semibold leading-5 text-blue-900">
                            {Number(universalPendingSyncCount)} pending POS record{Number(universalPendingSyncCount) === 1 ? '' : 's'} waiting to sync. Reconnect, then press Sync.
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleManualUniversalSync}
                            disabled={sessionLocked || manualSyncPolicy?.remaining <= 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)}
                            className="shrink-0 border-blue-300 bg-white text-[11px] font-extrabold text-blue-800 hover:bg-blue-100"
                        >
                            Sync
                        </Button>
                    </div>
                )}

                <Suspense fallback={<div className="h-[46px] w-full animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />}>
                    <PosCurrentSaleActions
                        presentationBundle={posPresentationBundle}
                        onParkAndNewSale={openParkSaleNameDialog}
                        parkSaleDisabled={posActionsBlocked || checkoutLoading || parkLoading || safeCart.length === 0 || !activeShiftId || !normalizedTerminalId}
                        parkLoading={parkLoading}
                        activeParkedSale={activeParkedSale}
                        onCheckout={openCheckoutConfirmModal}
                        checkoutDisabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                        checkoutLoading={checkoutLoading}
                        itemCount={safeCart.length}
                        onPrintOrder={handlePrintOrder}
                        printOrderDisabled={posActionsBlocked || safeCart.length === 0 || !isPrinterAvailable}
                        printerAvailable={isPrinterAvailable}
                        onOpenCashDrawer={() => handleOpenDrawer({
                            transactionId: Number(lastReceipt?.pos_transaction_id) || null,
                            reason: 'manual_drawer_panel'
                        })}
                        cashDrawerDisabled={!activeShiftId || drawerOpening || drawerAuthorizationModalOpen}
                        drawerOpening={drawerOpening}
                        showParkedSaleControls={posPresentationBundle.currentSaleActions.showParkedSaleControls}
                        onParkSale={openParkSaleNameDialog}
                        parkSaleLoading={parkLoading}
                        parkSaleLabel={activeParkedSale ? 'Update Parked Sale' : 'Park Sale'}
                        onSplitPayment={openSplitPaymentModal}
                        splitPaymentDisabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || isEmployeeCreditPayment}
                        splitPaymentLoading={checkoutLoading}
                        tabletLayout={isTabletViewport}
                    />
                </Suspense>
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
                                data-testid="pos-receipt-open-pos-report"
                                onClick={openInPosReport}
                            >
                                {posReportActionLabel}
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
                                    mobileResponsive
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

            <div data-testid="pos-split-payment-modal-host">
                <Suspense fallback={null}>
                    <POSSplitPaymentWorkflow
                        key={splitPaymentWorkflowVersion}
                        open={splitPaymentDialogOpen}
                        onOpenChange={handleSplitPaymentOpenChange}
                        cart={safeCart}
                        catalog={safeCatalog}
                        subtotalAmount={cartSubtotal}
                        totalAmount={cartTotal}
                        shiftId={activeShiftId}
                        locationId={selectedLocationId}
                        terminalId={normalizedTerminalId}
                        parkedSaleId={activeParkedSale?.pos_parked_sale_id || null}
                        storageScopeKey={splitPaymentStorageScopeKey}
                        isMsmeMode={isMsmeMode}
                        checkoutContext={splitPaymentCheckoutContext}
                        onSessionStateChange={handleSplitPaymentSessionStateChange}
                        onReadyToComplete={handleCompletePreparedSplitPayment}
                    />
                </Suspense>
            </div>

            <Dialog
                open={drawerAuthorizationModalOpen}
                onOpenChange={(nextOpen) => {
                    if (!drawerAuthorizationSubmitting) setDrawerAuthorizationModalOpen(nextOpen);
                }}
            >
                <DialogContent
                    className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
                    data-testid="pos-drawer-authorization-dialog"
                >
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                        <DialogTitle className="text-lg font-black text-slate-900">Open Cash Drawer</DialogTitle>
                        <DialogDescription className="text-sm leading-5 text-slate-600">
                            Enter the reason and authorize this drawer opening before the terminal sends the hardware command.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        <div>
                            <label htmlFor="pos-drawer-open-reason" className="text-xs font-extrabold text-slate-700">Reason <span className="text-rose-600">*</span></label>
                            <Input
                                id="pos-drawer-open-reason"
                                data-testid="pos-drawer-open-reason"
                                value={drawerAuthorizationReason}
                                onChange={(event) => setDrawerAuthorizationReason(event.target.value)}
                                placeholder="e.g. Cash change for customer"
                                maxLength={255}
                                disabled={drawerAuthorizationSubmitting}
                                className="mt-1"
                            />
                        </div>
                        {drawerAdminBypass ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800" role="status">
                                Admin bypass is enabled for your account. A reason is still required and this action will be recorded in the audit history.
                            </div>
                        ) : (
                            <div>
                                <label htmlFor="pos-drawer-open-pin" className="text-xs font-extrabold text-slate-700">Cashier POS PIN <span className="text-rose-600">*</span></label>
                                <Input
                                    id="pos-drawer-open-pin"
                                    data-testid="pos-drawer-open-pin"
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={drawerAuthorizationPin}
                                    onChange={(event) => setDrawerAuthorizationPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                                    placeholder="Enter your POS PIN"
                                    maxLength={12}
                                    disabled={drawerAuthorizationSubmitting}
                                    className="mt-1"
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDrawerAuthorizationModalOpen(false)}
                            disabled={drawerAuthorizationSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={submitDrawerAuthorization}
                            disabled={drawerAuthorizationSubmitting}
                            className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                            data-testid="pos-drawer-authorize-submit"
                        >
                            {drawerAuthorizationSubmitting ? 'Authorizing…' : 'Authorize & Open Drawer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={discountModalOpen} onOpenChange={(nextOpen) => (nextOpen ? setDiscountModalOpen(true) : closeDiscountModal())}>
                <DialogContent className="relative flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full">
                    <button
                        type="button"
                        onClick={closeDiscountModal}
                        className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        aria-label="Close discount modal"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3 pr-12 text-left">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                                <Tag className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <DialogTitle className="text-[17px] font-black text-[#0F172A]">Apply Discount</DialogTitle>
                                <DialogDescription className="mt-0.5 text-[12px] font-medium text-[#475569]">Select discount type and verify employee.</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                        <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="Discount Type">
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
                                        className={`flex min-h-[62px] flex-col items-center justify-center gap-0.5 rounded-lg border p-1 text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                                            active
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-extrabold shadow-sm'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-slate-50'
                                        }`}
                                        onClick={() => setDiscountDraft((previous) => ({
                                            ...previous,
                                            type: option.value,
                                            rate: option.value === 'employee'
                                                ? '15'
                                                : (['senior', 'pwd'].includes(option.value) ? '20' : previous.rate)
                                        }))}
                                    >
                                        <TypeIcon className={`h-5 w-5 shrink-0 transition-colors ${active ? 'text-emerald-600' : 'text-slate-600'}`} aria-hidden="true" />
                                        <span className="w-full whitespace-normal text-center leading-tight">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div id="discount-type-panel" role="tabpanel" className="space-y-3">
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                {discountDraft.type !== 'employee' && (
                                    <div className={`space-y-1 ${['senior', 'pwd', 'promo'].includes(discountDraft.type) ? 'col-span-1' : 'col-span-2'}`}>
                                        <label className="text-xs font-semibold text-[#0F172A]">Customer Name <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input
                                                className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
                                                placeholder="Enter customer name"
                                                value={discountDraft.customer_name}
                                                onChange={(e) => setDiscountDraft((p) => ({ ...p, customer_name: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {['senior', 'pwd'].includes(discountDraft.type) && (
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Senior/PWD ID Number <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter ID number" value={discountDraft.id_number} onChange={(e) => setDiscountDraft((p) => ({ ...p, id_number: e.target.value }))} />
                                        </div>
                                    </div>
                                )}

                                {discountDraft.type === 'promo' && (
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Promo Code <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input
                                                className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
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
                                <div className="grid gap-2.5 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Employee Name <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Employee name" value={discountDraft.employee_name} onChange={(e) => setDiscountDraft((p) => ({ ...p, employee_name: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Employee ID <span className="font-medium text-slate-400">(optional)</span></label>
                                        <div className="relative">
                                            <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Employee ID" value={discountDraft.employee_id} onChange={(e) => setDiscountDraft((p) => ({ ...p, employee_id: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {discountDraft.type === 'manual' && (
                                <div className="grid gap-2.5 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Method <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <select
                                                value={discountDraft.method}
                                                onChange={(e) => setDiscountDraft((p) => ({ ...p, method: e.target.value }))}
                                                className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
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
                                                className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
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
                                <div className="text-[11px] font-medium text-[#64748B] -mt-1">
                                    Enter a valid promo or campaign code
                                </div>
                            )}

                            {discountDraft.type === 'manual' && (
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#0F172A]">Reason <span className="text-[11px] font-medium text-slate-400">(optional)</span></label>
                                    <div className="relative">
                                        <MessageSquare className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                        <Input className="h-9 rounded-lg border-slate-200 pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter other discount reason (optional)" value={discountDraft.reason} onChange={(e) => setDiscountDraft((p) => ({ ...p, reason: e.target.value }))} />
                                    </div>
                                </div>
                            )}
                            {discountDraft.type && (
                                <div className="grid gap-2.5 sm:grid-cols-2">
                                    {discountDraft.type === 'employee' && (
                                        <div className="space-y-1 sm:col-span-1">
                                            <label className="text-xs font-semibold text-[#0F172A]">Discount Rate <span className="text-rose-500">*</span></label>
                                            <div className="relative">
                                                <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                                <select
                                                    value={discountDraft.rate}
                                                    onChange={(event) => setDiscountDraft((previous) => ({ ...previous, rate: event.target.value, method: 'percentage' }))}
                                                    className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                                                    aria-label="Discount Rate"
                                                >
                                                    {employeeDiscountRateOptions.map((rate) => (
                                                        <option key={rate} value={rate}>{rate}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-1 sm:col-span-1">
                                        <label className="text-xs font-semibold text-[#0F172A]">Authorizing employee <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <BadgeCheck className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <select autoComplete="off" value={discountDraft.approver_user_id} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, approver_user_id: event.target.value }))} disabled={discountApproversLoading} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
                                                <option value="">{discountApproversLoading ? 'Loading authorized employees...' : 'Select authorized employee'}</option>
                                                {safeDiscountApprovers.map((approver) => <option key={approver.user_id} value={approver.user_id} disabled={approver.pos_approval_pin_configured !== true}>{approver.username} ({approver.role}){approver.pos_approval_pin_configured === true ? '' : ' — PIN not configured'}</option>)}
                                            </select>
                                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                        </div>
                                        {!discountApproversLoading && safeDiscountApprovers.length === 0 && <p className="text-xs font-medium text-amber-700 mt-1">No authorized employees are configured. Ask an administrator to grant discount authorization.</p>}
                                        {!discountApproversLoading && safeDiscountApprovers.length > 0 && !safeDiscountApprovers.some((approver) => approver.pos_approval_pin_configured === true) && <p className="text-xs font-medium text-amber-700 mt-1">Authorized employees are listed, but each needs a POS approval PIN before they can approve a discount.</p>}
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                        <label className="text-xs font-semibold text-[#0F172A]">Employee PIN <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                            <Input name="pos_discount_approval_pin" autoComplete="one-time-code" autoCorrect="off" spellCheck={false} data-1p-ignore="true" data-lpignore="true" data-bwignore="true" style={{ WebkitTextSecurity: showDiscountPin ? 'none' : 'disc' }} className="h-9 rounded-lg border-slate-200 pl-8 pr-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500" placeholder="Enter employee PIN" type="text" inputMode="numeric" value={discountDraft.manager_pin} onChange={(e) => setDiscountDraft((p) => ({ ...p, manager_pin: e.target.value }))} />
                                            <button type="button" onClick={() => setShowDiscountPin((prev) => !prev)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" aria-label={showDiscountPin ? 'Hide employee PIN' : 'Show employee PIN'}>
                                                {showDiscountPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-center sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
                            <div className="space-y-0.5 px-2 py-2.5">
                                <span className="block text-[10px] font-semibold text-slate-500">VAT Removed</span>
                                <span className="block text-sm font-bold tabular-nums text-slate-800">PHP {money(discountPreviewTotals.vatRemoved)}</span>
                            </div>
                            <div className="space-y-0.5 border-t border-slate-200 px-2 py-2.5 sm:border-t-0">
                                <span className="block text-[10px] font-semibold text-slate-500">Discount</span>
                                <span className="block text-sm font-bold tabular-nums text-slate-800">- PHP {money(discountPreviewTotals.discountAmount)}</span>
                            </div>
                            <div className="space-y-0.5 border-t border-slate-200 bg-emerald-50/60 px-2 py-2.5 sm:border-t-0">
                                <span className="block text-[10px] font-semibold text-slate-500">Total Amount Due</span>
                                <span className="block text-base font-black tabular-nums text-emerald-700">PHP {money(discountPreviewTotals.total)}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-lg border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors sm:min-w-28"
                            onClick={closeDiscountModal}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="h-9 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 transition-colors flex items-center justify-center sm:min-w-40"
                            onClick={handleApplyGovernedDiscount}
                            disabled={discountApplying}
                        >
                            <Tag className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {discountApplying ? 'Verifying...' : 'Apply Discount'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={checkoutConfirmModalOpen}
                onOpenChange={(nextOpen) => {
                    if (nextOpen) {
                        setCheckoutConfirmModalOpen(true);
                        return;
                    }
                    void handleCancelCheckout();
                }}
            >
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
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelCheckout}
                                disabled={checkoutLoading || splitPaymentCancelLoading || parkedSaleReleaseLoading}
                                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none disabled:opacity-50"
                                aria-label="Close checkout confirmation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </DialogHeader>

                    <div className="pos-modal-scroll-content min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" data-testid="pos-checkout-order-settings">
                            <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />}>
                                <PosCheckoutDetailsSlot
                                    presentationBundle={posPresentationBundle}
                                    posWorkflow={posWorkflow}
                                    orderMethod={orderMethod}
                                    setOrderMethod={setOrderMethod}
                                    tableNumber={tableNumber}
                                    setTableNumber={setTableNumber}
                                    kitchenNotes={kitchenNotes}
                                    setKitchenNotes={setKitchenNotes}
                                    servicesClientName={servicesClientName}
                                    setServicesClientName={setServicesClientName}
                                    servicesDateTime={servicesDateTime}
                                    setServicesDateTime={setServicesDateTime}
                                    servicesProvider={servicesProvider}
                                    setServicesProvider={setServicesProvider}
                                    servicesResource={servicesResource}
                                    setServicesResource={setServicesResource}
                                    servicesNotes={servicesNotes}
                                    setServicesNotes={setServicesNotes}
                                    paymentTypeField={!hasSplitPaymentSummary ? (
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
                                    ) : null}
                                    disabled={posActionsBlocked || checkoutLoading}
                                />
                            </Suspense>
                        </div>

                        {hasSplitPaymentSummary && (
                            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid="pos-checkout-split-payment-summary">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-wide text-[#1A4E8D]">Payment Summary</p>
                                    <p className="mt-1 text-xs font-medium text-slate-600">Payment methods received for this sale.</p>
                                </div>
                                <div className="space-y-2" data-testid="pos-checkout-split-payment-methods">
                                    {splitPaymentSummaryAllocations.map((allocation, index) => {
                                        const paymentMethod = String(allocation?.payment_method || '').trim().toLowerCase();
                                        const appliedAmount = round4(allocation?.applied_amount);
                                        const cashTendered = round4(allocation?.cash_tendered ?? appliedAmount);
                                        const displayedAmount = paymentMethod === 'cash' ? cashTendered : appliedAmount;
                                        const cashChange = round4(allocation?.change_amount);
                                        const hasCashAdjustment = paymentMethod === 'cash' && cashTendered !== appliedAmount;
                                        return (
                                            <div key={`${paymentMethod || 'payment'}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2" data-testid={`pos-checkout-split-payment-method-${index + 1}`}>
                                                <div className="flex items-center justify-between gap-3 text-sm">
                                                    <span className="font-extrabold text-slate-800">{formatSplitPaymentMethod(paymentMethod)}</span>
                                                    <span className="font-black text-[#1A4E8D]">PHP {money(displayedAmount)}</span>
                                                </div>
                                                {hasCashAdjustment && (
                                                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                                        Applied PHP {money(appliedAmount)} · Change PHP {money(cashChange)}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-3 gap-2" data-testid="pos-checkout-split-payment-totals">
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Paid</p>
                                        <p className="mt-1 text-sm font-black text-emerald-800">PHP {money(splitPaymentSummaryPaidAmount)}</p>
                                    </div>
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Remaining</p>
                                        <p className="mt-1 text-sm font-black text-amber-800">PHP {money(splitPaymentSummaryRemainingAmount)}</p>
                                    </div>
                                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2" data-testid="pos-checkout-split-payment-change">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Change</p>
                                        <p className="mt-1 text-sm font-black text-sky-800">PHP {money(splitPaymentSummaryChangeAmount)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="pos-checkout-sale-summary">
                            <p className="text-[11px] font-black uppercase tracking-wide text-[#64748B]">Sale Summary</p>
                            <div className="mt-2 space-y-2 text-[13px]">
                                <div className="flex justify-between gap-3">
                                    <span className="text-[#334155]">Total Sales (before discount)</span>
                                    <span className="font-extrabold tabular-nums text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                                </div>
                                <div className="flex items-start justify-between gap-3" data-testid="pos-checkout-discount-summary">
                                    <div className="min-w-0">
                                        <span className="block truncate text-[#334155]">
                                            Discount{calculatedDiscountAmount > 0 && checkoutDiscountLabel ? ` (${checkoutDiscountLabel})` : ''}
                                        </span>
                                        {calculatedDiscountAmount > 0 && <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Applied to this sale</span>}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className={`font-extrabold tabular-nums ${calculatedDiscountAmount > 0 ? 'text-rose-600' : 'text-[#0F172A]'}`}>
                                            {calculatedDiscountAmount > 0 ? `-PHP ${money(calculatedDiscountAmount)}` : 'PHP 0.00'}
                                        </span>
                                        {calculatedDiscountAmount > 0 ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openDiscountModal({ returnToCheckout: true })}
                                                    disabled={checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                                    className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] font-bold text-[#1A4E8D] transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                    aria-label={`Edit ${checkoutDiscountLabel}`}
                                                    title={splitPaymentDialogOpen || hasSplitPaymentSummary ? 'Finish or cancel the active payment first' : 'Edit discount'}
                                                    data-testid="pos-edit-checkout-discount"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={clearAppliedDiscount}
                                                    disabled={checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                    aria-label={`Remove ${checkoutDiscountLabel}`}
                                                    title={splitPaymentDialogOpen || hasSplitPaymentSummary ? 'Finish or cancel the active payment first' : 'Remove discount'}
                                                    data-testid="pos-remove-checkout-discount"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                                {governedDiscountTotals.vatRemoved > 0 && (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-[#334155]">VAT Removed</span>
                                        <span className="font-extrabold tabular-nums text-rose-600">-PHP {money(governedDiscountTotals.vatRemoved)}</span>
                                    </div>
                                )}
                                {calculatedDiscountAmount === 0 && (
                                    <button
                                        type="button"
                                        onClick={() => openDiscountModal({ returnToCheckout: true })}
                                        disabled={checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-[11px] font-bold text-[#1A4E8D] transition-colors hover:border-[#1A4E8D] hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                                        data-testid="pos-checkout-add-discount"
                                    >
                                        <Tag className="h-3.5 w-3.5" />
                                        Add Discount
                                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                )}
                                <div className="border-t border-dashed border-slate-200 pt-2">
                                    <div className="flex justify-between gap-3">
                                        <span className="font-extrabold text-[#334155]">Total Due</span>
                                        <span className="font-black tabular-nums text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {isEmployeeCreditPayment && (
                            <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Loading employee credit...</div>}>
                                <EmployeeCreditPaymentPanel
                                    selectedEmployee={selectedEmployeeCreditOption}
                                    onSelectEmployee={handleSelectEmployeeCredit}
                                    lookupLoading={employeeCreditLookupLoading}
                                    account={employeeCreditAccount}
                                    totalDue={cartTotal}
                                    locationId={selectedLocationId}
                                />
                            </Suspense>
                        )}
                        {!isEmployeeCreditPayment && !splitPaymentReady && (
                            <div className="space-y-2" data-testid="pos-checkout-payment-summary">
                                <label htmlFor="pos-customer-payment-amount" className="block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                                    {customerPaymentFieldLabel}
                                </label>
                                {isCashPayment && (
                                    <div className="grid grid-cols-3 gap-2" data-testid="pos-cash-payment-suggestions">
                                        {CASH_PAYMENT_SUGGESTIONS.map((amount) => (
                                            <button
                                                key={amount}
                                                type="button"
                                                onClick={() => setCustomerPaymentAmountInput(String(amount))}
                                                disabled={checkoutLoading}
                                                className="h-8 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-extrabold text-[#1A4E8D] transition-colors hover:border-[#1A4E8D] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                data-testid={`pos-cash-payment-suggestion-${amount}`}
                                            >
                                                PHP {amount.toLocaleString('en-US')}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <Input
                                    id="pos-customer-payment-amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={customerPaymentAmountInput}
                                    onChange={(event) => setCustomerPaymentAmountInput(event.target.value)}
                                    onFocus={(event) => {
                                        if (event.currentTarget.value === '0') setCustomerPaymentAmountInput('');
                                    }}
                                    placeholder="0.00"
                                    className="mt-2 h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] font-extrabold text-[#0F172A] focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-blue-100"
                                />
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
                                    <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#64748B]">Payment Summary</p>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-[#334155]">Payment Method</span>
                                        <span className="font-bold text-[#1A4E8D]">{formatSplitPaymentMethod(paymentType)}</span>
                                    </div>
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
                            </div>
                        )}

                    </div>

                    <DialogFooter className="shrink-0 grid grid-cols-3 gap-2 border-t border-slate-200 px-4 py-3 bg-white">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleBillRequest}
                            disabled={posActionsBlocked || checkoutLoading || billRequestPrinting || splitPaymentCancelLoading || parkedSaleReleaseLoading || safeCart.length === 0 || !isPrinterAvailable}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                            title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                            data-testid="pos-bill-request-button"
                        >
                            {billRequestPrinting ? 'Printing…' : 'Bill Request'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePrintOrder}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isPrinterAvailable}
                            title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                            className="h-10 rounded-lg border border-[#1A4E8D] bg-white px-2 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Printer className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Print Order
                        </Button>
                        <Button
                            type="button"
                            onClick={splitPaymentReady ? () => handleCompletePreparedSplitPayment() : handleCheckout}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isCheckoutWorkflowValid || (!splitPaymentReady && !isCustomerPaymentSufficient)}
                            className="h-10 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#143F73] disabled:cursor-not-allowed disabled:bg-[#1A4E8D] disabled:opacity-60"
                        >
                            {checkoutLoading ? 'Processing...' : (splitPaymentReady ? 'Confirm Sale' : 'Confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={splitPaymentCancelModalOpen} onOpenChange={(nextOpen) => {
                if (splitPaymentCancelLoading) return;
                setSplitPaymentCancelModalOpen(nextOpen);
            }}>
                <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full" data-testid="pos-split-payment-cancel-dialog">
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                        <DialogTitle className="text-lg font-black text-slate-900">Cancel split payment?</DialogTitle>
                        <DialogDescription className="text-sm leading-5 text-slate-600">
                            This sale already has recorded payment. Keep it saved to resume later, or reverse the recorded allocations before starting a new checkout.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSplitPaymentCancelModalOpen(false)}
                            disabled={splitPaymentCancelLoading}
                            className="font-extrabold"
                        >
                            Back
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleKeepSplitPaymentAndClose}
                            disabled={splitPaymentCancelLoading}
                            className="font-extrabold text-[#1A4E8D]"
                        >
                            Keep Saved Payment
                        </Button>
                        <Button
                            type="button"
                            onClick={handleReverseSplitPaymentAndStartNew}
                            disabled={splitPaymentCancelLoading}
                            className="bg-rose-600 font-extrabold text-white hover:bg-rose-700"
                        >
                            {splitPaymentCancelLoading ? 'Reversing…' : 'Reverse & Start New'}
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
                                            mobileResponsive
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
                    <DialogFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 print:hidden">
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
                        <div className="ml-auto flex items-center gap-2">
                            {lastReceipt && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setReceiptPreviewSource(
                                        receiptPreviewSource === 'order_preview' ? 'receipt_preview' : 'order_preview'
                                    )}
                                    className="h-9 rounded-lg border border-[#1A4E8D] bg-white px-4 text-xs font-bold text-[#1A4E8D] hover:bg-blue-50"
                                >
                                    {receiptPreviewSource === 'order_preview' ? 'View Receipt' : 'Back to Order'}
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                data-testid="pos-receipt-modal-open-pos-report"
                                disabled={posActionsBlocked || !lastReceipt}
                                onClick={openInPosReport}
                            >
                                {posReportActionLabel}
                            </Button>
                            <Button
                                type="button"
                                disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync || !isPrinterAvailable}
                                title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                                onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}
                                className="h-9 rounded-lg bg-[#1A4E8D] px-4 text-xs font-bold text-white shadow-md shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
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

            {posPresentationBundle.currentSaleActions.showParkedSaleControls && parkedSalesDialogOpen && (
                <Suspense fallback={<div className="sr-only" role="status">Loading parked sales…</div>}>
                    <POSParkedSalesDialog
                        open
                        onOpenChange={setParkedSalesDialogOpen}
                        activeShiftId={activeShiftId}
                        selectedLocationId={selectedLocationId}
                        terminalId={normalizedTerminalId}
                        currentUserId={terminalUser?.user_id || terminalUser?.id || null}
                        cartHasItems={safeCart.length > 0}
                        canView={canViewHistory && !sessionLocked}
                        canTransact={!posActionsBlocked}
                        onBeforeClaim={validateParkedSaleForResume}
                        onClaimed={handleParkedSaleClaimed}
                        onCancelled={(cancelledSale) => {
                            if (Number(cancelledSale?.pos_parked_sale_id) !== Number(activeParkedSale?.pos_parked_sale_id)) return;
                            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
                            setActiveParkedSale(null);
                            resetCurrentSaleForNewSale();
                        }}
                    />
                </Suspense>
            )}
            <Dialog
                open={parkSaleNameDialogOpen}
                onOpenChange={(nextOpen) => {
                    if (parkLoading) return;
                    setParkSaleNameDialogOpen(nextOpen);
                }}
            >
                <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full" data-testid="pos-park-sale-name-dialog">
                    <form
                        className="flex flex-col"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (parkLoading || !parkSaleNameInput.trim()) return;
                            handleParkAndNewSale();
                        }}
                    >
                        <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                            <DialogTitle className="text-lg font-black text-slate-900">Name Parked Sale</DialogTitle>
                            <DialogDescription className="text-sm text-slate-600">
                                Enter the customer or order name so staff know who this parked sale belongs to.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="px-5 py-4">
                            <label className="block text-xs font-bold text-slate-700" htmlFor="parked-sale-name">
                                Customer / Order Name <span className="text-rose-600">*</span>
                            </label>
                            <Input
                                id="parked-sale-name"
                                value={parkSaleNameInput}
                                onChange={(event) => setParkSaleNameInput(event.target.value)}
                                maxLength={100}
                                autoFocus
                                disabled={parkLoading}
                                placeholder="e.g., Maria Santos or Table 4"
                                className="mt-2 h-11"
                                data-testid="pos-park-sale-name-input"
                            />
                            <p className="mt-1.5 text-right text-[11px] text-slate-500">{parkSaleNameInput.length}/100</p>
                        </div>
                        <DialogFooter className="border-t border-slate-200 px-5 py-4 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setParkSaleNameDialogOpen(false)}
                                disabled={parkLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={parkLoading || !parkSaleNameInput.trim()}
                                className="bg-[#1A4E8D] hover:bg-[#143F73]"
                                data-testid="pos-confirm-park-sale"
                            >
                                {parkLoading ? 'Parking Sale…' : 'Park'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={clearSaleConfirmOpen}
                onOpenChange={setClearSaleConfirmOpen}
            >
                <DialogContent
                    className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
                    data-testid="pos-clear-current-sale-dialog"
                >
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                        <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
                            <Trash2 className="h-5 w-5 text-rose-600" />
                            Clear current sale?
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-600">
                            This removes all items and unsaved sale details from the current sale. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="border-t border-slate-200 px-5 py-4 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setClearSaleConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={confirmClearCurrentSale}
                            className="bg-rose-600 text-white hover:bg-rose-700"
                            data-testid="pos-confirm-clear-current-sale"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Clear sale
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ServiceOptionsModal
                key={`${serviceOptionsModal.open ? 'open' : 'closed'}:${serviceOptionsModal.item?.item_id || 'none'}`}
                open={serviceOptionsModal.open}
                onOpenChange={(open) => {
                    if (!open) setServiceOptionsModal({ open: false, item: null, groups: [] });
                }}
                serviceItem={serviceOptionsModal.item}
                optionGroups={serviceOptionsModal.groups}
                onConfirmOptions={handleConfirmServiceOptions}
            />
            {itemOptionsLineKey && (
                <Suspense fallback={<div className="sr-only" role="status">Loading item options…</div>}>
                    <ItemOptionsDialog
                        key={itemOptionsLineKey}
                        open
                        line={itemOptionsLine}
                        locationId={selectedLocationId}
                        itemDiscount={itemOptionsItemDiscount}
                        globalDiscount={itemOptionsGlobalDiscount}
                        discountApprovers={safeDiscountApprovers}
                        discountApproversLoading={discountApproversLoading}
                        defaultDiscountApprover={activeShiftCashierApprover}
                        onClose={() => setItemOptionsLineKey(null)}
                        onSave={saveItemOptions}
                    />
                </Suspense>
            )}
            {billRequestDraft && (
                <Suspense fallback={<div className="sr-only" role="status">Loading bill request…</div>}>
                    <BillRequestDialog
                        open
                        draft={billRequestDraft}
                        onClose={() => setBillRequestDraft(null)}
                    />
                </Suspense>
            )}

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
            {addToCartToasts.length > 0 && (
                <Suspense fallback={null}>
                    <PosAddToCartToastContainer toasts={addToCartToasts} onDismiss={handleDismissToast} />
                </Suspense>
            )}
        </div>
    );
}
