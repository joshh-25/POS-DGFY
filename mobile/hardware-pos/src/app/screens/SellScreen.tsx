import React, { useEffect, useMemo, useState } from 'react';
import {
    type DimensionValue,
    Image,
    Modal,
    Pressable,
    ScrollView,
    View,
    useWindowDimensions
} from 'react-native';
import type { CatalogProduct } from '../../domain/catalog';
import type { HistoryRow } from '../../domain/history';
import type { PendingHistorySnapshot } from '../../services/pendingHistoryService';
import type { SellScreenCartLine } from '../store';
import { PosText as Text, PosTextInput as TextInput } from '../components/PosTextScale';
import { PosTextSizeControl } from '../components/PosTextSizeControl';
import { resolvePosLayout } from '../layoutPolicy';

const ORDER_METHOD_OPTIONS = ['Dine In', 'Takeout', 'Pickup', 'Delivery'];
const PAYMENT_TYPE_OPTIONS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank Transfer'];
const DISCOUNT_PRESET_OPTIONS = ['No Discount', 'Senior Citizen', 'PWD', 'Employee Meal'];
const DISCOUNT_TYPE_OPTIONS = ['No Manual Discount', 'Peso Discount', 'Percent Discount'];
const HISTORY_STATUS_OPTIONS = ['All Status', 'Pending Sync', 'Sync In Progress', 'Synced', 'Conflict', 'Manual Resolution Required'];
const HISTORY_SOURCE_OPTIONS = ['All Sources', 'In-Store', 'Online Store'];
const SIDEBAR_EXPANDED_WIDTH = 220;

const formatCurrency = (value: number): string => `PHP ${Number(value || 0).toFixed(2)}`;
const formatDateInputValue = (value: string | null): string => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};
const formatDateTimeParts = (value: string): { date: string; time: string } => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return { date: value, time: '' };
    }

    return {
        date: parsed.toLocaleDateString(),
        time: parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    };
};
const normalizeOrderMethodLabel = (value: string): string => String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
const normalizePaymentTypeLabel = (value: string): string => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'gcash') return 'GCash';
    if (normalized === 'maya') return 'Maya';
    if (normalized === 'card') return 'Card';
    if (normalized === 'bank_transfer') return 'Bank Transfer';
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Cash';
};
const normalizeHistoryStatusLabel = (value: HistoryRow['status'] | 'all'): string => {
    if (value === 'all') return 'All Status';
    if (value === 'sync_pending') return 'Pending Sync';
    if (value === 'sync_replaying') return 'Sync In Progress';
    if (value === 'failed_manual_resolution_required') return 'Manual Resolution Required';
    return normalizeOrderMethodLabel(value);
};
const toCatalogSourceLabel = (catalogSource: 'bundled_seed' | 'catalog_cache' | 'live_bootstrap'): string => {
    if (catalogSource === 'live_bootstrap') return 'Live Catalog';
    if (catalogSource === 'catalog_cache') return 'Cached Catalog';
    return 'Bundled Catalog';
};

const buildFallbackColor = (seed: string): string => {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = seed.charCodeAt(index) + ((hash << 5) - hash);
    }

    const palette = ['#DBEAFE', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#EDE9FE', '#FCE7D3'];
    return palette[Math.abs(hash) % palette.length];
};

const SidebarButton = ({
    label,
    description,
    active = false,
    compact = false,
    onPress
}: {
    label: string;
    description: string;
    active?: boolean;
    compact?: boolean;
    onPress: () => void;
}) => (
    <Pressable
        onPress={onPress}
        style={{
            backgroundColor: active ? '#1D4ED8' : '#FFFFFF',
            borderColor: active ? '#1D4ED8' : '#D9E2EC',
            borderWidth: 1,
            borderRadius: 18,
            paddingHorizontal: compact ? 10 : 14,
            paddingVertical: compact ? 12 : 14,
            marginBottom: 10
        }}
    >
        <Text style={{ color: active ? '#FFFFFF' : '#0F172A', fontSize: compact ? 12 : 18, fontWeight: '800' }}>
            {compact ? label.slice(0, 1) : label}
        </Text>
        {!compact ? (
            <Text style={{ color: active ? '#DBEAFE' : '#64748B', marginTop: 6, fontSize: 13, lineHeight: 18 }}>
                {description}
            </Text>
        ) : null}
    </Pressable>
);

const ActionButton = ({
    label,
    onPress,
    variant = 'default',
    disabled = false
}: {
    label: string;
    onPress: () => void;
    variant?: 'default' | 'primary' | 'muted';
    disabled?: boolean;
}) => {
    const backgroundColor = disabled
        ? '#E2E8F0'
        : variant === 'primary'
            ? '#1D4ED8'
            : variant === 'muted'
                ? '#FFFFFF'
                : '#F8FAFC';
    const color = disabled
        ? '#94A3B8'
        : variant === 'primary'
            ? '#FFFFFF'
            : '#0F172A';

    return (
        <Pressable
            disabled={disabled}
            onPress={onPress}
            style={{
                flex: 1,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: variant === 'primary' ? 0 : 1,
                borderColor: '#D9E2EC',
                backgroundColor,
                paddingHorizontal: 14,
                paddingVertical: 12
            }}
        >
            <Text style={{ color, fontSize: 14, fontWeight: '800' }}>{label}</Text>
        </Pressable>
    );
};

const DropdownField = ({
    label,
    value,
    options,
    onSelect,
    open,
    onToggle,
    compact = false
}: {
    label?: string;
    value: string;
    options: string[];
    onSelect: (nextValue: string) => void;
    open: boolean;
    onToggle: () => void;
    compact?: boolean;
}) => (
    <View style={{ marginBottom: compact ? 0 : 14 }}>
        {label ? <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{label}</Text> : null}
        <Pressable
            onPress={onToggle}
            style={{
                minHeight: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: open ? '#93C5FD' : '#D9E2EC',
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                shadowColor: '#0F172A',
                shadowOpacity: open ? 0.08 : 0.04,
                shadowRadius: open ? 10 : 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: open ? 3 : 1
            }}
        >
            <Text style={{ color: '#0F172A', fontSize: compact ? 13 : 15, fontWeight: '700' }}>{value}</Text>
            <View
                style={{
                    width: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 10
                }}
            >
                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900' }}>{open ? '/\\' : '\\/'}</Text>
            </View>
        </Pressable>
        {open ? (
            <View
                style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: '#D9E2EC',
                    borderRadius: 14,
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                    shadowColor: '#0F172A',
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 4
                }}
            >
                {options.map((option, index) => {
                    const active = option === value;
                    return (
                        <Pressable
                            key={option}
                            onPress={() => {
                                onSelect(option);
                                onToggle();
                            }}
                            style={{
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: active ? '#EFF6FF' : '#FFFFFF',
                                borderTopWidth: index === 0 ? 0 : 1,
                                borderTopColor: '#E2E8F0'
                            }}
                        >
                            <Text style={{ color: active ? '#1D4ED8' : '#0F172A', fontSize: compact ? 13 : 14, fontWeight: active ? '800' : '600' }}>
                                {option}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        ) : null}
    </View>
);

const SelectCard = ({
    label,
    value,
    options,
    onSelect,
    open,
    onToggle
}: {
    label: string;
    value: string;
    options: string[];
    onSelect: (nextValue: string) => void;
    open: boolean;
    onToggle: () => void;
}) => <DropdownField label={label} value={value} options={options} onSelect={onSelect} open={open} onToggle={onToggle} />;

const CompactSelectField = ({
    value,
    options,
    onSelect,
    open,
    onToggle
}: {
    value: string;
    options: string[];
    onSelect: (nextValue: string) => void;
    open: boolean;
    onToggle: () => void;
}) => <DropdownField value={value} options={options} onSelect={onSelect} open={open} onToggle={onToggle} compact />;

export const SellScreen = ({
    cashierName,
    catalog,
    cart,
    cartCount,
    pendingHistory,
    activeShiftId,
    lastReceipt,
    receiptPreviewVisible,
    syncStatusLabel,
    storageMode,
    connectivityMode,
    catalogSource,
    lastCatalogRefreshAt,
    settingsSummary,
    devicePolicySummary,
    hardwareMessage,
    loading,
    onAddToCart,
    onUpdateCartQuantity,
    onRemoveFromCart,
    onScanBarcode,
    onRefreshCatalog,
    onLockSession,
    onOpenCart,
    onCheckout,
    onOpenHistoryReceipt,
    onRefreshHistory,
    onOpenReceipt,
    onPrintLastReceipt,
    onOpenDrawer,
    onOpenShift,
    onOpenCloseShift,
    onOpenSyncCenter,
    onOpenAccountManagement,
    onCloseReceiptPreview
}: {
    cashierName: string;
    catalog: CatalogProduct[];
    cart: SellScreenCartLine[];
    cartCount: number;
    pendingHistory: PendingHistorySnapshot | null;
    activeShiftId: string | null;
    lastReceipt: {
        localTransactionId: string;
        cashierName: string;
        shiftId: string;
        createdAtLocal: string;
        total: number;
        paymentType: string;
        lines: Array<{ name: string; quantity: number; total: number }>;
        syncState: 'pending_sync' | 'synced';
    } | null;
    receiptPreviewVisible: boolean;
    syncStatusLabel: string;
    storageMode: 'memory' | 'sqlite';
    connectivityMode: 'offline_local' | 'online_live' | 'syncing' | 'degraded';
    catalogSource: 'bundled_seed' | 'catalog_cache' | 'live_bootstrap';
    lastCatalogRefreshAt: string | null;
    settingsSummary: string;
    devicePolicySummary: string;
    hardwareMessage: string;
    loading: boolean;
    onAddToCart: (product: CatalogProduct) => void;
    onUpdateCartQuantity: (itemId: number, nextQuantity: number) => void;
    onRemoveFromCart: (itemId: number) => void;
    onScanBarcode: () => void;
    onRefreshCatalog: () => void;
    onLockSession: () => void;
    onOpenCart: () => void;
    onCheckout: (options?: { paymentType?: string; orderMethod?: string }) => void;
    onOpenHistoryReceipt: (localTransactionId: string) => void;
    onRefreshHistory: () => Promise<void>;
    onOpenReceipt: () => void;
    onPrintLastReceipt: () => void;
    onOpenDrawer: () => void;
    onOpenShift: () => void;
    onOpenCloseShift: () => void;
    onOpenSyncCenter: () => void;
    onOpenAccountManagement: () => void;
    onCloseReceiptPreview: () => void;
}) => {
    const { width, height } = useWindowDimensions();
    const { isTabletDevice, isTabletLayout, isCompactTablet, isLargeTablet, catalogColumns } = resolvePosLayout(width, height);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [activeCenterPanel, setActiveCenterPanel] = useState<'catalog' | 'history'>('catalog');
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All Items');
    const [orderMethod, setOrderMethod] = useState('Dine In');
    const [paymentType, setPaymentType] = useState('Cash');
    const [discountPreset, setDiscountPreset] = useState('No Discount');
    const [discountType, setDiscountType] = useState('No Manual Discount');
    const [discountAmountInput, setDiscountAmountInput] = useState('0.00');
    const [historySearch, setHistorySearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState('All Status');
    const [historyPayment, setHistoryPayment] = useState('All Payments');
    const [historyOrderMethod, setHistoryOrderMethod] = useState('All Order Methods');
    const [historySource, setHistorySource] = useState('All Sources');
    const [historyCashierId, setHistoryCashierId] = useState('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [checkoutConfirmModalOpen, setCheckoutConfirmModalOpen] = useState(false);
    const [customerPaymentAmountInput, setCustomerPaymentAmountInput] = useState('0');
    const [receiptPaperWidth, setReceiptPaperWidth] = useState('80mm (3 1/8 in)');

    const categories = useMemo(
        () => ['All Items', ...Array.from(new Set(catalog.map((product) => product.categoryName))).sort()],
        [catalog]
    );

    const filteredCatalog = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return catalog.filter((product) => {
            const matchesCategory = selectedCategory === 'All Items' || product.categoryName === selectedCategory;
            const haystack = `${product.itemName} ${product.categoryName}`.toLowerCase();
            const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
            return matchesCategory && matchesSearch;
        });
    }, [catalog, search, selectedCategory]);

    const currentSubtotal = useMemo(
        () => cart.reduce((sum, line) => sum + (line.price * line.quantity), 0),
        [cart]
    );
    const convenienceFee = Number((currentSubtotal * 0.01).toFixed(2));
    const vatAmount = Number((currentSubtotal * 0.12).toFixed(2));
    const manualDiscountAmount = useMemo(() => {
        const parsed = Number(discountAmountInput || 0);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 0;
        }
        if (discountType === 'Percent Discount') {
            return Number((currentSubtotal * (parsed / 100)).toFixed(2));
        }
        if (discountType === 'Peso Discount') {
            return Number(Math.min(currentSubtotal, parsed).toFixed(2));
        }
        return 0;
    }, [currentSubtotal, discountAmountInput, discountType]);
    const netItems = Number(Math.max(0, currentSubtotal - manualDiscountAmount).toFixed(2));
    const vatableSales = Number((netItems / 1.12).toFixed(2));
    const vatAmountNet = Number((netItems - vatableSales).toFixed(2));
    const totalDue = Number((netItems + convenienceFee).toFixed(2));
    const checkoutDue = currentSubtotal;
    const normalizedPaymentType = paymentType.replace(/\s+/g, '_').toLowerCase();
    const isCashPayment = normalizedPaymentType === 'cash';
    const customerPaymentAmount = Number(customerPaymentAmountInput || 0);
    const normalizedCustomerPaymentAmount = Number.isFinite(customerPaymentAmount) ? customerPaymentAmount : 0;
    const customerPaymentChange = Number(Math.max(0, normalizedCustomerPaymentAmount - checkoutDue).toFixed(2));
    const customerPaymentShortfall = Number(Math.max(0, checkoutDue - normalizedCustomerPaymentAmount).toFixed(2));
    const isCustomerPaymentSufficient = customerPaymentShortfall <= 0;
    const customerPaymentFieldLabel = isCashPayment ? 'TOTAL PAYMENT' : 'RECEIVED PAYMENT';
    const workspaceTitle = activeCenterPanel === 'history' ? 'History' : 'POS Catalog';
    const workspaceSubtitle = activeCenterPanel === 'history'
        ? 'Transaction history, pending local receipts, and sync state for this device.'
        : `Terminal ${activeShiftId || 'not opened'}: cashier workspace for sell, orders, receipts, and shift controls.`;
    const historyRows = pendingHistory?.rows ?? [];
    const filteredHistoryRows = useMemo(() => historyRows.filter((row) => {
        const invoiceMatches = !historySearch.trim() || row.localTransactionId.toLowerCase().includes(historySearch.trim().toLowerCase());
        const statusMatches = historyStatus === 'All Status' || normalizeHistoryStatusLabel(row.status) === historyStatus;
        const paymentMatches = historyPayment === 'All Payments' || normalizePaymentTypeLabel(row.paymentType) === historyPayment;
        const orderMethodMatches = historyOrderMethod === 'All Order Methods' || normalizeOrderMethodLabel(row.orderMethod) === historyOrderMethod;
        const sourceLabel = row.orderSource === 'online_store' ? 'Online Store' : 'In-Store';
        const sourceMatches = historySource === 'All Sources' || sourceLabel === historySource;
        const cashierMatches = !historyCashierId.trim() || String(row.cashierId).includes(historyCashierId.trim());
        const rowDate = formatDateInputValue(row.createdAtLocal);
        const dateFromMatches = !historyDateFrom || (rowDate && rowDate >= historyDateFrom);
        const dateToMatches = !historyDateTo || (rowDate && rowDate <= historyDateTo);
        return invoiceMatches && statusMatches && paymentMatches && orderMethodMatches && sourceMatches && cashierMatches && dateFromMatches && dateToMatches;
    }), [
        historyRows,
        historySearch,
        historyStatus,
        historyPayment,
        historyOrderMethod,
        historySource,
        historyCashierId,
        historyDateFrom,
        historyDateTo
    ]);
    const receiptDateLabel = useMemo(() => {
        if (!lastReceipt?.createdAtLocal) {
            return '';
        }
        const parsed = new Date(lastReceipt.createdAtLocal);
        if (Number.isNaN(parsed.getTime())) {
            return lastReceipt.createdAtLocal;
        }
        return parsed.toLocaleString();
    }, [lastReceipt?.createdAtLocal]);
    const receiptSubtotal = useMemo(
        () => Number((lastReceipt?.lines.reduce((sum, line) => sum + Number(line.total || 0), 0) ?? 0).toFixed(2)),
        [lastReceipt]
    );
    const receiptItemsCount = useMemo(
        () => lastReceipt?.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0) ?? 0,
        [lastReceipt]
    );

    useEffect(() => {
        if (checkoutConfirmModalOpen && cart.length === 0 && !loading) {
            setCheckoutConfirmModalOpen(false);
        }
    }, [cart.length, checkoutConfirmModalOpen, loading]);

    const sidebarActions = [
        {
            label: 'Sell',
            description: 'Live selling and cart management',
            onPress: () => {
                setMobileSidebarOpen(false);
                setActiveCenterPanel('catalog');
            },
            active: activeCenterPanel === 'catalog'
        },
        {
            label: 'History',
            description: 'Invoice lookups and audit trail',
            onPress: () => {
                setMobileSidebarOpen(false);
                void onRefreshHistory().then(() => {
                    setActiveCenterPanel('history');
                });
            },
            active: activeCenterPanel === 'history'
        },
        { label: 'Receipt', description: 'Open the latest local receipt preview', onPress: () => { setMobileSidebarOpen(false); onOpenReceipt(); } },
        { label: 'Shift', description: activeShiftId ? 'Close or review the active shift' : 'Open a new shift before selling', onPress: () => { setMobileSidebarOpen(false); activeShiftId ? onOpenCloseShift() : onOpenShift(); } }
    ];

    const secondaryActions = [
        { label: 'Sync', description: 'Run manual sync and inspect pending items', onPress: () => { setMobileSidebarOpen(false); void onOpenSyncCenter(); } },
        { label: 'Accounts', description: 'Manage cached device cashier access', onPress: () => { setMobileSidebarOpen(false); void onOpenAccountManagement(); } },
        { label: 'Full Cart', description: 'Review the sale and confirm payment in the checkout modal', onPress: () => { setMobileSidebarOpen(false); setCheckoutConfirmModalOpen(true); } },
        { label: 'Lock', description: 'Lock this cashier session', onPress: () => { setMobileSidebarOpen(false); void onLockSession(); } }
    ];

    const openCheckoutConfirmModal = () => {
        if (cart.length === 0) {
            return;
        }
        setCustomerPaymentAmountInput('0');
        setCheckoutConfirmModalOpen(true);
    };

    const handleConfirmCheckout = () => {
        if (!isCustomerPaymentSufficient || cart.length === 0 || loading) {
            return;
        }
        void onCheckout({ paymentType, orderMethod });
    };

    const renderSidebar = (compact = false) => (
        <View
            style={{
                width: SIDEBAR_EXPANDED_WIDTH,
                backgroundColor: '#FFFFFF',
                borderRightWidth: 1,
                borderRightColor: '#E2E8F0',
                paddingHorizontal: compact ? 14 : 12,
                paddingVertical: 18
            }}
        >
            <Text style={{ color: '#0F172A', fontSize: compact ? 22 : 20, fontWeight: '900', marginBottom: 6 }}>
                DGFY
            </Text>
            <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 18 }}>Hardware POS workspace</Text>

            <Text style={{ color: '#334155', fontSize: 11, fontWeight: '900', marginBottom: 10 }}>PRIMARY MODES</Text>
                    {sidebarActions.map((action) => (
                        <SidebarButton
                            key={action.label}
                            label={action.label}
                            description={action.description}
                            active={action.active}
                            compact={false}
                            onPress={action.onPress}
                        />
                    ))}

            <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 }} />
            <Text style={{ color: '#334155', fontSize: 11, fontWeight: '900', marginBottom: 10 }}>SECONDARY ACTIONS</Text>
                    {secondaryActions.map((action) => (
                        <SidebarButton
                            key={action.label}
                            label={action.label}
                            description={action.description}
                            compact={false}
                            onPress={action.onPress}
                        />
                    ))}
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 16 }}>
                <View
                    style={{
                        flex: 1,
                        flexDirection: isTabletLayout ? 'row' : 'column',
                        borderRadius: 24,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: '#D9E2EC',
                        backgroundColor: '#FFFFFF'
                    }}
                >
                    {isTabletLayout && !isCompactTablet && !sidebarCollapsed ? renderSidebar(false) : null}

                    <View style={{ flex: 1, flexDirection: isTabletLayout ? 'row' : 'column', minHeight: 0 }}>
                        <View
                            style={{
                                flex: 1,
                                minHeight: 0,
                                borderRightWidth: isTabletLayout && activeCenterPanel === 'catalog' ? 1 : 0,
                                borderRightColor: '#E2E8F0'
                            }}
                        >
                            <View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 18,
                                    paddingVertical: 16,
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#E2E8F0'
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Pressable
                                        onPress={() => {
                                            if (isTabletLayout && !isCompactTablet) {
                                                setSidebarCollapsed((current) => !current);
                                                return;
                                            }
                                            setMobileSidebarOpen(true);
                                        }}
                                        style={{
                                            width: 42,
                                            height: 42,
                                            borderRadius: 14,
                                            borderWidth: 1,
                                            borderColor: '#D9E2EC',
                                            backgroundColor: '#F8FAFC',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginRight: 12
                                        }}
                                    >
                                        <View style={{ width: 18 }}>
                                            <View style={{ height: 2, borderRadius: 999, backgroundColor: '#1E3A8A', marginBottom: 3 }} />
                                            <View style={{ height: 2, borderRadius: 999, backgroundColor: '#1E3A8A', marginBottom: 3 }} />
                                            <View style={{ height: 2, borderRadius: 999, backgroundColor: '#1E3A8A' }} />
                                        </View>
                                    </Pressable>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#0F172A', fontSize: 28, fontWeight: '900' }}>{workspaceTitle}</Text>
                                        <Text style={{ color: '#64748B', marginTop: 4 }}>{workspaceSubtitle}</Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                                    <PosTextSizeControl compact={!isTabletLayout} />
                                    {isTabletLayout ? (
                                        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                                        <Text style={{ color: '#0F172A', fontWeight: '800' }}>{cashierName || 'Cashier'}</Text>
                                        <Text style={{ color: '#64748B', marginTop: 2 }}>{activeShiftId ? 'Shift active' : 'Shift closed'}</Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>

                            <ScrollView contentContainerStyle={{ padding: 18 }}>
                                {activeCenterPanel === 'catalog' ? (
                                    <>
                                        <View
                                            style={{
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: catalogSource === 'live_bootstrap' ? '#86EFAC' : catalogSource === 'catalog_cache' ? '#FCD34D' : '#BFDBFE',
                                                backgroundColor: catalogSource === 'live_bootstrap' ? '#F0FDF4' : catalogSource === 'catalog_cache' ? '#FFFBEB' : '#EFF6FF',
                                                padding: 16,
                                                marginBottom: 16
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '900' }}>
                                                        {toCatalogSourceLabel(catalogSource)} • {catalog.length} items
                                                    </Text>
                                                    <Text style={{ color: '#475569', marginTop: 6 }}>
                                                        {hardwareMessage}
                                                    </Text>
                                                </View>
                                                <View
                                                    style={{
                                                        borderRadius: 999,
                                                        backgroundColor: connectivityMode === 'online_live' ? '#DCFCE7' : connectivityMode === 'degraded' ? '#FEF3C7' : '#E2E8F0',
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 6
                                                    }}
                                                >
                                                    <Text style={{ color: connectivityMode === 'online_live' ? '#166534' : connectivityMode === 'degraded' ? '#92400E' : '#475569', fontWeight: '900' }}>
                                                        {connectivityMode === 'online_live' ? 'ONLINE' : connectivityMode === 'degraded' ? 'CACHED' : 'OFFLINE'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={{ color: '#64748B', marginTop: 8, fontSize: 12 }}>
                                                Last catalog refresh: {lastCatalogRefreshAt || 'not synced yet'}
                                            </Text>
                                        </View>

                                        <View
                                            style={{
                                                borderRadius: 24,
                                                borderWidth: 1,
                                                borderColor: '#D9E2EC',
                                                backgroundColor: '#F8FAFC',
                                                padding: 18
                                            }}
                                        >
                                            <View style={{ flexDirection: isCompactTablet || isTabletLayout ? 'row' : 'column', gap: 12 }}>
                                                <TextInput
                                                    value={search}
                                                    onChangeText={setSearch}
                                                    placeholder="Search POS-visible items..."
                                                    placeholderTextColor="#94A3B8"
                                                    style={{
                                                        flex: 1,
                                                        minHeight: 52,
                                                        borderRadius: 16,
                                                        borderWidth: 1,
                                                        borderColor: '#CBD5E1',
                                                        backgroundColor: '#FFFFFF',
                                                        paddingHorizontal: 16,
                                                        color: '#0F172A'
                                                    }}
                                                />
                                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                                    <Pressable
                                                        onPress={() => {
                                                            const currentIndex = categories.indexOf(selectedCategory);
                                                            const nextIndex = currentIndex >= categories.length - 1 ? 0 : currentIndex + 1;
                                                            setSelectedCategory(categories[nextIndex]);
                                                        }}
                                                        style={{
                                                            minHeight: 52,
                                                            minWidth: 120,
                                                            paddingHorizontal: 14,
                                                            borderRadius: 16,
                                                            borderWidth: 1,
                                                            borderColor: '#CBD5E1',
                                                            backgroundColor: '#FFFFFF',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        <Text style={{ color: '#0F172A', fontWeight: '800' }}>Filter</Text>
                                                        <Text style={{ color: '#64748B', marginTop: 4, fontSize: 12 }}>{selectedCategory}</Text>
                                                    </Pressable>
                                                    <Pressable
                                                        onPress={onScanBarcode}
                                                        style={{
                                                            minHeight: 52,
                                                            minWidth: 100,
                                                            paddingHorizontal: 14,
                                                            borderRadius: 16,
                                                            borderWidth: 1,
                                                            borderColor: '#CBD5E1',
                                                            backgroundColor: '#FFFFFF',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        <Text style={{ color: '#0F172A', fontWeight: '800' }}>Scan</Text>
                                                        <Text style={{ color: '#64748B', marginTop: 4, fontSize: 12 }}>Barcode</Text>
                                                    </Pressable>
                                                </View>
                                            </View>

                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={{ paddingTop: 14, gap: 10 }}
                                            >
                                                {categories.map((category) => {
                                                    const active = category === selectedCategory;
                                                    return (
                                                        <Pressable
                                                            key={category}
                                                            onPress={() => setSelectedCategory(category)}
                                                            style={{
                                                                borderRadius: 999,
                                                                borderWidth: 1,
                                                                borderColor: active ? '#1D4ED8' : '#D9E2EC',
                                                                backgroundColor: active ? '#DBEAFE' : '#FFFFFF',
                                                                paddingHorizontal: 14,
                                                                paddingVertical: 10
                                                            }}
                                                        >
                                                            <Text style={{ color: active ? '#1D4ED8' : '#334155', fontWeight: '800' }}>{category}</Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>

                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                flexWrap: 'wrap',
                                                marginTop: 16,
                                                marginHorizontal: -6
                                            }}
                                        >
                                            {filteredCatalog.length === 0 ? (
                                                <View
                                                    style={{
                                                        width: '100%',
                                                        borderRadius: 20,
                                                        borderWidth: 1,
                                                        borderColor: '#D9E2EC',
                                                        borderStyle: 'dashed',
                                                        backgroundColor: '#F8FAFC',
                                                        padding: 24
                                                    }}
                                                >
                                                    <Text style={{ color: '#0F172A', fontSize: 18, fontWeight: '800' }}>No matching POS items</Text>
                                                    <Text style={{ color: '#64748B', marginTop: 8 }}>
                                                        Try another category or search term, or refresh the local device catalog.
                                                    </Text>
                                                </View>
                                            ) : null}

                                            {filteredCatalog.map((product) => {
                                                const inCart = cart.find((line) => line.itemId === product.itemId);
                                                const cardWidth = `${100 / catalogColumns}%` as DimensionValue;
                                                const fallbackColor = buildFallbackColor(product.itemName);
                                                return (
                                                    <View key={product.itemId} style={{ width: cardWidth, paddingHorizontal: 6, paddingBottom: 12 }}>
                                                        <Pressable
                                                            onPress={() => onAddToCart(product)}
                                                            style={{
                                                                borderRadius: 22,
                                                                borderWidth: 1,
                                                                borderColor: '#D9E2EC',
                                                                backgroundColor: '#FFFFFF',
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {product.imageUrl ? (
                                                                <Image
                                                                    source={{ uri: product.imageUrl }}
                                                                    resizeMode="cover"
                                                                    style={{ width: '100%', height: 128, backgroundColor: '#E2E8F0' }}
                                                                />
                                                            ) : (
                                                                <View
                                                                    style={{
                                                                        height: 128,
                                                                        backgroundColor: fallbackColor,
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        paddingHorizontal: 18
                                                                    }}
                                                                >
                                                                    <Text style={{ color: '#1E3A8A', fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
                                                                        {product.itemName}
                                                                    </Text>
                                                                </View>
                                                            )}

                                                            <View style={{ padding: 14 }}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                                                    <View style={{ flex: 1 }}>
                                                                        <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '900' }}>{product.itemName}</Text>
                                                                        <Text style={{ color: '#64748B', marginTop: 4 }}>{product.categoryName}</Text>
                                                                    </View>
                                                                    {inCart ? (
                                                                        <View style={{ borderRadius: 999, backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 6 }}>
                                                                            <Text style={{ color: '#1D4ED8', fontWeight: '900' }}>x{inCart.quantity}</Text>
                                                                        </View>
                                                                    ) : null}
                                                                </View>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                                                                    <Text style={{ color: '#0F766E', fontSize: 18, fontWeight: '900' }}>{formatCurrency(product.price)}</Text>
                                                                    <Text style={{ color: '#64748B', fontSize: 12 }}>Tap to add</Text>
                                                                </View>
                                                            </View>
                                                        </Pressable>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <View
                                            style={{
                                                borderRadius: 24,
                                                borderWidth: 1,
                                                borderColor: '#D9E2EC',
                                                backgroundColor: '#FFFFFF',
                                                padding: 18
                                            }}
                                        >
                                            <TextInput
                                                value={historySearch}
                                                onChangeText={setHistorySearch}
                                                placeholder="Search by invoice number..."
                                                placeholderTextColor="#94A3B8"
                                                style={{
                                                    minHeight: 52,
                                                    borderRadius: 16,
                                                    borderWidth: 1,
                                                    borderColor: '#CBD5E1',
                                                    backgroundColor: '#FFFFFF',
                                                    paddingHorizontal: 16,
                                                    color: '#0F172A'
                                                }}
                                            />

                                            <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 18 }} />

                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                                                {[
                                                    { label: 'Status', value: historyStatus, options: HISTORY_STATUS_OPTIONS, onSelect: setHistoryStatus },
                                                    { label: 'Payments', value: historyPayment, options: ['All Payments', ...PAYMENT_TYPE_OPTIONS], onSelect: setHistoryPayment },
                                                    { label: 'Order Methods', value: historyOrderMethod, options: ['All Order Methods', ...ORDER_METHOD_OPTIONS], onSelect: setHistoryOrderMethod },
                                                    { label: 'Sources', value: historySource, options: HISTORY_SOURCE_OPTIONS, onSelect: setHistorySource },
                                                    { label: 'Cashier ID', value: historyCashierId || 'All Cashiers', options: [], onSelect: () => {} },
                                                    { label: 'Date From', value: historyDateFrom || 'Any Date', options: [], onSelect: () => {} },
                                                    { label: 'Date To', value: historyDateTo || 'Any Date', options: [], onSelect: () => {} }
                                                ].map((field) => (
                                                    <View key={field.label} style={{ width: isTabletLayout ? '25%' : isCompactTablet ? '50%' : '100%', paddingHorizontal: 6, paddingBottom: 12 }}>
                                                        <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{field.label}</Text>
                                                        {field.options.length > 0 ? (
                                                            <CompactSelectField
                                                                value={field.value}
                                                                options={field.options}
                                                                onSelect={field.onSelect}
                                                                open={openDropdown === `history-${field.label}`}
                                                                onToggle={() => setOpenDropdown((current) => current === `history-${field.label}` ? null : `history-${field.label}`)}
                                                            />
                                                        ) : field.label === 'Cashier ID' ? (
                                                            <TextInput
                                                                value={historyCashierId}
                                                                onChangeText={setHistoryCashierId}
                                                                placeholder="Search cashier ID..."
                                                                placeholderTextColor="#94A3B8"
                                                                keyboardType="numeric"
                                                                style={{
                                                                    minHeight: 52,
                                                                    borderRadius: 16,
                                                                    borderWidth: 1,
                                                                    borderColor: '#CBD5E1',
                                                                    backgroundColor: '#FFFFFF',
                                                                    paddingHorizontal: 16,
                                                                    color: '#0F172A'
                                                                }}
                                                            />
                                                        ) : (
                                                            <TextInput
                                                                value={field.label === 'Date From' ? historyDateFrom : historyDateTo}
                                                                onChangeText={field.label === 'Date From' ? setHistoryDateFrom : setHistoryDateTo}
                                                                placeholder="YYYY-MM-DD"
                                                                placeholderTextColor="#94A3B8"
                                                                style={{
                                                                    minHeight: 52,
                                                                    borderRadius: 16,
                                                                    borderWidth: 1,
                                                                    borderColor: '#CBD5E1',
                                                                    backgroundColor: '#FFFFFF',
                                                                    paddingHorizontal: 16,
                                                                    color: '#0F172A'
                                                                }}
                                                            />
                                                        )}
                                                    </View>
                                                ))}
                                            </View>

                                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                                                <Pressable
                                                    onPress={() => {
                                                        setHistorySearch('');
                                                        setHistoryStatus('All Status');
                                                        setHistoryPayment('All Payments');
                                                        setHistoryOrderMethod('All Order Methods');
                                                        setHistorySource('All Sources');
                                                        setHistoryCashierId('');
                                                        setHistoryDateFrom('');
                                                        setHistoryDateTo('');
                                                    }}
                                                    style={{
                                                        minHeight: 52,
                                                        flex: 1,
                                                        borderRadius: 16,
                                                        borderWidth: 1,
                                                        borderColor: '#CBD5E1',
                                                        backgroundColor: '#FFFFFF',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <Text style={{ color: '#334155', fontWeight: '900' }}>Reset</Text>
                                                </Pressable>
                                                <Pressable
                                                    onPress={() => {
                                                        void onRefreshHistory();
                                                    }}
                                                    style={{
                                                        minHeight: 52,
                                                        flex: 1,
                                                        borderRadius: 16,
                                                        backgroundColor: '#1D4ED8',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Apply Filters</Text>
                                                </Pressable>
                                            </View>
                                        </View>

                                        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                <View style={{ minWidth: isLargeTablet ? 1080 : isTabletDevice ? 820 : 860 }}>
                                                    <View style={{ flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                                                        {['Invoice', 'Datetime', 'Source', 'Payment', 'Cashier', 'Status', 'Vatable', 'VAT', 'Total', 'Action'].map((column, index) => (
                                                            <Text
                                                                key={column}
                                                                style={{
                                                                    width: index === 0 ? 150 : index === 1 ? 150 : index === 2 ? 120 : index === 9 ? 110 : 100,
                                                                    color: column === 'Total' ? '#1D4ED8' : '#0F172A',
                                                                    fontSize: 13,
                                                                    fontWeight: '900',
                                                                    paddingHorizontal: 8
                                                                }}
                                                            >
                                                                {column}
                                                            </Text>
                                                        ))}
                                                    </View>

                                                    {filteredHistoryRows.length > 0 ? filteredHistoryRows.map((row) => {
                                                        const dateTime = formatDateTimeParts(row.createdAtLocal);
                                                        const vatable = Number((row.grandTotal / 1.12).toFixed(2));
                                                        const vat = Number((row.grandTotal - vatable).toFixed(2));
                                                        const sourceLabel = row.orderSource === 'online_store' ? 'Online Store' : 'In-Store';
                                                        const sourceColors = row.orderSource === 'online_store'
                                                            ? { backgroundColor: '#E0F2FE', color: '#0369A1' }
                                                            : { backgroundColor: '#DCFCE7', color: '#047857' };
                                                        const statusColors = row.authoritative
                                                            ? { backgroundColor: '#DCFCE7', color: '#047857' }
                                                            : row.attentionRequired
                                                                ? { backgroundColor: '#FED7AA', color: '#B45309' }
                                                                : { backgroundColor: '#FEF3C7', color: '#B45309' };

                                                        return (
                                                            <View
                                                                key={row.localTransactionId}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    paddingVertical: 16,
                                                                    borderBottomWidth: 1,
                                                                    borderBottomColor: '#F1F5F9'
                                                                }}
                                                            >
                                                                <View style={{ width: 150, paddingHorizontal: 8 }}>
                                                                    <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '900' }}>{row.localTransactionId}</Text>
                                                                    <Text style={{ color: '#64748B', marginTop: 4, fontSize: 12 }}>{row.shiftId}</Text>
                                                                </View>
                                                                <View style={{ width: 150, paddingHorizontal: 8 }}>
                                                                    <Text style={{ color: '#334155' }}>{dateTime.date}</Text>
                                                                    <Text style={{ color: '#334155', marginTop: 4 }}>{dateTime.time || '-'}</Text>
                                                                </View>
                                                                <View style={{ width: 120, paddingHorizontal: 8 }}>
                                                                    <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: sourceColors.backgroundColor, paddingHorizontal: 12, paddingVertical: 8 }}>
                                                                        <Text style={{ color: sourceColors.color, fontWeight: '800' }}>{sourceLabel}</Text>
                                                                    </View>
                                                                </View>
                                                                <Text style={{ width: 100, paddingHorizontal: 8, color: '#334155' }}>{normalizePaymentTypeLabel(row.paymentType)}</Text>
                                                                <Text style={{ width: 100, paddingHorizontal: 8, color: '#334155' }}>{cashierName || `#${row.cashierId}`}</Text>
                                                                <View style={{ width: 100, paddingHorizontal: 8 }}>
                                                                    <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: statusColors.backgroundColor, paddingHorizontal: 12, paddingVertical: 8 }}>
                                                                        <Text style={{ color: statusColors.color, fontWeight: '800' }}>{row.statusLabel}</Text>
                                                                    </View>
                                                                </View>
                                                                <Text style={{ width: 100, paddingHorizontal: 8, color: '#334155' }}>{formatCurrency(vatable)}</Text>
                                                                <Text style={{ width: 100, paddingHorizontal: 8, color: '#334155' }}>{formatCurrency(vat)}</Text>
                                                                <Text style={{ width: 100, paddingHorizontal: 8, color: '#1D4ED8', fontWeight: '900' }}>{formatCurrency(row.grandTotal)}</Text>
                                                                <View style={{ width: 110, paddingHorizontal: 8 }}>
                                                                    <Pressable
                                                                        onPress={() => void onOpenHistoryReceipt(row.localTransactionId)}
                                                                        style={{
                                                                            minHeight: 44,
                                                                            borderRadius: 14,
                                                                            borderWidth: 1,
                                                                            borderColor: '#CBD5E1',
                                                                            backgroundColor: '#FFFFFF',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center'
                                                                        }}
                                                                    >
                                                                        <Text style={{ color: '#0F172A', fontWeight: '900' }}>View Receipt</Text>
                                                                    </Pressable>
                                                                </View>
                                                            </View>
                                                        );
                                                    }) : (
                                                        <View
                                                            style={{
                                                                borderRadius: 20,
                                                                borderWidth: 1,
                                                                borderStyle: 'dashed',
                                                                borderColor: '#CBD5E1',
                                                                backgroundColor: '#F8FAFC',
                                                                padding: 24,
                                                                marginTop: 16
                                                            }}
                                                        >
                                                            <Text style={{ color: '#0F172A', fontSize: 18, fontWeight: '800' }}>No history items found</Text>
                                                            <Text style={{ color: '#64748B', marginTop: 8 }}>
                                                                Adjust the invoice filters or complete a sale to populate this history view.
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </ScrollView>
                                        </View>
                                    </>
                                )}
                            </ScrollView>
                        </View>

                        {activeCenterPanel === 'catalog' ? (
                            <View
                                style={{
                                    width: isTabletLayout ? 350 : undefined,
                                    borderTopWidth: isTabletLayout ? 0 : 1,
                                    borderTopColor: '#E2E8F0',
                                    backgroundColor: '#FFFFFF'
                                }}
                            >
                            <ScrollView contentContainerStyle={{ padding: 18 }}>
                                <Text style={{ color: '#0F172A', fontSize: 34, fontWeight: '900' }}>Current Sale</Text>
                                <Text style={{ color: '#64748B', marginTop: 8 }}>
                                    Live cart, receipt preview, and checkout controls stay visible while selling.
                                </Text>

                                <View style={{ marginTop: 18 }}>
                                    <SelectCard
                                        label="Order Method"
                                        value={orderMethod}
                                        options={ORDER_METHOD_OPTIONS}
                                        onSelect={setOrderMethod}
                                        open={openDropdown === 'sell-order-method'}
                                        onToggle={() => setOpenDropdown((current) => current === 'sell-order-method' ? null : 'sell-order-method')}
                                    />
                                    <SelectCard
                                        label="Payment Type"
                                        value={paymentType}
                                        options={PAYMENT_TYPE_OPTIONS}
                                        onSelect={setPaymentType}
                                        open={openDropdown === 'sell-payment-type'}
                                        onToggle={() => setOpenDropdown((current) => current === 'sell-payment-type' ? null : 'sell-payment-type')}
                                    />
                                    <SelectCard
                                        label="Discount Preset"
                                        value={discountPreset}
                                        options={DISCOUNT_PRESET_OPTIONS}
                                        onSelect={(nextValue) => {
                                            setDiscountPreset(nextValue);
                                            if (nextValue !== 'No Discount') {
                                                setDiscountType('No Manual Discount');
                                                setDiscountAmountInput('0.00');
                                            }
                                        }}
                                        open={openDropdown === 'sell-discount-preset'}
                                        onToggle={() => setOpenDropdown((current) => current === 'sell-discount-preset' ? null : 'sell-discount-preset')}
                                    />
                                    <Text style={{ color: '#64748B', fontSize: 12, marginTop: -6, marginBottom: 12 }}>
                                        Preset discounts cannot combine with manual discounts.
                                    </Text>
                                    <SelectCard
                                        label="Discount Type"
                                        value={discountType}
                                        options={DISCOUNT_TYPE_OPTIONS}
                                        onSelect={(nextValue) => {
                                            setDiscountType(nextValue);
                                            if (nextValue === 'No Manual Discount') {
                                                setDiscountAmountInput('0.00');
                                            }
                                            if (discountPreset !== 'No Discount' && nextValue !== 'No Manual Discount') {
                                                setDiscountPreset('No Discount');
                                            }
                                        }}
                                        open={openDropdown === 'sell-discount-type'}
                                        onToggle={() => setOpenDropdown((current) => current === 'sell-discount-type' ? null : 'sell-discount-type')}
                                    />
                                    <View style={{ marginBottom: 14 }}>
                                        <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>Discount Amount</Text>
                                        <TextInput
                                            value={discountAmountInput}
                                            onChangeText={setDiscountAmountInput}
                                            editable={discountType !== 'No Manual Discount'}
                                            keyboardType="decimal-pad"
                                            placeholder="0.00"
                                            placeholderTextColor="#94A3B8"
                                            style={{
                                                minHeight: 52,
                                                borderRadius: 16,
                                                borderWidth: 1,
                                                borderColor: '#D9E2EC',
                                                backgroundColor: discountType === 'No Manual Discount' ? '#F8FAFC' : '#FFFFFF',
                                                paddingHorizontal: 16,
                                                color: '#0F172A'
                                            }}
                                        />
                                        <Text style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>Select a POS Setup preset.</Text>
                                    </View>
                                </View>

                                <View
                                    style={{
                                        borderRadius: 22,
                                        borderWidth: 1,
                                        borderColor: '#D9E2EC',
                                        backgroundColor: '#FFFFFF',
                                        padding: 16
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '900' }}>Current Sale</Text>
                                        <View style={{ borderRadius: 999, backgroundColor: cart.length > 0 ? '#DBEAFE' : '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6 }}>
                                            <Text style={{ color: cart.length > 0 ? '#1D4ED8' : '#64748B', fontWeight: '900' }}>
                                                {cart.length > 0 ? `${cartCount} item${cartCount === 1 ? '' : 's'}` : 'EMPTY'}
                                            </Text>
                                        </View>
                                    </View>

                                    {cart.length === 0 ? (
                                        <View
                                            style={{
                                                minHeight: 160,
                                                borderRadius: 18,
                                                borderWidth: 1,
                                                borderStyle: 'dashed',
                                                borderColor: '#CBD5E1',
                                                backgroundColor: '#F8FAFC',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                paddingHorizontal: 18
                                            }}
                                        >
                                            <Text style={{ color: '#475569', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
                                                No items in cart yet.
                                            </Text>
                                            <Text style={{ color: '#64748B', marginTop: 8, textAlign: 'center' }}>
                                                Add item boxes from the catalog to start this sale.
                                            </Text>
                                        </View>
                                    ) : (
                                        <View>
                                            {cart.map((line) => (
                                                <View
                                                    key={line.itemId}
                                                    style={{
                                                        borderRadius: 18,
                                                        borderWidth: 1,
                                                        borderColor: '#E2E8F0',
                                                        backgroundColor: '#F8FAFC',
                                                        padding: 14,
                                                        marginBottom: 10
                                                    }}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ color: '#0F172A', fontSize: 16, fontWeight: '800' }}>{line.itemName}</Text>
                                                            <Text style={{ color: '#64748B', marginTop: 4 }}>{line.categoryName}</Text>
                                                        </View>
                                                        <Pressable onPress={() => onRemoveFromCart(line.itemId)}>
                                                            <Text style={{ color: '#B91C1C', fontWeight: '800' }}>Remove</Text>
                                                        </Pressable>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                            <Pressable
                                                                onPress={() => onUpdateCartQuantity(line.itemId, line.quantity - 1)}
                                                                style={{
                                                                    width: 34,
                                                                    height: 34,
                                                                    borderRadius: 12,
                                                                    borderWidth: 1,
                                                                    borderColor: '#CBD5E1',
                                                                    backgroundColor: '#FFFFFF',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center'
                                                                }}
                                                            >
                                                                <Text style={{ color: '#0F172A', fontSize: 18, fontWeight: '900' }}>-</Text>
                                                            </Pressable>
                                                            <View
                                                                style={{
                                                                    minWidth: 44,
                                                                    alignItems: 'center',
                                                                    marginHorizontal: 10
                                                                }}
                                                            >
                                                                <Text style={{ color: '#0F172A', fontSize: 16, fontWeight: '900' }}>{line.quantity}</Text>
                                                            </View>
                                                            <Pressable
                                                                onPress={() => onUpdateCartQuantity(line.itemId, line.quantity + 1)}
                                                                style={{
                                                                    width: 34,
                                                                    height: 34,
                                                                    borderRadius: 12,
                                                                    borderWidth: 1,
                                                                    borderColor: '#CBD5E1',
                                                                    backgroundColor: '#FFFFFF',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center'
                                                                }}
                                                            >
                                                                <Text style={{ color: '#0F172A', fontSize: 18, fontWeight: '900' }}>+</Text>
                                                            </Pressable>
                                                        </View>
                                                        <View style={{ alignItems: 'flex-end' }}>
                                                            <Text style={{ color: '#64748B', fontSize: 12 }}>Line Total</Text>
                                                            <Text style={{ color: '#1D4ED8', fontSize: 18, fontWeight: '900', marginTop: 4 }}>
                                                                {formatCurrency(line.price * line.quantity)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View
                                    style={{
                                        marginTop: 16,
                                        borderTopWidth: 1,
                                        borderTopColor: '#E2E8F0',
                                        paddingTop: 16
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>Items Subtotal</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '900' }}>{formatCurrency(currentSubtotal)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>Discount</Text>
                                        <Text style={{ color: '#E11D48', fontWeight: '900' }}>- {formatCurrency(manualDiscountAmount)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>Net Items</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '900' }}>{formatCurrency(netItems)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>DGFY convenience fee (1%)</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '900' }}>+ {formatCurrency(convenienceFee)}</Text>
                                    </View>
                                    <View style={{ height: 1, borderTopWidth: 1, borderTopColor: '#E2E8F0', borderStyle: 'dashed', marginBottom: 14 }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>Vatable Sales</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '700' }}>{formatCurrency(vatableSales)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>VAT Amount</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '700' }}>{formatCurrency(vatAmountNet)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>VAT Exempt Sales</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '700' }}>{formatCurrency(0)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }}>
                                        <Text style={{ color: '#334155', fontSize: 14 }}>Zero Rated Sales</Text>
                                        <Text style={{ color: '#0F172A', fontWeight: '700' }}>{formatCurrency(0)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ color: '#0F172A', fontSize: 18, fontWeight: '900' }}>Total</Text>
                                        <Text style={{ color: '#1D4ED8', fontSize: 22, fontWeight: '900' }}>{formatCurrency(totalDue)}</Text>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                                    <ActionButton label="Print Order" onPress={onOpenReceipt} variant="muted" />
                                    <ActionButton
                                        label="Checkout"
                                        onPress={openCheckoutConfirmModal}
                                        variant="primary"
                                        disabled={cart.length === 0}
                                    />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                    <ActionButton label="Close Day / Z-Reading" onPress={onOpenCloseShift} variant="muted" />
                                    <ActionButton label="Print Last Receipt" onPress={onPrintLastReceipt} variant="muted" />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                    <ActionButton label="Open Cash Drawer" onPress={onOpenDrawer} variant="muted" />
                                    <ActionButton label="View Setup Details" onPress={onOpenSyncCenter} variant="muted" />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                    <ActionButton label="Refresh" onPress={onRefreshCatalog} variant="muted" />
                                    <ActionButton label="Full Cart" onPress={openCheckoutConfirmModal} variant="muted" />
                                </View>
                            </ScrollView>
                            </View>
                        ) : null}
                    </View>
                </View>
            </View>

            <Modal
                visible={checkoutConfirmModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    if (!loading) {
                        setCheckoutConfirmModalOpen(false);
                    }
                }}
            >
                <View
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(15, 23, 42, 0.42)',
                        justifyContent: 'center',
                        paddingHorizontal: 12,
                        paddingVertical: 16
                    }}
                >
                    <View
                        style={{
                            maxHeight: '100%',
                            borderRadius: 24,
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                            backgroundColor: '#FFFFFF',
                            overflow: 'hidden'
                        }}
                    >
                        <View
                            style={{
                                borderBottomWidth: 1,
                                borderBottomColor: '#E2E8F0',
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 12
                            }}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: '#0F172A', fontSize: 17, fontWeight: '900' }}>Confirm Checkout</Text>
                                <Text style={{ color: '#475569', fontSize: 12, fontWeight: '500', lineHeight: 18, marginTop: 4 }}>
                                    Review the items and enter the customer payment before finalizing this sale.
                                </Text>
                            </View>
                            <Pressable
                                onPress={() => setCheckoutConfirmModalOpen(false)}
                                disabled={loading}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 999,
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <Text style={{ color: '#64748B', fontSize: 24, lineHeight: 24 }}>×</Text>
                            </Pressable>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 16 }}>
                            <View
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: '#E2E8F0',
                                    backgroundColor: '#F8FAFC',
                                    padding: 14
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                    <Text style={{ color: '#334155', fontSize: 13, fontWeight: '700' }}>Total Due</Text>
                                    <Text style={{ color: '#1A4E8D', fontSize: 14, fontWeight: '900' }}>{formatCurrency(checkoutDue)}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                                    <Text style={{ color: '#334155', fontSize: 13, fontWeight: '700' }}>Payment Type</Text>
                                    <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800' }}>{paymentType}</Text>
                                </View>
                            </View>

                            <View
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: '#E2E8F0',
                                    backgroundColor: '#FFFFFF',
                                    padding: 14,
                                    marginTop: 14
                                }}
                            >
                                <View
                                    style={{
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#F1F5F9',
                                        paddingBottom: 10,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12
                                    }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '800' }}>ITEMS</Text>
                                        <Text style={{ color: '#475569', fontSize: 12, fontWeight: '500', marginTop: 4 }}>
                                            {cartCount} item{cartCount === 1 ? '' : 's'} in this sale
                                        </Text>
                                    </View>
                                    <Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '900' }}>{formatCurrency(checkoutDue)}</Text>
                                </View>

                                <View style={{ marginTop: 12 }}>
                                    {cart.map((line) => (
                                        <View
                                            key={line.itemId}
                                            style={{
                                                borderRadius: 14,
                                                borderWidth: 1,
                                                borderColor: '#F1F5F9',
                                                backgroundColor: '#F8FAFC',
                                                paddingHorizontal: 14,
                                                paddingVertical: 12,
                                                marginBottom: 10,
                                                flexDirection: 'row',
                                                justifyContent: 'space-between',
                                                gap: 12
                                            }}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '900' }}>{line.itemName}</Text>
                                                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '500', marginTop: 4 }}>
                                                    {line.quantity} x {formatCurrency(line.price)}
                                                </Text>
                                            </View>
                                            <Text style={{ color: '#1A4E8D', fontSize: 13, fontWeight: '900' }}>
                                                {formatCurrency(line.price * line.quantity)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <View style={{ marginTop: 14 }}>
                                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                                    {customerPaymentFieldLabel}
                                </Text>
                                <TextInput
                                    value={customerPaymentAmountInput}
                                    onChangeText={setCustomerPaymentAmountInput}
                                    keyboardType="decimal-pad"
                                    placeholder="0.00"
                                    placeholderTextColor="#94A3B8"
                                    editable={!loading}
                                    style={{
                                        minHeight: 56,
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: '#CBD5E1',
                                        backgroundColor: '#FFFFFF',
                                        paddingHorizontal: 16,
                                        color: '#0F172A',
                                        fontSize: 18,
                                        fontWeight: '900'
                                    }}
                                />
                            </View>

                            <View
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: '#E2E8F0',
                                    backgroundColor: '#F8FAFC',
                                    padding: 14,
                                    marginTop: 14
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                    <Text style={{ color: '#334155', fontSize: 13 }}>
                                        {isCashPayment ? 'Change' : 'Excess Payment'}
                                    </Text>
                                    <Text style={{ color: '#047857', fontSize: 14, fontWeight: '800' }}>
                                        {formatCurrency(customerPaymentChange)}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                                    <Text style={{ color: '#334155', fontSize: 13 }}>Remaining Balance</Text>
                                    <Text
                                        style={{
                                            color: customerPaymentShortfall > 0 ? '#BE123C' : '#0F172A',
                                            fontSize: 14,
                                            fontWeight: '800'
                                        }}
                                    >
                                        {formatCurrency(customerPaymentShortfall)}
                                    </Text>
                                </View>
                            </View>

                            {!isCustomerPaymentSufficient ? (
                                <View
                                    style={{
                                        borderRadius: 14,
                                        borderWidth: 1,
                                        borderColor: '#FECDD3',
                                        backgroundColor: '#FFF1F2',
                                        paddingHorizontal: 14,
                                        paddingVertical: 12,
                                        marginTop: 14
                                    }}
                                >
                                    <Text style={{ color: '#BE123C', fontSize: 12, fontWeight: '700' }}>
                                        {customerPaymentFieldLabel} must be at least {formatCurrency(checkoutDue)}.
                                    </Text>
                                </View>
                            ) : null}

                            {!loading && hardwareMessage ? (
                                <View
                                    style={{
                                        borderRadius: 14,
                                        borderWidth: 1,
                                        borderColor: '#DBEAFE',
                                        backgroundColor: '#EFF6FF',
                                        paddingHorizontal: 14,
                                        paddingVertical: 12,
                                        marginTop: 14
                                    }}
                                >
                                    <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: '700' }}>
                                        {hardwareMessage}
                                    </Text>
                                </View>
                            ) : null}
                        </ScrollView>

                        <View
                            style={{
                                borderTopWidth: 1,
                                borderTopColor: '#E2E8F0',
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                flexDirection: 'row',
                                gap: 10
                            }}
                        >
                            <ActionButton
                                label="Cancel"
                                onPress={() => setCheckoutConfirmModalOpen(false)}
                                variant="muted"
                                disabled={loading}
                            />
                            <ActionButton
                                label={loading ? 'Processing...' : 'Confirm'}
                                onPress={handleConfirmCheckout}
                                variant="primary"
                                disabled={loading || cart.length === 0 || !isCustomerPaymentSufficient}
                            />
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={mobileSidebarOpen} transparent animationType="fade" onRequestClose={() => setMobileSidebarOpen(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', justifyContent: 'flex-start' }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setMobileSidebarOpen(false)}>
                        <View />
                    </Pressable>
                    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}>
                        {renderSidebar(true)}
                    </View>
                </View>
            </Modal>

            <Modal visible={receiptPreviewVisible && Boolean(lastReceipt)} transparent animationType="fade" onRequestClose={onCloseReceiptPreview}>
                <View
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(15, 23, 42, 0.38)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24
                    }}
                >
                    <View
                        style={{
                            width: '100%',
                            maxWidth: 980,
                            maxHeight: '92%',
                            backgroundColor: '#FFFFFF',
                            borderRadius: 22,
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: '#D9E2EC'
                        }}
                    >
                        <View
                            style={{
                                paddingHorizontal: 22,
                                paddingVertical: 16,
                                borderBottomWidth: 1,
                                borderBottomColor: '#E2E8F0',
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between'
                            }}
                        >
                            <View style={{ flex: 1, paddingRight: 16 }}>
                                <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '900' }}>Receipt Preview</Text>
                                <Text style={{ color: '#64748B', marginTop: 8, fontSize: 14 }}>
                                    Review the selected receipt from history.
                                </Text>
                            </View>
                            <Pressable
                                onPress={onCloseReceiptPreview}
                                style={{
                                    minHeight: 44,
                                    minWidth: 74,
                                    borderRadius: 12,
                                    backgroundColor: '#11998E',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingHorizontal: 16
                                }}
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Close</Text>
                            </Pressable>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 22, alignItems: 'center' }}>
                            {lastReceipt ? (
                                <View
                                    style={{
                                        width: '100%',
                                        maxWidth: 378,
                                        borderRadius: 18,
                                        borderWidth: 1,
                                        borderColor: '#D7E2F1',
                                        backgroundColor: '#FFFFFF',
                                        paddingHorizontal: 20,
                                        paddingVertical: 22
                                    }}
                                >
                                    <Text style={{ textAlign: 'center', color: '#14539A', fontSize: 24, fontWeight: '900' }}>DGFY</Text>
                                    <Text style={{ textAlign: 'center', color: '#0F172A', fontSize: 13, fontWeight: '800', marginTop: 12 }}>
                                        {lastReceipt.syncState === 'synced' ? 'NON-FISCAL SLIP' : 'PENDING LOCAL RECEIPT'}
                                    </Text>
                                    <View
                                        style={{
                                            marginTop: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: '#FCD34D',
                                            backgroundColor: '#FFFBEB',
                                            paddingVertical: 8,
                                            paddingHorizontal: 12
                                        }}
                                    >
                                        <Text style={{ textAlign: 'center', color: '#C2410C', fontSize: 11, fontWeight: '800' }}>
                                            {lastReceipt.syncState === 'synced' ? 'NOT A FISCAL RECEIPT' : 'LOCAL PENDING DOCUMENT'}
                                        </Text>
                                        <Text style={{ textAlign: 'center', color: '#C2410C', fontSize: 11, marginTop: 2 }}>
                                            {lastReceipt.syncState === 'synced' ? 'NON-FISCAL DOCUMENT' : 'AWAITING FINAL SYNC'}
                                        </Text>
                                    </View>
                                    <Text style={{ textAlign: 'center', color: '#64748B', marginTop: 10, fontWeight: '700' }}>
                                        {lastReceipt.localTransactionId}
                                    </Text>
                                    <Text style={{ textAlign: 'center', color: '#64748B', marginTop: 4 }}>
                                        {receiptDateLabel}
                                    </Text>

                                    <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#D7E2F1' }}>
                                        <View style={{ flexDirection: 'row', paddingBottom: 10 }}>
                                            <Text style={{ flex: 1.7, color: '#64748B', fontSize: 12, fontWeight: '800' }}>ITEM</Text>
                                            <Text style={{ flex: 0.9, color: '#64748B', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>UNIT PRICE</Text>
                                            <Text style={{ width: 44, color: '#64748B', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>QTY</Text>
                                            <Text style={{ flex: 0.9, color: '#64748B', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>LINE</Text>
                                        </View>

                                        {lastReceipt.lines.map((line, index) => {
                                            const unitPrice = Number(line.quantity) > 0
                                                ? Number((Number(line.total) / Number(line.quantity)).toFixed(2))
                                                : Number(line.total || 0);
                                            return (
                                                <View
                                                    key={`${line.name}-${index}`}
                                                    style={{
                                                        borderTopWidth: index === 0 ? 1 : 0,
                                                        borderBottomWidth: 1,
                                                        borderColor: '#E2E8F0',
                                                        paddingVertical: 12
                                                    }}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                                        <Text style={{ flex: 1.7, color: '#0F172A', fontSize: 13, fontWeight: '900', paddingRight: 12 }}>
                                                            {line.name}
                                                        </Text>
                                                        <Text style={{ flex: 0.9, color: '#0F172A', fontSize: 13, textAlign: 'right' }}>
                                                            {unitPrice.toFixed(2)}
                                                        </Text>
                                                        <Text style={{ width: 44, color: '#0F172A', fontSize: 13, textAlign: 'right' }}>
                                                            {line.quantity}
                                                        </Text>
                                                        <Text style={{ flex: 0.9, color: '#0F172A', fontSize: 13, fontWeight: '800', textAlign: 'right' }}>
                                                            {Number(line.total).toFixed(2)}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>

                                    <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: '#D7E2F1', paddingTop: 14, gap: 8 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={{ color: '#334155', fontSize: 15 }}>Subtotal</Text>
                                            <Text style={{ color: '#334155', fontSize: 15 }}>{receiptSubtotal.toFixed(2)}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={{ color: '#334155', fontSize: 15 }}>Items</Text>
                                            <Text style={{ color: '#334155', fontSize: 15 }}>{receiptItemsCount}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={{ color: '#0F172A', fontSize: 17, fontWeight: '900' }}>Total</Text>
                                            <Text style={{ color: '#0F172A', fontSize: 17, fontWeight: '900' }}>{lastReceipt.total.toFixed(2)}</Text>
                                        </View>
                                    </View>

                                    <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: '#D7E2F1', paddingTop: 14 }}>
                                        <Text style={{ textAlign: 'center', color: '#64748B', lineHeight: 22 }}>
                                            Document context: {lastReceipt.syncState === 'synced' ? 'non_fiscal' : 'pending_local'}
                                        </Text>
                                        <Text style={{ textAlign: 'center', color: '#64748B', lineHeight: 22 }}>
                                            Payment: {lastReceipt.paymentType || 'cash'}
                                        </Text>
                                        <Text style={{ textAlign: 'center', color: '#64748B', lineHeight: 22 }}>
                                            Sequence control: receipt number is retained on this device.
                                        </Text>
                                    </View>
                                </View>
                            ) : null}
                        </ScrollView>

                        <View
                            style={{
                                borderTopWidth: 1,
                                borderTopColor: '#E2E8F0',
                                paddingHorizontal: 20,
                                paddingVertical: 14,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 16
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ color: '#334155', fontSize: 14, fontWeight: '800' }}>Paper</Text>
                                <Pressable
                                    onPress={() => setReceiptPaperWidth((value) => value === '80mm (3 1/8 in)' ? '58mm (2 1/4 in)' : '80mm (3 1/8 in)')}
                                    style={{
                                        minHeight: 44,
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: '#CBD5E1',
                                        backgroundColor: '#FFFFFF',
                                        justifyContent: 'center',
                                        paddingHorizontal: 14
                                    }}
                                >
                                    <Text style={{ color: '#0F172A', fontWeight: '700' }}>{receiptPaperWidth}</Text>
                                </Pressable>
                            </View>

                            <Pressable
                                onPress={onPrintLastReceipt}
                                style={{
                                    minHeight: 46,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: '#CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingHorizontal: 22
                                }}
                            >
                                <Text style={{ color: '#0F172A', fontWeight: '900' }}>Print</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};
