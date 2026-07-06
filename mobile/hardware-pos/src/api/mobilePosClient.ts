import type { MobilePosCheckoutReplayEntry } from '../domain/checkout';
import type { MobilePosSyncApi, MobilePosSyncResponse } from '../services/manualSyncService';

export interface MobilePosClientConfig {
    baseUrl: string;
    authToken?: string | null;
    companyToken?: string | null;
    timeoutMs?: number;
}

export interface LegacyPosCatalogRow {
    item_id?: number;
    name?: string;
    item_name?: string;
    sku_code?: string;
    barcode?: string | null;
    category?: string;
    category_name?: string;
    folder_name?: string;
    unit_of_measure?: string;
    default_sale_price?: number;
    sale_price?: number;
    price?: number;
    available_stock?: number | null;
}

export interface MobilePosBootstrapCatalogResponse {
    generated_at: string;
    bootstrap_version: string;
    query: Record<string, unknown>;
    catalog: LegacyPosCatalogRow[];
}

export interface MobilePosBootstrapSettingsResponse {
    generated_at: string;
    bootstrap_version: string;
    settings: Record<string, unknown>;
    sync_policy: Record<string, unknown>;
}

export interface MobilePosDevicePolicyResponse {
    generated_at: string;
    bootstrap_version: string;
    terminal_policy: Record<string, unknown>;
    sync_policy: Record<string, unknown>;
    receipt_profile: Record<string, unknown>;
}

export interface LegacyShiftRecord {
    pos_terminal_shift_id?: number;
    shift_id?: number;
    status?: string;
    terminal_id?: string;
    opening_float_amount?: number;
    opened_at?: string;
    closed_at?: string | null;
}

export interface LegacyShiftEnvelope {
    shift?: LegacyShiftRecord;
    current_shift?: LegacyShiftRecord;
    active_shift?: LegacyShiftRecord;
}

export interface LegacyCheckoutLineInput {
    item_id: number;
    quantity: number;
    sale_price: number;
}

export interface LegacyCheckoutTransactionLine {
    item_id?: number;
    item_name?: string;
    quantity?: number;
    sale_price?: number;
    unit_price?: number;
    item?: {
        name?: string;
    } | null;
}

export interface LegacyCheckoutTransaction {
    pos_transaction_id?: number;
    id?: number;
    invoice_number?: string;
    total_amount?: number;
    grand_total?: number;
    created_at?: string;
    status?: string;
    shift_id?: number;
    terminal_shift_id?: number;
    lines?: LegacyCheckoutTransactionLine[];
}

export interface LegacyTransactionsResponse {
    transactions: LegacyCheckoutTransaction[];
}

interface ApiEnvelope<T> {
    success: boolean;
    data: T;
    message?: string;
    error_code?: string;
}

export class MobilePosRequestError extends Error {
    statusCode: number | null;
    errorCode: string | null;
    responseBody: unknown;
    isNetworkError: boolean;

    constructor(
        message: string,
        options: {
            statusCode?: number | null;
            errorCode?: string | null;
            responseBody?: unknown;
            isNetworkError?: boolean;
        } = {}
    ) {
        super(message);
        this.name = 'MobilePosRequestError';
        this.statusCode = options.statusCode ?? null;
        this.errorCode = options.errorCode ?? null;
        this.responseBody = options.responseBody ?? null;
        this.isNetworkError = options.isNetworkError === true;
    }
}

const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number
): Promise<T> => {
    return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error('Mobile POS request timed out')), timeoutMs);
        })
    ]);
};

const joinUrl = (baseUrl: string, path: string): string => (
    `${String(baseUrl).replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
);

const normalizeApiBase = (input: string): string => {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
        return '';
    }

    return trimmed.endsWith('/api/v1')
        ? trimmed
        : `${trimmed.replace(/\/+$/, '')}/api/v1`;
};

const currentTimestamp = (): string => new Date().toISOString();

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const buildQueryString = (params: Record<string, string | number | null | undefined>): string => {
    const pairs = Object.entries(params)
        .filter(([, value]) => value !== null && value !== undefined && String(value) !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

    return pairs.length > 0 ? `?${pairs.join('&')}` : '';
};

const unwrapCatalogRows = (payload: unknown): LegacyPosCatalogRow[] => {
    if (Array.isArray(payload)) {
        return payload as LegacyPosCatalogRow[];
    }

    if (!payload || typeof payload !== 'object') {
        return [];
    }

    const candidate = payload as Record<string, unknown>;
    return asArray<LegacyPosCatalogRow>(
        candidate.rows ?? candidate.items ?? candidate.catalog ?? []
    );
};

const unwrapShift = (payload: unknown): LegacyShiftRecord | null => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const nested = record.shift ?? record.current_shift ?? record.active_shift;
    const value = (nested && typeof nested === 'object') ? nested : record;
    const shiftId = Number(
        (value as LegacyShiftRecord).pos_terminal_shift_id
        ?? (value as LegacyShiftRecord).shift_id
        ?? 0
    );

    return shiftId > 0 ? value as LegacyShiftRecord : null;
};

const unwrapTransactions = (payload: unknown): LegacyCheckoutTransaction[] => {
    if (Array.isArray(payload)) {
        return payload as LegacyCheckoutTransaction[];
    }

    if (!payload || typeof payload !== 'object') {
        return [];
    }

    const record = payload as Record<string, unknown>;
    return asArray<LegacyCheckoutTransaction>(
        record.transactions ?? record.rows ?? record.items ?? []
    );
};

const unwrapTransaction = (payload: unknown): LegacyCheckoutTransaction | null => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const candidate = record.transaction && typeof record.transaction === 'object'
        ? record.transaction
        : record;

    const transactionId = Number(
        (candidate as LegacyCheckoutTransaction).pos_transaction_id
        ?? (candidate as LegacyCheckoutTransaction).id
        ?? 0
    );

    return transactionId > 0 ? candidate as LegacyCheckoutTransaction : null;
};

const toReplayPayload = (
    entry: MobilePosCheckoutReplayEntry,
    deviceId: string
): {
    idempotency_key: string;
    terminal_id: string;
    shift_id?: number;
    order_method: string;
    payment_type: string;
    payment_handoff_mode: string;
    lines: LegacyCheckoutLineInput[];
} => {
    const payload = entry?.payload && typeof entry.payload === 'object'
        ? entry.payload as Record<string, unknown>
        : {};
    const paymentSnapshot = payload.payment_snapshot && typeof payload.payment_snapshot === 'object'
        ? payload.payment_snapshot as Record<string, unknown>
        : {};
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const paymentType = String(paymentSnapshot.payment_type || 'cash').trim().toLowerCase() || 'cash';
    const orderMethod = String(paymentSnapshot.order_method || 'dine_in').trim().toLowerCase() || 'dine_in';

    return {
        idempotency_key: String(payload.idempotency_key || entry.local_transaction_id || `standalone-replay-${Date.now()}`),
        terminal_id: String(payload.terminal_id || deviceId).trim(),
        shift_id: payload.shift_id ? Number(payload.shift_id) : undefined,
        order_method: orderMethod,
        payment_type: paymentType,
        payment_handoff_mode: paymentType === 'cash' ? 'internal' : 'external',
        lines: lines.map((line) => {
            const row = line && typeof line === 'object' ? line as Record<string, unknown> : {};
            return {
                item_id: Number(row.item_id),
                quantity: Number(row.quantity),
                sale_price: Number(row.sale_price)
            };
        }).filter((line) => Number.isFinite(line.item_id) && line.item_id > 0 && Number.isFinite(line.quantity) && line.quantity > 0)
    };
};

export class MobilePosClient implements MobilePosSyncApi {
    constructor(private readonly config: MobilePosClientConfig) {}

    async getCatalog(params: {
        search?: string;
        limit?: number;
        location_id?: number;
    } = {}): Promise<MobilePosBootstrapCatalogResponse> {
        const suffix = buildQueryString({
            search: params.search ?? null,
            limit: params.limit ?? null,
            location_id: params.location_id ?? null
        });
        const payload = await this.request<unknown>(`/pos/catalog${suffix}`);

        return {
            generated_at: currentTimestamp(),
            bootstrap_version: 'legacy-pos-v1',
            query: {
                search: params.search ?? '',
                limit: params.limit ?? null,
                location_id: params.location_id ?? null
            },
            catalog: unwrapCatalogRows(payload)
        };
    }

    async getSettings(): Promise<MobilePosBootstrapSettingsResponse> {
        return {
            generated_at: currentTimestamp(),
            bootstrap_version: 'legacy-pos-v1',
            settings: {
                source: 'legacy-pos-api',
                mode: 'synthetic'
            },
            sync_policy: {
                source: 'local-device-policy',
                mode: 'manual_only'
            }
        };
    }

    async getDevicePolicy(): Promise<MobilePosDevicePolicyResponse> {
        return {
            generated_at: currentTimestamp(),
            bootstrap_version: 'legacy-pos-v1',
            terminal_policy: {
                registry_mode: 'legacy-live-terminal'
            },
            sync_policy: {
                mode: 'immediate-checkout-live'
            },
            receipt_profile: {
                profile_name: 'server-transaction-receipt'
            }
        };
    }

    async getCurrentShift(terminalId: string): Promise<LegacyShiftRecord | null> {
        const payload = await this.request<unknown>(
            `/pos/terminal/shifts/current?terminal_id=${encodeURIComponent(String(terminalId || '').trim())}`
        );

        return unwrapShift(payload);
    }

    async openShift(input: {
        terminalId: string;
        openingFloatAmount?: number;
        idempotencyKey?: string;
    }): Promise<LegacyShiftRecord | null> {
        const payload = await this.request<unknown>('/pos/terminal/shifts/open', {
            method: 'POST',
            body: JSON.stringify({
                idempotency_key: input.idempotencyKey ?? `standalone-shift-${Date.now()}`,
                terminal_id: String(input.terminalId || '').trim(),
                opening_float_amount: Number(input.openingFloatAmount ?? 0)
            })
        });

        return unwrapShift(payload);
    }

    async checkout(input: {
        terminalId: string;
        shiftId?: number | string | null;
        orderMethod?: string;
        paymentType?: string;
        paymentHandoffMode?: string;
        discountAmount?: number;
        idempotencyKey?: string;
        lines: LegacyCheckoutLineInput[];
    }): Promise<LegacyCheckoutTransaction | null> {
        const payload = await this.request<unknown>('/pos/checkouts', {
            method: 'POST',
            body: JSON.stringify({
                idempotency_key: input.idempotencyKey ?? `standalone-checkout-${Date.now()}`,
                terminal_id: String(input.terminalId || '').trim(),
                shift_id: input.shiftId ? Number(input.shiftId) : undefined,
                order_method: String(input.orderMethod || 'dine_in'),
                payment_type: String(input.paymentType || 'cash'),
                payment_handoff_mode: String(input.paymentHandoffMode || 'internal'),
                discount_amount: Number(input.discountAmount ?? 0),
                lines: input.lines.map((line) => ({
                    item_id: Number(line.item_id),
                    quantity: Number(line.quantity),
                    sale_price: Number(line.sale_price)
                }))
            })
        });

        return unwrapTransaction(payload);
    }

    async getTransactions(limit = 50): Promise<LegacyTransactionsResponse> {
        const payload = await this.request<unknown>(`/pos/transactions?limit=${encodeURIComponent(String(limit))}`);
        return {
            transactions: unwrapTransactions(payload)
        };
    }

    async getTransactionById(transactionId: number | string): Promise<LegacyCheckoutTransaction | null> {
        const payload = await this.request<unknown>(`/pos/transactions/${encodeURIComponent(String(transactionId))}`);
        return unwrapTransaction(payload);
    }

    async syncCheckouts(payload: {
        device_id: string;
        client_sync_run_id: string;
        entries: MobilePosCheckoutReplayEntry[];
    }): Promise<MobilePosSyncResponse> {
        const results: MobilePosSyncResponse['results'] = [];

        for (const [index, entry] of payload.entries.entries()) {
            const localTransactionId = String(entry.local_transaction_id ?? `local-${index}`);
            try {
                const replayPayload = toReplayPayload(entry, payload.device_id);
                const transaction = await this.checkout({
                    terminalId: replayPayload.terminal_id,
                    shiftId: replayPayload.shift_id,
                    orderMethod: replayPayload.order_method,
                    paymentType: replayPayload.payment_type,
                    paymentHandoffMode: replayPayload.payment_handoff_mode,
                    idempotencyKey: replayPayload.idempotency_key,
                    lines: replayPayload.lines
                });

                results.push({
                    local_transaction_id: localTransactionId,
                    status: transaction ? 'accepted' : 'replayed',
                    server_transaction_id: Number(transaction?.pos_transaction_id ?? transaction?.id ?? 0) || null,
                    replay_outcome: transaction ? 'processed' : 'idempotent_replay'
                });
            } catch (error) {
                results.push({
                    local_transaction_id: localTransactionId,
                    status: 'rejected',
                    error: {
                        error_code: error instanceof MobilePosRequestError
                            ? (error.errorCode || (error.isNetworkError ? 'UNKNOWN' : 'MALFORMED_PAYLOAD'))
                            : 'UNKNOWN'
                    }
                });
            }
        }

        const acceptedCount = results.filter((entry) => entry.status === 'accepted').length;
        const replayedCount = results.filter((entry) => entry.status === 'replayed').length;

        return {
            results,
            summary: {
                checkpoint_token: acceptedCount + replayedCount > 0 ? `replay-${payload.client_sync_run_id}` : null,
                accepted_count: acceptedCount,
                replayed_count: replayedCount
            }
        };
    }

    async acknowledgeCheckpoint(_payload: { checkpoint_token: string }): Promise<void> {
        return;
    }

    private async request<T>(
        path: string,
        init: RequestInit = {}
    ): Promise<T> {
        const headers = new Headers(init.headers);
        headers.set('Content-Type', 'application/json');
        if (this.config.authToken) {
            headers.set('Authorization', `Bearer ${this.config.authToken}`);
        }
        if (this.config.companyToken) {
            headers.set('x-company-token', this.config.companyToken);
        }

        let response: Response;
        try {
            response = await withTimeout(
                fetch(joinUrl(normalizeApiBase(this.config.baseUrl), path), {
                    ...init,
                    credentials: 'omit',
                    headers
                }),
                this.config.timeoutMs ?? 15000
            );
        } catch (error) {
            throw new MobilePosRequestError(
                error instanceof Error ? error.message : 'Mobile POS request failed',
                { isNetworkError: true }
            );
        }

        let envelope: ApiEnvelope<T> | null = null;
        try {
            envelope = await response.json() as ApiEnvelope<T>;
        } catch {
            envelope = null;
        }

        if (!response.ok || envelope?.success !== true) {
            throw new MobilePosRequestError(
                envelope?.message || envelope?.error_code || 'Mobile POS request failed',
                {
                    statusCode: response.status,
                    errorCode: envelope?.error_code ?? null,
                    responseBody: envelope
                }
            );
        }

        return envelope.data;
    }
}
