import logger from '../config/logger.js';
import { companyRegistrationRepository } from '../modules/tenants/repositories/companyRegistrationRepository.js';

// Issue #1825: provisioning now runs detached from the approving admin's HTTP request
// (approveTenantUseCase.js), so a process death mid-provisioning no longer has any request-path
// code left alive to record a terminal outcome. `markProvisioningStarted`'s own CAS already
// treats an `in_progress` row older than 10 minutes as stale/retryable (the same threshold
// reused here via STALE_THRESHOLD_MS), which is exactly the crash-recovery signal a boot
// reconciler needs. This scheduler is the "mark it failed so an admin can see and retry it"
// half of that recovery -- deliberately not an auto-resume: resuming would mean synthesizing an
// actor for the audit trail and duplicating the existing, human-in-the-loop retry-provisioning
// endpoint's own logic. `markProvisioningOutcome`'s own CAS (`WHERE ... provisioning_status =
// 'in_progress'`) makes this safe to run from more than one instance without extra locking.
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export const reconcileStaleTenantProvisioning = async ({ olderThanMs = STALE_THRESHOLD_MS } = {}) => {
    const staleApplications = await companyRegistrationRepository.findStaleInProgressApplications({ olderThanMs });

    let reconciled = 0;
    for (const application of staleApplications) {
        const outcome = await companyRegistrationRepository.markProvisioningOutcome({
            tenantId: application.tenant_id,
            succeeded: false,
            details: {
                error: 'reconciled_on_boot: in_progress row exceeded staleness threshold with no terminal outcome recorded -- likely process death mid-provisioning'
            }
        });
        // A null outcome means another process already resolved this application between the
        // find and this update (its own CAS lost the race) -- not a failure, just a race we lost
        // harmlessly; nothing further to do for that row.
        if (outcome) {
            reconciled += 1;
            logger.warn('[TenantProvisioningReconciler] Marked stale in_progress application as failed', {
                applicationId: application.id,
                tenantId: application.tenant_id
            });
        }
    }

    return { checked: staleApplications.length, reconciled };
};

let reconciliationInterval = null;

export const startTenantProvisioningReconciliationScheduler = () => {
    const enabled = process.env.TENANT_PROVISIONING_RECONCILE_ENABLED !== 'false';
    if (!enabled) {
        return;
    }

    const minutes = Number.parseInt(process.env.TENANT_PROVISIONING_RECONCILE_MINUTES || '5', 10);
    const intervalMs = Math.max(1, Number.isFinite(minutes) ? minutes : 5) * 60 * 1000;

    reconcileStaleTenantProvisioning().then((result) => {
        logger.info('[TenantProvisioningReconciler] Startup reconciliation completed', result);
    }).catch((error) => {
        logger.warn('[TenantProvisioningReconciler] Startup reconciliation failed', {
            error: error?.message || 'unknown_error'
        });
    });

    reconciliationInterval = setInterval(() => {
        reconcileStaleTenantProvisioning().then((result) => {
            logger.info('[TenantProvisioningReconciler] Scheduled reconciliation completed', result);
        }).catch((error) => {
            logger.warn('[TenantProvisioningReconciler] Scheduled reconciliation failed', {
                error: error?.message || 'unknown_error'
            });
        });
    }, intervalMs);

    if (typeof reconciliationInterval.unref === 'function') {
        reconciliationInterval.unref();
    }
};

export const stopTenantProvisioningReconciliationScheduler = () => {
    if (reconciliationInterval) {
        clearInterval(reconciliationInterval);
        reconciliationInterval = null;
    }
};
