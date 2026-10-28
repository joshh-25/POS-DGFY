import cron from 'node-cron';
import dbStore from '../utils/dbStore.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import logger from '../config/logger.js';
import * as cacheService from '../services/cacheService.js';
import { reconcileBusinessAdminAlertSnapshots } from '../modules/businessAdmin/services/businessAdminAlertSnapshotService.js';
import { businessAdminAlertSnapshotRepository } from '../modules/businessAdmin/repositories/businessAdminAlertSnapshotRepository.js';

let task = null;
let cycleInProgress = false;
const SCHEDULER_LOCK_KEY = 'scheduler:business_admin_alert_snapshots';
const intervalMinutes = () => Math.max(5, Number.parseInt(process.env.BUSINESS_ADMIN_ALERT_SNAPSHOT_MINUTES || '15', 10) || 15);
const lockTtlSeconds = () => Math.max(60, Number.parseInt(process.env.BUSINESS_ADMIN_ALERT_SNAPSHOT_LOCK_SECONDS || '900', 10) || 900);
const withTenant = async (tenant, callback) => {
    const sequelize = await tenantConnector.getConnection(tenant, 'scheduler.business-admin-alert');
    const models = getTenantModels(sequelize);
    return dbStore.run({ ...models, sequelize, tenantId: tenant.id, tenantName: tenant.name }, callback);
};

export const runBusinessAdminAlertSnapshotCycle = async () => {
    if (cycleInProgress) {
        logger.warn('Business Admin alert snapshot cycle is already running. Skipping overlapping execution.');
        return { status: 'skipped', reason: 'local_lock' };
    }

    const acquired = await cacheService.acquireLock(SCHEDULER_LOCK_KEY, lockTtlSeconds());
    if (!acquired) {
        logger.warn('Business Admin alert snapshot scheduler lock is held by another instance. Skipping execution.');
        return { status: 'skipped', reason: 'distributed_lock' };
    }

    cycleInProgress = true;
    const Tenant = dbStore.get('Tenant');
    try {
        const tenants = await Tenant.findAll({ where: { status: 'active' }, attributes: ['id', 'name', 'company_token', 'db_name'] });
        let failures = 0;
        for (const tenant of tenants) {
            try {
                await withTenant(tenant, () => reconcileBusinessAdminAlertSnapshots({ repository: businessAdminAlertSnapshotRepository, tenant }));
            } catch (error) {
                failures += 1;
                logger.error(`Business Admin alert snapshot failed for tenant ${tenant.id}: ${error.message}`);
            }
        }
        return { status: 'completed', tenants: tenants.length, failures };
    } finally {
        cycleInProgress = false;
        await cacheService.releaseLock(SCHEDULER_LOCK_KEY);
    }
};

export const startBusinessAdminAlertScheduler = () => {
    if (process.env.BUSINESS_ADMIN_ALERT_SNAPSHOT_ENABLED === 'false' || task) return;
    const minute = intervalMinutes();
    task = cron.schedule(`*/${minute} * * * *`, () => runBusinessAdminAlertSnapshotCycle().catch((error) => logger.error(`Business Admin alert scheduler failed: ${error.message}`)));
    logger.info(`Business Admin alert snapshot scheduler initialized (${minute} minutes)`);
};

export const stopBusinessAdminAlertScheduler = () => { task?.stop(); task = null; };
