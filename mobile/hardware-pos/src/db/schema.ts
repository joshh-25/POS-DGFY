export interface TableColumn {
    name: string;
    type: string;
    required?: boolean;
    notes?: string;
}

export interface TableDefinition {
    name: string;
    columns: TableColumn[];
}

export const hardwarePosSchema: TableDefinition[] = [
    {
        name: 'device_profile',
        columns: [
            { name: 'device_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'store_id', type: 'INTEGER', required: true },
            { name: 'location_id', type: 'INTEGER', required: false },
            { name: 'terminal_label', type: 'TEXT', required: false },
            { name: 'timezone', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'cashier_profiles_cache',
        columns: [
            { name: 'cashier_id', type: 'INTEGER PRIMARY KEY', required: true },
            { name: 'display_name', type: 'TEXT', required: true },
            { name: 'role_code', type: 'TEXT', required: true },
            { name: 'authorization_snapshot_json', type: 'TEXT', required: true },
            { name: 'cached_at', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'cashier_session',
        columns: [
            { name: 'session_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'cashier_id', type: 'INTEGER', required: true },
            { name: 'status', type: 'TEXT', required: true },
            { name: 'opened_at', type: 'TEXT', required: true },
            { name: 'locked_at', type: 'TEXT', required: false }
        ]
    },
    {
        name: 'shift_state',
        columns: [
            { name: 'shift_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'cashier_id', type: 'INTEGER', required: true },
            { name: 'opening_cash_amount', type: 'NUMERIC', required: true },
            { name: 'status', type: 'TEXT', required: true },
            { name: 'opened_at', type: 'TEXT', required: true },
            { name: 'closed_at', type: 'TEXT', required: false }
        ]
    },
    {
        name: 'catalog_items',
        columns: [
            { name: 'item_id', type: 'INTEGER PRIMARY KEY', required: true },
            { name: 'item_name', type: 'TEXT', required: true },
            { name: 'unit_label', type: 'TEXT', required: false },
            { name: 'status', type: 'TEXT', required: true },
            { name: 'snapshot_json', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'catalog_prices',
        columns: [
            { name: 'price_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'item_id', type: 'INTEGER', required: true },
            { name: 'location_id', type: 'INTEGER', required: false },
            { name: 'unit_price', type: 'NUMERIC', required: true },
            { name: 'pricing_snapshot_json', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'barcode_mappings',
        columns: [
            { name: 'barcode_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'item_id', type: 'INTEGER', required: true },
            { name: 'barcode_value', type: 'TEXT', required: true },
            { name: 'resolution_snapshot_json', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'cart_drafts',
        columns: [
            { name: 'cart_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'cashier_id', type: 'INTEGER', required: true },
            { name: 'draft_snapshot_json', type: 'TEXT', required: true },
            { name: 'updated_at', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'local_transactions',
        columns: [
            { name: 'local_transaction_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'idempotency_key', type: 'TEXT UNIQUE', required: true },
            { name: 'created_at_local', type: 'TEXT', required: true },
            { name: 'status', type: 'TEXT', required: true },
            { name: 'receipt_state', type: 'TEXT', required: true },
            { name: 'cashier_id', type: 'INTEGER', required: true },
            { name: 'shift_id', type: 'TEXT', required: true },
            { name: 'transaction_snapshot_json', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'local_transaction_lines',
        columns: [
            { name: 'line_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'local_transaction_id', type: 'TEXT', required: true },
            { name: 'item_snapshot_json', type: 'TEXT', required: true },
            { name: 'pricing_snapshot_json', type: 'TEXT', required: true },
            { name: 'barcode_resolution_json', type: 'TEXT', required: false }
        ]
    },
    {
        name: 'sync_journal',
        columns: [
            { name: 'journal_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'entity_type', type: 'TEXT', required: true },
            { name: 'entity_id', type: 'TEXT', required: true },
            { name: 'operation_type', type: 'TEXT', required: true },
            { name: 'payload_json', type: 'TEXT', required: true },
            { name: 'status', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'sync_runs',
        columns: [
            { name: 'run_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'started_at', type: 'TEXT', required: true },
            { name: 'completed_at', type: 'TEXT', required: false },
            { name: 'outcome', type: 'TEXT', required: true },
            { name: 'checkpoint_returned', type: 'TEXT', required: false },
            { name: 'consumed_slot', type: 'INTEGER', required: true }
        ]
    },
    {
        name: 'sync_policy',
        columns: [
            { name: 'business_day_key', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'successful_sync_count_today', type: 'INTEGER', required: true },
            { name: 'last_successful_sync_at', type: 'TEXT', required: false },
            { name: 'next_allowed_sync_at', type: 'TEXT', required: false },
            { name: 'last_checkpoint', type: 'TEXT', required: false }
        ]
    },
    {
        name: 'receipt_print_log',
        columns: [
            { name: 'print_log_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'local_transaction_id', type: 'TEXT', required: true },
            { name: 'print_type', type: 'TEXT', required: true },
            { name: 'status', type: 'TEXT', required: true },
            { name: 'printed_at', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'hardware_event_log',
        columns: [
            { name: 'hardware_event_id', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'event_type', type: 'TEXT', required: true },
            { name: 'severity', type: 'TEXT', required: true },
            { name: 'event_payload_json', type: 'TEXT', required: true },
            { name: 'occurred_at', type: 'TEXT', required: true }
        ]
    },
    {
        name: 'app_runtime_state',
        columns: [
            { name: 'state_key', type: 'TEXT PRIMARY KEY', required: true },
            { name: 'state_json', type: 'TEXT', required: true },
            { name: 'updated_at', type: 'TEXT', required: true }
        ]
    }
];
