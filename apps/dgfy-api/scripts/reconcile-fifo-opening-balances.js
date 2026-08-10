import dotenv from 'dotenv';
import { QueryTypes } from 'sequelize';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Tenant, sequelize as landlordSequelize } from '../src/models/index.js';
import tenantConnector from '../src/utils/TenantConnector.js';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { reconcileFifoLedgerOpeningBalance } from '../src/services/stockMovementService.js';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: join(dirname(__filename), '..', '.env') });

const getArg = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] || null : null;
};

const tenantId = getArg('--tenant-id');
const actorUserId = Number.parseInt(getArg('--actor-user-id'), 10);
const shouldApply = process.argv.includes('--apply');

if (!tenantId) throw new Error('--tenant-id is required. This tool never reconciles every tenant.');
if (shouldApply && (!Number.isInteger(actorUserId) || actorUserId <= 0)) {
    throw new Error('--actor-user-id is required with --apply so every reconciliation has an accountable actor.');
}

const CANDIDATES_SQL = `
  SELECT
    i.item_id,
    i.sku_code,
    i.name,
    CAST(i.current_stock AS DECIMAL(18,6)) AS item_stock,
    CAST(ils.quantity_on_hand AS DECIMAL(18,6)) AS location_stock,
    CAST(COALESCE(SUM(GREATEST(fb.quantity - fb.quantity_consumed, 0)), 0) AS DECIMAL(18,6)) AS batch_available,
    CAST(i.current_stock - COALESCE(SUM(GREATEST(fb.quantity - fb.quantity_consumed, 0)), 0) AS DECIMAL(18,6)) AS variance
  FROM items i
  JOIN item_location_stocks ils ON ils.item_id = i.item_id
  LEFT JOIN fifo_batches fb ON fb.item_id = i.item_id AND fb.location_id = ils.location_id
  WHERE i.fifo_enabled = 1
    AND i.deleted_at IS NULL
    AND (i.status IS NULL OR i.status <> 'inactive')
  GROUP BY i.item_id, i.sku_code, i.name, i.current_stock, ils.location_id, ils.quantity_on_hand
  HAVING variance > 0.0001
    AND ABS(i.current_stock - ils.quantity_on_hand) <= 0.0001
    AND (SELECT COUNT(*) FROM stock_movements sm WHERE sm.item_id = i.item_id) = 0
  ORDER BY i.item_id ASC
`;

try {
    const tenant = await Tenant.findByPk(tenantId, { raw: true });
    if (!tenant || tenant.status !== 'active') throw new Error('Active tenant not found.');

    const sequelize = await tenantConnector.getConnection(tenant);
    const tenantModels = getTenantModels(sequelize);
    const locations = await sequelize.query(
        'SELECT location_id FROM tenant_locations WHERE is_active = 1 ORDER BY location_id ASC',
        { type: QueryTypes.SELECT }
    );
    if (locations.length !== 1) {
        throw new Error('This reconciler requires exactly one active location. Review multi-location inventory per location before reconciliation.');
    }

    const locationId = Number(locations[0].location_id);
    const candidates = await sequelize.query(CANDIDATES_SQL, { type: QueryTypes.SELECT });
    console.log(`[FifoOpeningBalanceReconciliation] tenant=${tenant.name} location_id=${locationId} candidates=${candidates.length} apply=${shouldApply}`);
    candidates.forEach((row) => console.log(
        ` - item_id=${row.item_id} sku=${row.sku_code || '-'} quantity=${Number(row.variance).toFixed(6)} current_stock=${Number(row.item_stock).toFixed(6)} batch_available=${Number(row.batch_available).toFixed(6)}`
    ));

    if (!shouldApply) {
        console.log('[FifoOpeningBalanceReconciliation] review only. Re-run with --apply --actor-user-id <id> after approving the listed rows.');
    } else {
        await dbStore.run({ sequelize, tenantId: tenant.id, tenantName: tenant.name, ...tenantModels }, async () => {
            for (const row of candidates) {
                await reconcileFifoLedgerOpeningBalance({
                    itemId: row.item_id,
                    locationId,
                    quantity: Number(row.variance),
                    expectedItemStock: Number(row.item_stock),
                    expectedLocationStock: Number(row.location_stock),
                    expectedBatchAvailable: Number(row.batch_available),
                    referenceId: `FIFO-OPENING-${tenant.id.slice(0, 8)}`,
                    notes: 'Reviewed historical opening balance backfill. Item and location stock were verified before the FIFO ledger record was created.'
                }, actorUserId);
            }
        });
        console.log(`[FifoOpeningBalanceReconciliation] applied=${candidates.length}`);
    }
} finally {
    await tenantConnector.closeAll();
    await landlordSequelize.close();
}
