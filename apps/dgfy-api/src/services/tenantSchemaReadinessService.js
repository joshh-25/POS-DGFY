import { runTenantSchemaSync } from '../../scripts/sync-tenant-schemas.js';

// Runtime facade: reports tenant schema health but never performs DDL.
export const auditTenantSchemaReadiness = async () => {
    const report = await runTenantSchemaSync({ mode: 'report', failOnError: false });
    const failures = (report?.results || []).filter((result) => result.status === 'failed');

    return {
        status: failures.length === 0 ? 'healthy' : 'degraded',
        checkedAt: report?.generated_at || new Date().toISOString(),
        tenantCount: Number(report?.summary?.tenants_total || 0),
        failedTenantCount: failures.length,
        failures
    };
};

export default { auditTenantSchemaReadiness };
