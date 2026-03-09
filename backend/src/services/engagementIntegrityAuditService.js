import { Op } from 'sequelize';
import db from '../models/index.js';
import { getEngagementWriteAuditStats } from './engagementService.js';
import { getBillingRouteOutcomes } from './billingRouteAuditService.js';

const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_ATTEMPT_GRACE_MINUTES = 15;
const DEFAULT_ISSUE_LIMIT = 20;
const DEFAULT_THRESHOLDS = {
    missingCorrelationCount: 0,
    missingOutcomeCount: 0,
    orphanAttemptCount: 0,
    duplicateEventCount: 0,
    paymentWithoutTelemetryCount: 0,
    tenantStateMismatchCount: 0,
    webhookWithoutTelemetryCount: 0,
    routeOutcomeMismatchCount: 0,
    recentWriteFailures: 0,
    recentSkips: 0
};

const BILLING_EVENT_PREFIXES = [
    'company_registration_',
    'premium_upgrade_',
    'paypal_'
];

const ATTEMPT_FLOW_PREFIXES = [
    'company_registration',
    'premium_upgrade'
];

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeString = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim();
};

const parseMetadata = (metadata) => {
    if (!metadata) return {};
    if (typeof metadata === 'object') return metadata;

    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
};

const buildPrefixFilter = () => ({
    [Op.or]: BILLING_EVENT_PREFIXES.map((prefix) => ({
        event_type: { [Op.like]: `${prefix}%` }
    }))
});

const buildIssueSummary = (entries = [], maxItems = DEFAULT_ISSUE_LIMIT) => (
    entries.slice(0, maxItems).map((entry) => ({ ...entry }))
);

const makeDuplicateKey = (row) => ([
    row.tenant_id || 'no_tenant',
    row.subscription_id || 'no_subscription',
    row.correlation_id || 'no_correlation',
    row.event_type || 'no_event_type'
].join('|'));

const isTerminalEventForPrefix = (eventType, prefix) => (
    eventType === `${prefix}_succeeded`
    || eventType === `${prefix}_failed`
    || eventType.startsWith(`${prefix}_failed_`)
    || eventType.startsWith(`${prefix}_blocked_`)
);

const deriveAttemptFlowPrefix = (eventType) => {
    if (eventType === 'company_registration_attempted') return 'company_registration';
    if (eventType === 'premium_upgrade_attempted') return 'premium_upgrade';
    return null;
};

export const summarizeIntegrityIssuesForHealth = (issues = [], maxItems = DEFAULT_ISSUE_LIMIT) => (
    buildIssueSummary(issues, maxItems)
);

const loadThresholds = () => ({
    missingCorrelationCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_MISSING_CORRELATION, 0),
    missingOutcomeCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_MISSING_OUTCOME, 0),
    orphanAttemptCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_ORPHAN_ATTEMPTS, 0),
    duplicateEventCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_DUPLICATE_EVENTS, 0),
    paymentWithoutTelemetryCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_PAYMENT_WITHOUT_TELEMETRY, 0),
    tenantStateMismatchCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_TENANT_STATE_MISMATCH, 0),
    webhookWithoutTelemetryCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_WEBHOOK_WITHOUT_TELEMETRY, 0),
    routeOutcomeMismatchCount: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_ROUTE_OUTCOME_MISMATCH, 0),
    recentWriteFailures: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_WRITE_FAILURES, 0),
    recentSkips: parseNonNegativeInt(process.env.BILLING_FUNNEL_THRESHOLD_SKIPS, 0)
});

export const auditBillingFunnelIntegrity = async ({
    engagementEventModel = db?.EngagementEvent,
    paymentModel = db?.Payment,
    tenantModel = db?.Tenant,
    webhookLogModel = db?.WebhookLog,
    now = new Date(),
    lookbackHours = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS),
    attemptGraceMinutes = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_ATTEMPT_GRACE_MINUTES, DEFAULT_ATTEMPT_GRACE_MINUTES),
    issueLimit = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_ISSUE_LIMIT, DEFAULT_ISSUE_LIMIT),
    thresholds = loadThresholds()
} = {}) => {
    const startedAt = Date.now();
    const errors = [];
    const issues = [];

    if (!engagementEventModel || typeof engagementEventModel.findAll !== 'function') {
        return {
            status: 'degraded',
            checkedAt: now.toISOString(),
            durationMs: Date.now() - startedAt,
            lookbackHours,
            attemptGraceMinutes,
            rowsScanned: 0,
            missingCorrelationCount: 0,
            missingOutcomeCount: 0,
            orphanAttemptCount: 0,
            duplicateEventCount: 0,
            issues: [],
            issuesForHealth: [],
            errors: [{ scope: 'model', message: 'EngagementEvent model unavailable.' }]
        };
    }

    const windowStart = new Date(now.getTime() - (lookbackHours * 60 * 60 * 1000));
    const graceCutoff = new Date(now.getTime() - (attemptGraceMinutes * 60 * 1000));
    const writeAuditStats = getEngagementWriteAuditStats({ now, lookbackHours });

    let rows = [];

    try {
        rows = await engagementEventModel.findAll({
            attributes: [
                'event_type',
                'tenant_id',
                'subscription_id',
                'correlation_id',
                'request_id',
                'idempotency_key',
                'outcome',
                'metadata',
                'event_time'
            ],
            where: {
                event_time: { [Op.gte]: windowStart },
                ...buildPrefixFilter()
            },
            order: [['event_time', 'ASC']],
            raw: true
        });
    } catch (error) {
        return {
            status: 'degraded',
            checkedAt: now.toISOString(),
            durationMs: Date.now() - startedAt,
            lookbackHours,
            attemptGraceMinutes,
            rowsScanned: 0,
            missingCorrelationCount: 0,
            missingOutcomeCount: 0,
            orphanAttemptCount: 0,
            duplicateEventCount: 0,
            issues: [],
            issuesForHealth: [],
            errors: [{ scope: 'query', message: error.message }]
        };
    }

    const rowsWithParsedMetadata = rows.map((row) => ({
        ...row,
        metadata: parseMetadata(row.metadata)
    }));
    const routeOutcomes = getBillingRouteOutcomes({ now, lookbackHours });

    const missingCorrelationIssues = rowsWithParsedMetadata
        .filter((row) => !normalizeString(row.correlation_id))
        .map((row) => ({
            type: 'missing_correlation_id',
            event_type: row.event_type,
            tenant_id: row.tenant_id || null,
            subscription_id: row.subscription_id || null,
            event_time: row.event_time instanceof Date ? row.event_time.toISOString() : new Date(row.event_time).toISOString()
        }));

    const missingOutcomeIssues = rowsWithParsedMetadata
        .filter((row) => !normalizeString(row.outcome) && !normalizeString(row.metadata?.outcome))
        .map((row) => ({
            type: 'missing_outcome',
            event_type: row.event_type,
            correlation_id: row.correlation_id || null,
            request_id: row.request_id || null,
            tenant_id: row.tenant_id || null,
            event_time: row.event_time instanceof Date ? row.event_time.toISOString() : new Date(row.event_time).toISOString()
        }));

    const paymentCompletionRows = rowsWithParsedMetadata.filter(
        (row) => row.event_type === 'paypal_payment_sale_completed'
    );
    const paymentCompletionByCorrelation = new Set(
        paymentCompletionRows.map((row) => normalizeString(row.correlation_id)).filter(Boolean)
    );
    const webhookTelemetryPairs = rowsWithParsedMetadata
        .filter((row) => row.event_type.startsWith('paypal_'))
        .map((row) => `${normalizeString(row.metadata?.paypal_event_type)}|${normalizeString(row.metadata?.resource_id || row.correlation_id || row.subscription_id)}`);
    const webhookTelemetrySet = new Set(webhookTelemetryPairs.filter((key) => key !== '|'));

    const duplicateMap = new Map();
    rowsWithParsedMetadata.forEach((row) => {
        const key = makeDuplicateKey(row);
        if (!duplicateMap.has(key)) {
            duplicateMap.set(key, { row, count: 0 });
        }
        duplicateMap.get(key).count += 1;
    });

    const duplicateIssues = [...duplicateMap.values()]
        .filter((entry) => entry.count > 1)
        .map(({ row, count }) => ({
            type: 'duplicate_event_key',
            event_type: row.event_type,
            correlation_id: row.correlation_id || null,
            tenant_id: row.tenant_id || null,
            subscription_id: row.subscription_id || null,
            count
        }));

    const rowsByFlowAndCorrelation = new Map();
    rowsWithParsedMetadata.forEach((row) => {
        if (!normalizeString(row.correlation_id)) return;

        ATTEMPT_FLOW_PREFIXES.forEach((prefix) => {
            if (!row.event_type.startsWith(`${prefix}_`)) return;
            const key = `${prefix}|${row.correlation_id}`;
            if (!rowsByFlowAndCorrelation.has(key)) {
                rowsByFlowAndCorrelation.set(key, []);
            }
            rowsByFlowAndCorrelation.get(key).push(row);
        });
    });

    const orphanAttemptIssues = rowsWithParsedMetadata
        .filter((row) => row.event_type.endsWith('_attempted'))
        .filter((row) => normalizeString(row.correlation_id))
        .filter((row) => new Date(row.event_time) <= graceCutoff)
        .map((row) => {
            const prefix = deriveAttemptFlowPrefix(row.event_type);
            if (!prefix) return null;

            const relatedRows = rowsByFlowAndCorrelation.get(`${prefix}|${row.correlation_id}`) || [];
            const hasTerminal = relatedRows.some((candidate) => isTerminalEventForPrefix(candidate.event_type, prefix));
            if (hasTerminal) return null;

            return {
                type: 'orphan_attempt',
                event_type: row.event_type,
                correlation_id: row.correlation_id,
                tenant_id: row.tenant_id || null,
                subscription_id: row.subscription_id || null,
                event_time: row.event_time instanceof Date ? row.event_time.toISOString() : new Date(row.event_time).toISOString()
            };
        })
        .filter(Boolean);

    let paymentReconciliationIssues = [];
    if (paymentModel && typeof paymentModel.findAll === 'function') {
        try {
            const payments = await paymentModel.findAll({
                attributes: ['tenant_id', 'transaction_id', 'status', 'payment_method', 'payment_date'],
                where: {
                    payment_date: { [Op.gte]: windowStart },
                    status: 'completed',
                    payment_method: 'paypal'
                },
                raw: true
            });

            paymentReconciliationIssues = payments
                .filter((payment) => !paymentCompletionByCorrelation.has(normalizeString(payment.transaction_id)))
                .map((payment) => ({
                    type: 'payment_without_telemetry',
                    tenant_id: payment.tenant_id || null,
                    correlation_id: payment.transaction_id || null,
                    event_type: 'paypal_payment_sale_completed'
                }));
        } catch (error) {
            errors.push({
                scope: 'payment_reconciliation',
                message: error.message
            });
        }
    }

    let tenantReconciliationIssues = [];
    if (tenantModel && typeof tenantModel.findAll === 'function') {
        try {
            const tenantIds = [...new Set(rowsWithParsedMetadata
                .map((row) => row.tenant_id)
                .filter(Boolean))];

            const tenants = tenantIds.length > 0
                ? await tenantModel.findAll({
                    attributes: ['id', 'status', 'plan', 'subscription_status', 'paypal_subscription_id'],
                    where: { id: { [Op.in]: tenantIds } },
                    raw: true
                })
                : [];

            const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

            tenantReconciliationIssues = rowsWithParsedMetadata.flatMap((row) => {
                if (!row.tenant_id) return [];
                if (row.event_type !== 'premium_upgrade_succeeded' && row.event_type !== 'company_registration_succeeded') {
                    return [];
                }

                const tenant = tenantMap.get(row.tenant_id);
                if (!tenant) {
                    return [{
                        type: 'success_event_missing_tenant',
                        tenant_id: row.tenant_id,
                        correlation_id: row.correlation_id || null,
                        event_type: row.event_type
                    }];
                }

                const issuesForRow = [];

                if (row.event_type === 'premium_upgrade_succeeded') {
                    if (tenant.plan !== 'premium' || tenant.subscription_status !== 'active') {
                        issuesForRow.push({
                            type: 'premium_upgrade_state_mismatch',
                            tenant_id: row.tenant_id,
                            correlation_id: row.correlation_id || null,
                            event_type: row.event_type
                        });
                    }

                    if (row.subscription_id && tenant.paypal_subscription_id !== row.subscription_id) {
                        issuesForRow.push({
                            type: 'premium_upgrade_subscription_mismatch',
                            tenant_id: row.tenant_id,
                            correlation_id: row.correlation_id || null,
                            event_type: row.event_type
                        });
                    }
                }

                // Removed flawed company_registration_succeeded status mismatch check.
                // Tenant status is explicitly mutable (e.g. pending -> active via admin approval),
                // so comparing current tenant.status to immutable event metadata is guaranteed to fail
                // if an admin reviews the tenant within the 24h audit window.

                return issuesForRow;
            });
        } catch (error) {
            errors.push({
                scope: 'tenant_reconciliation',
                message: error.message
            });
        }
    }

    let webhookReconciliationIssues = [];
    if (webhookLogModel && typeof webhookLogModel.findAll === 'function') {
        try {
            const webhookLogs = await webhookLogModel.findAll({
                attributes: ['webhook_id', 'event_type', 'resource_id', 'status', 'processed_at'],
                where: {
                    createdAt: { [Op.gte]: windowStart },
                    status: 'processed'
                },
                raw: true
            });

            const handledWebhookEventTypes = new Set([
                'PAYMENT.SALE.COMPLETED',
                'BILLING.SUBSCRIPTION.ACTIVATED',
                'BILLING.SUBSCRIPTION.CANCELLED',
                'BILLING.SUBSCRIPTION.SUSPENDED',
                'BILLING.SUBSCRIPTION.EXPIRED'
            ]);

            webhookReconciliationIssues = webhookLogs
                .filter((log) => handledWebhookEventTypes.has(log.event_type))
                .filter((log) => {
                    const key = `${normalizeString(log.event_type)}|${normalizeString(log.resource_id || log.webhook_id)}`;
                    return !webhookTelemetrySet.has(key);
                })
                .map((log) => ({
                    type: 'webhook_without_telemetry',
                    event_type: log.event_type,
                    correlation_id: log.resource_id || log.webhook_id || null
                }));
        } catch (error) {
            errors.push({
                scope: 'webhook_reconciliation',
                message: error.message
            });
        }
    }

    const telemetryRowsByRequestId = new Map();
    rowsWithParsedMetadata.forEach((row) => {
        const key = normalizeString(row.request_id) || normalizeString(row.correlation_id);
        if (!key) return;
        if (!telemetryRowsByRequestId.has(key)) {
            telemetryRowsByRequestId.set(key, []);
        }
        telemetryRowsByRequestId.get(key).push(row);
    });

    const routeOutcomeIssues = routeOutcomes.flatMap((entry) => {
        const requestId = normalizeString(entry.requestId);
        if (!requestId) {
            return [{
                type: 'route_outcome_missing_request_id',
                route: entry.route,
                status_code: entry.statusCode
            }];
        }

        const relatedRows = telemetryRowsByRequestId.get(requestId) || [];
        const wantsSuccess = entry.statusCode >= 200 && entry.statusCode < 300;
        const wantsFailure = entry.statusCode >= 400;

        if (entry.route === 'POST /api/v1/payments/upgrade') {
            const hasSuccess = relatedRows.some((row) => row.event_type === 'premium_upgrade_succeeded');
            const hasFailure = relatedRows.some((row) =>
                row.event_type.startsWith('premium_upgrade_blocked_')
                || row.event_type === 'premium_upgrade_failed'
                || row.event_type.startsWith('premium_upgrade_failed_')
            );

            if ((wantsSuccess && !hasSuccess) || (wantsFailure && !hasFailure)) {
                return [{
                    type: 'route_outcome_without_matching_telemetry',
                    route: entry.route,
                    status_code: entry.statusCode,
                    request_id: requestId
                }];
            }
        }

        if (entry.route === 'POST /api/v1/admin/tenants/register') {
            const hasSuccess = relatedRows.some((row) => row.event_type === 'company_registration_succeeded');
            const hasFailure = relatedRows.some((row) =>
                row.event_type.startsWith('company_registration_blocked_')
                || row.event_type === 'company_registration_failed'
                || row.event_type.startsWith('company_registration_failed_')
            );

            if ((wantsSuccess && !hasSuccess) || (wantsFailure && !hasFailure)) {
                return [{
                    type: 'route_outcome_without_matching_telemetry',
                    route: entry.route,
                    status_code: entry.statusCode,
                    request_id: requestId
                }];
            }
        }

        return [];
    });

    issues.push(
        ...missingCorrelationIssues,
        ...missingOutcomeIssues,
        ...duplicateIssues,
        ...orphanAttemptIssues,
        ...paymentReconciliationIssues,
        ...tenantReconciliationIssues,
        ...webhookReconciliationIssues,
        ...routeOutcomeIssues
    );

    if (writeAuditStats.writeFailedCount > 0) {
        issues.push({
            type: 'write_failures_detected',
            count: writeAuditStats.writeFailedCount
        });
    }

    if (writeAuditStats.tableMissingCount > 0) {
        issues.push({
            type: 'table_missing_detected',
            count: writeAuditStats.tableMissingCount
        });
    }

    if (writeAuditStats.modelUnavailableCount > 0) {
        issues.push({
            type: 'model_unavailable_detected',
            count: writeAuditStats.modelUnavailableCount
        });
    }

    if (writeAuditStats.missingEventTypeCount > 0) {
        issues.push({
            type: 'missing_event_type_detected',
            count: writeAuditStats.missingEventTypeCount
        });
    }

    const counts = {
        missingCorrelationCount: missingCorrelationIssues.length,
        missingOutcomeCount: missingOutcomeIssues.length,
        orphanAttemptCount: orphanAttemptIssues.length,
        duplicateEventCount: duplicateIssues.length,
        paymentWithoutTelemetryCount: paymentReconciliationIssues.length,
        tenantStateMismatchCount: tenantReconciliationIssues.length,
        webhookWithoutTelemetryCount: webhookReconciliationIssues.length,
        routeOutcomeMismatchCount: routeOutcomeIssues.length,
        recentWriteFailures: writeAuditStats.writeFailedCount,
        recentSkips: writeAuditStats.skippedCount
    };

    const thresholdBreaches = Object.entries(thresholds || DEFAULT_THRESHOLDS)
        .filter(([key, limit]) => (counts[key] || 0) > limit)
        .map(([key, limit]) => ({
            metric: key,
            count: counts[key] || 0,
            threshold: limit
        }));

    return {
        status: thresholdBreaches.length === 0 && errors.length === 0 ? 'healthy' : 'degraded',
        checkedAt: now.toISOString(),
        durationMs: Date.now() - startedAt,
        lookbackHours,
        attemptGraceMinutes,
        rowsScanned: rowsWithParsedMetadata.length,
        recentWriteFailures: writeAuditStats.writeFailedCount,
        recentSkips: writeAuditStats.skippedCount,
        recentTableMissingSkips: writeAuditStats.tableMissingCount,
        recentModelUnavailableSkips: writeAuditStats.modelUnavailableCount,
        recentMissingEventTypeSkips: writeAuditStats.missingEventTypeCount,
        missingCorrelationCount: missingCorrelationIssues.length,
        missingOutcomeCount: missingOutcomeIssues.length,
        orphanAttemptCount: orphanAttemptIssues.length,
        duplicateEventCount: duplicateIssues.length,
        paymentWithoutTelemetryCount: paymentReconciliationIssues.length,
        tenantStateMismatchCount: tenantReconciliationIssues.length,
        webhookWithoutTelemetryCount: webhookReconciliationIssues.length,
        routeOutcomeMismatchCount: routeOutcomeIssues.length,
        thresholds,
        thresholdBreaches,
        issues,
        issuesForHealth: summarizeIntegrityIssuesForHealth(issues, issueLimit),
        errors
    };
};

export default {
    auditBillingFunnelIntegrity,
    summarizeIntegrityIssuesForHealth
};
