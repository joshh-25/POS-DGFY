export const COMPLIANCE_REVIEW_FILTERS = [
    { value: 'needs_review', label: 'Needs review' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'revoked', label: 'Revoked' },
    { value: 'all', label: 'All' }
];

export const COMPLIANCE_AUDIT_FILTERS = [
    { value: 'all', label: 'All events' },
    { value: 'verification', label: 'Verification' },
    { value: 'security', label: 'Security' },
    { value: 'blocked', label: 'Blocked ops' },
    { value: 'lifecycle', label: 'Lifecycle' }
];

const COMPLIANCE_SECTION_LABELS = {
    profile: 'Profile',
    settings: 'Settings',
    artifacts: 'Artifacts',
    peripherals: 'Peripherals',
    final_review: 'Final review'
};

export const normalizeVerificationStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || ['pending', 'pending_review', 'needs_review', 'for_review'].includes(normalized)) return 'needs_review';
    if (['verified', 'rejected', 'revoked'].includes(normalized)) return normalized;
    return normalized;
};

export const countComplianceReviewStatuses = (artifacts = [], peripherals = []) => {
    const counts = { needs_review: 0, verified: 0, rejected: 0, revoked: 0, all: artifacts.length + peripherals.length };
    [...artifacts, ...peripherals].forEach((entry) => {
        const status = normalizeVerificationStatus(entry?.verification_status);
        if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    });
    return counts;
};

export const filterComplianceRecords = (records = [], filter = 'all') => filter === 'all'
    ? records
    : records.filter((entry) => normalizeVerificationStatus(entry?.verification_status) === filter);

export const getComplianceSectionProgress = (sectionProgress) => {
    if (!sectionProgress || typeof sectionProgress !== 'object') return [];
    return Object.entries(sectionProgress)
        .filter(([key]) => Object.prototype.hasOwnProperty.call(COMPLIANCE_SECTION_LABELS, key))
        .map(([key, value]) => ({
            key,
            label: COMPLIANCE_SECTION_LABELS[key],
            status: String(value?.status || 'not_started'),
            complete: Number(value?.complete || 0),
            total: Number(value?.total || 0)
        }));
};

export const categorizeComplianceAuditEvent = (eventType) => {
    const normalized = String(eventType || '').trim().toLowerCase();
    if (['artifact_verification', 'peripheral_verification'].includes(normalized)) return 'verification';
    if (normalized.startsWith('security_')) return 'security';
    if (normalized === 'blocked_operation') return 'blocked';
    if (['mode_selection', 'mode_upgrade', 'mode_activation', 'mode_force_non_compliant', 'mode_revert_non_compliant'].includes(normalized)) return 'lifecycle';
    return 'all';
};

export const countComplianceAuditCategories = (auditLogs = []) => {
    const counts = { all: auditLogs.length, verification: 0, security: 0, blocked: 0, lifecycle: 0 };
    auditLogs.forEach((entry) => {
        const category = categorizeComplianceAuditEvent(entry?.event_type);
        if (category !== 'all') counts[category] += 1;
    });
    return counts;
};

export const filterComplianceAuditLogs = (auditLogs = [], filter = 'all') => filter === 'all'
    ? auditLogs
    : auditLogs.filter((entry) => categorizeComplianceAuditEvent(entry?.event_type) === filter);

export const summarizeSecurityIncidents = (incidents = []) => incidents.reduce((summary, incident) => {
    const status = String(incident?.status || '').trim().toLowerCase();
    if (status === 'resolved') summary.resolved += 1;
    else if (status === 'acknowledged') { summary.acknowledged += 1; summary.open += 1; }
    else summary.open += 1;
    return summary;
}, { open: 0, acknowledged: 0, resolved: 0 });

export const complianceProgressBadgeClass = (status) => {
    if (status === 'complete') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'in_progress') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (status === 'blocked') return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
};
