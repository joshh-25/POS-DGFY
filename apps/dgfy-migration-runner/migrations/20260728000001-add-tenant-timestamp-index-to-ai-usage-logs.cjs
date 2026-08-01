'use strict';

// Batch menu import (modules/menuImport/) enforces a per-tenant daily AI-spend
// budget (MENU_IMPORT_DAILY_USD_BUDGET) by summing ai_usage_logs.cost_usd for
// the tenant over the last 24h on every batch-upload request (see
// modules/menuImport/repositories/menuImportBudgetRepository.js). The existing
// single-column indexes on tenant_id and timestamp
// (20260220000001-create-ai-usage-logs.cjs) let MySQL use one of them plus a
// filesort/range scan for the other, but ai_usage_logs is a landlord (shared,
// not tenant-per-DB) table logging every tenant's AI usage platform-wide, so
// it can grow large — a composite (tenant_id, timestamp) index lets that
// per-upload query hit a single index range scan instead.
//
// Idempotent guard (addIndexIfMissing) mirrors
// 20260723000001-create-affiliates-program.cjs so re-running this migration
// against an already-migrated database is a no-op.

const INDEX_NAME = 'idx_ai_usage_logs_tenant_timestamp';

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
    async up(queryInterface) {
        await addIndexIfMissing(queryInterface, 'ai_usage_logs', ['tenant_id', 'timestamp'], {
            name: INDEX_NAME
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('ai_usage_logs', INDEX_NAME).catch(() => null);
    }
};
