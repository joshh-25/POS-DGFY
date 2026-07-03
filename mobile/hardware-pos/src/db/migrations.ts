import { hardwarePosSchema, type TableColumn } from './schema';

const renderColumn = (column: TableColumn): string => {
    const requiredSuffix = column.required && !column.type.includes('PRIMARY KEY')
        ? ' NOT NULL'
        : '';
    return `${column.name} ${column.type}${requiredSuffix}`;
};

export const createTableStatements = hardwarePosSchema.map((table) => ({
    tableName: table.name,
    sql: `CREATE TABLE IF NOT EXISTS ${table.name} (${table.columns.map(renderColumn).join(', ')});`
}));

export const createIndexStatements = [
    {
        name: 'idx_local_transactions_status_created_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_local_transactions_status_created_at ON local_transactions (status, created_at_local DESC);'
    },
    {
        name: 'idx_local_transaction_lines_transaction',
        sql: 'CREATE INDEX IF NOT EXISTS idx_local_transaction_lines_transaction ON local_transaction_lines (local_transaction_id);'
    },
    {
        name: 'idx_sync_journal_status_entity',
        sql: 'CREATE INDEX IF NOT EXISTS idx_sync_journal_status_entity ON sync_journal (status, entity_type, entity_id);'
    },
    {
        name: 'idx_sync_runs_started_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs (started_at DESC);'
    },
    {
        name: 'idx_receipt_print_log_transaction',
        sql: 'CREATE INDEX IF NOT EXISTS idx_receipt_print_log_transaction ON receipt_print_log (local_transaction_id, printed_at DESC);'
    },
    {
        name: 'idx_hardware_event_log_occurred_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_hardware_event_log_occurred_at ON hardware_event_log (occurred_at DESC);'
    }
];
