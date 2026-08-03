'use strict';

// AI cost metering has no way to separate spend by feature (#195): every
// AI-spending feature (the AI assistant, menu-import extraction, and soon
// per-image item-image generation) writes to the same ai_usage_logs table
// with no way to attribute a row back to its feature. That means
// MENU_IMPORT_DAILY_USD_BUDGET (see
// modules/menuImport/repositories/menuImportBudgetRepository.js) sums ALL
// tenant AI spend, not menu import's own — a tenant's AI-chat usage can
// exhaust the budget that's supposed to gate menu imports, and vice versa.
//
// `feature` classifies which product surface generated the row. Existing
// rows predate this feature (they were written before this column existed)
// and are overwhelmingly AI-assistant chat traffic (menu-import logging only
// shipped in 20260220000001, after the assistant), so they backfill to
// 'ai_assistant' rather than an unclassified sentinel.
//
// `units` carries a non-token usage count (e.g. images generated) for
// features priced per-unit rather than per-token — see
// config/aiModelRates.js's resolveImageModelRate(). Token-priced rows leave
// it at its default of 0.
//
// Composite (tenant_id, feature, timestamp) index: the budget query already
// filters tenant_id + timestamp (see 20260728000001's composite index) and
// will add a feature filter on top of that — a three-column index keeps that
// a single index range scan instead of an extra filesort on top of the
// existing two-column index.
//
// Idempotent guards mirror 20260801000002-add-service-addons-toggle.cjs
// (columns) and 20260728000001-add-tenant-timestamp-index-to-ai-usage-logs.cjs
// (index) so re-running this migration against an already-migrated database
// is a no-op.

const INDEX_NAME = 'idx_ai_usage_logs_tenant_feature_timestamp';

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable('ai_usage_logs').catch(() => null);
        if (!columns) return;

        if (!columns.feature) {
            await queryInterface.addColumn('ai_usage_logs', 'feature', {
                type: Sequelize.STRING(64),
                allowNull: false,
                defaultValue: 'ai_assistant',
                after: 'user_id'
            });
        }

        if (!columns.units) {
            await queryInterface.addColumn('ai_usage_logs', 'units', {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                after: 'output_tokens'
            });
        }

        await addIndexIfMissing(queryInterface, 'ai_usage_logs', ['tenant_id', 'feature', 'timestamp'], {
            name: INDEX_NAME
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('ai_usage_logs', INDEX_NAME).catch(() => null);

        const columns = await queryInterface.describeTable('ai_usage_logs').catch(() => null);
        if (columns?.units) {
            await queryInterface.removeColumn('ai_usage_logs', 'units');
        }
        if (columns?.feature) {
            await queryInterface.removeColumn('ai_usage_logs', 'feature');
        }
    }
};
