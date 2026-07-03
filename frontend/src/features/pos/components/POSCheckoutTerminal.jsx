import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Delete,
    Filter,
    Folder,
    Gauge,
    Lock,
    Minus,
    Plus,
    Printer,
    Search,
    X
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
import { toast } from 'sonner';
import {
    fetchPosCatalog,
    createPosCheckout,
    closePosDay,
    fetchPosTransactions,
    fetchPosTransactionById,
    fetchPosDeviceStatus,
    printPosReceipt,
    openPosDeviceDrawer
} from '../services/posService';
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
import { getFolders } from '@/services/itemService.js';
import { getAllSettings, verifyPosSettingsAccessPin } from '@/services/settingsService';
import { resolveAppAssetUrl, resolveAssetUrl } from '@/src/utils/assetUrl.js';
import { openSkupervisorPath } from '../utils/skupervisorHandoff.js';
import {
    notifyIminWebPosReady,
    openDrawerWithIminBridge,
    printOrderWithIminBridge,
    printReceiptWithIminBridge
} from '../utils/iminHardwareBridge.js';

const ReceiptPrintView = lazy(() => import('./ReceiptPrintView'));
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
const EMPTY_DISCOUNT_DRAFT = {
    type: 'senior', method: 'percentage', rate: '20', amount: '', customer_name: '',
    id_number: '', employee_name: '', employee_id: '', reason: '', manager_pin: '', eligible_item_ids: []
};
const calculateGovernedDiscount = (cart, application) => {
    const subtotal = round4(cart.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.sale_price || 0), 0));
    if (!application) return { vatRemoved: 0, vatExemptAmount: 0, discountAmount: 0, total: subtotal };
    const statutory = application.type === 'senior' || application.type === 'pwd';
    if (!statutory) {
        const discountAmount = application.method === 'fixed'
            ? Math.min(subtotal, Math.max(0, Number(application.amount || 0)))
            : Math.min(subtotal, subtotal * Math.min(100, Math.max(0, Number(application.rate || 0))) / 100);
        return { vatRemoved: 0, vatExemptAmount: 0, discountAmount: round4(discountAmount), total: round4(subtotal - discountAmount) };
    }
    const selected = new Set((application.eligible_item_ids || []).map(Number));
    let vatRemoved = 0;
    let vatExemptAmount = 0;
    cart.forEach((line) => {
        if (!selected.has(Number(line.item_id))) return;
        const gross = round4(Number(line.quantity || 0) * Number(line.sale_price || 0));
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
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
const DGFY_CONVENIENCE_FEE_RATE = 0.01;
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
const isServiceCatalogItem = (item = {}) => String(item?.category || '').trim().toLowerCase() === 'service';
const getLineKey = (line = {}) => line.line_key || line.item_id;
const createCartLineKey = (itemId) => `line-${itemId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    const itemName = String(item?.name || '').trim().toLowerCase();
    if (!itemName) return '';
    const mapped = POS_ITEM_IMAGE_MAP.find((entry) => (
        Array.isArray(entry.match) && entry.match.some((token) => itemName.includes(String(token).toLowerCase()))
    ));
    return mapped?.src || '';
};

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
    selectedLocationId = null,
    activeShiftId = null,
    terminalId = '',
    terminalMeta = null,
    onCheckoutCompleted = null,
    checkoutBlockedReason = '',
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
    fnbContext = null
}) {
    useEffect(() => {
        notifyIminWebPosReady();
    }, []);

    const [viewMode, setViewMode] = useState('checkout');
    const [catalog, setCatalog] = useState([]);
    const [catalogImageErrors, setCatalogImageErrors] = useState(() => new Set());
    const [catalogError, setCatalogError] = useState('');
    const [posFolders, setPosFolders] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
    const [posFoldersLoading, setPosFoldersLoading] = useState(true);
    const [posFoldersError, setPosFoldersError] = useState('');
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [orderMethod, setOrderMethod] = useState('dine_in');
    const [paymentType, setPaymentType] = useState('cash');
    const [discountProfiles, setDiscountProfiles] = useState([]);
    const [selectedDiscountProfile, setSelectedDiscountProfile] = useState('');
    const [manualDiscountMode, setManualDiscountMode] = useState('none');
    const [manualDiscountRateInput, setManualDiscountRateInput] = useState('');
    const [manualDiscountAmountInput, setManualDiscountAmountInput] = useState('');
    const [discountModalOpen, setDiscountModalOpen] = useState(false);
    const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT);
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const [discountApplying, setDiscountApplying] = useState(false);
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
    const [receiptSettings, setReceiptSettings] = useState({});
    const [deviceStatus, setDeviceStatus] = useState(null);
    const [deviceStatusLoading, setDeviceStatusLoading] = useState(false);
    const [receiptPrinting, setReceiptPrinting] = useState(false);
    const [receiptPaperWidth, setReceiptPaperWidth] = useState('80mm');
    const [drawerOpening, setDrawerOpening] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [receiptPreviewModalOpen, setReceiptPreviewModalOpen] = useState(false);
    const [setupSnapshotModalOpen, setSetupSnapshotModalOpen] = useState(false);
    const [externalReceiptModalActive, setExternalReceiptModalActive] = useState(false);

    const closeReceiptPreviewModal = useCallback(() => {
        setReceiptPreviewModalOpen(false);
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
    const [catalogAutoPageSize, setCatalogAutoPageSize] = useState(16);
    const catalogSectionRef = useRef(null);
    const catalogViewportRef = useRef(null);
    const catalogGridRef = useRef(null);
    const previousCatalogPageRef = useRef(1);
    const searchBackspaceTimeoutRef = useRef(null);
    const searchBackspaceIntervalRef = useRef(null);
    const catalogSwipeStartXRef = useRef(null);
    const catalogSwipePointerIdRef = useRef(null);
    const shellClassName = 'h-full min-h-0 space-y-5';
    const checkoutGridClassName = 'grid h-full min-h-0 grid-cols-1 gap-4 pb-24 md:grid-cols-[minmax(0,1fr)_325px] md:overflow-hidden md:pb-0 2xl:gap-6';
    const catalogGridClassName = useMemo(() => {
        if (isTabletViewport) {
            return IS_DGFY_POS_SURFACE
                ? 'mt-4 grid grid-cols-2 auto-rows-[7rem] gap-2 sm:grid-cols-3'
                : 'mt-4 grid grid-cols-3 auto-rows-[11rem] gap-1.5';
        }
        return sidebarCollapsed
            ? 'mt-4 grid grid-cols-1 auto-rows-[15rem] gap-2 md:grid-cols-3 md:auto-rows-[11rem] xl:grid-cols-5'
            : 'mt-4 grid grid-cols-1 auto-rows-[15rem] gap-2 md:grid-cols-3 md:auto-rows-[11rem] xl:grid-cols-4';
    }, [isTabletViewport, sidebarCollapsed]);
    const catalogViewportClassName = 'flex min-h-0 flex-1 flex-col overflow-hidden pr-0 pb-3';
    const tabletAlignedPaneClassName = isTabletViewport ? 'md:max-xl:min-h-[78rem]' : '';
    const currentSaleBodyClassName = 'min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y';
    const currentSaleItemsListClassName = 'pr-1';
    const checkoutPaneClassName = 'h-full max-h-full';
    const catalogPaneHeightClassName = 'h-full max-h-full';
    const currentSalePaneHeightClassName = 'h-full max-h-full';
    const catalogCardClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'group flex h-[7rem] min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
        : isTabletViewport
            ? 'group flex h-[11rem] min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
            : 'group flex h-[15rem] min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-2 text-left transition-all shadow-sm shadow-slate-200/70 md:h-[11rem] md:p-1.5 xl:h-full';
    const catalogCardImageWrapClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
        : isTabletViewport
            ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
            : 'flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md md:h-16 xl:h-24';
    const isViewModeControlled = typeof controlledViewMode === 'string' && controlledViewMode.length > 0;
    const currentViewMode = isViewModeControlled ? controlledViewMode : viewMode;
    const normalizedTerminalId = String(terminalId || '').trim();
    const terminalIdentityLabel = normalizedTerminalId
        ? `Terminal ${normalizedTerminalId}`
        : 'No terminal selected';
    const TABLET_CATALOG_PAGE_SIZE = 18;
    const DESKTOP_CATALOG_PAGE_SIZE = sidebarCollapsed ? 20 : 16;
    const fallbackCatalogPageSize = isTabletViewport ? TABLET_CATALOG_PAGE_SIZE : DESKTOP_CATALOG_PAGE_SIZE;
    const catalogPageSize = Math.max(1, catalogAutoPageSize || fallbackCatalogPageSize);
    const selectedFolder = useMemo(() => (
        posFolders.find((folder) => Number(folder.folder_id) === Number(selectedFolderId)) || null
    ), [posFolders, selectedFolderId]);
    const totalCatalogPages = useMemo(() => (
        Math.max(1, Math.ceil(catalog.length / catalogPageSize))
    ), [catalog.length, catalogPageSize]);
    const visibleCatalogItems = useMemo(() => {
        const pageStart = (catalogPage - 1) * catalogPageSize;
        return catalog.slice(pageStart, pageStart + catalogPageSize);
    }, [catalog, catalogPage, catalogPageSize]);
    const visibleCatalogRange = useMemo(() => {
        if (catalog.length === 0) return { start: 0, end: 0 };
        const start = (catalogPage - 1) * catalogPageSize + 1;
        const end = start + visibleCatalogItems.length - 1;
        return { start, end };
    }, [catalog.length, catalogPage, catalogPageSize, visibleCatalogItems.length]);
    const handleCatalogPageChange = useCallback((direction) => {
        setCatalogPage((previous) => {
            if (direction === 'previous') {
                return Math.max(1, previous - 1);
            }
            return Math.min(totalCatalogPages, previous + 1);
        });
    }, [totalCatalogPages]);

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
        queuedCheckouts.filter((entry) => (
            String(entry?.status || '') === TERMINAL_QUEUE_STATUS.QUEUED
            || String(entry?.status || '') === TERMINAL_QUEUE_STATUS.REPLAYING
        )).length
    ), [queuedCheckouts]);
    const queuedCheckoutBlockedCount = useMemo(() => (
        queuedCheckouts.filter((entry) => (
            String(entry?.status || '') === TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
        )).length
    ), [queuedCheckouts]);
    const offlineHistoryRows = useMemo(() => (
        queuedCheckouts
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
        queuedCheckouts
    ]);
    const visibleHistoryRows = useMemo(() => (
        historyPage === 1
            ? [...offlineHistoryRows, ...historyRows]
            : historyRows
    ), [historyPage, historyRows, offlineHistoryRows]);
    const visibleHistoryPagination = useMemo(() => {
        const baseLimit = Number(historyPagination?.limit || historyRows.length || 20) || 20;
        const baseTotal = Number(historyPagination?.total || historyRows.length || 0);
        const offlineCount = historyPage === 1 ? offlineHistoryRows.length : 0;
        const total = baseTotal + offlineCount;
        return {
            ...(historyPagination || {}),
            page: historyPage,
            limit: baseLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / baseLimit))
        };
    }, [historyPage, historyPagination, historyRows.length, offlineHistoryRows.length]);
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

    const syncQueuedCheckoutsState = useCallback(async () => {
        const rows = await listTerminalOperationQueueEntries({
            includeResolved: false,
            statuses: [
                TERMINAL_QUEUE_STATUS.QUEUED,
                TERMINAL_QUEUE_STATUS.REPLAYING,
                TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
            ]
        });
        const checkoutRows = (Array.isArray(rows) ? rows : []).filter((entry) => isCheckoutQueueEntry(entry));
        setQueuedCheckouts(checkoutRows);
    }, []);

    const enqueueCheckoutIntent = useCallback(async (payload, source = 'unknown') => {
        const idempotencyKey = String(payload?.idempotency_key || createIdempotencyKey()).trim();
        if (!idempotencyKey) return null;
        const nowIso = new Date().toISOString();
        const entry = await enqueueTerminalOperationIntent({
            intent_id: idempotencyKey,
            operation: CHECKOUT_QUEUE_OPERATION,
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
    }, [syncQueuedCheckoutsState]);

    const loadCatalog = useCallback(async () => {
        if (sessionLocked) {
            setCatalog([]);
            setCatalogError('');
            setCatalogLoading(false);
            return;
        }
        if (!canViewHistory) {
            setCatalog([]);
            setCatalogError('You need POS view permission to load the POS catalog.');
            setCatalogLoading(false);
            return;
        }
        setCatalogLoading(true);
        setCatalogError('');
        try {
            const params = { search: search || '', limit: 200 };
            if (selectedFolderId) params.folder_id = selectedFolderId;
            if (selectedLocationId) params.location_id = selectedLocationId;
            const data = await fetchPosCatalog(params);
            setCatalog(data || []);
            setCatalogImageErrors(new Set());
        } catch (error) {
            const apiMessage = error?.response?.data?.message;
            const message = error?.response?.status === 403
                ? (apiMessage || 'You need POS view permission to load the POS catalog.')
                : (apiMessage || 'Failed to load POS catalog');
            setCatalogError(message);
            toast.error(message);
        } finally {
            setCatalogLoading(false);
        }
    }, [canViewHistory, search, selectedFolderId, selectedLocationId, sessionLocked]);

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
                date_to: historyDateTo || undefined
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

        const candidates = (await getReplayCandidateEntries({ limit: CHECKOUT_REPLAY_BATCH_SIZE }))
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
        onCheckoutCompleted,
        sessionLocked,
        syncQueuedCheckoutsState
    ]);

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
            return;
        }
        try {
            const allSettings = await getAllSettings();
            setReceiptSettings({
                pos_registered_name: allSettings?.pos_registered_name?.value || '',
                pos_business_name: allSettings?.pos_business_name?.value || '',
                pos_taxpayer_type: allSettings?.pos_taxpayer_type?.value || '',
                pos_tin_branch: allSettings?.pos_tin_branch?.value || '',
                pos_address: allSettings?.pos_address?.value || '',
                pos_ptu_number: allSettings?.pos_ptu_number?.value || '',
                pos_min_number: allSettings?.pos_min_number?.value || '',
                pos_accreditation_number: allSettings?.pos_accreditation_number?.value || '',
                pos_software_name: allSettings?.pos_software_name?.value || '',
                pos_software_version: allSettings?.pos_software_version?.value || '',
                pos_software_serial_number: allSettings?.pos_software_serial_number?.value || '',
                pos_receipt_footer_message: allSettings?.pos_receipt_footer_message?.value || ''
            });
            setDiscountProfiles(normalizeDiscountProfiles(allSettings?.pos_discount_profiles?.value));
        } catch {
            setReceiptSettings({});
            setDiscountProfiles([]);
        }
    }, [sessionLocked]);

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
        if (!IS_DGFY_POS_SURFACE || !isTabletViewport) {
            setCatalogAutoPageSize(TABLET_CATALOG_PAGE_SIZE);
            return undefined;
        }
        if (typeof window === 'undefined') return undefined;

        const viewport = catalogViewportRef.current;
        const grid = catalogGridRef.current;
        if (!viewport || !grid) return undefined;

        let frameId = 0;
        const measurePageSize = () => {
            frameId = 0;
            const viewportNode = catalogViewportRef.current;
            const gridNode = catalogGridRef.current;
            if (!viewportNode || !gridNode) return;

            const viewportRect = viewportNode.getBoundingClientRect();
            const gridRect = gridNode.getBoundingClientRect();
            const availableHeight = Math.max(0, viewportRect.bottom - gridRect.top);
            const computedStyles = window.getComputedStyle(gridNode);
            const rowGap = Number.parseFloat(computedStyles.rowGap || computedStyles.gap || '0') || 0;
            const rowHeight = Number.parseFloat(computedStyles.gridAutoRows || '0') || 128;
            const columnCount = Math.max(
                1,
                computedStyles.gridTemplateColumns
                    .split(' ')
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .length
            );
            const visibleRows = Math.max(1, Math.floor((availableHeight + rowGap) / (rowHeight + rowGap)));
            const nextPageSize = Math.max(
                columnCount,
                Math.min(catalog.length || fallbackCatalogPageSize, visibleRows * columnCount)
            );
            setCatalogAutoPageSize((previous) => (previous === nextPageSize ? previous : nextPageSize));
        };
        const scheduleMeasure = () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(measurePageSize);
        };

        scheduleMeasure();

        const resizeObserver = new ResizeObserver(() => {
            scheduleMeasure();
        });
        resizeObserver.observe(viewport);
        resizeObserver.observe(grid);
        window.addEventListener('resize', scheduleMeasure);

        return () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            window.removeEventListener('resize', scheduleMeasure);
        };
    }, [catalog.length, catalogFiltersOpen, fallbackCatalogPageSize, posFolders.length, posFoldersLoading]);

    useEffect(() => {
        setCatalogPage(1);
    }, [search, selectedFolderId, selectedLocationId]);

    useEffect(() => {
        if (catalogPage > totalCatalogPages) {
            setCatalogPage(totalCatalogPages);
        }
    }, [catalogPage, totalCatalogPages]);

    useEffect(() => {
        if (previousCatalogPageRef.current === catalogPage) return;
        previousCatalogPageRef.current = catalogPage;

        const section = catalogSectionRef.current;
        if (section) {
            section.scrollIntoView({ block: 'start', behavior: 'auto' });
        }

        const viewport = catalogViewportRef.current;
        if (!viewport) return;
        viewport.scrollTop = 0;
    }, [catalogPage]);

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
        const stillExists = posFolders.some((folder) => Number(folder.folder_id) === Number(selectedFolderId));
        if (!stillExists) {
            setSelectedFolderId(null);
        }
    }, [posFolders, selectedFolderId]);

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
        () => cart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.sale_price)), 0),
        [cart]
    );

    const governedDiscountTotals = useMemo(
        () => calculateGovernedDiscount(cart, appliedDiscount),
        [appliedDiscount, cart]
    );

    const selectedDiscount = useMemo(
        () => discountProfiles.find((profile) => profile.name === selectedDiscountProfile) || null,
        [discountProfiles, selectedDiscountProfile]
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

    const serviceFeeAmount = useMemo(
        () => round4(Math.max(0, cartSubtotal) * DGFY_CONVENIENCE_FEE_RATE),
        [cartSubtotal]
    );

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
        const adjustedLines = cart.map((line) => ({
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
    }, [cart, cartSubtotal, netItemsTotal, normalizedFnbContext, restaurantServiceChargeAmount]);

    const cartTotal = useMemo(
        () => round4(netItemsTotal + serviceFeeAmount + restaurantServiceChargeAmount),
        [netItemsTotal, restaurantServiceChargeAmount, serviceFeeAmount]
    );
    const cartTotalQuantity = useMemo(
        () => cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        [cart]
    );
    const isCashPayment = paymentType === 'cash';
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
    const isCustomerPaymentSufficient = customerPaymentAmount >= cartTotal;
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
        if (isServiceCatalogItem(item)) {
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
        if (cart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }
        setCustomerPaymentAmountInput('0');
        setCheckoutConfirmModalOpen(true);
        setMobileCheckoutPanelOpen(false);
    }, [cart.length, checkoutBlockedReason, normalizedTerminalId]);

    const openDiscountModal = () => {
        const eligibleItemIds = cart
            .filter((line) => line.senior_pwd_discount_eligible === true)
            .map((line) => Number(line.item_id));
        setDiscountDraft(appliedDiscount ? { ...EMPTY_DISCOUNT_DRAFT, ...appliedDiscount, manager_pin: '' } : {
            ...EMPTY_DISCOUNT_DRAFT,
            eligible_item_ids: eligibleItemIds
        });
        setDiscountModalOpen(true);
    };

    const handleApplyGovernedDiscount = async () => {
        const type = discountDraft.type;
        const statutory = type === 'senior' || type === 'pwd';
        if (statutory && (!discountDraft.customer_name.trim() || !discountDraft.id_number.trim())) {
            toast.error('Customer name and Senior/PWD ID number are required.');
            return;
        }
        if (statutory && discountDraft.eligible_item_ids.length === 0) {
            toast.error('Select at least one eligible item.');
            return;
        }
        if (type === 'employee' && (!discountDraft.employee_name.trim() || !discountDraft.employee_id.trim())) {
            toast.error('Employee name and employee ID are required.');
            return;
        }
        if (['employee', 'manual'].includes(type) && !discountDraft.reason.trim()) {
            toast.error('A discount reason is required.');
            return;
        }
        const rate = Number(discountDraft.rate || 0);
        const amount = Number(discountDraft.amount || 0);
        if (!statutory && discountDraft.method === 'percentage' && (!(rate > 0) || rate > 100)) {
            toast.error('Enter a discount rate from 0.01 to 100.');
            return;
        }
        if (!statutory && discountDraft.method === 'fixed' && !(amount > 0)) {
            toast.error('Enter a fixed discount amount.');
            return;
        }
        setDiscountApplying(true);
        try {
            if (['employee', 'manual'].includes(type)) {
                await verifyPosSettingsAccessPin(discountDraft.manager_pin);
            }
            const labels = { senior: 'Senior Citizen', pwd: 'PWD', employee: 'Employee Discount', promo: 'Promo Discount', manual: 'Manual Discount' };
            setAppliedDiscount({
                ...discountDraft,
                label: labels[type],
                rate: statutory ? 20 : rate,
                amount: discountDraft.method === 'fixed' ? amount : null
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

        if (cart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }
        if (!isCustomerPaymentSufficient) {
            toast.error(`${customerPaymentFieldLabel} must cover the total due.`);
            setCheckoutConfirmModalOpen(true);
            return;
        }

        const payload = {
            idempotency_key: createIdempotencyKey(),
            terminal_id: normalizedTerminalId || undefined,
            location_id: selectedLocationId || undefined,
            order_method: orderMethod,
            payment_type: paymentType,
            payment_handoff_mode: paymentType === 'cash' ? 'internal' : 'external',
            cash_received: Number(customerPaymentAmount || 0),
            change_amount: Number(customerPaymentChange || 0),
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
            shift_id: activeShiftId || undefined,
            fnb_check_id: normalizedFnbContext?.fnb_check_id || undefined,
            fnb_table_id: normalizedFnbContext?.fnb_table_id || undefined,
            fnb_table_label_snapshot: normalizedFnbContext?.fnb_table_label_snapshot || undefined,
            fnb_guest_count: normalizedFnbContext?.fnb_guest_count || undefined,
            fnb_server_id: normalizedFnbContext?.fnb_server_id || undefined,
            restaurant_service_charge: normalizedFnbContext?.restaurant_service_charge || undefined,
            lines: cart.map((line) => ({
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
        payload.offline_line_items_snapshot = cart.map((line) => ({
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
                toast.error('Governed discounts require an online checkout so eligibility and Admin approval can be verified securely.');
                return;
            }
            await enqueueCheckoutIntent(payload, source);
            setCart([]);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            setCustomerPaymentAmountInput('');
            setCheckoutConfirmModalOpen(false);
            const refreshedQueue = await listTerminalOperationQueueEntries({
                includeResolved: false,
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
                `You are offline. Checkout queued locally and will auto-replay when connection is restored (${nextQueueCount} queued).`
            );
        };

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
            setCustomerPaymentAmountInput('');
            setCheckoutConfirmModalOpen(false);
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
                    openDrawerAfterPrint: true
                });
                if (iminPrintResult.handled) {
                    toast.success('Receipt printed and cash drawer opened.');
                } else {
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
            const iminPrintResult = printReceiptWithIminBridge({
                transaction,
                businessSettings: receiptSettings,
                receiptContract: inferReceiptContract(transaction),
                openDrawerAfterPrint: true
            });
            if (iminPrintResult.handled) {
                toast.success('Receipt printed and cash drawer opened.');
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
        if (cart.length === 0) {
            toast.error('Add at least one item before printing an order.');
            return;
        }

        try {
            const result = printOrderWithIminBridge({
                cart,
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
    }, [cart, loadDeviceStatus, normalizedFnbContext, normalizedTerminalId, orderMethod]);

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
            <section className={currentViewMode === 'checkout' ? 'contents' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5'}>
            {currentViewMode === 'history' && (
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
                        loadHistory={loadHistory}
                        historyPage={historyPage}
                        historyPagination={visibleHistoryPagination}
                        pendingSyncCount={queuedCheckoutPendingCount}
                        pendingSyncBlockedCount={queuedCheckoutBlockedCount}
                        syncPendingTransactions={() => replayQueuedCheckouts({ toastIfEmpty: true })}
                        syncingPendingTransactions={replayingQueuedCheckouts}
                        syncDisabled={sessionLocked || Boolean(checkoutBlockedReason) || (typeof navigator !== 'undefined' && navigator.onLine === false)}
                    />
                </Suspense>
            )}

            {currentViewMode === 'checkout' && (
                <>
                <div className={checkoutGridClassName}>
            <section ref={catalogSectionRef} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-6 ${checkoutPaneClassName} ${tabletAlignedPaneClassName} ${catalogPaneHeightClassName} flex min-h-0 flex-col`}>
                    {isTabletViewport && renderViewModeControls()}
                    <div ref={catalogViewportRef} className={catalogViewportClassName} role="region" aria-label="POS catalog contents">
                <div className={`${isTabletViewport ? 'mb-3 gap-2.5' : 'mb-5 gap-4'} flex min-w-0 flex-col ${IS_DGFY_POS_SURFACE ? 'xl:flex-row xl:items-start' : 'lg:flex-row lg:items-start'}`}>
                    <div className={`${isTabletViewport ? 'flex-col items-stretch sm:flex-col' : 'flex-wrap items-center sm:flex-nowrap'} flex min-w-0 flex-1 gap-3`}>
                        <label className={`flex h-11 min-w-0 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-[13px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 ${isTabletViewport ? 'w-full' : 'flex-1'}`}>
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
                                    className={`flex h-11 shrink-0 items-center justify-center gap-3 rounded-lg border px-5 text-[13px] font-bold shadow-sm transition ${
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
                                />
                            </Suspense>
                            </>
                        )}
                </div>
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
                        {posFolders.map((folder) => {
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
                    {!posFoldersLoading && !posFoldersError && canViewHistory && posFolders.length === 0 && (
                        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                            No POS folder filters available yet.
                        </p>
                    )}
                </div>
                )}
                <div
                    data-testid="pos-catalog-scroll"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-3 touch-pan-y select-none"
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
                    <div ref={catalogGridRef} className={catalogGridClassName}>
                        {visibleCatalogItems.map((item) => {
                            const isServiceItem = isServiceCatalogItem(item);
                            const isAlwaysAvailable = item?.pos_always_available === true;
                            const isOutOfStock = !isServiceItem && !isAlwaysAvailable && Number(item.current_stock || 0) <= 0;
                            const configuredPosImageSrc = resolveAssetUrl(item.pos_image_url);
                            const mappedPosImageSrc = resolveAppAssetUrl(resolveMappedPosItemImage(item));
                            const fallbackPosImageSrc = resolveAppAssetUrl(POS_ITEM_FALLBACK_IMAGE);
                            const posImageSrc = configuredPosImageSrc || mappedPosImageSrc || fallbackPosImageSrc;
                            const hasImage = Boolean(posImageSrc) && !catalogImageErrors.has(item.item_id);
                            return (
                                <div
                                    key={item.item_id}
                                    onClick={() => {
                                        if (isOutOfStock || posActionsBlocked) {
                                            if (posActionsBlocked) notifyPosActionBlocked();
                                            return;
                                        }
                                        addToCart(item);
                                    }}
                                    onKeyDown={(event) => {
                                        if (isOutOfStock || posActionsBlocked) return;
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            addToCart(item);
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
                                <div className="mb-1">
                                    <div
                                        className={`${catalogCardImageWrapClassName} relative`}
                                        aria-hidden="true"
                                    >
                                        {hasImage ? (
                                            <img
                                                src={posImageSrc}
                                                alt={`${item.name} menu`}
                                                className="h-full w-full object-cover object-center"
                                                onError={(event) => {
                                                    const fallbackSrc = fallbackPosImageSrc;
                                                    const currentSrc = String(event.currentTarget.src || '');
                                                    const alreadyFallback = currentSrc.endsWith(fallbackSrc);
                                                    if (!alreadyFallback) {
                                                        event.currentTarget.src = fallbackSrc;
                                                        return;
                                                    }
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
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent px-2 py-1.5">
                                                <div className="flex items-end justify-between gap-2">
                                                    <p className="min-w-0 text-[11px] font-black leading-tight text-white line-clamp-2">
                                                        {item.name}
                                                    </p>
                                                    {isServiceItem ? (
                                                        <span className="shrink-0 rounded-md border border-white/30 bg-white/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                                                            Service
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {!(IS_DGFY_POS_SURFACE && isTabletViewport) && (
                                    <>
                                        <div className="flex items-start justify-between gap-1.5">
                                            <p className="min-w-0 pr-1 text-[13.5px] font-black leading-tight text-[#0F172A] line-clamp-2">{item.name}</p>
                                            {isServiceItem ? (
                                                <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#1A4E8D]">
                                                    Service
                                                </span>
                                            ) : isAlwaysAvailable ? (
                                                <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#1A4E8D]">
                                                    Always available
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px] font-extrabold tracking-wide text-[#64748B]">
                                            {item.sku_code}
                                        </p>
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
                                        <div className={`${isTabletViewport ? 'mt-1.5' : 'mt-3'} grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10.5px] text-[#64748B]`}>
                                            <span className="font-semibold">Stock:</span>
                                            <span className="text-right font-bold text-emerald-700 whitespace-nowrap">
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
                                            <p className="mt-auto pt-1 text-[10.5px] font-medium text-slate-500">
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
                                        Showing {visibleCatalogRange.start}-{visibleCatalogRange.end} of {catalog.length || 0} items
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
                className={`space-y-4 ${checkoutPaneClassName} ${mobileCheckoutPanelOpen
                    ? 'fixed inset-x-0 bottom-0 z-50 max-h-[88vh] translate-y-0 overflow-y-auto pointer-events-auto'
                    : 'fixed inset-x-0 bottom-0 z-50 max-h-[88vh] translate-y-full overflow-y-auto pointer-events-none'
                } transition-transform duration-300 ease-out md:static md:z-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto md:transition-none`}
            >
            <section className={`relative flex min-h-0 flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-6 md:rounded-xl ${currentSalePaneHeightClassName}`}>
                    <div role="region" aria-label="Current sale contents" className="flex h-full min-h-0 flex-col">
                <div data-testid="pos-current-sale-header" className="relative mb-4 shrink-0">
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
                            <p className="mt-2 break-words font-semibold text-slate-800">DGFY convenience fee (1%)</p>
                            <p className="mt-1 break-words text-slate-600">Auto-calculated from gross item subtotal</p>
                        </div>
                    )}
                </div>
                <div data-testid="pos-current-sale-scroll" className={currentSaleBodyClassName}>
                <div className="flex flex-col">
                <div className="order-2 md:order-1 space-y-3 mb-4">
                    <label className="text-[11px] text-slate-500 block">
                        Order Method
                        <select
                            value={orderMethod}
                            onChange={(event) => setOrderMethod(event.target.value)}
                            className={`w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-[13px] ${POS_FORM_SELECT_CLASS}`}
                        >
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                            <option value="pickup">Pickup</option>
                            <option value="delivery">Delivery</option>
                            <option value="appointment">Appointment</option>
                        </select>
                    </label>

                    <label className="text-[11px] text-slate-500 block">
                        Payment Type
                        <select
                            value={paymentType}
                            onChange={(event) => setPaymentType(event.target.value)}
                            className={`w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-[13px] ${POS_FORM_SELECT_CLASS}`}
                        >
                            <option value="cash">Cash</option>
                            <option value="gcash">{isMsmeMode ? 'GCash (Manual)' : 'GCash'}</option>
                            <option value="maya">{isMsmeMode ? 'Maya (Manual)' : 'Maya'}</option>
                            <option value="card">{isMsmeMode ? 'Card (Manual)' : 'Card'}</option>
                            <option value="bank_transfer">{isMsmeMode ? 'Bank Transfer (Manual)' : 'Bank Transfer'}</option>
                        </select>
                    </label>
                </div>
                <div className="order-1 md:order-2 mb-4 border-b border-slate-200 pb-4">
                    <div className={`space-y-2.5 ${currentSaleItemsListClassName}`}>
                        {cart.length > 0 ? cart.map((line) => {
                            const lineKey = getLineKey(line);
                            return (
                                <div key={lineKey} className="rounded-lg border border-slate-200 p-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-[13px] font-extrabold text-[#0F172A]">{line.item_name}</p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-[11px]"
                                            onClick={() => removeCartLine(lineKey)}
                                            disabled={posActionsBlocked}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <label className="text-[11px] text-slate-500">
                                            Qty
                                            <div className="mt-1 flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-[13px]"
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) - 1)}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                                <span className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-[13px] font-extrabold text-[#0F172A]">
                                                    {formatQuantity(line.quantity)}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-[13px]"
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
                                <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
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
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[12px] font-extrabold text-[#0F172A]">Discount</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{appliedDiscount?.label || 'No discount applied'}</p>
                        </div>
                    </div>
                    {appliedDiscount && (
                        <button type="button" className="mt-2 text-[11px] font-bold text-rose-600" onClick={() => setAppliedDiscount(null)}>
                            Remove Discount
                        </button>
                    )}
                </div>

                <div className="mb-3 space-y-3 border-b border-slate-200 pb-4 text-[13px]">
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
                    <div className="flex justify-between">
                        <span className="text-[#334155]">
                            {DGFY_CONVENIENCE_FEE_LABEL} (1%)
                        </span>
                        <span className="font-extrabold text-[#0F172A]">+ PHP {money(serviceFeeAmount)}</span>
                    </div>
                    <div className="border-t border-dashed border-slate-200 my-2" />
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
                    <div className="flex justify-between">
                        <span className="text-[18px] font-black text-[#0F172A]">Total</span>
                        <span className="text-[22px] font-black text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                    </div>
                </div>
                </div>

                {(checkoutBlockedReason || cart.length === 0) && (
                    <div className="border-t border-slate-200 pt-3">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                            {checkoutBlockedReason || 'Add at least one item before checkout.'}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrintOrder}
                        disabled={posActionsBlocked || cart.length === 0}
                        className="flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#1A4E8D] bg-white px-2 text-center text-[12px] font-extrabold leading-tight text-[#1A4E8D] hover:bg-blue-50 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Printer size={18} />
                        Print Order
                    </Button>
                    <Button
                        type="button"
                        onClick={openCheckoutConfirmModal}
                        disabled={posActionsBlocked || checkoutLoading}
                        className="flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg bg-[#1A4E8D] px-2 text-center text-[12px] font-extrabold leading-tight text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#143F73] sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-95"
                    >
                        <Lock size={17} />
                        {checkoutLoading ? 'Processing...' : 'Checkout'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseDay}
                        disabled={closingDay}
                        className="flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#1A4E8D] bg-white px-2 text-center text-[12px] font-extrabold leading-tight text-[#1A4E8D] hover:bg-blue-50 sm:text-[13px]"
                    >
                        <Gauge size={18} />
                        {closingDay ? 'Generating...' : 'Close Day / Z-Reading'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePrintReceipt(lastReceipt, 'last_receipt_panel')}
                        disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync}
                        className="flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border px-2 text-center text-[12px] font-extrabold leading-tight sm:text-[13px]"
                    >
                        <Printer size={18} />
                        {receiptPrinting ? 'Printing...' : 'Print Last Receipt'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleOpenDrawer({
                            transactionId: Number(lastReceipt?.pos_transaction_id) || null,
                            reason: 'manual_drawer_panel'
                        })}
                        disabled={!activeShiftId || drawerOpening}
                        className="flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border px-2 text-center text-[12px] font-extrabold leading-tight sm:text-[13px]"
                    >
                        {drawerOpening ? 'Opening...' : 'Open Cash Drawer'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#1A4E8D] bg-white px-2 text-center text-[12px] font-extrabold leading-tight text-[#1A4E8D] hover:bg-blue-50 sm:text-[13px]"
                        onClick={openDiscountModal}
                        disabled={posActionsBlocked || cart.length === 0}
                    >
                        Apply Discount
                    </Button>
                </div>
                    </div>
            </section>
            </aside>

                </div>

                <div
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
                            type="button"
                            onClick={() => setMobileCheckoutPanelOpen(true)}
                            disabled={posActionsBlocked || checkoutLoading || cart.length === 0}
                            className="h-11 shrink-0 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Lock size={16} className="mr-1.5" />
                            {checkoutLoading ? 'Processing...' : 'Checkout'}
                        </Button>
                    </div>
                </div>
                </>
            )}

            {currentViewMode === 'receipt' && (
                <div>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Receipt Preview</h2>
                            <p className="text-sm text-slate-600">Review the selected receipt.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                                Paper
                                <select
                                    value={receiptPaperWidth}
                                    onChange={(event) => setReceiptPaperWidth(event.target.value)}
                                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                >
                                    {RECEIPT_PAPER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            {normalizedTerminalId && (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                    {terminalIdentityLabel}
                                </span>
                            )}
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                isPrinterAvailable
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}>
                                {deviceStatusLoading
                                    ? 'Checking printer...'
                                    : (isPrinterAvailable
                                        ? `${detectedPrinterCount} printer${detectedPrinterCount === 1 ? '' : 's'} ready`
                                        : 'Printer unavailable')}
                            </span>
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
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDrawer({
                                    transactionId: Number(lastReceipt?.pos_transaction_id) || null,
                                    reason: 'receipt_preview_drawer_open'
                                })}
                                disabled={!activeShiftId || drawerOpening}
                            >
                                {drawerOpening ? 'Opening...' : 'Open Drawer'}
                            </Button>
                        </div>
                    </div>
                    {lastReceipt ? (
                        <div className="space-y-3">
                            <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading receipt preview...</div>}>
                                <ReceiptPrintView
                                    transaction={lastReceipt}
                                    businessSettings={receiptSettings}
                                    receiptContract={lastReceiptContract}
                                    paperWidth={receiptPaperWidth}
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
                <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Apply Discount</DialogTitle>
                        <DialogDescription>Select the discount and complete all required verification details.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <label className="block text-sm font-semibold">Discount Type
                            <select value={discountDraft.type} onChange={(event) => setDiscountDraft((prev) => ({ ...prev, type: event.target.value, rate: ['senior', 'pwd'].includes(event.target.value) ? '20' : prev.rate }))} className={`mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 ${POS_FORM_SELECT_CLASS}`}>
                                <option value="senior">Senior Citizen</option><option value="pwd">PWD</option><option value="employee">Employee Discount</option><option value="promo">Promo Discount</option><option value="manual">Manual Discount</option>
                            </select>
                        </label>
                        {['senior', 'pwd'].includes(discountDraft.type) && <>
                            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Customer Name<Input value={discountDraft.customer_name} onChange={(e) => setDiscountDraft((p) => ({ ...p, customer_name: e.target.value }))} /></label><label className="text-sm font-semibold">Senior/PWD ID Number<Input value={discountDraft.id_number} onChange={(e) => setDiscountDraft((p) => ({ ...p, id_number: e.target.value }))} /></label></div>
                            <div><p className="mb-2 text-sm font-semibold">Eligible Items</p><div className="space-y-2 rounded-lg border border-slate-200 p-3">{cart.map((line) => { const checked = discountDraft.eligible_item_ids.includes(Number(line.item_id)); return <label key={`discount-line-${line.item_id}`} className="flex items-center justify-between gap-3 text-sm"><span><input type="checkbox" className="mr-2" checked={checked} onChange={(e) => setDiscountDraft((p) => ({ ...p, eligible_item_ids: e.target.checked ? [...new Set([...p.eligible_item_ids, Number(line.item_id)])] : p.eligible_item_ids.filter((id) => id !== Number(line.item_id)) }))} />{line.item_name}</span><span className="text-xs text-slate-500">Qty {line.quantity}</span></label>; })}</div></div>
                        </>}
                        {discountDraft.type === 'employee' && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Employee Name<Input value={discountDraft.employee_name} onChange={(e) => setDiscountDraft((p) => ({ ...p, employee_name: e.target.value }))} /></label><label className="text-sm font-semibold">Employee ID<Input value={discountDraft.employee_id} onChange={(e) => setDiscountDraft((p) => ({ ...p, employee_id: e.target.value }))} /></label></div>}
                        {!['senior', 'pwd'].includes(discountDraft.type) && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Method<select value={discountDraft.method} onChange={(e) => setDiscountDraft((p) => ({ ...p, method: e.target.value }))} className={`mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 ${POS_FORM_SELECT_CLASS}`}><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option></select></label><label className="text-sm font-semibold">{discountDraft.method === 'fixed' ? 'Amount' : 'Rate (%)'}<Input type="number" min="0" max={discountDraft.method === 'percentage' ? 100 : undefined} value={discountDraft.method === 'fixed' ? discountDraft.amount : discountDraft.rate} onChange={(e) => setDiscountDraft((p) => ({ ...p, [p.method === 'fixed' ? 'amount' : 'rate']: e.target.value }))} /></label></div>}
                        {['employee', 'manual'].includes(discountDraft.type) && <><label className="block text-sm font-semibold">Reason<Input value={discountDraft.reason} onChange={(e) => setDiscountDraft((p) => ({ ...p, reason: e.target.value }))} /></label><label className="block text-sm font-semibold">Admin PIN<Input type="password" inputMode="numeric" value={discountDraft.manager_pin} onChange={(e) => setDiscountDraft((p) => ({ ...p, manager_pin: e.target.value }))} /></label></>}
                        <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>VAT Removed</span><span>PHP {money(calculateGovernedDiscount(cart, discountDraft).vatRemoved)}</span></div><div className="mt-1 flex justify-between"><span>Discount</span><span>PHP {money(calculateGovernedDiscount(cart, discountDraft).discountAmount)}</span></div><div className="mt-2 flex justify-between font-black"><span>Total Amount Due</span><span>PHP {money(calculateGovernedDiscount(cart, discountDraft).total)}</span></div></div>
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setDiscountModalOpen(false)}>Cancel</Button><Button onClick={handleApplyGovernedDiscount} disabled={discountApplying}>{discountApplying ? 'Verifying...' : 'Apply Discount'}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={checkoutConfirmModalOpen} onOpenChange={setCheckoutConfirmModalOpen}>
                <DialogContent className="pos-checkout-confirm-dialog flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full">
                    <DialogHeader className="border-b border-slate-200 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <DialogTitle id="pos-checkout-confirm-modal-title" className="text-[17px] font-black text-[#0F172A]">
                                    Confirm Checkout
                                </DialogTitle>
                                <DialogDescription className="mt-1 text-[12px] font-medium text-[#475569]">
                                    Review the items and enter the customer payment before finalizing this sale.
                                </DialogDescription>
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
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
                            <div className="flex justify-between gap-2">
                                <span className="font-semibold text-[#334155]">Total Due</span>
                                <span className="font-black text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                            </div>
                            <div className="mt-2 flex justify-between gap-2">
                                <span className="font-semibold text-[#334155]">Payment Type</span>
                                <span className="font-bold capitalize text-[#0F172A]">{paymentType.replace('_', ' ')}</span>
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Items</p>
                                    <p className="mt-1 text-[12px] font-medium text-[#475569]">
                                        {cart.length} item{cart.length === 1 ? '' : 's'} in this sale
                                    </p>
                                </div>
                                <span className="text-[12px] font-black text-[#0F172A]">PHP {money(cartTotal)}</span>
                            </div>
                            <div className="mt-3 space-y-2">
                                {cart.map((line) => {
                                    const lineTotal = round4(Number(line.quantity || 0) * Number(line.sale_price || 0));
                                    return (
                                        <div key={getLineKey(line)} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{line.item_name}</p>
                                                <p className="mt-0.5 text-[11px] font-medium text-[#64748B]">
                                                    {formatQuantity(line.quantity)} x PHP {money(line.sale_price)}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-[13px] font-black text-[#1A4E8D]">PHP {money(lineTotal)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

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

                        {!isCustomerPaymentSufficient && (
                            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                {customerPaymentFieldLabel} must be at least PHP {money(cartTotal)}.
                            </p>
                        )}
                    </div>

                    <DialogFooter className="grid grid-cols-2 gap-2 border-t border-slate-200 px-4 py-3">
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
                            onClick={handleCheckout}
                            disabled={posActionsBlocked || checkoutLoading || cart.length === 0 || !isCustomerPaymentSufficient}
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
                <DialogContent className="pos-receipt-print-dialog flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:h-[calc(100dvh-3rem)] sm:w-full print:h-auto print:max-h-none print:max-w-none print:rounded-none print:border-none print:shadow-none">
                    <DialogHeader className="border-b border-slate-200 px-4 py-3 print:hidden">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <DialogTitle id="pos-history-receipt-modal-title" className="text-lg font-black text-[#0F172A]">
                                    Receipt Preview
                                </DialogTitle>
                                <DialogDescription className="mt-1 text-sm text-[#64748B]">
                                    {lastReceiptPendingSync
                                        ? 'Review the offline receipt. Sync the transaction before printing.'
                                        : 'Review the selected receipt from history.'}
                                </DialogDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={closeReceiptPreviewModal}
                                    aria-label="Close receipt preview"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>
                    <div className="pos-receipt-print-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 print:overflow-visible print:p-0">
                        {lastReceipt ? (
                            <div className="space-y-3 print:space-y-0">
                                <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading receipt preview...</div>}>
                                    <div className="pos-receipt-print-paper">
                                        <ReceiptPrintView
                                            transaction={lastReceipt}
                                            businessSettings={receiptSettings}
                                            receiptContract={lastReceiptContract}
                                            paperWidth={receiptPaperWidth}
                                        />
                                    </div>
                                </Suspense>
                            </div>
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
                    <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 print:hidden">
                        <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                            Paper
                            <select
                                value={receiptPaperWidth}
                                onChange={(event) => setReceiptPaperWidth(event.target.value)}
                                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                {RECEIPT_PAPER_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync}
                                onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}
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
        </div>
    );
}
