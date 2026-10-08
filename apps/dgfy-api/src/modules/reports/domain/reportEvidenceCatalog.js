import {
    REPORT_REGISTRY,
    listReportDefinitions
} from './reportRegistry.js';

const SAMPLE_FIXTURE_PATH = 'docs/compliance/evidence/annex-b-items-4-14-section-05-report-sample-fixtures-v1.json';

const SUPPLEMENTAL_EVIDENCE_ROWS = Object.freeze([
    {
        report_key: 'audit_activity',
        label: 'Audit activity',
        report_family: 'audit',
        surface: 'business_admin',
        owner: 'pos_audit_log',
        source_of_truth: 'Append-only AuditLog event stream with actor, scope, request, and change metadata',
        source: 'audit_log',
        filters: ['date_from', 'date_to', 'branch_id', 'action', 'entity_type'],
        timezone: 'Asia/Manila',
        formats: ['json', 'csv'],
        retention: 'merchant_policy_and_external_review_required',
        route: ['/api/v1/business-admin/audit'],
        export_route: [],
        ui_surface: 'POS Business Admin > Audit',
        applicability: 'applicable',
        applicability_reason: 'Audit activity is a supporting evidence source for report/export access, adjustments, and fiscal-readiness review.',
        sample_fixture_path: SAMPLE_FIXTURE_PATH,
        sample_fixture_key: 'audit_activity',
        external_review_status: 'required_before_external_submission'
    }
]);

const sourceOfTruth = (definition) => {
    if (definition?.source === 'pos_terminal_report_read_model') return 'POS terminal report read model backed by finalized POS transaction snapshots';
    if (definition?.source === 'legacy_report_service') return 'Legacy report service compatibility read model; not an e-journal source';
    if (definition?.source === 'inventory_valuation') return 'Inventory FIFO valuation and branch stock ledger';
    if (definition?.source === 'inventory_ledger') return 'Inventory command owner ledger';
    return 'POS canonical finalized transaction read model';
};

const uiSurface = (definition) => {
    if (definition?.surface === 'terminal') return 'POS > Reports';
    if (definition?.surface === 'legacy_reports') return 'POS Business Admin > Reports & analytics';
    return definition?.surface === 'business_admin' ? 'POS Business Admin > Reports & analytics' : 'POS-owned report surface';
};

const applicability = (key, definition) => {
    if (key === 'saved_report_snapshots') {
        return {
            status: 'not_applicable_as_fiscal_source',
            reason: 'Saved snapshots are reviewer history, not an immutable fiscal or operational source record.'
        };
    }
    if (definition?.source === 'legacy_report_service' && key === 'compliance_package') {
        return {
            status: 'applicable_with_boundary',
            reason: 'Books-style compliance package remains available as a separate report and is not relabeled as an e-journal.'
        };
    }
    if (definition?.report_family === 'inventory') {
        return {
            status: 'applicable_when_inventory_scope_is_requested',
            reason: 'Inventory evidence is relevant to Annex B readiness but is not a fiscal e-journal record source.'
        };
    }
    return {
        status: 'applicable',
        reason: 'Registry definition is available on a POS-owned report surface with a declared source and filter contract.'
    };
};

const buildRegistryCatalog = () => Object.entries(REPORT_REGISTRY).map(([key, definition]) => {
    const applicabilityState = applicability(key, definition);
    return {
        report_key: key,
        label: definition.label,
        report_family: definition.report_family,
        surface: definition.surface,
        owner: definition.owner,
        source_of_truth: sourceOfTruth(definition),
        source: definition.source,
        filters: definition.filters || [],
        timezone: definition.formatting?.timezone || 'Asia/Manila',
        formats: definition.export_formats || [],
        retention: 'merchant_policy_and_external_review_required',
        route: definition.compatibility?.read_endpoints || [],
        export_route: definition.compatibility?.export_endpoints || [],
        ui_surface: uiSurface(definition),
        applicability: applicabilityState.status,
        applicability_reason: applicabilityState.reason,
        sample_fixture_path: SAMPLE_FIXTURE_PATH,
        sample_fixture_key: key,
        external_review_status: 'required_before_external_submission'
    };
});

export const buildReportApplicabilityCatalog = () => [
    ...buildRegistryCatalog(),
    ...SUPPLEMENTAL_EVIDENCE_ROWS.map((row) => ({ ...row }))
];

export const buildReportApplicabilitySummary = () => {
    const rows = buildReportApplicabilityCatalog();
    const registryRows = buildRegistryCatalog();
    return {
        registry_source: 'apps/dgfy-api/src/modules/reports/domain/reportRegistry.js',
        registry_report_count: registryRows.length,
        catalog_row_count: rows.length,
        applicable_count: rows.filter((row) => row.applicability === 'applicable').length,
        boundary_count: rows.filter((row) => row.applicability.includes('boundary') || row.applicability.includes('when_')).length,
        not_applicable_count: rows.filter((row) => row.applicability.startsWith('not_applicable')).length,
        external_review_status: 'required_before_external_submission'
    };
};

export const listEvidenceReportDefinitions = () => listReportDefinitions().map((definition) => ({
    ...definition,
    evidence: buildReportApplicabilityCatalog().find((row) => row.report_key === definition.key) || null
}));
