import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import logger from '../../../config/logger.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';
import { isBusinessAdminDashboardEnabled } from '../domain/businessAdminRolloutPolicy.js';
import { resolveBusinessAdminOverviewDateRange } from './businessAdminOverviewUseCase.js';

const ok = (data) => ({ success: true, data });
const fail = (message, reasonCode) => ({
    success: false,
    error: new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, {
        statusCode: 403,
        details: { reason_code: reasonCode }
    })
});

const asNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const summarizeCompany = ({ tenant, overview }) => ({
    tenant_id: String(tenant.id),
    name: String(tenant.name || 'Business'),
    summary: {
        total_sales: asNumber(overview?.summary?.total_sales),
        transactions: asNumber(overview?.summary?.today_transactions),
        branch_count: asNumber(overview?.summary?.branch_count),
        active_cashiers: asNumber(overview?.summary?.active_cashiers),
        active_registers: asNumber(overview?.summary?.active_registers),
        open_shifts: asNumber(overview?.summary?.open_shifts),
        overdue_shifts: asNumber(overview?.summary?.overdue_shifts)
    }
});

const summarizeAllCompanies = (companies) => companies.reduce((summary, company) => ({
    total_sales: summary.total_sales + company.summary.total_sales,
    transactions: summary.transactions + company.summary.transactions,
    branch_count: summary.branch_count + company.summary.branch_count,
    active_cashiers: summary.active_cashiers + company.summary.active_cashiers,
    active_registers: summary.active_registers + company.summary.active_registers,
    open_shifts: summary.open_shifts + company.summary.open_shifts,
    overdue_shifts: summary.overdue_shifts + company.summary.overdue_shifts
}), {
    total_sales: 0,
    transactions: 0,
    branch_count: 0,
    active_cashiers: 0,
    active_registers: 0,
    open_shifts: 0,
    overdue_shifts: 0
});

export const buildGetBusinessAdminMultiCompanyOverviewUseCase = ({
    businessAdminMultiCompanyRepository,
    getBusinessAdminOverviewUseCase
}) => async ({ query = {}, user = {}, tenant = null, auditContext = {} } = {}) => {
    const currentAccess = resolveBusinessAdminAccess(user);
    if (!currentAccess.allowed || currentAccess.scope !== 'all') {
        return fail(
            'Tenant-wide Business Admin access is required to view all companies.',
            'BUSINESS_ADMIN_TENANT_WIDE_SCOPE_REQUIRED'
        );
    }

    const dateRange = resolveBusinessAdminOverviewDateRange(query);
    if (dateRange.error) return dateRange.error;

    const membershipResult = await businessAdminMultiCompanyRepository.listAcceptedMembershipsForTenantUser({
        tenantId: tenant?.id,
        tenantUserId: user.user_id
    });
    if (!membershipResult.dgfyAccountId) {
        return fail(
            'An accepted DGFY company membership is required to view all companies.',
            'DGFY_MEMBERSHIP_REQUIRED'
        );
    }

    const companies = [];
    let excludedCompanyCount = 0;
    let unavailableCompanyCount = 0;
    for (const membership of membershipResult.memberships) {
        const targetTenant = membership?.tenant;
        if (!targetTenant || !isBusinessAdminDashboardEnabled(targetTenant)) {
            unavailableCompanyCount += 1;
            continue;
        }

        try {
            const company = await businessAdminMultiCompanyRepository.withAcceptedTenantMembership({
                membership,
                dgfyAccountId: membershipResult.dgfyAccountId
            }, async ({ tenant: authorizedTenant, user: authorizedUser }) => {
                const access = resolveBusinessAdminAccess(authorizedUser);
                if (!access.allowed || access.scope !== 'all') return { excluded: true };

                const overviewResult = await getBusinessAdminOverviewUseCase({
                    query: { date_from: dateRange.dateFrom, date_to: dateRange.dateTo },
                    user: authorizedUser,
                    tenant: authorizedTenant,
                    includeScheduledAlerts: false
                });
                if (!overviewResult.success) return { unavailable: true };
                return summarizeCompany({ tenant: authorizedTenant, overview: overviewResult.data });
            });

            if (!company) unavailableCompanyCount += 1;
            else if (company.excluded) excludedCompanyCount += 1;
            else if (company.unavailable) unavailableCompanyCount += 1;
            else companies.push(company);
        } catch {
            // One unavailable tenant must not expose or block data from other authorized tenants.
            unavailableCompanyCount += 1;
        }
    }

    if (companies.length === 0) {
        return fail(
            'No companies are available for the all-company overview.',
            'BUSINESS_ADMIN_MULTI_COMPANY_ACCESS_REQUIRED'
        );
    }

    const data = {
        scope: 'all_companies',
        read_only: true,
        filters: { date_from: dateRange.dateFrom, date_to: dateRange.dateTo },
        summary: summarizeAllCompanies(companies),
        companies,
        visibility: {
            included_company_count: companies.length,
            excluded_company_count: excludedCompanyCount,
            unavailable_company_count: unavailableCompanyCount
        }
    };
    logger.info('[BusinessAdmin] all-company overview read', {
        request_id: auditContext.requestId || null,
        tenant_id: tenant?.id || null,
        included_company_count: data.visibility.included_company_count,
        excluded_company_count: data.visibility.excluded_company_count,
        unavailable_company_count: data.visibility.unavailable_company_count
    });
    return ok(data);
};
