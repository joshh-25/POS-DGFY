import type { SqlRow, SqliteDriver } from '../db/driver';
import type { LocalTransactionRecord } from '../domain/checkout';
import { toHistoryRow, type HistoryRow } from '../domain/history';
import type { ReceiptState } from '../domain/types';
import type { HistoryCounts, LocalTransactionRepository } from './contracts';

interface LocalTransactionRow extends SqlRow {
    local_transaction_id: string;
    idempotency_key: string;
    created_at_local: string;
    status: LocalTransactionRecord['status'];
    receipt_state: ReceiptState;
    cashier_id: number;
    shift_id: string;
    transaction_snapshot_json: string;
    server_transaction_id?: number | null;
    last_sync_reason_code?: string | null;
}

interface LocalTransactionSnapshot {
    lines: LocalTransactionRecord['lines'];
    totals: LocalTransactionRecord['totals'];
    pricingSnapshot: LocalTransactionRecord['pricingSnapshot'];
    paymentSnapshot: LocalTransactionRecord['paymentSnapshot'];
    customerSnapshot: LocalTransactionRecord['customerSnapshot'];
    serverTransactionId?: number | null;
    lastSyncReasonCode?: string | null;
}

const parseSnapshot = (raw: string): LocalTransactionSnapshot => JSON.parse(raw) as LocalTransactionSnapshot;

export class SqliteLocalTransactionRepository implements LocalTransactionRepository {
    constructor(private readonly driver: SqliteDriver) {}

    async create(transaction: LocalTransactionRecord): Promise<void> {
        await this.driver.transaction(async (tx) => {
            await tx.execute({
                sql: `
                    INSERT INTO local_transactions (
                        local_transaction_id,
                        idempotency_key,
                        created_at_local,
                        status,
                        receipt_state,
                        cashier_id,
                        shift_id,
                        transaction_snapshot_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                `,
                params: [
                    transaction.localTransactionId,
                    transaction.idempotencyKey,
                    transaction.createdAtLocal,
                    transaction.status,
                    transaction.receiptState,
                    transaction.cashierId,
                    transaction.shiftId,
                    JSON.stringify({
                        lines: transaction.lines,
                        totals: transaction.totals,
                        pricingSnapshot: transaction.pricingSnapshot,
                        paymentSnapshot: transaction.paymentSnapshot,
                        customerSnapshot: transaction.customerSnapshot,
                        serverTransactionId: transaction.serverTransactionId,
                        lastSyncReasonCode: transaction.lastSyncReasonCode
                    })
                ]
            });

            for (const line of transaction.lines) {
                await tx.execute({
                    sql: `
                        INSERT INTO local_transaction_lines (
                            line_id,
                            local_transaction_id,
                            item_snapshot_json,
                            pricing_snapshot_json,
                            barcode_resolution_json
                        ) VALUES (?, ?, ?, ?, ?);
                    `,
                    params: [
                        line.lineId,
                        transaction.localTransactionId,
                        JSON.stringify({
                            itemId: line.itemId,
                            itemName: line.itemName,
                            quantity: line.quantity
                        }),
                        JSON.stringify({
                            unitPrice: line.unitPrice,
                            discounts: line.discounts,
                            fees: line.fees,
                            vatRelevantAmount: line.vatRelevantAmount
                        }),
                        line.barcodeMetadata ? JSON.stringify(line.barcodeMetadata) : null
                    ]
                });
            }
        });
    }

    async getById(localTransactionId: string): Promise<LocalTransactionRecord | null> {
        const rows = await this.driver.query<LocalTransactionRow>({
            sql: `
                SELECT *
                FROM local_transactions
                WHERE local_transaction_id = ?
                LIMIT 1;
            `,
            params: [localTransactionId]
        });

        const row = rows[0];
        if (!row) {
            return null;
        }

        const snapshot = parseSnapshot(row.transaction_snapshot_json);
        return {
            localTransactionId: row.local_transaction_id,
            idempotencyKey: row.idempotency_key,
            createdAtLocal: row.created_at_local,
            status: row.status,
            receiptState: row.receipt_state,
            cashierId: row.cashier_id,
            shiftId: row.shift_id,
            lines: snapshot.lines,
            totals: snapshot.totals,
            pricingSnapshot: snapshot.pricingSnapshot,
            paymentSnapshot: snapshot.paymentSnapshot,
            customerSnapshot: snapshot.customerSnapshot,
            serverTransactionId: snapshot.serverTransactionId ?? null,
            lastSyncReasonCode: snapshot.lastSyncReasonCode ?? null
        };
    }

    async markStatus(input: {
        localTransactionId: string;
        status: LocalTransactionRecord['status'];
        serverTransactionId?: number | null;
        lastSyncReasonCode?: string | null;
        receiptState?: ReceiptState;
    }): Promise<void> {
        await this.driver.transaction(async (tx) => {
            const rows = await tx.query<LocalTransactionRow>({
                sql: `
                    SELECT *
                    FROM local_transactions
                    WHERE local_transaction_id = ?
                    LIMIT 1;
                `,
                params: [input.localTransactionId]
            });

            const current = rows[0];
            if (!current) {
                return;
            }

            const snapshot = parseSnapshot(current.transaction_snapshot_json);
            const nextSnapshot: LocalTransactionSnapshot = {
                ...snapshot,
                serverTransactionId: input.serverTransactionId ?? snapshot.serverTransactionId ?? null,
                lastSyncReasonCode: input.lastSyncReasonCode ?? snapshot.lastSyncReasonCode ?? null
            };

            await tx.execute({
                sql: `
                    UPDATE local_transactions
                    SET status = ?,
                        receipt_state = ?,
                        transaction_snapshot_json = ?
                    WHERE local_transaction_id = ?;
                `,
                params: [
                    input.status,
                    input.receiptState ?? current.receipt_state,
                    JSON.stringify(nextSnapshot),
                    input.localTransactionId
                ]
            });
        });
    }

    async listReplayable(): Promise<LocalTransactionRecord[]> {
        const rows = await this.driver.query<LocalTransactionRow>({
            sql: `
                SELECT *
                FROM local_transactions
                WHERE status IN ('sync_pending', 'sync_replaying')
                ORDER BY created_at_local ASC;
            `
        });

        return rows.map((row) => {
            const snapshot = parseSnapshot(row.transaction_snapshot_json);
            return {
                localTransactionId: row.local_transaction_id,
                idempotencyKey: row.idempotency_key,
                createdAtLocal: row.created_at_local,
                status: row.status,
                receiptState: row.receipt_state,
                cashierId: row.cashier_id,
                shiftId: row.shift_id,
                lines: snapshot.lines,
                totals: snapshot.totals,
                pricingSnapshot: snapshot.pricingSnapshot,
                paymentSnapshot: snapshot.paymentSnapshot,
                customerSnapshot: snapshot.customerSnapshot,
                serverTransactionId: snapshot.serverTransactionId ?? null,
                lastSyncReasonCode: snapshot.lastSyncReasonCode ?? null
            };
        });
    }

    async listHistory(): Promise<HistoryRow[]> {
        const rows = await this.driver.query<LocalTransactionRow>({
            sql: `
                SELECT *
                FROM local_transactions
                ORDER BY created_at_local DESC;
            `
        });

        return rows.map((row) => {
            const snapshot = parseSnapshot(row.transaction_snapshot_json);
            return toHistoryRow({
                localTransactionId: row.local_transaction_id,
                createdAtLocal: row.created_at_local,
                cashierId: row.cashier_id,
                shiftId: row.shift_id,
                paymentType: String(snapshot.paymentSnapshot?.payment_type ?? 'cash'),
                orderMethod: String(snapshot.paymentSnapshot?.order_method ?? 'dine_in'),
                orderSource: 'in_store',
                status: row.status,
                receiptState: row.receipt_state,
                grandTotal: snapshot.totals.grandTotal,
                itemCount: snapshot.lines.length,
                serverTransactionId: snapshot.serverTransactionId ?? null
            });
        });
    }

    async getHistoryCounts(): Promise<HistoryCounts> {
        const rows = await this.driver.query<{
            pending_count: number;
            synced_count: number;
            conflict_count: number;
        }>({
            sql: `
                SELECT
                    SUM(CASE WHEN status IN ('sync_pending', 'sync_replaying') THEN 1 ELSE 0 END) AS pending_count,
                    SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced_count,
                    SUM(CASE WHEN status IN ('conflict', 'failed_manual_resolution_required') THEN 1 ELSE 0 END) AS conflict_count
                FROM local_transactions;
            `
        });

        const counts = rows[0] ?? {
            pending_count: 0,
            synced_count: 0,
            conflict_count: 0
        };

        return {
            pending: Number(counts.pending_count || 0),
            synced: Number(counts.synced_count || 0),
            conflict: Number(counts.conflict_count || 0)
        };
    }
}
