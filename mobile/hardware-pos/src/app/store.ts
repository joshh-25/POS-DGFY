import { useCallback, useMemo, useRef, useState } from 'react';
import { MobilePosRequestError } from '../api/mobilePosClient';
import { initializeHardwarePosDependencies } from './dependencies';
import { bundledCatalog, bundledCatalogGeneratedAt } from './bundledCatalog';
import type { CatalogProduct } from '../domain/catalog';
import type { LocalCheckoutInput, LocalTransactionLineInput } from '../domain/checkout';
import type { HistoryRow } from '../domain/history';
import { normalizePosTextScale, type PosTextScale } from '../domain/textScale';
import type { PendingHistorySnapshot } from '../services/pendingHistoryService';
import type { LegacyCheckoutTransaction, LegacyShiftRecord, MobilePosDevicePolicyResponse } from '../api/mobilePosClient';
import type {
    CachedCashierProfileRecord,
    PersistedOfflineAuthProfile
} from '../services/runtimeStateService';
import type { HistoryCounts } from '../repositories/contracts';

type HardwareScreen =
    | 'splash'
    | 'bootstrap_error'
    | 'login_unlock'
    | 'shift_open'
    | 'sell_screen'
    | 'cart'
    | 'receipt'
    | 'history'
    | 'sync_center'
    | 'close_shift'
    | 'account_management';

type ConnectivityMode = 'offline_local' | 'online_live' | 'syncing' | 'degraded';
type CatalogSource = 'bundled_seed' | 'catalog_cache' | 'live_bootstrap';

interface CartLine {
    product: CatalogProduct;
    quantity: number;
}

export interface SellScreenCartLine {
    itemId: number;
    itemName: string;
    categoryName: string;
    imageUrl?: string | null;
    price: number;
    quantity: number;
}

interface ReceiptPreview {
    localTransactionId: string;
    cashierName: string;
    shiftId: string;
    createdAtLocal: string;
    total: number;
    paymentType: string;
    lines: Array<{ name: string; quantity: number; total: number }>;
    syncState: 'pending_sync' | 'synced';
}

interface RemoteBootstrapResult {
    catalog: CatalogProduct[];
    catalogSource: CatalogSource;
    connectivityMode: ConnectivityMode;
    hardwareMessage: string;
    lastCatalogRefreshAt: string | null;
    settingsSummary: string;
    devicePolicySummary: string;
}

interface ManagedAccountRecord {
    cashierId: number;
    displayName: string;
    roleCode: string;
    cachedAt: string;
    isOfflineEnabled: boolean;
    isActiveSession: boolean;
}

interface AccountManagementSnapshot {
    cachedAccounts: ManagedAccountRecord[];
    offlineProfile: PersistedOfflineAuthProfile | null;
}

interface HardwarePosState {
    screen: HardwareScreen;
    isOnline: boolean;
    hardwareReady: boolean;
    deviceId: string;
    cashierName: string;
    cashierId: number | null;
    currentRoleCode: string;
    currentPermissions: string[];
    activeShiftId: string | null;
    catalog: CatalogProduct[];
    cart: CartLine[];
    pendingHistory: PendingHistorySnapshot | null;
    lastReceipt: ReceiptPreview | null;
    syncStatusLabel: string;
    lastSyncMessage: string;
    storageMode: 'memory' | 'sqlite';
    hardwareMessage: string;
    hardwareDiagnostics: Record<string, unknown> | null;
    offlineAuthAvailable: boolean;
    offlineCashierLabel: string;
    loginBaseUrl: string;
    companyToken: string;
    loginEmail: string;
    loading: boolean;
    syncBusy: boolean;
    adminAccessGranted: boolean;
    accountManagementSnapshot: AccountManagementSnapshot | null;
    connectivityMode: ConnectivityMode;
    catalogSource: CatalogSource;
    lastCatalogRefreshAt: string | null;
    settingsSummary: string;
    devicePolicySummary: string;
    textScale: PosTextScale;
    setTextScale(scale: PosTextScale): Promise<void>;
    bootstrap(): Promise<void>;
    unlockCashier(input: {
        baseUrl: string;
        email: string;
        password: string;
        offlinePin?: string;
    }): Promise<void>;
    unlockOfflineCashier(input: {
        email: string;
        offlinePin: string;
    }): Promise<void>;
    openShift(openingCash: number): Promise<void>;
    addToCart(product: CatalogProduct): void;
    updateCartQuantity(itemId: number, nextQuantity: number): void;
    removeFromCart(itemId: number): void;
    scanCatalogBarcode(): Promise<void>;
    refreshCatalog(): Promise<void>;
    lockSession(): Promise<void>;
    goToCart(): void;
    backToSell(): void;
    openReceipt(): void;
    openHistoryReceipt(localTransactionId: string): Promise<void>;
    openHistory(): Promise<void>;
    refreshHistorySnapshot(): Promise<void>;
    openSyncCenter(): Promise<void>;
    openCloseShift(): void;
    openAccountManagement(): Promise<void>;
    verifyAdminAccess(input: {
        baseUrl: string;
        email: string;
        password: string;
    }): Promise<void>;
    refreshAccountManagement(): Promise<void>;
    removeManagedCashier(cashierId: number): Promise<void>;
    clearOfflineManagedCashier(): Promise<void>;
    commitCheckout(options?: {
        paymentType?: string;
        orderMethod?: string;
    }): Promise<void>;
    runManualSync(): Promise<void>;
    printLastReceipt(): Promise<void>;
    openDrawer(): Promise<void>;
    loadHardwareDiagnostics(): Promise<void>;
    closeShift(): Promise<void>;
}

type HardwarePosViewState = Omit<
    HardwarePosState,
    | 'bootstrap'
    | 'unlockCashier'
    | 'unlockOfflineCashier'
    | 'openShift'
    | 'addToCart'
    | 'updateCartQuantity'
    | 'removeFromCart'
    | 'scanCatalogBarcode'
    | 'refreshCatalog'
    | 'lockSession'
    | 'goToCart'
    | 'backToSell'
    | 'openReceipt'
    | 'openHistoryReceipt'
    | 'openHistory'
    | 'refreshHistorySnapshot'
    | 'openSyncCenter'
    | 'openCloseShift'
    | 'openAccountManagement'
    | 'verifyAdminAccess'
    | 'refreshAccountManagement'
    | 'removeManagedCashier'
    | 'clearOfflineManagedCashier'
    | 'commitCheckout'
    | 'runManualSync'
    | 'printLastReceipt'
    | 'openDrawer'
    | 'loadHardwareDiagnostics'
    | 'closeShift'
    | 'setTextScale'
>;

const DEFAULT_POS_BASE_URL = 'https://pos.dgfy.ph';
const DEFAULT_COMPANY_TOKEN = 'token-spacebar-8ddb3350';
const DEFAULT_TERMINAL_ID = 'COUNTER-01';
const DEFAULT_LOGIN_EMAIL = 'mail@space.com.ph';
const REMOTE_BOOTSTRAP_TIMEOUT_MS = 15000;

const normalizeRuntimeBaseUrl = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return DEFAULT_POS_BASE_URL;
    }

    return trimmed.replace(/\/api\/v1\/?$/i, '').replace(/\/+$/, '');
};

const toSyncStatusLabel = (successfulSyncCountToday: number): string => {
    if (successfulSyncCountToday <= 0) return '0/2';
    if (successfulSyncCountToday === 1) return '1/2';
    return '2/2';
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
                }, timeoutMs);
            })
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};

const getDeps = () => initializeHardwarePosDependencies({
    deviceId: DEFAULT_TERMINAL_ID
});

const toCurrency = (value: number): string => `PHP ${value.toFixed(2)}`;

const normalizeCheckoutPaymentType = (value?: string): string => {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (normalized === 'gcash') return 'gcash';
    if (normalized === 'maya') return 'maya';
    if (normalized === 'card') return 'card';
    if (normalized === 'bank_transfer') return 'bank_transfer';
    return normalized || 'cash';
};

const normalizeCheckoutOrderMethod = (value?: string): string => {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (normalized === 'dine_in') return 'dine_in';
    if (normalized === 'takeout') return 'takeout';
    if (normalized === 'pickup') return 'pickup';
    if (normalized === 'delivery') return 'delivery';
    return normalized || 'dine_in';
};

const toNumber = (value: unknown, fallback = 0): number => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
};

const buildServerReceiptKey = (transactionId: number | string): string => `server-${transactionId}`;

const parseServerReceiptKey = (value: string): number | null => {
    const match = String(value || '').match(/^server-(\d+)$/);
    return match ? Number(match[1]) : null;
};

const toShiftIdString = (shift: LegacyShiftRecord | null): string | null => {
    if (!shift) {
        return null;
    }

    const shiftId = Number(shift.pos_terminal_shift_id ?? shift.shift_id ?? 0);
    return shiftId > 0 ? String(shiftId) : null;
};

const hashOfflinePin = (cashierId: number, deviceId: string, pin: string): string => {
    const source = `${cashierId}:${deviceId}:${String(pin || '').trim()}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16)}`;
};

const isAdminLikeRole = (roleCode: string, permissions: string[] = [], isMasterAdmin = false): boolean => {
    if (isMasterAdmin) return true;
    if (String(roleCode || '').trim().toLowerCase() === 'admin') return true;
    return permissions.some((permission) => String(permission || '').trim().toLowerCase() === 'users.manage');
};

const mapBootstrapCatalogEntry = (entry: {
    item_id?: number;
    item_name?: string;
    name?: string;
    folder_name?: string;
    category_name?: string;
    category?: string;
    default_sale_price?: number | string | null;
    sale_price?: number;
    price?: number;
    barcode?: string | null;
    image_url?: string | null;
}, index: number): CatalogProduct => ({
    itemId: Number(entry.item_id ?? index + 1),
    itemName: String(entry.item_name ?? entry.name ?? `Item ${index + 1}`),
    categoryName: String(entry.folder_name ?? entry.category_name ?? entry.category ?? 'General'),
    price: Number(entry.default_sale_price ?? entry.sale_price ?? entry.price ?? 0),
    barcode: entry.barcode ? String(entry.barcode) : null,
    imageUrl: entry.image_url ? String(entry.image_url) : null
});

const mergeCatalogProducts = (
    currentCatalog: CatalogProduct[],
    liveCatalog: CatalogProduct[]
): CatalogProduct[] => {
    if (liveCatalog.length === 0) {
        return currentCatalog;
    }

    const liveById = new Map(liveCatalog.map((item) => [item.itemId, item]));
    const merged = currentCatalog.map((item) => liveById.get(item.itemId) ?? item);
    const existingIds = new Set(merged.map((item) => item.itemId));

    for (const item of liveCatalog) {
        if (!existingIds.has(item.itemId)) {
            merged.push(item);
        }
    }

    return merged;
};

const mapRemoteTransactionToHistoryRow = (transaction: LegacyCheckoutTransaction): HistoryRow => {
    const transactionId = Number(transaction.pos_transaction_id ?? transaction.id ?? 0);
    const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
    const grandTotal = toNumber(transaction.total_amount ?? transaction.grand_total, 0);

    return {
        localTransactionId: buildServerReceiptKey(transactionId),
        createdAtLocal: String(transaction.created_at ?? new Date().toISOString()),
        cashierId: 0,
        shiftId: String(transaction.shift_id ?? transaction.terminal_shift_id ?? ''),
        paymentType: 'cash',
        orderMethod: 'dine_in',
        orderSource: 'in_store',
        status: 'synced',
        receiptState: 'printed_local_synced',
        grandTotal,
        itemCount: lines.length,
        serverTransactionId: transactionId > 0 ? transactionId : null,
        statusLabel: 'Synced',
        authoritative: true,
        attentionRequired: false
    };
};

const mapRemoteTransactionToReceipt = (
    transaction: LegacyCheckoutTransaction,
    fallbackCashierName: string
): ReceiptPreview => {
    const transactionId = Number(transaction.pos_transaction_id ?? transaction.id ?? 0);
    const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
    const total = toNumber(transaction.total_amount ?? transaction.grand_total, 0);

    return {
        localTransactionId: buildServerReceiptKey(transactionId || transaction.invoice_number || Date.now()),
        cashierName: fallbackCashierName || 'Cashier',
        shiftId: String(transaction.shift_id ?? transaction.terminal_shift_id ?? ''),
        createdAtLocal: String(transaction.created_at ?? new Date().toISOString()),
        total,
        paymentType: 'cash',
        lines: lines.length > 0
            ? lines.map((line) => {
                const quantity = toNumber(line.quantity, 1);
                const unitPrice = toNumber(line.sale_price ?? line.unit_price, 0);
                return {
                    name: String(line.item?.name ?? line.item_name ?? 'Item'),
                    quantity,
                    total: unitPrice * quantity
                };
            })
            : [{
                name: String(transaction.invoice_number ?? 'Saved transaction'),
                quantity: 1,
                total
            }],
        syncState: 'synced'
    };
};

const buildRemoteHistorySnapshot = (transactions: LegacyCheckoutTransaction[]): PendingHistorySnapshot => {
    const rows = transactions
        .map((transaction) => mapRemoteTransactionToHistoryRow(transaction))
        .filter((row) => row.serverTransactionId !== null);

    const counts: HistoryCounts = {
        pending: 0,
        synced: rows.length,
        conflict: 0
    };

    return {
        rows,
        counts,
        lastSyncRun: null
    };
};

const mergePendingHistorySnapshots = (
    remoteSnapshot: PendingHistorySnapshot | null,
    localSnapshot: PendingHistorySnapshot | null
): PendingHistorySnapshot | null => {
    if (!remoteSnapshot && !localSnapshot) {
        return null;
    }

    const rows = [
        ...(remoteSnapshot?.rows ?? []),
        ...(localSnapshot?.rows ?? [])
    ].sort((left, right) => String(right.createdAtLocal || '').localeCompare(String(left.createdAtLocal || '')));

    return {
        rows,
        counts: {
            pending: Number(remoteSnapshot?.counts.pending ?? 0) + Number(localSnapshot?.counts.pending ?? 0),
            synced: Number(remoteSnapshot?.counts.synced ?? 0) + Number(localSnapshot?.counts.synced ?? 0),
            conflict: Number(remoteSnapshot?.counts.conflict ?? 0) + Number(localSnapshot?.counts.conflict ?? 0)
        },
        lastSyncRun: localSnapshot?.lastSyncRun ?? remoteSnapshot?.lastSyncRun ?? null
    };
};

const summarizeSettings = (settings: Record<string, unknown>, syncPolicy: Record<string, unknown>): string => {
    const settingsCount = Object.keys(settings || {}).length;
    const syncKeys = Object.keys(syncPolicy || {}).length;
    return `${settingsCount} runtime settings cached, ${syncKeys} sync policy fields loaded`;
};

const summarizeDevicePolicy = (devicePolicy: MobilePosDevicePolicyResponse): string => {
    const terminalPolicy = devicePolicy.terminal_policy && typeof devicePolicy.terminal_policy === 'object'
        ? devicePolicy.terminal_policy as Record<string, unknown>
        : {};
    const receiptProfile = devicePolicy.receipt_profile && typeof devicePolicy.receipt_profile === 'object'
        ? devicePolicy.receipt_profile as Record<string, unknown>
        : {};
    const registryMode = String(terminalPolicy.registry_mode ?? terminalPolicy.mode ?? 'default').trim() || 'default';
    const receiptProfileName = String(receiptProfile.profile_name ?? receiptProfile.document_type ?? 'default').trim() || 'default';
    return `Terminal policy ${registryMode}; receipt profile ${receiptProfileName}`;
};

const buildCheckoutInput = (
    deviceId: string,
    cashierName: string,
    shiftId: string,
    cart: CartLine[],
    options?: {
        paymentType?: string;
        orderMethod?: string;
    }
): LocalCheckoutInput => {
    const createdAtLocal = new Date().toISOString();
    const normalizedPaymentType = normalizeCheckoutPaymentType(options?.paymentType);
    const normalizedOrderMethod = normalizeCheckoutOrderMethod(options?.orderMethod);
    const lines: LocalTransactionLineInput[] = cart.map((entry, index) => ({
        lineId: `${deviceId}-line-${Date.now()}-${index}`,
        itemId: entry.product.itemId,
        itemName: entry.product.itemName,
        quantity: entry.quantity,
        unitPrice: entry.product.price,
        discounts: 0,
        fees: 0,
        vatRelevantAmount: entry.product.price * entry.quantity,
        barcodeMetadata: entry.product.barcode ? { code: entry.product.barcode } : null
    }));
    const grandTotal = lines.reduce((sum, line) => sum + (line.unitPrice * line.quantity), 0);

    return {
        localTransactionId: `${deviceId}-sale-${Date.now()}`,
        idempotencyKey: `${deviceId}-idem-${Date.now()}`,
        createdAtLocal,
        cashierId: 1,
        shiftId,
        receiptState: 'printed_local_pending_sync',
        lines,
        totals: {
            subtotal: grandTotal,
            discountTotal: 0,
            feeTotal: 0,
            grandTotal,
            vatTotal: grandTotal * 0.12
        },
        pricingSnapshot: {
            source: 'local_catalog_cache'
        },
        paymentSnapshot: {
            payment_type: normalizedPaymentType,
            order_method: normalizedOrderMethod,
            cashier_name: cashierName
        },
        customerSnapshot: null
    };
};

const refreshRemoteBootstrap = async (options: {
    preserveCatalog: CatalogProduct[];
    fallbackMessage: string;
}) => {
    const deps = await getDeps();
    const client = deps.getMobilePosClient();
    const runtimeStateService = deps.runtimeStateService;
    const cachedBootstrap = await runtimeStateService?.getBootstrapCache() ?? null;

    if (!client) {
        return {
            catalog: options.preserveCatalog,
            catalogSource: options.preserveCatalog === bundledCatalog ? 'bundled_seed' : 'catalog_cache',
            connectivityMode: 'offline_local',
            hardwareMessage: options.fallbackMessage,
            lastCatalogRefreshAt: cachedBootstrap?.savedAt ?? null,
            settingsSummary: cachedBootstrap?.settingsSummary ?? 'Offline mode: no server settings cached yet.',
            devicePolicySummary: cachedBootstrap?.devicePolicySummary ?? 'Offline mode: no server terminal policy cached yet.'
        } satisfies RemoteBootstrapResult;
    }

    try {
        const catalogResponse = await withTimeout(
            client.getCatalog({ limit: 500 }),
            REMOTE_BOOTSTRAP_TIMEOUT_MS,
            'Standalone POS remote catalog bootstrap'
        );
        const [settingsResult, devicePolicyResult] = await Promise.allSettled([
            client.getSettings(),
            client.getDevicePolicy()
        ]);

        const savedAt = new Date().toISOString();
        const catalog = catalogResponse.catalog.map(mapBootstrapCatalogEntry);
        if (catalog.length === 0) {
            throw new Error('Live POS catalog returned no sellable items.');
        }
        const settingsResponse = settingsResult.status === 'fulfilled'
            ? settingsResult.value
            : {
                settings: {},
                sync_policy: {}
            };
        const devicePolicyResponse = devicePolicyResult.status === 'fulfilled'
            ? devicePolicyResult.value
            : {
                generated_at: savedAt,
                bootstrap_version: 'legacy-pos-v1',
                terminal_policy: {},
                sync_policy: {},
                receipt_profile: {}
            };
        const settingsSummary = summarizeSettings(settingsResponse.settings, settingsResponse.sync_policy);
        const devicePolicySummary = summarizeDevicePolicy(devicePolicyResponse);

        await runtimeStateService?.saveCatalogCache({
            savedAt,
            items: catalog
        });
        await runtimeStateService?.saveBootstrapCache({
            savedAt,
            settingsSummary,
            devicePolicySummary
        });

        return {
            catalog,
            catalogSource: 'live_bootstrap',
            connectivityMode: 'online_live',
            hardwareMessage: `Live backend catalog loaded at ${savedAt}. ${catalog.length} POS items are now cached on this device.`,
            lastCatalogRefreshAt: savedAt,
            settingsSummary,
            devicePolicySummary
        } satisfies RemoteBootstrapResult;
    } catch {
        const cachedCatalog = await runtimeStateService?.getCatalogCache() ?? null;
        const catalog = cachedCatalog?.items?.length
            ? cachedCatalog.items
            : options.preserveCatalog;
        const catalogSource = cachedCatalog?.items?.length
            ? 'catalog_cache'
            : (catalog === bundledCatalog ? 'bundled_seed' : 'catalog_cache');
        const hardwareMessage = cachedCatalog?.items?.length
            ? `Backend unavailable. Using cached catalog from ${cachedCatalog.savedAt}.`
            : `Backend unavailable. Using bundled POS catalog snapshot from ${bundledCatalogGeneratedAt} until a live sync succeeds.`;

        return {
            catalog,
            catalogSource,
            connectivityMode: 'degraded',
            hardwareMessage,
            lastCatalogRefreshAt: cachedCatalog?.savedAt ?? cachedBootstrap?.savedAt ?? null,
            settingsSummary: cachedBootstrap?.settingsSummary ?? 'No cached settings summary available.',
            devicePolicySummary: cachedBootstrap?.devicePolicySummary ?? 'No cached device policy summary available.'
        } satisfies RemoteBootstrapResult;
    }
};

const refreshPendingHistory = async (): Promise<PendingHistorySnapshot | null> => {
    const deps = await getDeps();
    return await deps.pendingHistoryService.getSnapshot();
};

const buildOfflineCashierLabel = (profile: PersistedOfflineAuthProfile | null): string => (
    profile
        ? `${profile.cashierName} (${profile.companyName})`
        : ''
);

const toBootstrapErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message || 'Standalone POS bootstrap failed.';
    }

    return 'Standalone POS bootstrap failed.';
};

const toManagedAccount = (
    profile: CachedCashierProfileRecord,
    offlineProfile: PersistedOfflineAuthProfile | null,
    activeCashierId: number | null
): ManagedAccountRecord => ({
    cashierId: profile.cashierId,
    displayName: profile.displayName,
    roleCode: profile.roleCode,
    cachedAt: profile.cachedAt,
    isOfflineEnabled: offlineProfile?.cashierId === profile.cashierId,
    isActiveSession: activeCashierId === profile.cashierId
});

const loadAccountManagementSnapshot = async (activeCashierId: number | null): Promise<AccountManagementSnapshot | null> => {
    const deps = await getDeps();
    const runtimeStateService = deps.runtimeStateService;
    if (!runtimeStateService) {
        return null;
    }

    const [cachedProfiles, offlineProfile] = await Promise.all([
        runtimeStateService.listCachedCashierProfiles(),
        runtimeStateService.getOfflineAuthProfile()
    ]);

    return {
        cachedAccounts: cachedProfiles.map((profile) => toManagedAccount(profile, offlineProfile, activeCashierId)),
        offlineProfile
    };
};

const initialState: HardwarePosViewState = {
    screen: 'splash',
    isOnline: false,
    hardwareReady: true,
    deviceId: DEFAULT_TERMINAL_ID,
    cashierName: '',
    cashierId: null,
    currentRoleCode: '',
    currentPermissions: [],
    activeShiftId: null,
    catalog: [],
    cart: [],
    pendingHistory: null,
    lastReceipt: null,
    syncStatusLabel: '0/2',
    lastSyncMessage: 'No sync executed yet.',
    storageMode: 'memory',
    hardwareMessage: 'Preparing standalone hardware POS runtime...',
    hardwareDiagnostics: null,
    offlineAuthAvailable: false,
    offlineCashierLabel: '',
    loginBaseUrl: DEFAULT_POS_BASE_URL,
    companyToken: DEFAULT_COMPANY_TOKEN,
    loginEmail: DEFAULT_LOGIN_EMAIL,
    loading: false,
    syncBusy: false,
    adminAccessGranted: false,
    accountManagementSnapshot: null,
    connectivityMode: 'offline_local',
    catalogSource: 'bundled_seed',
    lastCatalogRefreshAt: null,
    settingsSummary: 'No settings loaded yet.',
    devicePolicySummary: 'No device policy loaded yet.',
    textScale: 1
};

export const useHardwarePosStore = (): HardwarePosState => {
    const [state, setState] = useState<HardwarePosViewState>(initialState);
    const stateRef = useRef(state);

    const mergeState = useCallback((patch: Partial<HardwarePosViewState>) => {
        setState((current) => {
            const next = { ...current, ...patch };
            stateRef.current = next;
            return next;
        });
    }, []);

    const bootstrap = useCallback(async () => {
        mergeState({
            loading: true,
            screen: 'splash',
            hardwareMessage: 'Preparing standalone hardware POS runtime...'
        });

        try {
            const deps = await getDeps();
            const persistedSession = await deps.runtimeStateService?.getActiveCashierSession() ?? null;
            const persistedShift = await deps.runtimeStateService?.getActiveShiftState() ?? null;
            const persistedAuthConfig = await deps.runtimeStateService?.getAuthConfig() ?? null;
            const cachedCatalog = await deps.runtimeStateService?.getCatalogCache() ?? null;
            const cachedBootstrap = await deps.runtimeStateService?.getBootstrapCache() ?? null;
            const persistedTextScale = normalizePosTextScale(
                await deps.runtimeStateService?.getTextScalePreference() ?? 1
            );
            const offlineAuthProfile = await deps.runtimeStateService?.getOfflineAuthProfile() ?? null;

            if (persistedAuthConfig) {
                deps.configureMobileClient({
                    ...persistedAuthConfig,
                    baseUrl: normalizeRuntimeBaseUrl(persistedAuthConfig.baseUrl)
                });
            }

            const remoteBootstrap = await refreshRemoteBootstrap({
                preserveCatalog: cachedCatalog?.items?.length ? cachedCatalog.items : bundledCatalog,
                fallbackMessage: persistedSession
                    ? `Restoring ${persistedSession.cashierName}. Device will stay usable even before the backend is reachable.`
                    : `Standalone POS runs offline-first. This APK includes ${bundledCatalog.length} bundled POS items and can refresh from the live backend when reachable.`
            });

            const pendingHistory = await deps.pendingHistoryService.getSnapshot();
            const syncPolicy = await deps.syncPolicyRepository.getCurrent();

            mergeState({
                catalog: remoteBootstrap.catalog,
                catalogSource: remoteBootstrap.catalogSource,
                connectivityMode: remoteBootstrap.connectivityMode,
                isOnline: remoteBootstrap.connectivityMode === 'online_live',
                lastCatalogRefreshAt: remoteBootstrap.lastCatalogRefreshAt ?? cachedBootstrap?.savedAt ?? null,
                settingsSummary: remoteBootstrap.settingsSummary,
                devicePolicySummary: remoteBootstrap.devicePolicySummary,
                offlineAuthAvailable: Boolean(offlineAuthProfile?.pinHash),
                offlineCashierLabel: buildOfflineCashierLabel(offlineAuthProfile),
                pendingHistory,
                storageMode: deps.storageMode,
                syncStatusLabel: toSyncStatusLabel(syncPolicy.successfulSyncCountToday),
                cashierName: persistedSession?.cashierName ?? '',
                cashierId: persistedSession?.cashierId ?? null,
                currentRoleCode: persistedSession?.roleCode ?? (offlineAuthProfile?.roleCode ?? ''),
                currentPermissions: persistedSession?.permissions ?? [],
                activeShiftId: persistedShift?.shiftId ?? null,
                loginBaseUrl: normalizeRuntimeBaseUrl(persistedAuthConfig?.baseUrl ?? offlineAuthProfile?.baseUrl ?? DEFAULT_POS_BASE_URL),
                companyToken: persistedAuthConfig?.companyToken ?? offlineAuthProfile?.companyToken ?? DEFAULT_COMPANY_TOKEN,
                loginEmail: offlineAuthProfile?.email ?? DEFAULT_LOGIN_EMAIL,
                textScale: persistedTextScale,
                loading: false,
                hardwareReady: deps.storageMode === 'sqlite',
                adminAccessGranted: false,
                accountManagementSnapshot: null,
                screen: persistedSession
                    ? (persistedShift ? 'sell_screen' : 'shift_open')
                    : 'login_unlock',
                hardwareMessage: persistedSession
                    ? `Restored cashier ${persistedSession.cashierName}${persistedShift ? ` with open shift ${persistedShift.shiftId}.` : '.'} ${remoteBootstrap.hardwareMessage}`
                    : remoteBootstrap.hardwareMessage
            });
        } catch (error) {
            mergeState({
                loading: false,
                screen: 'bootstrap_error',
                hardwareReady: false,
                storageMode: 'memory',
                hardwareMessage: `Startup failed: ${toBootstrapErrorMessage(error)}`
            });
        }
    }, [mergeState]);

    const setTextScale = useCallback(async (scale: PosTextScale) => {
        const normalizedScale = normalizePosTextScale(scale);
        mergeState({ textScale: normalizedScale });
        const deps = await getDeps();
        await deps.runtimeStateService?.saveTextScalePreference(normalizedScale);
    }, [mergeState]);

    const unlockCashier = useCallback(async (input: {
        baseUrl: string;
        email: string;
        password: string;
        offlinePin?: string;
    }) => {
        const deps = await getDeps();
        mergeState({ loading: true, hardwareMessage: 'Authenticating cashier and preparing local runtime...' });
        try {
            const currentOfflineAuthProfile = await deps.runtimeStateService?.getOfflineAuthProfile() ?? null;
            const authSession = await deps.authClient.login({
                baseUrl: input.baseUrl,
                email: input.email,
                password: input.password,
                terminalId: stateRef.current.deviceId,
                preferredTenantId: currentOfflineAuthProfile?.tenantId || '',
                companyToken: stateRef.current.companyToken || currentOfflineAuthProfile?.companyToken || DEFAULT_COMPANY_TOKEN
            });

            const normalizedBaseUrl = normalizeRuntimeBaseUrl(input.baseUrl);
            const clientConfig = {
                baseUrl: normalizedBaseUrl,
                authToken: authSession.token,
                companyToken: authSession.companyToken
            };

            deps.configureMobileClient(clientConfig);
            await deps.runtimeStateService?.saveAuthConfig(clientConfig);
            await deps.runtimeStateService?.saveCashierSession({
                sessionId: `session-${Date.now()}`,
                cashierId: authSession.userId || 1,
                cashierName: authSession.username || authSession.email,
                roleCode: authSession.roleCode,
                permissions: authSession.permissions,
                openedAt: new Date().toISOString(),
                status: 'active'
            });

            const normalizedOfflinePin = String(input.offlinePin || '').trim();
            if (normalizedOfflinePin.length >= 4) {
                await deps.runtimeStateService?.saveOfflineAuthProfile({
                    cashierId: authSession.userId || 1,
                    cashierName: authSession.username || authSession.email,
                    email: authSession.email || input.email,
                    roleCode: authSession.roleCode,
                    tenantId: authSession.tenantId,
                    companyName: authSession.companyName,
                    companyToken: authSession.companyToken,
                    baseUrl: normalizedBaseUrl,
                    pinHash: hashOfflinePin(authSession.userId || 1, stateRef.current.deviceId, normalizedOfflinePin),
                    authorizedAt: new Date().toISOString()
                });
            }

            const offlineAuthProfile = await deps.runtimeStateService?.getOfflineAuthProfile() ?? null;
            const remoteBootstrap = await refreshRemoteBootstrap({
                preserveCatalog: stateRef.current.catalog.length > 0 ? stateRef.current.catalog : bundledCatalog,
                fallbackMessage: 'Cashier authenticated. Live server data is not reachable yet, so the app is staying on local cache.'
            });
            const liveShift = await deps.getMobilePosClient()?.getCurrentShift(stateRef.current.deviceId) ?? null;
            const liveShiftId = toShiftIdString(liveShift);

            if (liveShiftId) {
                const confirmedLiveShift = liveShift!;
                await deps.runtimeStateService?.saveShiftState({
                    shiftId: liveShiftId,
                    cashierId: authSession.userId || 1,
                    openingCashAmount: toNumber(confirmedLiveShift?.opening_float_amount, 0),
                    openedAt: String(confirmedLiveShift?.opened_at ?? new Date().toISOString()),
                    status: 'open'
                });
            }

            mergeState({
                cashierName: authSession.username || authSession.email,
                cashierId: authSession.userId || 1,
                currentRoleCode: authSession.roleCode,
                currentPermissions: authSession.permissions,
                activeShiftId: liveShiftId,
                loginBaseUrl: normalizedBaseUrl,
                companyToken: authSession.companyToken,
                loginEmail: input.email,
                hardwareMessage: `Cashier authenticated for ${authSession.companyName}. ${remoteBootstrap.hardwareMessage}`,
                catalog: remoteBootstrap.catalog,
                catalogSource: remoteBootstrap.catalogSource,
                connectivityMode: remoteBootstrap.connectivityMode,
                isOnline: remoteBootstrap.connectivityMode === 'online_live',
                lastCatalogRefreshAt: remoteBootstrap.lastCatalogRefreshAt,
                settingsSummary: remoteBootstrap.settingsSummary,
                devicePolicySummary: remoteBootstrap.devicePolicySummary,
                offlineAuthAvailable: Boolean(offlineAuthProfile?.pinHash),
                offlineCashierLabel: buildOfflineCashierLabel(offlineAuthProfile),
                loading: false,
                adminAccessGranted: false,
                accountManagementSnapshot: null,
                screen: liveShiftId ? 'sell_screen' : 'shift_open'
            });
        } catch (error) {
            mergeState({
                loading: false,
                connectivityMode: 'offline_local',
                isOnline: false,
                hardwareMessage: error instanceof Error ? error.message : 'Cashier authentication failed.'
            });
        }
    }, [mergeState]);

    const unlockOfflineCashier = useCallback(async (input: {
        email: string;
        offlinePin: string;
    }) => {
        const deps = await getDeps();
        mergeState({
            loading: true,
            hardwareMessage: 'Checking offline cashier authorization on this device...'
        });

        const offlineAuthProfile = await deps.runtimeStateService?.getOfflineAuthProfile() ?? null;
        if (!offlineAuthProfile) {
            mergeState({
                loading: false,
                hardwareMessage: 'Offline unlock is not configured yet. Sign in online once and save an offline PIN first.'
            });
            return;
        }

        const normalizedEmail = String(input.email || '').trim().toLowerCase();
        const profileEmail = String(offlineAuthProfile.email || '').trim().toLowerCase();
        if (!normalizedEmail || normalizedEmail !== profileEmail) {
            mergeState({
                loading: false,
                hardwareMessage: 'Offline unlock email does not match the cached cashier for this device.'
            });
            return;
        }

        const submittedHash = hashOfflinePin(offlineAuthProfile.cashierId, stateRef.current.deviceId, input.offlinePin);
        if (submittedHash !== offlineAuthProfile.pinHash) {
            mergeState({
                loading: false,
                hardwareMessage: 'Offline unlock PIN is incorrect.'
            });
            return;
        }

        await deps.runtimeStateService?.saveCashierSession({
            sessionId: `offline-session-${Date.now()}`,
            cashierId: offlineAuthProfile.cashierId,
            cashierName: offlineAuthProfile.cashierName,
            roleCode: offlineAuthProfile.roleCode,
            openedAt: new Date().toISOString(),
            status: 'active'
        });

        const persistedShift = await deps.runtimeStateService?.getActiveShiftState() ?? null;
        const pendingHistory = await deps.pendingHistoryService.getSnapshot();
        mergeState({
            cashierName: offlineAuthProfile.cashierName,
            cashierId: offlineAuthProfile.cashierId,
            currentRoleCode: offlineAuthProfile.roleCode,
            currentPermissions: [],
            activeShiftId: persistedShift?.shiftId ?? null,
            loginBaseUrl: normalizeRuntimeBaseUrl(offlineAuthProfile.baseUrl || stateRef.current.loginBaseUrl),
            companyToken: offlineAuthProfile.companyToken,
            loginEmail: offlineAuthProfile.email,
            pendingHistory,
            offlineAuthAvailable: true,
            offlineCashierLabel: buildOfflineCashierLabel(offlineAuthProfile),
            connectivityMode: 'offline_local',
            isOnline: false,
            loading: false,
            adminAccessGranted: false,
            accountManagementSnapshot: null,
            hardwareMessage: `Offline unlock successful for ${offlineAuthProfile.cashierName}. This device is using local data until sync is available.`,
            screen: persistedShift ? 'sell_screen' : 'shift_open'
        });
    }, [mergeState]);

    const openShift = useCallback(async (openingCash: number) => {
        const deps = await getDeps();
        const client = deps.getMobilePosClient();
        const cashierId = stateRef.current.cashierId ?? 1;

        if (!client) {
            const shiftId = `shift-${Date.now()}`;
            await deps.runtimeStateService?.saveShiftState({
                shiftId,
                cashierId,
                openingCashAmount: openingCash,
                openedAt: new Date().toISOString(),
                status: 'open'
            });
            mergeState({
                activeShiftId: shiftId,
                hardwareMessage: `Shift ${shiftId} opened locally with opening cash ${toCurrency(openingCash)}.`,
                screen: 'sell_screen'
            });
            return;
        }

        mergeState({
            loading: true,
            hardwareMessage: 'Opening live terminal shift...'
        });

        try {
            const liveShift = await client.openShift({
                terminalId: stateRef.current.deviceId,
                openingFloatAmount: openingCash
            });
            const shiftId = toShiftIdString(liveShift);
            if (!shiftId) {
                throw new Error('Shift open succeeded but no shift id was returned by the server.');
            }
            const confirmedLiveShift = liveShift!;

            await deps.runtimeStateService?.saveShiftState({
                shiftId,
                cashierId,
                openingCashAmount: openingCash,
                openedAt: String(confirmedLiveShift?.opened_at ?? new Date().toISOString()),
                status: 'open'
            });

            mergeState({
                activeShiftId: shiftId,
                loading: false,
                connectivityMode: 'online_live',
                isOnline: true,
                hardwareMessage: `Shift ${shiftId} opened on ${stateRef.current.deviceId}.`,
                screen: 'sell_screen'
            });
        } catch (error) {
            mergeState({
                loading: false,
                hardwareMessage: error instanceof Error ? error.message : 'Unable to open shift.'
            });
        }
    }, [mergeState]);

    const addToCart = useCallback((product: CatalogProduct) => {
        const existing = stateRef.current.cart.find((line) => line.product.itemId === product.itemId);
        if (existing) {
            mergeState({
                cart: stateRef.current.cart.map((line) => line.product.itemId === product.itemId
                    ? { ...line, quantity: line.quantity + 1 }
                    : line)
            });
            return;
        }

        mergeState({
            cart: [...stateRef.current.cart, { product, quantity: 1 }]
        });
    }, [mergeState]);

    const updateCartQuantity = useCallback((itemId: number, nextQuantity: number) => {
        if (nextQuantity <= 0) {
            mergeState({
                cart: stateRef.current.cart.filter((line) => line.product.itemId !== itemId)
            });
            return;
        }

        mergeState({
            cart: stateRef.current.cart.map((line) => (
                line.product.itemId === itemId
                    ? { ...line, quantity: nextQuantity }
                    : line
            ))
        });
    }, [mergeState]);

    const removeFromCart = useCallback((itemId: number) => {
        mergeState({
            cart: stateRef.current.cart.filter((line) => line.product.itemId !== itemId)
        });
    }, [mergeState]);

    const scanCatalogBarcode = useCallback(async () => {
        const scanResult = await (await import('../native/standalonePosHardware')).standalonePosHardware.scanBarcode();
        if (!scanResult.available || !scanResult.code) {
            mergeState({
                hardwareMessage: scanResult.message || 'Scanner is not available in this runtime.'
            });
            return;
        }

        const match = stateRef.current.catalog.find((product) => String(product.barcode || '').trim() === String(scanResult.code || '').trim());
        if (!match) {
            mergeState({
                hardwareMessage: `Scanned ${scanResult.code}, but it is not in the current local catalog cache.`
            });
            return;
        }

        addToCart(match);
        mergeState({
            hardwareMessage: `Scanned ${scanResult.code}. Added ${match.itemName} to cart.`
        });
    }, [addToCart, mergeState]);

    const refreshCatalog = useCallback(async () => {
        mergeState({
            loading: true,
            hardwareMessage: 'Refreshing live catalog and device policy...'
        });
        const remoteBootstrap = await refreshRemoteBootstrap({
            preserveCatalog: stateRef.current.catalog.length > 0 ? stateRef.current.catalog : bundledCatalog,
            fallbackMessage: 'Refresh completed without a live backend response. Local catalog remains active.'
        });
        mergeState({
            catalog: remoteBootstrap.catalog,
            catalogSource: remoteBootstrap.catalogSource,
            connectivityMode: remoteBootstrap.connectivityMode,
            isOnline: remoteBootstrap.connectivityMode === 'online_live',
            lastCatalogRefreshAt: remoteBootstrap.lastCatalogRefreshAt,
            settingsSummary: remoteBootstrap.settingsSummary,
            devicePolicySummary: remoteBootstrap.devicePolicySummary,
            hardwareMessage: remoteBootstrap.hardwareMessage,
            loading: false
        });
    }, [mergeState]);

    const lockSession = useCallback(async () => {
        const deps = await getDeps();
        await deps.runtimeStateService?.lockCashierSession(new Date().toISOString());
        const offlineAuthProfile = await deps.runtimeStateService?.getOfflineAuthProfile() ?? null;
        mergeState({
            cashierName: '',
            cashierId: null,
            currentRoleCode: '',
            currentPermissions: [],
            cart: [],
            screen: 'login_unlock',
            loginEmail: '',
            offlineAuthAvailable: Boolean(offlineAuthProfile?.pinHash),
            offlineCashierLabel: buildOfflineCashierLabel(offlineAuthProfile),
            adminAccessGranted: false,
            accountManagementSnapshot: null,
            hardwareMessage: 'Cashier session locked. Cached catalog and local history remain on this device.',
            lastReceipt: null
        });
    }, [mergeState]);

    const goToCart = useCallback(() => {
        mergeState({ screen: 'cart' });
    }, [mergeState]);

    const backToSell = useCallback(() => {
        mergeState({ screen: 'sell_screen' });
    }, [mergeState]);

    const openReceipt = useCallback(() => {
        if (!stateRef.current.lastReceipt) {
            return;
        }
        mergeState({ screen: 'receipt' });
    }, [mergeState]);

    const openHistory = useCallback(async () => {
        const deps = await getDeps();
        const client = deps.getMobilePosClient();
        const localPendingHistory = await refreshPendingHistory();
        const pendingHistory = client
            ? mergePendingHistorySnapshots(
                buildRemoteHistorySnapshot((await client.getTransactions(50)).transactions),
                localPendingHistory
            )
            : localPendingHistory;
        mergeState({
            pendingHistory,
            hardwareMessage: client
                ? 'Live transaction history loaded with local pending checkout state.'
                : 'Showing local transaction history on this device.',
            screen: 'history'
        });
    }, [mergeState]);

    const refreshHistorySnapshot = useCallback(async () => {
        const deps = await getDeps();
        const client = deps.getMobilePosClient();
        const localPendingHistory = await refreshPendingHistory();
        const pendingHistory = client
            ? mergePendingHistorySnapshots(
                buildRemoteHistorySnapshot((await client.getTransactions(50)).transactions),
                localPendingHistory
            )
            : localPendingHistory;
        mergeState({
            pendingHistory
        });
    }, [mergeState]);

    const openSyncCenter = useCallback(async () => {
        const pendingHistory = await refreshPendingHistory();
        mergeState({
            pendingHistory,
            screen: 'sync_center'
        });
    }, [mergeState]);

    const openCloseShift = useCallback(() => {
        mergeState({ screen: 'close_shift' });
    }, [mergeState]);

    const openAccountManagement = useCallback(async () => {
        const snapshot = await loadAccountManagementSnapshot(stateRef.current.cashierId);
        mergeState({
            screen: 'account_management',
            accountManagementSnapshot: snapshot,
            hardwareMessage: stateRef.current.adminAccessGranted
                ? 'Admin account management is open for this device.'
                : 'Admin verification is required to manage local cashier accounts.'
        });
    }, [mergeState]);

    const verifyAdminAccess = useCallback(async (input: {
        baseUrl: string;
        email: string;
        password: string;
    }) => {
        const deps = await getDeps();
        mergeState({
            loading: true,
            hardwareMessage: 'Verifying admin access for device account management...'
        });

        try {
            const authSession = await deps.authClient.login({
                baseUrl: input.baseUrl,
                email: input.email,
                password: input.password,
                terminalId: stateRef.current.deviceId
            });

            if (!isAdminLikeRole(authSession.roleCode, authSession.permissions, authSession.isMasterAdmin)) {
                throw new Error('Only a DGFY admin account can open device account management.');
            }

            const snapshot = await loadAccountManagementSnapshot(stateRef.current.cashierId);
            mergeState({
                loading: false,
                adminAccessGranted: true,
                accountManagementSnapshot: snapshot,
                hardwareMessage: `Admin access verified for ${authSession.username || authSession.email}.`
            });
        } catch (error) {
            mergeState({
                loading: false,
                adminAccessGranted: false,
                hardwareMessage: error instanceof Error ? error.message : 'Admin verification failed.'
            });
        }
    }, [mergeState]);

    const refreshAccountManagement = useCallback(async () => {
        const snapshot = await loadAccountManagementSnapshot(stateRef.current.cashierId);
        mergeState({
            accountManagementSnapshot: snapshot,
            hardwareMessage: 'Local device account snapshot refreshed.'
        });
    }, [mergeState]);

    const removeManagedCashier = useCallback(async (cashierId: number) => {
        if (stateRef.current.cashierId === cashierId) {
            mergeState({
                hardwareMessage: 'The active cashier session cannot be removed while it is currently unlocked.'
            });
            return;
        }

        const deps = await getDeps();
        const runtimeStateService = deps.runtimeStateService;
        if (!runtimeStateService) {
            mergeState({
                hardwareMessage: 'Account management requires the local SQLite runtime.'
            });
            return;
        }

        const offlineAuthProfile = await runtimeStateService.getOfflineAuthProfile();
        await runtimeStateService.removeCachedCashierProfile(cashierId);
        if (offlineAuthProfile?.cashierId === cashierId) {
            await runtimeStateService.clearOfflineAuthProfile();
        }

        const nextSnapshot = await loadAccountManagementSnapshot(stateRef.current.cashierId);
        mergeState({
            accountManagementSnapshot: nextSnapshot,
            offlineAuthAvailable: Boolean(nextSnapshot?.offlineProfile?.pinHash),
            offlineCashierLabel: buildOfflineCashierLabel(nextSnapshot?.offlineProfile ?? null),
            hardwareMessage: 'Cached cashier profile removed from this device.'
        });
    }, [mergeState]);

    const clearOfflineManagedCashier = useCallback(async () => {
        const deps = await getDeps();
        const runtimeStateService = deps.runtimeStateService;
        if (!runtimeStateService) {
            mergeState({
                hardwareMessage: 'Offline unlock management requires the local SQLite runtime.'
            });
            return;
        }

        await runtimeStateService.clearOfflineAuthProfile();
        const nextSnapshot = await loadAccountManagementSnapshot(stateRef.current.cashierId);
        mergeState({
            accountManagementSnapshot: nextSnapshot,
            offlineAuthAvailable: false,
            offlineCashierLabel: '',
            hardwareMessage: 'Offline cashier unlock was removed from this device.'
        });
    }, [mergeState]);

    const commitCheckout = useCallback(async (options?: {
        paymentType?: string;
        orderMethod?: string;
    }) => {
        const deps = await getDeps();
        const currentState = stateRef.current;
        if (!currentState.activeShiftId || currentState.cart.length === 0) {
            return;
        }

        const input = buildCheckoutInput(
            currentState.deviceId,
            currentState.cashierName,
            currentState.activeShiftId,
            currentState.cart,
            options
        );
        input.cashierId = currentState.cashierId ?? 1;

        const client = deps.getMobilePosClient();

        if (!client) {
            await deps.localCheckoutJournalService.commitLocalCheckout(input);
            const pendingHistory = await deps.pendingHistoryService.getSnapshot();

            mergeState({
                cart: [],
                pendingHistory,
                lastReceipt: {
                    localTransactionId: input.localTransactionId,
                    cashierName: currentState.cashierName,
                    shiftId: currentState.activeShiftId,
                    createdAtLocal: input.createdAtLocal,
                    total: input.totals.grandTotal,
                    paymentType: String(input.paymentSnapshot?.payment_type ?? 'cash'),
                    lines: input.lines.map((line) => ({
                        name: line.itemName,
                        quantity: line.quantity,
                        total: line.unitPrice * line.quantity
                    })),
                    syncState: 'pending_sync'
                },
                hardwareMessage: 'Sale saved locally. It will stay on-device until you run sync after connectivity returns.',
                screen: 'sell_screen'
            });
            return;
        }

        mergeState({
            loading: true,
            hardwareMessage: 'Submitting checkout to the live POS backend...'
        });

        try {
            const normalizedPaymentType = normalizeCheckoutPaymentType(options?.paymentType);
            const normalizedOrderMethod = normalizeCheckoutOrderMethod(options?.orderMethod);
            const liveCatalogResponse = await client.getCatalog({ limit: 500 });
            const liveCatalog = liveCatalogResponse.catalog.map(mapBootstrapCatalogEntry);
            const liveCatalogById = new Map(liveCatalog.map((product) => [product.itemId, product]));
            const checkoutCart = currentState.cart.map((entry) => {
                const liveProduct = liveCatalogById.get(entry.product.itemId);
                if (!liveProduct) {
                    return entry;
                }

                return {
                    ...entry,
                    product: {
                        ...entry.product,
                        itemName: liveProduct.itemName,
                        categoryName: liveProduct.categoryName,
                        price: liveProduct.price,
                        barcode: liveProduct.barcode,
                        imageUrl: liveProduct.imageUrl
                    }
                };
            });
            const transaction = await client.checkout({
                terminalId: currentState.deviceId,
                shiftId: currentState.activeShiftId,
                orderMethod: normalizedOrderMethod,
                paymentType: normalizedPaymentType,
                lines: checkoutCart.map((entry) => ({
                    item_id: entry.product.itemId,
                    quantity: entry.quantity,
                    sale_price: entry.product.price
                }))
            });

            if (!transaction) {
                throw new Error('Checkout completed without a server transaction.');
            }

            const pendingHistory = mergePendingHistorySnapshots(
                buildRemoteHistorySnapshot((await client.getTransactions(50)).transactions),
                await deps.pendingHistoryService.getSnapshot()
            );
            mergeState({
                cart: [],
                catalog: mergeCatalogProducts(currentState.catalog, liveCatalog),
                loading: false,
                pendingHistory,
                lastReceipt: mapRemoteTransactionToReceipt(transaction, currentState.cashierName),
                connectivityMode: 'online_live',
                isOnline: true,
                lastCatalogRefreshAt: new Date().toISOString(),
                hardwareMessage: `Checkout posted successfully as ${transaction.invoice_number ?? 'server transaction'}.`,
                screen: 'sell_screen'
            });
        } catch (error) {
            if (error instanceof MobilePosRequestError && error.isNetworkError) {
                await deps.localCheckoutJournalService.commitLocalCheckout(input);
                const pendingHistory = await deps.pendingHistoryService.getSnapshot();

                mergeState({
                    cart: [],
                    loading: false,
                    pendingHistory: mergePendingHistorySnapshots(null, pendingHistory),
                    lastReceipt: {
                        localTransactionId: input.localTransactionId,
                        cashierName: currentState.cashierName,
                        shiftId: currentState.activeShiftId,
                        createdAtLocal: input.createdAtLocal,
                        total: input.totals.grandTotal,
                        paymentType: String(input.paymentSnapshot?.payment_type ?? 'cash'),
                        lines: input.lines.map((line) => ({
                            name: line.itemName,
                            quantity: line.quantity,
                            total: line.unitPrice * line.quantity
                        })),
                        syncState: 'pending_sync'
                    },
                    connectivityMode: 'degraded',
                    isOnline: false,
                    hardwareMessage: `${error.message}. Sale was saved locally and is pending sync.`,
                    screen: 'sell_screen'
                });
                return;
            }

            mergeState({
                loading: false,
                hardwareMessage: error instanceof Error ? error.message : 'Checkout failed.'
            });
        }
    }, [mergeState]);

    const openHistoryReceipt = useCallback(async (localTransactionId: string) => {
        const deps = await getDeps();
        const client = deps.getMobilePosClient();
        const serverTransactionId = parseServerReceiptKey(localTransactionId);

        if (client && serverTransactionId) {
            const transaction = await client.getTransactionById(serverTransactionId);
            if (!transaction) {
                mergeState({ hardwareMessage: 'The selected server receipt is no longer available.' });
                return;
            }

            mergeState({
                lastReceipt: mapRemoteTransactionToReceipt(transaction, stateRef.current.cashierName),
                hardwareMessage: 'Server receipt preview opened from live history.',
                screen: 'receipt'
            });
            return;
        }

        const transaction = await deps.localTransactionRepository.getById(localTransactionId);
        if (!transaction) {
            mergeState({ hardwareMessage: 'The selected local receipt is no longer available on this device.' });
            return;
        }

        const paymentType = String(transaction.paymentSnapshot?.payment_type ?? 'cash');
        const cashierNameFromSnapshot = String(transaction.paymentSnapshot?.cashier_name ?? '').trim();
        mergeState({
            lastReceipt: {
                localTransactionId: transaction.localTransactionId,
                cashierName: cashierNameFromSnapshot || stateRef.current.cashierName || 'Cashier',
                shiftId: transaction.shiftId,
                createdAtLocal: transaction.createdAtLocal,
                total: transaction.totals.grandTotal,
                paymentType,
                lines: transaction.lines.map((line) => ({
                    name: line.itemName,
                    quantity: line.quantity,
                    total: line.unitPrice * line.quantity
                })),
                syncState: transaction.status === 'synced' ? 'synced' : 'pending_sync'
            },
            hardwareMessage: 'Local receipt preview opened from transaction history.',
            screen: 'receipt'
        });
    }, [mergeState]);

    const runManualSync = useCallback(async () => {
        const deps = await getDeps();
        mergeState({
            syncBusy: true,
            connectivityMode: 'syncing',
            hardwareMessage: 'Running governed manual sync...'
        });
        const outcome = await deps.manualSyncService.run(`sync-${Date.now()}`, new Date());
        const workerStatus = await (await import('../native/standalonePosSync')).standalonePosSync.enqueueAuthorizedSync(stateRef.current.deviceId);
        const pendingHistory = await deps.pendingHistoryService.getSnapshot();
        const currentReceipt = stateRef.current.lastReceipt;
        const nextConnectivityMode = outcome.outcome === 'failed'
            ? 'degraded'
            : (deps.getMobilePosClient() ? 'online_live' : 'offline_local');

        mergeState({
            pendingHistory,
            screen: 'sync_center',
            syncBusy: false,
            isOnline: nextConnectivityMode === 'online_live',
            connectivityMode: nextConnectivityMode,
            syncStatusLabel: toSyncStatusLabel(outcome.successfulSyncCountToday),
            lastSyncMessage: outcome.outcome === 'blocked_daily_limit'
                ? `Sync blocked until ${outcome.nextAllowedSyncAt ?? 'next business day'}`
                : `Last sync outcome: ${outcome.outcome}${workerStatus.state ? ` | worker ${workerStatus.state}` : ''}`,
            hardwareMessage: outcome.outcome === 'blocked_daily_limit'
                ? `WorkManager authorization blocked until ${outcome.nextAllowedSyncAt ?? 'next business day'}.`
                : `Manual sync completed with outcome ${outcome.outcome}. Authorized worker ${workerStatus.workId || 'unavailable'}.`,
            lastReceipt: currentReceipt && outcome.outcome === 'completed'
                ? { ...currentReceipt, syncState: 'synced' }
                : currentReceipt
        });
    }, [mergeState]);

    const printLastReceipt = useCallback(async () => {
        const receipt = stateRef.current.lastReceipt;
        if (!receipt) {
            mergeState({ hardwareMessage: 'No local receipt is available to print.' });
            return;
        }

        const receiptText = [
            'DGFY POS',
            `Receipt: ${receipt.localTransactionId}`,
            `Cashier: ${receipt.cashierName}`,
            `Shift: ${receipt.shiftId}`,
            `Datetime: ${receipt.createdAtLocal}`,
            '',
            ...receipt.lines.map((line) => `${line.quantity} x ${line.name}  ${toCurrency(line.total)}`),
            '',
            `TOTAL ${toCurrency(receipt.total)}`,
            receipt.syncState === 'synced' ? 'Status: Synced' : 'Status: Pending Sync'
        ].join('\n');

        // No tenant branding sync exists in this offline app yet (see issue #321) --
        // '' falls back to the bundled DGFY icon at the native layer, same as the
        // hardcoded 'DGFY POS' header text above.
        const result = await (await import('../native/standalonePosHardware')).standalonePosHardware.printReceipt(receiptText, true, '');
        mergeState({ hardwareMessage: result.message });
    }, [mergeState]);

    const openDrawer = useCallback(async () => {
        const receipt = stateRef.current.lastReceipt;
        const result = await (await import('../native/standalonePosHardware')).standalonePosHardware.openCashDrawer(
            'manual_open',
            receipt ? { localTransactionId: receipt.localTransactionId } : null
        );
        mergeState({ hardwareMessage: result.message });
    }, [mergeState]);

    const loadHardwareDiagnostics = useCallback(async () => {
        const diagnostics = await (await import('../native/standalonePosHardware')).standalonePosHardware.getHardwareDiagnostics();
        const summary = typeof diagnostics.lastErrorMessage === 'string' && diagnostics.lastErrorMessage
            ? String(diagnostics.lastErrorMessage)
            : typeof diagnostics.lastConnectionEvent === 'string'
                ? `Diagnostics loaded: ${diagnostics.lastConnectionEvent}`
                : 'Diagnostics loaded.';
        mergeState({
            hardwareDiagnostics: diagnostics,
            hardwareMessage: summary
        });
    }, [mergeState]);

    const closeShift = useCallback(async () => {
        const currentShiftId = stateRef.current.activeShiftId;
        const deps = await getDeps();
        if (currentShiftId) {
            await deps.runtimeStateService?.closeShift(currentShiftId, new Date().toISOString());
        }
        await deps.runtimeStateService?.lockCashierSession(new Date().toISOString());
        const offlineAuthProfile = await deps.runtimeStateService?.getOfflineAuthProfile() ?? null;
        mergeState({
            cashierId: null,
            activeShiftId: null,
            currentRoleCode: '',
            currentPermissions: [],
            cart: [],
            screen: 'login_unlock',
            cashierName: '',
            loginEmail: '',
            offlineAuthAvailable: Boolean(offlineAuthProfile?.pinHash),
            offlineCashierLabel: buildOfflineCashierLabel(offlineAuthProfile),
            adminAccessGranted: false,
            accountManagementSnapshot: null,
            hardwareMessage: 'Shift closed successfully. Cashier session locked for the next operator.',
            lastSyncMessage: 'Shift closed successfully. Please unlock and open a new shift to continue.'
        });
    }, [mergeState]);

    return useMemo(() => ({
        ...state,
        bootstrap,
        unlockCashier,
        unlockOfflineCashier,
        openShift,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        scanCatalogBarcode,
        refreshCatalog,
        lockSession,
        goToCart,
        backToSell,
        openReceipt,
        openHistoryReceipt,
        openHistory,
        refreshHistorySnapshot,
        openSyncCenter,
        openCloseShift,
        openAccountManagement,
        verifyAdminAccess,
        refreshAccountManagement,
        removeManagedCashier,
        clearOfflineManagedCashier,
        commitCheckout,
        runManualSync,
        printLastReceipt,
        openDrawer,
        loadHardwareDiagnostics,
        closeShift,
        setTextScale
    }), [
        state,
        bootstrap,
        unlockCashier,
        unlockOfflineCashier,
        openShift,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        scanCatalogBarcode,
        refreshCatalog,
        lockSession,
        goToCart,
        backToSell,
        openReceipt,
        openHistoryReceipt,
        openHistory,
        refreshHistorySnapshot,
        openSyncCenter,
        openCloseShift,
        openAccountManagement,
        verifyAdminAccess,
        refreshAccountManagement,
        removeManagedCashier,
        clearOfflineManagedCashier,
        commitCheckout,
        runManualSync,
        printLastReceipt,
        openDrawer,
        loadHardwareDiagnostics,
        closeShift,
        setTextScale
    ]);
};
