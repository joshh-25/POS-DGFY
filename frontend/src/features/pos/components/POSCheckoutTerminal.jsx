import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Folder, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
    fetchPosCatalog,
    createPosCheckout,
    closePosDay,
    fetchPosTransactions,
    fetchPosTransactionById
} from '../services/posService';
import { getFolders } from '@/services/itemService.js';
import ReceiptPrintView from './ReceiptPrintView';
import { getAllSettings } from '@/services/settingsService';
import { usePermission } from '@/hooks/usePermission';

const money = (value) => Number(value || 0).toFixed(2);
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toDateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
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
const ORDER_METHOD_FEE_LABELS = {
    dine_in: 'Dine In Fee',
    takeout: 'Takeout Fee',
    delivery: 'Delivery Fee',
    online: 'Online Fee'
};
const ORDER_METHODS = ['dine_in', 'takeout', 'delivery', 'online'];
const createDefaultOrderMethodFees = () => ORDER_METHODS.reduce((acc, method) => {
    acc[method] = {
        enabled: false,
        amount: 0,
        label: ORDER_METHOD_FEE_LABELS[method]
    };
    return acc;
}, {});
const parseBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';
const normalizeOrderMethodFees = (rawFees) => {
    let parsed = rawFees;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = {};
        }
    }
    const defaults = createDefaultOrderMethodFees();
    if (!parsed || typeof parsed !== 'object') return defaults;

    ORDER_METHODS.forEach((method) => {
        const entry = parsed?.[method];
        if (!entry || typeof entry !== 'object') return;
        const amount = Number(entry.amount);
        defaults[method] = {
            enabled: parseBoolean(entry.enabled),
            amount: Number.isFinite(amount) ? Math.max(0, round4(amount)) : 0,
            label: String(entry.label || '').trim() || ORDER_METHOD_FEE_LABELS[method]
        };
    });

    return defaults;
};
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

const createIdempotencyKey = () => {
    if (window?.crypto?.randomUUID) return window.crypto.randomUUID();
    return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function POSCheckoutTerminal({
    sessionLocked = false,
    canViewHistory = true,
    activeShiftId = null,
    onCheckoutCompleted = null,
    checkoutBlockedReason = ''
}) {
    const { can } = usePermission();
    const canOverridePrice = can('pos:price_override');
    const canViewCatalog = Boolean(canViewHistory);
    const [viewMode, setViewMode] = useState('checkout');
    const [catalog, setCatalog] = useState([]);
    const [posFolders, setPosFolders] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [posFoldersLoading, setPosFoldersLoading] = useState(true);
    const [posFoldersError, setPosFoldersError] = useState('');
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [orderMethod, setOrderMethod] = useState('dine_in');
    const [paymentType, setPaymentType] = useState('cash');
    const [discountProfiles, setDiscountProfiles] = useState([]);
    const [orderMethodFees, setOrderMethodFees] = useState(createDefaultOrderMethodFees());
    const [serviceFeeInput, setServiceFeeInput] = useState('');
    const [serviceFeeEdited, setServiceFeeEdited] = useState(false);
    const [selectedDiscountProfile, setSelectedDiscountProfile] = useState('');
    const [cart, setCart] = useState([]);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [closingDay, setClosingDay] = useState(false);
    const [lastReceipt, setLastReceipt] = useState(null);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPagination, setHistoryPagination] = useState(null);
    const [historySearch, setHistorySearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState('all');
    const [historyPaymentType, setHistoryPaymentType] = useState('all');
    const [historyOrderMethod, setHistoryOrderMethod] = useState('all');
    const [historyCashierId, setHistoryCashierId] = useState('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
    const [receiptSettings, setReceiptSettings] = useState({});
    const [imagePreview, setImagePreview] = useState(null);

    const loadCatalog = useCallback(async () => {
        if (sessionLocked || !canViewCatalog) {
            setCatalog([]);
            setCatalogLoading(false);
            return;
        }
        setCatalogLoading(true);
        try {
            const params = { search: search || '', limit: 200 };
            if (selectedFolderId) params.folder_id = selectedFolderId;
            const data = await fetchPosCatalog(params);
            setCatalog(data || []);
        } catch (error) {
            if (error?.response?.status === 403) {
                setCatalog([]);
                return;
            }
            toast.error(error?.response?.data?.message || 'Failed to load POS catalog');
        } finally {
            setCatalogLoading(false);
        }
    }, [canViewCatalog, search, selectedFolderId, sessionLocked]);

    const loadPosFolders = useCallback(async () => {
        if (sessionLocked) {
            setPosFolders([]);
            setPosFoldersLoading(false);
            setPosFoldersError('');
            return;
        }
        if (!canViewCatalog) {
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
            if (error?.response?.status === 403) {
                setPosFoldersError('POS view permission is required to load category filters.');
                return;
            }
            setPosFoldersError(error?.response?.data?.message || 'Failed to load POS categories.');
        } finally {
            setPosFoldersLoading(false);
        }
    }, [canViewCatalog, sessionLocked]);

    const loadReceiptSettings = useCallback(async () => {
        if (sessionLocked || !canViewCatalog) {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setOrderMethodFees(createDefaultOrderMethodFees());
            return;
        }
        try {
            const allSettings = await getAllSettings();
            setReceiptSettings({
                pos_business_name: allSettings?.pos_business_name?.value || '',
                pos_tin_branch: allSettings?.pos_tin_branch?.value || '',
                pos_address: allSettings?.pos_address?.value || '',
                pos_ptu_number: allSettings?.pos_ptu_number?.value || '',
                pos_min_number: allSettings?.pos_min_number?.value || '',
                pos_accreditation_number: allSettings?.pos_accreditation_number?.value || '',
                pos_receipt_footer_message: allSettings?.pos_receipt_footer_message?.value || ''
            });
            setDiscountProfiles(normalizeDiscountProfiles(allSettings?.pos_discount_profiles?.value));
            setOrderMethodFees(normalizeOrderMethodFees(allSettings?.pos_order_method_fees?.value));
        } catch {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setOrderMethodFees(createDefaultOrderMethodFees());
        }
    }, [canViewCatalog, sessionLocked]);

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
                cashier_id: historyCashierId || undefined,
                date_from: historyDateFrom || undefined,
                date_to: historyDateTo || undefined
            });
            const rows = Array.isArray(result?.transactions) ? result.transactions : [];
            setHistoryRows(rows);
            setHistoryPagination(result?.pagination || null);
            setHistoryPage(page);
        } catch (error) {
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
        historyPaymentType,
        historySearch,
        historyStatus,
        sessionLocked
    ]);

    const openHistoryDetail = async (posTransactionId) => {
        setHistoryDetailLoading(true);
        try {
            const detail = await fetchPosTransactionById(posTransactionId);
            setLastReceipt(detail || null);
            setViewMode('receipt');
        } catch (error) {
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load selected transaction');
        } finally {
            setHistoryDetailLoading(false);
        }
    };

    useEffect(() => {
        if (sessionLocked) return;
        loadReceiptSettings();
        loadPosFolders();
    }, [loadReceiptSettings, loadPosFolders, sessionLocked]);

    useEffect(() => {
        if (sessionLocked) return undefined;
        const timeout = setTimeout(() => {
            loadCatalog();
        }, 250);
        return () => clearTimeout(timeout);
    }, [loadCatalog, sessionLocked]);

    useEffect(() => {
        if (!sessionLocked && viewMode === 'history') {
            loadHistory(1);
        }
    }, [viewMode, loadHistory, sessionLocked]);

    useEffect(() => {
        if (!canViewHistory && viewMode === 'history') {
            setViewMode('checkout');
        }
    }, [canViewHistory, viewMode]);

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

    const cartSubtotal = useMemo(
        () => cart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.sale_price)), 0),
        [cart]
    );

    const selectedDiscount = useMemo(
        () => discountProfiles.find((profile) => profile.name === selectedDiscountProfile) || null,
        [discountProfiles, selectedDiscountProfile]
    );

    const calculatedDiscountAmount = useMemo(
        () => round4(selectedDiscount ? (cartSubtotal * selectedDiscount.percentage) / 100 : 0),
        [cartSubtotal, selectedDiscount]
    );

    const currentMethodFeeConfig = useMemo(
        () => orderMethodFees?.[orderMethod] || createDefaultOrderMethodFees()[orderMethod],
        [orderMethodFees, orderMethod]
    );

    useEffect(() => {
        if (currentMethodFeeConfig?.enabled) {
            setServiceFeeInput(String(round4(currentMethodFeeConfig.amount)));
        } else {
            setServiceFeeInput('');
        }
        setServiceFeeEdited(false);
    }, [orderMethod, currentMethodFeeConfig?.enabled, currentMethodFeeConfig?.amount]);

    const serviceFeeAmount = useMemo(() => {
        if (!currentMethodFeeConfig?.enabled) return 0;
        const parsed = Number(serviceFeeInput);
        if (!Number.isFinite(parsed)) return round4(currentMethodFeeConfig.amount);
        return round4(Math.max(0, parsed));
    }, [currentMethodFeeConfig, serviceFeeInput]);

    const netItemsTotal = useMemo(
        () => round4(Math.max(0, cartSubtotal - calculatedDiscountAmount)),
        [cartSubtotal, calculatedDiscountAmount]
    );

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

        const vatableSales = round4(vatableGross / (1 + VAT_RATE));
        const vatAmount = round4(vatableGross - vatableSales);
        return {
            vatableSales,
            vatAmount,
            vatExemptSales,
            zeroRatedSales
        };
    }, [cart, cartSubtotal, netItemsTotal]);

    const cartTotal = useMemo(
        () => round4(netItemsTotal + serviceFeeAmount),
        [netItemsTotal, serviceFeeAmount]
    );

    const addToCart = (item) => {
        const defaultPrice = Number(item.default_sale_price ?? item.cost_per_unit ?? 0);
        setCart((prev) => {
            const existing = prev.find((line) => line.item_id === item.item_id);
            if (existing) {
                return prev.map((line) => (
                    line.item_id === item.item_id
                        ? { ...line, quantity: Number(line.quantity) + 1, vat_type: line.vat_type || item.vat_type || 'vatable' }
                        : line
                ));
            }
            return [
                ...prev,
                {
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: 1,
                    base_sale_price: defaultPrice,
                    sale_price: defaultPrice,
                    price_override_reason: '',
                    unit_of_measure: item.unit_of_measure,
                    vat_type: item.vat_type || 'vatable'
                }
            ];
        });
    };

    const updateCartLine = (itemId, patch) => {
        setCart((prev) => prev.map((line) => (
            line.item_id === itemId
                ? { ...line, ...patch }
                : line
        )));
    };

    const removeCartLine = (itemId) => {
        setCart((prev) => prev.filter((line) => line.item_id !== itemId));
    };

    const toggleFolderFilter = (folderId) => {
        setSelectedFolderId((prev) => (prev === folderId ? null : folderId));
    };

    const handleCheckout = async () => {
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }

        if (cart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }

        setCheckoutLoading(true);
        try {
            const payload = {
                idempotency_key: createIdempotencyKey(),
                terminal_id: 'WEB-POS-01',
                order_method: orderMethod,
                payment_type: paymentType,
                service_fee_amount: currentMethodFeeConfig?.enabled && serviceFeeEdited ? Number(serviceFeeAmount || 0) : undefined,
                discount_amount: Number(calculatedDiscountAmount || 0),
                discount_profile_name: selectedDiscount?.name || null,
                discount_rate: selectedDiscount ? Number(selectedDiscount.percentage) : null,
                shift_id: activeShiftId || undefined,
                lines: cart.map((line) => ({
                    item_id: line.item_id,
                    quantity: Number(line.quantity),
                    sale_price: Number(line.sale_price),
                    price_override_reason: String(line.price_override_reason || '').trim() || undefined
                }))
            };

            const data = await createPosCheckout(payload);
            setLastReceipt(data?.transaction || null);
            setCart([]);
            setSelectedDiscountProfile('');
            setServiceFeeEdited(false);
            if (typeof onCheckoutCompleted === 'function') {
                onCheckoutCompleted(data?.transaction || null);
            }
            toast.success(
                data?.idempotent_replay
                    ? 'Checkout replayed from idempotent request'
                    : 'Checkout completed successfully'
            );
            loadCatalog();
        } catch (error) {
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'POS checkout failed');
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

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant={viewMode === 'checkout' ? 'default' : 'outline'}
                    onClick={() => setViewMode('checkout')}
                >
                    Checkout
                </Button>
                <Button
                    type="button"
                    variant={viewMode === 'history' ? 'default' : 'outline'}
                    onClick={() => setViewMode('history')}
                    disabled={!canViewHistory}
                >
                    History
                </Button>
                <Button
                    type="button"
                    variant={viewMode === 'receipt' ? 'default' : 'outline'}
                    onClick={() => setViewMode('receipt')}
                    disabled={!lastReceipt}
                >
                    Receipt Preview
                </Button>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                    Tip: Use <span className="font-semibold text-slate-800">Checkout</span> for live selling, <span className="font-semibold text-slate-800">History</span> for audits, and <span className="font-semibold text-slate-800">Receipt Preview</span> for reprints.
                </p>
            </div>

            {viewMode === 'history' && (
                <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">POS Sales History</h2>
                            <p className="text-sm text-slate-600">Track invoice times, cashier accountability, and receipt totals.</p>
                        </div>
                        <Input
                            value={historySearch}
                            onChange={(event) => setHistorySearch(event.target.value)}
                            placeholder="Search by invoice number..."
                            className="sm:max-w-xs"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                        <select
                            value={historyStatus}
                            onChange={(event) => setHistoryStatus(event.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="all">All Status</option>
                            <option value="completed">Completed</option>
                            <option value="voided">Voided</option>
                        </select>
                        <select
                            value={historyPaymentType}
                            onChange={(event) => setHistoryPaymentType(event.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="all">All Payments</option>
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="maya">Maya</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                        </select>
                        <select
                            value={historyOrderMethod}
                            onChange={(event) => setHistoryOrderMethod(event.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="all">All Order Methods</option>
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                            <option value="delivery">Delivery</option>
                            <option value="online">Online</option>
                        </select>
                        <Input
                            type="number"
                            min="1"
                            value={historyCashierId}
                            onChange={(event) => setHistoryCashierId(event.target.value)}
                            placeholder="Cashier ID"
                        />
                        <Input
                            type="date"
                            value={historyDateFrom}
                            max={historyDateTo || undefined}
                            onChange={(event) => setHistoryDateFrom(event.target.value)}
                            placeholder="Date from"
                        />
                        <Input
                            type="date"
                            value={historyDateTo}
                            min={historyDateFrom || undefined}
                            max={toDateInput(new Date())}
                            onChange={(event) => setHistoryDateTo(event.target.value)}
                            placeholder="Date to"
                        />
                    </div>
                    {historyLoading ? (
                        <p className="text-sm text-slate-500">Loading transactions...</p>
                    ) : (
                        <div className="overflow-auto">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="text-left py-2">Invoice</th>
                                        <th className="text-left py-2">Datetime</th>
                                        <th className="text-left py-2">Cashier</th>
                                        <th className="text-left py-2">Payment</th>
                                        <th className="text-left py-2">Discount</th>
                                        <th className="text-right py-2">Fee</th>
                                        <th className="text-right py-2">Vatable</th>
                                        <th className="text-right py-2">VAT</th>
                                        <th className="text-right py-2">Total</th>
                                        <th className="text-right py-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyRows.map((row) => (
                                        <tr key={row.pos_transaction_id} className="border-b border-slate-100">
                                            <td className="py-2 font-medium text-slate-900">{row.invoice_number}</td>
                                            <td className="py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                                            <td className="py-2 text-slate-600">{row.cashier?.username || '-'}</td>
                                            <td className="py-2 text-slate-600 capitalize">{row.payment_type}</td>
                                            <td className="py-2 text-slate-600">
                                                {row.discount_label_snapshot
                                                    ? `${row.discount_label_snapshot}${row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : ''}`
                                                    : '-'}
                                            </td>
                                            <td className="py-2 text-right text-slate-600">PHP {money(row.service_fee_amount)}</td>
                                            <td className="py-2 text-right text-slate-600">PHP {money(row.vatable_sales)}</td>
                                            <td className="py-2 text-right text-slate-600">PHP {money(row.vat_amount)}</td>
                                            <td className="py-2 text-right font-semibold text-slate-900">PHP {money(row.total_amount)}</td>
                                            <td className="py-2 text-right">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openHistoryDetail(row.pos_transaction_id)}
                                                    disabled={historyDetailLoading}
                                                >
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {historyRows.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="py-6 text-center text-slate-500">No transactions found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => loadHistory(Math.max(1, historyPage - 1))}
                            disabled={historyLoading || historyPage <= 1}
                        >
                            Previous
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => loadHistory(historyPage + 1)}
                            disabled={historyLoading || !historyPagination || historyPage >= (historyPagination.totalPages || 1)}
                        >
                            Next
                        </Button>
                    </div>
                </section>
            )}

            {(viewMode === 'checkout' || viewMode === 'receipt') && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <section className="xl:col-span-9 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">POS Catalog</h2>
                        <p className="text-sm text-slate-600">Tap an item card to add it to the current cart.</p>
                    </div>
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search POS-visible items..."
                        className="sm:max-w-xs"
                        disabled={!canViewCatalog}
                    />
                </div>

                {!canViewCatalog && (
                    <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        POS view permission is required to load catalog data.
                    </p>
                )}

                <div className="mb-4">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900">POS Categories</h3>
                        {selectedFolderId && (
                            <button
                                type="button"
                                onClick={() => setSelectedFolderId(null)}
                                className="text-xs text-slate-500 hover:text-slate-700"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">Click category to filter. Click again to cancel.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedFolderId(null)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                !selectedFolderId
                                    ? 'border-teal-300 bg-teal-50 text-teal-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        active
                                            ? 'border-teal-300 bg-teal-50 text-teal-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                    {!posFoldersLoading && !posFoldersError && posFolders.length === 0 && (
                        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                            No POS folder filters available yet.
                        </p>
                    )}
                </div>

                {!canViewCatalog ? (
                    <p className="text-sm text-slate-600">Catalog data is hidden for this account.</p>
                ) : catalogLoading ? (
                    <p className="text-sm text-slate-500">Loading catalog...</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {catalog.map((item) => (
                            <div
                                key={item.item_id}
                                onClick={() => addToCart(item)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        addToCart(item);
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                className="text-left border border-slate-200 rounded-xl p-3 hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50 transition-all shadow-sm hover:shadow-md cursor-pointer"
                            >
                                <div className="mb-2">
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setImagePreview({
                                                src: item.pos_image_url || '',
                                                alt: `${item.name} menu`,
                                                hasImage: Boolean(item.pos_image_url)
                                            });
                                        }}
                                        className="w-full aspect-square max-h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                                        title={item.pos_image_url ? 'Click to enlarge image' : 'Click to preview placeholder'}
                                    >
                                        {item.pos_image_url ? (
                                            <img
                                                src={item.pos_image_url}
                                                alt={`${item.name} menu`}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-center">
                                                <span className="px-2 text-xs font-semibold text-slate-500">No POS Image</span>
                                            </div>
                                        )}
                                    </button>
                                </div>
                                <p className="text-lg font-semibold text-slate-900 leading-tight">{item.name}</p>
                                <p className="text-xs font-semibold tracking-wide bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent">
                                    {item.sku_code}
                                </p>
                                <div className="mt-2 text-xs text-slate-600 flex justify-between">
                                    <span className="font-medium bg-gradient-to-r from-teal-700 to-emerald-600 bg-clip-text text-transparent">
                                        Stock: {Number(item.current_stock || 0).toFixed(2)}
                                    </span>
                                    <span className="font-semibold text-slate-700">Default: PHP {money(item.default_sale_price ?? item.cost_per_unit)}</span>
                                </div>
                                <p className="mt-1 text-[11px] font-semibold bg-gradient-to-r from-indigo-700 via-sky-700 to-cyan-700 bg-clip-text text-transparent">
                                    VAT: {VAT_TYPE_LABEL[item.vat_type || 'vatable'] || 'VATable'}
                                </p>
                            </div>
                        ))}
                        {catalog.length === 0 && (
                            <p className="text-sm text-slate-600 col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                                No POS-visible items found. Enable items from Inventory first.
                            </p>
                        )}
                    </div>
                )}
            </section>

            <section className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Current Sale</h2>
                <p className="text-sm text-slate-600 mb-4">Review cart, pricing, VAT buckets, and final total before checkout.</p>
                <div className="space-y-3 mb-4">
                    <label className="text-xs text-slate-500 block">
                        Order Method
                        <select
                            value={orderMethod}
                            onChange={(event) => setOrderMethod(event.target.value)}
                            className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                            <option value="delivery">Delivery</option>
                            <option value="online">Online</option>
                        </select>
                    </label>

                    <label className="text-xs text-slate-500 block">
                        Payment Type
                        <select
                            value={paymentType}
                            onChange={(event) => setPaymentType(event.target.value)}
                            className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="maya">Maya</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                        </select>
                    </label>

                    {currentMethodFeeConfig?.enabled && (
                        <label className="text-xs text-slate-500 block">
                            {currentMethodFeeConfig.label || ORDER_METHOD_FEE_LABELS[orderMethod] || 'Service Fee'} (PHP)
                            <Input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={serviceFeeInput}
                                onChange={(event) => {
                                    setServiceFeeInput(event.target.value);
                                    setServiceFeeEdited(true);
                                }}
                                className="mt-1"
                            />
                            <span className="mt-1 block text-[11px] text-slate-500">
                                Configured default: PHP {money(currentMethodFeeConfig.amount)}.
                            </span>
                        </label>
                    )}
                </div>

                <div className="space-y-3 max-h-72 overflow-auto mb-4">
                    {cart.map((line) => (
                        <div key={line.item_id} className="border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-900">{line.item_name}</p>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {VAT_TYPE_LABEL[line.vat_type] || VAT_TYPE_LABEL.vatable}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <label className="text-xs text-slate-500">
                                    Qty
                                    <Input
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        value={line.quantity}
                                        onChange={(event) => updateCartLine(line.item_id, { quantity: Number(event.target.value || 0) })}
                                    />
                                </label>
                                <label className="text-xs text-slate-500">
                                    Price
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={line.sale_price}
                                        onChange={(event) => updateCartLine(line.item_id, {
                                            sale_price: Number(event.target.value || 0)
                                        })}
                                        disabled={!canOverridePrice}
                                    />
                                </label>
                            </div>
                            {canOverridePrice && Math.abs(Number(line.sale_price || 0) - Number(line.base_sale_price || 0)) > 0.0001 && (
                                <label className="text-xs text-slate-500 mt-2 block">
                                    Price Override Reason
                                    <Input
                                        value={line.price_override_reason || ''}
                                        onChange={(event) => updateCartLine(line.item_id, { price_override_reason: event.target.value })}
                                        placeholder="Required when changing price"
                                    />
                                </label>
                            )}
                            {!canOverridePrice && (
                                <p className="text-[11px] text-slate-500 mt-2">
                                    Price edit is disabled. Ask admin to grant <code>pos:price_override</code>.
                                </p>
                            )}
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-xs text-slate-500">
                                    Subtotal: PHP {money(Number(line.quantity) * Number(line.sale_price))}
                                </span>
                                <Button type="button" variant="outline" size="sm" onClick={() => removeCartLine(line.item_id)}>
                                    Remove
                                </Button>
                            </div>
                        </div>
                    ))}
                    {cart.length === 0 && (
                        <p className="text-sm text-slate-600 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                            Cart is empty. Select any product from the catalog to start a transaction.
                        </p>
                    )}
                </div>

                <label className="text-xs text-slate-500 block mb-3">
                    Discount Preset
                    <select
                        value={selectedDiscountProfile}
                        onChange={(event) => setSelectedDiscountProfile(event.target.value)}
                        className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                    >
                        <option value="">No Discount</option>
                        {discountProfiles
                            .filter((profile) => profile.active !== false)
                            .map((profile) => (
                                <option key={`discount-${profile.name}`} value={profile.name}>
                                    {profile.name} ({money(profile.percentage)}%)
                                </option>
                            ))}
                    </select>
                </label>

                <label className="text-xs text-slate-500 block mb-3">
                    Discount Amount
                    <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={money(calculatedDiscountAmount)}
                        readOnly
                        disabled
                    />
                    {selectedDiscount ? (
                        <span className="mt-1 block text-[11px] text-slate-500">
                            Auto-calculated from {selectedDiscount.name} ({money(selectedDiscount.percentage)}%).
                        </span>
                    ) : (
                        <span className="mt-1 block text-[11px] text-slate-500">
                            Select a configured discount preset in Settings &gt; POS Setup to apply a discount.
                        </span>
                    )}
                </label>

                <div className="text-sm border-t border-slate-200 bg-slate-50 rounded-xl p-3 space-y-1 mb-3">
                    <div className="flex justify-between">
                        <span className="text-slate-600">Items Subtotal</span>
                        <span className="font-medium">PHP {money(cartSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-600">
                            Discount{selectedDiscount ? ` (${selectedDiscount.name})` : ''}
                        </span>
                        <span className="font-medium text-rose-600">- PHP {money(calculatedDiscountAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-600">Net Items</span>
                        <span className="font-medium">PHP {money(netItemsTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-600">
                            {currentMethodFeeConfig?.label || ORDER_METHOD_FEE_LABELS[orderMethod] || 'Order Method Fee'}
                        </span>
                        <span className="font-medium text-slate-900">+ PHP {money(serviceFeeAmount)}</span>
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
                        <span className="font-semibold text-slate-900">Total</span>
                        <span className="text-lg font-bold text-slate-900">PHP {money(cartTotal)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    {checkoutBlockedReason && (
                        <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                            {checkoutBlockedReason}
                        </p>
                    )}
                    <Button
                        type="button"
                        onClick={handleCheckout}
                        disabled={Boolean(checkoutBlockedReason) || checkoutLoading || cart.length === 0}
                    >
                        {checkoutLoading ? 'Processing...' : 'Checkout'}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCloseDay} disabled={closingDay}>
                        {closingDay ? 'Generating...' : 'Close Day / Z-Reading'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.print()}
                        disabled={!lastReceipt}
                    >
                        Print Last Receipt
                    </Button>
                </div>
            </section>

            <section className="xl:col-span-3">
                <ReceiptPrintView transaction={lastReceipt} businessSettings={receiptSettings} />
            </section>
                </div>
            )}

            {imagePreview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
                    onClick={() => setImagePreview(null)}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl"
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
