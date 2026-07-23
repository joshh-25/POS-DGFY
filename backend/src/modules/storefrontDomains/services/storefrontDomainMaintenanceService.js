import logger from '../../../config/logger.js';
import { storefrontDomainRepository } from '../repositories/storefrontDomainRepository.js';
import { storefrontDomainFeaturePolicy } from './storefrontDomainFeaturePolicy.js';
import { storefrontDomainUseCases } from '../index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_WINDOW_MS = 30 * DAY_MS;
const actor = { username: 'storefront_domain_maintenance', request_id: null };
let intervalHandle = null;
let running = false;

const isOlderThan = (value, ageMs, currentTime) => (
    !value || currentTime.getTime() - new Date(value).getTime() >= ageMs
);

export const runStorefrontDomainMaintenance = async ({ currentTime = new Date() } = {}) => {
    if (!storefrontDomainFeaturePolicy.isEnabled() || running) {
        return { skipped: true, reason: running ? 'already_running' : 'feature_disabled' };
    }
    running = true;
    const summary = {
        checked: 0,
        eligibility_reconciled: 0,
        dns_checked: 0,
        renewals_queued: 0,
        failures: []
    };
    try {
        const domains = await storefrontDomainRepository.listDomainsForMaintenance();
        const tenantIds = [...new Set(domains.map((domain) => String(domain.tenant_id)))];
        for (const tenantId of tenantIds) {
            const result = await storefrontDomainUseCases.reconcileEligibility({ tenantId, actor });
            if (result.success) summary.eligibility_reconciled += 1;
            else summary.failures.push({ tenant_id: tenantId, action: 'eligibility', code: result.error?.code });
        }

        for (const domain of domains) {
            if (!storefrontDomainFeaturePolicy.isTenantAllowed(domain.tenant_id)) continue;
            summary.checked += 1;

            if (isOlderThan(domain.last_dns_checked_at, DAY_MS, currentTime)) {
                const result = await storefrontDomainUseCases.auditDnsDrift({
                    tenantId: domain.tenant_id,
                    domainId: domain.id,
                    actor
                });
                if (result.success) summary.dns_checked += 1;
                else summary.failures.push({ domain_id: domain.id, action: 'dns', code: result.error?.code });
            }

            const tlsExpiry = domain.tls_expires_at ? new Date(domain.tls_expires_at) : null;
            if (!tlsExpiry || tlsExpiry.getTime() - currentTime.getTime() <= RENEWAL_WINDOW_MS) {
                const result = await storefrontDomainUseCases.queueRenewal({
                    tenantId: domain.tenant_id,
                    domainId: domain.id,
                    actor
                });
                if (result.success) summary.renewals_queued += 1;
                else summary.failures.push({ domain_id: domain.id, action: 'renewal', code: result.error?.code });
            }
        }
        return summary;
    } finally {
        running = false;
    }
};

export const startStorefrontDomainMaintenanceScheduler = () => {
    if (intervalHandle || process.env.STOREFRONT_DOMAIN_MAINTENANCE_ENABLED !== 'true') return;
    const intervalMs = Math.max(
        Number(process.env.STOREFRONT_DOMAIN_MAINTENANCE_INTERVAL_MS) || (6 * 60 * 60 * 1000),
        60_000
    );
    const execute = () => runStorefrontDomainMaintenance()
        .then((summary) => logger.info('[StorefrontDomainMaintenance] Completed.', summary))
        .catch((error) => logger.error('[StorefrontDomainMaintenance] Failed.', { message: error.message }));
    execute();
    intervalHandle = setInterval(execute, intervalMs);
    intervalHandle.unref?.();
};

export const stopStorefrontDomainMaintenanceScheduler = () => {
    if (!intervalHandle) return;
    clearInterval(intervalHandle);
    intervalHandle = null;
};
