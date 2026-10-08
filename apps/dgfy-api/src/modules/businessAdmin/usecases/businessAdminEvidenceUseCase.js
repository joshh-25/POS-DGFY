import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import {
    resolveBusinessAdminAccess,
    userHasBusinessAdminPermission
} from '../domain/businessAdminAccessPolicy.js';
import {
    buildReportApplicabilityCatalog,
    buildReportApplicabilitySummary
} from '../../reports/domain/reportEvidenceCatalog.js';
import {
    buildEJournalExportPackage,
    buildEJournalSourceRevision,
    EJOURNAL_GRAMMAR_VERSION
} from '../../reports/domain/eJournalReadiness.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TERMINAL_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const MAX_EJOURNAL_SOURCE_ROWS = 5000;
const MAX_EJOURNAL_RANGE_DAYS = 1;
const EJOURNAL_SOURCE_REVISION = buildEJournalSourceRevision({
    registryHash: 'report-registry-runtime-v1',
    grammarHash: 'annex-b-ejournal-readiness-grammar-v0.1'
});

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const isAdminLike = (user = {}) => Boolean(
    user?.is_master_admin === true
    || String(user?.role || '').trim().toLowerCase() === 'admin'
);

const canUsePermission = (user, permission) => isAdminLike(user) || userHasBusinessAdminPermission(user, permission);

const normalizedDate = (value) => {
    const date = String(value || '').trim();
    if (!DATE_PATTERN.test(date)) return null;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};
const resolveEvidenceScope = ({ query = {}, user = {}, businessAdminOverviewRepository }) => {
    const rawDateFrom = String(query.date_from || query.date || query.startDate || '').trim();
    const rawDateTo = String(query.date_to || query.endDate || rawDateFrom).trim();
    const dateFrom = normalizedDate(rawDateFrom);
    const dateTo = normalizedDate(rawDateTo);
    if (!dateFrom || !dateTo) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422, { reason_code: 'BUSINESS_ADMIN_EVIDENCE_INVALID_DATE' }) };
    }
    if (dateFrom !== dateTo || MAX_EJOURNAL_RANGE_DAYS !== 1) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'An e-journal file represents one business date. Set date_from and date_to to the same date.', 422, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_SINGLE_DATE_REQUIRED' }) };
    }

    const locationId = Number.parseInt(query.branch_id || query.location_id, 10);
    if (!Number.isInteger(locationId) || locationId <= 0) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id is required for a single-location e-journal export.', 422, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_LOCATION_REQUIRED' }) };
    }
    const terminalId = String(query.terminal_id || '').trim().toUpperCase();
    if (!TERMINAL_PATTERN.test(terminalId)) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'terminal_id is required and must be a valid terminal identifier.', 422, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_TERMINAL_REQUIRED' }) };
    }

    return {
        scope: {
            dateFrom,
            dateTo,
            businessDate: dateFrom,
            locationId,
            terminalId,
            tenantId: String(user?.tenant_id || '').trim()
        },
        businessAdminOverviewRepository
    };
};
const recordEvidenceAudit = async ({ posRepository, user, auditContext = {}, action, eventType, scope, outcome, details = {} }) => {
    if (!posRepository || typeof posRepository.createAuditLog !== 'function') return false;
    try {
        await posRepository.createAuditLog({
            user_id: Number.parseInt(user?.user_id, 10) || null,
            actor_username: String(user?.username || user?.email || '').trim() || null,
            entity_type: 'pos_bir_evidence_export',
            entity_id: null,
            action,
            event_type: eventType,
            terminal_id: scope?.terminalId || null,
            location_id: scope?.locationId || null,
            request_id: auditContext.requestId || null,
            ip_address: auditContext.ipAddress || null,
            user_agent: auditContext.userAgent || null,
            changes: {
                event: eventType,
                outcome,
                serializer_version: EJOURNAL_GRAMMAR_VERSION,
                business_date: scope?.businessDate || null,
                location_id: scope?.locationId || null,
                terminal_id: scope?.terminalId || null,
                ...details
            }
        });
        return true;
    } catch {
        return false;
    }
};

const readPermissionFailure = (user) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
    if (!canUsePermission(user, PERMISSIONS.REPORTS.actions.VIEW_REPORTS)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'Reports view permission is required for readiness evidence.', 403, { reason_code: 'BUSINESS_ADMIN_EVIDENCE_VIEW_DENIED' });
    }
    return null;
};

export const buildListBusinessAdminEvidenceCatalogUseCase = ({ posRepository } = {}) => async ({ user = {}, auditContext = {} } = {}) => {
    const permissionFailure = readPermissionFailure(user);
    if (permissionFailure) return permissionFailure;
    const reports = buildReportApplicabilityCatalog();
    const summary = buildReportApplicabilitySummary();
    await recordEvidenceAudit({
        posRepository,
        user,
        auditContext,
        action: 'VIEW',
        eventType: 'pos_bir_report_catalog_viewed',
        outcome: 'success',
        details: { report_count: reports.length }
    });
    return ok({
        contract_version: 'annex-b-items-4-14-section-05-report-catalog-v1',
        environment: 'local',
        timezone: 'Asia/Manila',
        reports,
        summary,
        external_review_status: 'required_before_external_submission',
        approval_claim: 'none'
    });
};

export const buildGetBusinessAdminEJournalEvidenceUseCase = ({
    businessAdminOverviewRepository,
    posRepository
}) => async ({ query = {}, user = {}, format = 'summary', auditContext = {} } = {}) => {
    const permissionFailure = readPermissionFailure(user);
    if (permissionFailure) return permissionFailure;
    const normalizedFormat = String(format || query.format || 'summary').trim().toLowerCase();
    if (!['summary', 'txt', 'html', 'hard-copy', 'manifest'].includes(normalizedFormat)) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'format must be summary, txt, html, hard-copy, or manifest.', 422, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_INVALID_FORMAT' });
    }
    if (normalizedFormat !== 'summary' && !canUsePermission(user, PERMISSIONS.REPORTS.actions.EXPORT_REPORTS)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'Reports export permission is required to download readiness evidence.', 403, { reason_code: 'BUSINESS_ADMIN_EVIDENCE_EXPORT_DENIED' });
    }

    const resolved = resolveEvidenceScope({ query, user, businessAdminOverviewRepository });
    if (resolved.error) return resolved.error;
    const scope = resolved.scope;
    if (!scope.tenantId) return fail(DomainErrorCode.TENANT_CONTEXT_MISSING, 'Tenant context is required for an e-journal export.', 400, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_TENANT_REQUIRED' });

    const access = resolveBusinessAdminAccess(user);
    const allowedLocationIds = access.scope === 'all'
        ? null
        : (await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id) || []);
    if (access.scope !== 'all' && !allowedLocationIds.includes(scope.locationId)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_BRANCH_ACCESS_DENIED' });
    }

    let source;
    try {
        const [transactions, adjustments, events, zSnapshots] = await Promise.all([
            posRepository.listEJournalTransactions({
                businessDate: scope.businessDate,
                locationId: scope.locationId,
                terminalId: scope.terminalId,
                limit: MAX_EJOURNAL_SOURCE_ROWS + 1
            }),
            posRepository.listEJournalAdjustments({
                businessDate: scope.businessDate,
                locationId: scope.locationId,
                terminalId: scope.terminalId,
                limit: MAX_EJOURNAL_SOURCE_ROWS + 1
            }),
            posRepository.listEJournalFiscalEvents({
                businessDate: scope.businessDate,
                terminalId: scope.terminalId,
                limit: MAX_EJOURNAL_SOURCE_ROWS + 1
            }),
            posRepository.listEJournalZReadingSnapshots({
                businessDate: scope.businessDate,
                locationId: scope.locationId,
                terminalId: scope.terminalId,
                limit: MAX_EJOURNAL_SOURCE_ROWS + 1
            })
        ]);
        const oversizedSource = [
            ['transactions', transactions],
            ['adjustments', adjustments],
            ['events', events],
            ['z_reading_snapshots', zSnapshots]
        ].find(([, rows]) => rows.length > MAX_EJOURNAL_SOURCE_ROWS);
        if (oversizedSource) {
            await recordEvidenceAudit({
                posRepository,
                user,
                auditContext,
                action: 'VIEW',
                eventType: 'pos_bir_ejournal_export_rejected',
                scope,
                outcome: 'rejected',
                details: { reason_code: 'BUSINESS_ADMIN_EJOURNAL_EXPORT_LIMIT', source: oversizedSource[0], limit: MAX_EJOURNAL_SOURCE_ROWS }
            });
            return fail(DomainErrorCode.VALIDATION_FAILED, `E-journal generation is limited to ${MAX_EJOURNAL_SOURCE_ROWS} source rows per category. Refine the terminal/date scope.`, 422, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_EXPORT_LIMIT', source: oversizedSource[0], limit: MAX_EJOURNAL_SOURCE_ROWS });
        }
        source = { transactions, adjustments, events, zSnapshots };
    } catch (error) {
        await recordEvidenceAudit({
            posRepository,
            user,
            auditContext,
            action: 'VIEW',
            eventType: 'pos_bir_ejournal_export_failed',
            scope,
            outcome: 'failed',
            details: { reason_code: error?.code || 'BUSINESS_ADMIN_EJOURNAL_SOURCE_READ_FAILED' }
        });
        return fail(DomainErrorCode.INTERNAL_ERROR, 'E-journal source records could not be read.', 500, { reason_code: 'BUSINESS_ADMIN_EJOURNAL_SOURCE_READ_FAILED' });
    }

    let evidence;
    try {
        evidence = buildEJournalExportPackage({
            tenantId: scope.tenantId,
            locationId: scope.locationId,
            terminalId: scope.terminalId,
            businessDate: scope.businessDate,
            ...source,
            sourceRevision: EJOURNAL_SOURCE_REVISION
        });
    } catch (error) {
        await recordEvidenceAudit({
            posRepository,
            user,
            auditContext,
            action: 'VIEW',
            eventType: 'pos_bir_ejournal_export_failed',
            scope,
            outcome: 'failed',
            details: { reason_code: error?.code || String(error?.message || 'BUSINESS_ADMIN_EJOURNAL_SERIALIZATION_FAILED').slice(0, 100) }
        });
        const reasonCode = String(error?.code || '').startsWith('EJOURNAL_') ? error.code : 'BUSINESS_ADMIN_EJOURNAL_SERIALIZATION_FAILED';
        return fail(DomainErrorCode.VALIDATION_FAILED, 'E-journal generation was rejected because the immutable source evidence is incomplete or invalid.', 422, { reason_code: reasonCode });
    }

    const auditRecorded = await recordEvidenceAudit({
        posRepository,
        user,
        auditContext,
        action: 'VIEW',
        eventType: normalizedFormat === 'summary' ? 'pos_bir_ejournal_evidence_viewed' : 'pos_bir_ejournal_evidence_downloaded',
        scope,
        outcome: 'success',
        details: {
            source_filename: evidence.filename,
            record_count: evidence.summary.record_count,
            content_sha256: evidence.summary.content_sha256,
            format: normalizedFormat
        }
    });

    if (normalizedFormat === 'txt') return ok({ ...evidence, content: evidence.rawText, contentType: 'text/plain; charset=utf-8', audit_recorded: auditRecorded });
    if (normalizedFormat === 'html') return ok({ ...evidence, filename: evidence.filename.replace(/\.txt$/, '.html'), content: evidence.printableHtml, contentType: 'text/html; charset=utf-8', audit_recorded: auditRecorded });
    if (normalizedFormat === 'hard-copy') return ok({ ...evidence, filename: evidence.filename.replace(/\.txt$/, '-hard-copy.txt'), content: evidence.hardCopyText, contentType: 'text/plain; charset=utf-8', audit_recorded: auditRecorded });
    if (normalizedFormat === 'manifest') return ok({ ...evidence, filename: evidence.filename.replace(/\.txt$/, '.manifest.json'), content: JSON.stringify(evidence.manifest, null, 2), contentType: 'application/json; charset=utf-8', audit_recorded: auditRecorded });
    return ok({ summary: evidence.summary, manifest: evidence.manifest, audit_recorded: auditRecorded });
};
