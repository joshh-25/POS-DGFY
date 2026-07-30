/**
 * Menu Import Budget Repository
 *
 * Reads a tenant's AI spend so the batch-import upload use case can enforce
 * MENU_IMPORT_DAILY_USD_BUDGET before enqueueing a job (batch import can
 * trigger up to MENU_IMPORT_MAX_FILES_PER_BATCH vision calls per request —
 * this is the backstop against runaway cost from repeated large batches).
 *
 * AiUsageLog is a landlord (shared, not tenant-per-DB) model — see
 * menuExtractionService.js's own comment on why it reaches AiUsageLog via a
 * static models/index.js import rather than dbStore.get('AiUsageLog'). This
 * repository does the same for consistency.
 */

import { Op, fn, col } from 'sequelize';
import { AiUsageLog } from '../../../models/index.js';

/**
 * @param {string} tenantId
 * @param {Date} since
 * @returns {Promise<number>} total cost_usd logged for the tenant at/after `since`, or 0.
 */
export const getTenantAiSpendSince = async (tenantId, since) => {
    const result = await AiUsageLog.findOne({
        attributes: [[fn('SUM', col('cost_usd')), 'total']],
        where: {
            tenant_id: tenantId,
            timestamp: { [Op.gte]: since }
        },
        raw: true
    });
    const total = Number(result?.total);
    return Number.isFinite(total) ? total : 0;
};

export default { getTenantAiSpendSince };
