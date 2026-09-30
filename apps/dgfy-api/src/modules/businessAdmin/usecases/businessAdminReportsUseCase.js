import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { buildBusinessAdminCapabilities, resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';
import { BUSINESS_ADMIN_REPORT_DEFINITIONS, buildBusinessAdminInventoryValuationRows, listBusinessAdminReportDefinitions, paginateBusinessAdminReportRows } from '../domain/businessAdminReportCatalog.js';
import { buildBusinessAdminReportExport } from '../domain/businessAdminReportExport.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORT_RANGE_DAYS = 366;

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const todayManilaDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

const parseDate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (!DATE_ONLY_PATTERN.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
        ? normalized
        : null;
};

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveDateRange = (query = {}) => {
    const today = todayManilaDate();
    const rawFrom = parseDate(query.date_from);
    const rawTo = parseDate(query.date_to);
    const dateFrom = rawFrom || today;
    const dateTo = rawTo || dateFrom;
    if (rawFrom === null || rawTo === null) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_DATE' }) };
    }
    const startAt = new Date(`${dateFrom}T00:00:00.000+08:00`);
    const endAt = new Date(`${dateTo}T00:00:00.000+08:00`);
    if (startAt > endAt) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from must be earlier than or equal to date_to.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_DATE_RANGE' }) };
    }
    const rangeDays = Math.floor((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (rangeDays > MAX_REPORT_RANGE_DAYS) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, `Reports are limited to ${MAX_REPORT_RANGE_DAYS} days per request.`, 422, { reason_code: 'BUSINESS_ADMIN_REPORT_DATE_RANGE_EXCEEDED' }) };
    }
    return { dateFrom, dateTo };
};

const redactCostFields = (value) => {
    if (Array.isArray(value)) return value.map(redactCostFields);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !['cogs', 'pos_profit_loss', 'profit_margin', 'profit_delta', 'profit_delta_percentage'].includes(key))
        .map(([key, child]) => [key, redactCostFields(child)]));
};

export const buildGetBusinessAdminReportsUseCase = ({ businessAdminOverviewRepository, posRepository }) => async ({
    query = {},
    user = {}
} = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
    }

    const dateRange = resolveDateRange(query);
    if (dateRange.error) return dateRange.error;

    const branchId = parsePositiveInt(query.branch_id);
    if (String(query.branch_id || '').trim() && !branchId) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
    }

    const assignedLocationIds = access.scope === 'all'
        ? []
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && assignedLocationIds.length === 0) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
    }
    if (branchId && access.scope !== 'all' && !assignedLocationIds.includes(branchId)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
    }

    const report = await posRepository.getReportsOverview({
        date_from: dateRange.dateFrom,
        date_to: dateRange.dateTo,
        ...(branchId ? { location_id: branchId } : {}),
        ...(access.scope === 'all' ? {} : { allowed_location_ids: assignedLocationIds })
    });
    const capabilities = buildBusinessAdminCapabilities(user);
    return ok({
        report: capabilities.view_costs ? report : redactCostFields(report),
        meta: {
            as_of: new Date().toISOString(),
            timezone: 'Asia/Manila',
            source: 'pos_canonical_report_read_model',
            date_from: dateRange.dateFrom,
            date_to: dateRange.dateTo,
            branch_id: branchId,
            scope: access.scope,
            cost_visibility: capabilities.view_costs
        }
    });
};

export const buildListBusinessAdminReportDefinitionsUseCase = () => async ({ user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
    }
    return ok({ reports: listBusinessAdminReportDefinitions() });
};

export const buildGetBusinessAdminReportDatasetUseCase = (dependencies) => async ({ query = {}, user = {}, reportKey = '' } = {}) => {
    const normalizedKey = String(reportKey || '').trim().toLowerCase();
    const definition = BUSINESS_ADMIN_REPORT_DEFINITIONS[normalizedKey];
    if (!definition) return fail(DomainErrorCode.VALIDATION_FAILED, 'report_key is invalid.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_REPORT_KEY' });

    let rows;
    let meta;
    if (definition.source === 'inventory_valuation') {
        const valuationResult = await dependencies.getBusinessAdminInventoryValuationUseCase({ query, user });
        if (!valuationResult.success) return valuationResult;
        rows = buildBusinessAdminInventoryValuationRows(valuationResult.data.valuation);
        meta = {
            ...valuationResult.data.meta,
            source: 'inventory_fifo_valuation_read_model'
        };
    } else if (definition.source === 'inventory_ledger') {
        const access = resolveBusinessAdminAccess(user);
        if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
        const dateRange = definition.filters.includes('date_from')
            ? resolveDateRange(query)
            : { dateFrom: null, dateTo: null };
        if (dateRange.error) return dateRange.error;
        const branchId = parsePositiveInt(query.branch_id);
        if (String(query.branch_id || '').trim() && !branchId) {
            return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
        }
        const allowedLocationIds = access.scope === 'all'
            ? null
            : await dependencies.businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
        if (access.scope !== 'all' && allowedLocationIds.length === 0) {
            return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
        }
        if (branchId && access.scope !== 'all' && !allowedLocationIds.includes(branchId)) {
            return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
        }
        const queryMethod = normalizedKey === 'inventory_movements'
            ? dependencies.businessAdminInventoryReportRepository.listMovementReport
            : dependencies.businessAdminInventoryReportRepository.listLowStockReport;
        const inventoryDataset = await queryMethod({
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            branchId,
            allowedLocationIds,
            page: query.page,
            limit: query.limit,
            sortBy: query.sort_by,
            sortDirection: query.sort_direction || (normalizedKey === 'low_stock' ? 'asc' : 'desc')
        });
        return ok({
            definition: { key: normalizedKey, label: definition.label, default_sort: definition.default_sort },
            ...inventoryDataset,
            meta: {
                as_of: new Date().toISOString(),
                timezone: 'Asia/Manila',
                source: 'inventory_ledger_read_model',
                date_from: dateRange.dateFrom,
                date_to: dateRange.dateTo,
                branch_id: branchId,
                scope: access.scope,
                cost_visibility: false
            }
        });
    } else {
        const access = resolveBusinessAdminAccess(user);
        if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
        const dateRange = resolveDateRange(query);
        if (dateRange.error) return dateRange.error;
        const branchId = parsePositiveInt(query.branch_id);
        if (String(query.branch_id || '').trim() && !branchId) {
            return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
        }
        const allowedLocationIds = access.scope === 'all'
            ? null
            : await dependencies.businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
        if (access.scope !== 'all' && allowedLocationIds.length === 0) {
            return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
        }
        if (branchId && access.scope !== 'all' && !allowedLocationIds.includes(branchId)) {
            return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
        }
        const financialDataset = await dependencies.businessAdminFinancialReportRepository.getDataset({
            reportKey: normalizedKey,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            branchId,
            allowedLocationIds,
            page: query.page,
            limit: query.limit,
            sortBy: query.sort_by,
            sortDirection: query.sort_direction || 'desc'
        });
        const capabilities = buildBusinessAdminCapabilities(user);
        return ok({
            definition: { key: normalizedKey, label: definition.label, default_sort: definition.default_sort },
            ...financialDataset,
            rows: capabilities.view_costs ? financialDataset.rows : redactCostFields(financialDataset.rows),
            meta: {
                as_of: new Date().toISOString(),
                timezone: 'Asia/Manila',
                source: 'pos_database_aggregate_read_model',
                date_from: dateRange.dateFrom,
                date_to: dateRange.dateTo,
                branch_id: branchId,
                scope: access.scope,
                cost_visibility: capabilities.view_costs
            }
        });
    }
    if (!rows) return fail(DomainErrorCode.VALIDATION_FAILED, 'report_key is invalid.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_REPORT_KEY' });
    const dataset = paginateBusinessAdminReportRows({
        rows,
        reportKey: normalizedKey,
        sortBy: String(query.sort_by || '').trim(),
        sortDirection: String(query.sort_direction || '').trim(),
        page: query.page,
        limit: query.limit
    });
    return ok({ ...dataset, meta });
};

export const buildExportBusinessAdminReportUseCase = (dependencies) => async ({ query = {}, user = {}, reportKey = '' } = {}) => {
    const datasetResult = await buildGetBusinessAdminReportDatasetUseCase(dependencies)({
        query: { ...query, page: 1, limit: 5000 },
        user,
        reportKey
    });
    if (!datasetResult.success) return datasetResult;
    if (datasetResult.data.pagination.total > 5000) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'This report has more than 5,000 rows. Refine the date range or branch before exporting.', 422, { reason_code: 'BUSINESS_ADMIN_REPORT_EXPORT_LIMIT' });
    }
    const format = String(query.format || 'csv').trim().toLowerCase();
    if (!['csv', 'xls'].includes(format)) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'format must be csv or xls.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_REPORT_EXPORT_FORMAT' });
    }
    return ok(buildBusinessAdminReportExport({
        dataset: datasetResult.data,
        format,
        dateFrom: datasetResult.data.meta.date_from,
        dateTo: datasetResult.data.meta.date_to
    }));
};
