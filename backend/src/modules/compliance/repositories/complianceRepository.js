import fs from 'fs';
import path from 'path';
import dbStore from '../../../utils/dbStore.js';

const COMPLIANCE_TRANSITIONS = Object.freeze({
    non_compliant_active: new Set(['non_compliant_active', 'compliant_pending']),
    compliant_pending: new Set(['compliant_pending', 'compliant_active']),
    compliant_active: new Set(['compliant_active'])
});

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const mergeObjects = (base, incoming) => {
    const output = { ...base };
    Object.keys(incoming || {}).forEach((key) => {
        const nextValue = incoming[key];
        if (
            nextValue
            && typeof nextValue === 'object'
            && !Array.isArray(nextValue)
            && output[key]
            && typeof output[key] === 'object'
            && !Array.isArray(output[key])
        ) {
            output[key] = mergeObjects(output[key], nextValue);
            return;
        }
        output[key] = nextValue;
    });
    return output;
};

const normalizeComplianceProfileValue = (value) => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};

    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        return {};
    }

    return {};
};

const resolveExistingPath = (candidates = []) => (
    candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) || candidates.filter(Boolean)[0] || null
);

const readTextFileSafe = (absolutePath) => {
    try {
        return fs.readFileSync(absolutePath, 'utf8');
    } catch {
        return null;
    }
};

const parseJsonFileSafe = (absolutePath) => {
    const raw = readTextFileSafe(absolutePath);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const normalizePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeNumeric = (value, fallback = NaN) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const computeAgeInDays = (dateValue) => {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return null;
    const diffMs = Date.now() - parsed.getTime();
    return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
};

const hasRequiredTokens = (text = '', tokens = []) => (
    tokens.every((token) => text.includes(token))
);

const evaluateSubmissionMarkdownQuality = ({ absolutePath, requiredTokens = [] }) => {
    const text = readTextFileSafe(absolutePath);
    if (!text) {
        return {
            quality_ok: false,
            quality_issues: ['file_unreadable']
        };
    }

    const missingTokens = requiredTokens.filter((token) => !text.includes(token));
    return {
        quality_ok: missingTokens.length === 0,
        quality_issues: missingTokens.map((token) => `missing_token:${token}`)
    };
};

const evaluateJsonEvidenceQuality = ({
    absolutePath,
    requiredRootKeys = [],
    freshnessDateKey = null,
    maxAgeDays = 45
}) => {
    const payload = parseJsonFileSafe(absolutePath);
    if (!payload) {
        return {
            quality_ok: false,
            quality_issues: ['invalid_json'],
            fresh: false,
            age_days: null
        };
    }

    const missingKeys = requiredRootKeys.filter((key) => !Object.prototype.hasOwnProperty.call(payload, key));
    const dateValue = freshnessDateKey ? payload?.[freshnessDateKey] : null;
    const ageDays = freshnessDateKey ? computeAgeInDays(dateValue) : null;
    const fresh = freshnessDateKey ? Number.isFinite(ageDays) && ageDays <= maxAgeDays : true;

    const qualityIssues = [
        ...missingKeys.map((key) => `missing_key:${key}`),
        ...(freshnessDateKey && ageDays == null ? ['invalid_freshness_date'] : []),
        ...(freshnessDateKey && !fresh && ageDays != null ? [`stale:${ageDays}d`] : [])
    ];

    return {
        quality_ok: qualityIssues.length === 0,
        quality_issues: qualityIssues,
        fresh,
        age_days: ageDays
    };
};

const evaluateSystemFlowDiagramQuality = ({ absolutePath = null, absolute_path: absolutePathSnake = null } = {}) => {
    const resolvedPath = absolutePath || absolutePathSnake;
    const text = readTextFileSafe(resolvedPath);
    if (!text) {
        return {
            quality_ok: false,
            quality_issues: ['file_unreadable']
        };
    }

    const includesMermaid = /flowchart|graph|sequenceDiagram|stateDiagram|gantt/i.test(text);
    return {
        quality_ok: includesMermaid,
        quality_issues: includesMermaid ? [] : ['missing_mermaid_diagram_definition']
    };
};

const getModel = (name) => dbStore.get(name);

const assertTransitionAllowed = ({ previousState, nextState }) => {
    if (!nextState || previousState == null || previousState === nextState) {
        return;
    }

    const allowed = COMPLIANCE_TRANSITIONS[previousState];
    if (!allowed || !allowed.has(nextState)) {
        throw new Error(`Compliance mode transition blocked: ${previousState} -> ${nextState}`);
    }
};

export const complianceRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async findTenantById(tenantId, options = {}) {
        const Tenant = getModel('Tenant');
        const tenant = await Tenant.findByPk(tenantId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(tenant);
    },

    async updateTenantById(tenantId, payload = {}, options = {}) {
        const Tenant = getModel('Tenant');
        const tenant = await Tenant.findByPk(tenantId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        if (!tenant) {
            return null;
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'compliance_mode_state')) {
            assertTransitionAllowed({
                previousState: tenant.compliance_mode_state || null,
                nextState: payload.compliance_mode_state
            });
        }

        await tenant.update(payload, { transaction: options.transaction });
        return toPlain(tenant);
    },

    async updateComplianceProfile(tenantId, patch = {}, options = {}) {
        const Tenant = getModel('Tenant');
        const tenant = await Tenant.findByPk(tenantId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        if (!tenant) return null;

        const current = normalizeComplianceProfileValue(tenant.compliance_profile);

        const nextProfile = mergeObjects(current, patch || {});
        await tenant.update({ compliance_profile: nextProfile }, { transaction: options.transaction });

        return {
            tenant: toPlain(tenant),
            compliance_profile: nextProfile
        };
    },

    async listArtifactsByTenantId(tenantId, options = {}) {
        const TenantComplianceArtifact = getModel('TenantComplianceArtifact');
        const rows = await TenantComplianceArtifact.findAll({
            where: { tenant_id: tenantId },
            order: [['updated_at', 'DESC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createArtifact(payload = {}, options = {}) {
        const TenantComplianceArtifact = getModel('TenantComplianceArtifact');
        const created = await TenantComplianceArtifact.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async updateArtifactById(artifactId, payload = {}, options = {}) {
        const TenantComplianceArtifact = getModel('TenantComplianceArtifact');
        const row = await TenantComplianceArtifact.findByPk(artifactId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listPeripheralsByTenantId(tenantId, options = {}) {
        const TenantCompliancePeripheral = getModel('TenantCompliancePeripheral');
        const rows = await TenantCompliancePeripheral.findAll({
            where: { tenant_id: tenantId },
            order: [['updated_at', 'DESC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createPeripheral(payload = {}, options = {}) {
        const TenantCompliancePeripheral = getModel('TenantCompliancePeripheral');
        const created = await TenantCompliancePeripheral.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async updatePeripheralById(peripheralId, payload = {}, options = {}) {
        const TenantCompliancePeripheral = getModel('TenantCompliancePeripheral');
        const row = await TenantCompliancePeripheral.findByPk(peripheralId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async createAuditLog(payload = {}, options = {}) {
        const TenantComplianceAuditLog = getModel('TenantComplianceAuditLog');
        const created = await TenantComplianceAuditLog.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async createAuditFailureLog(payload = {}, options = {}) {
        const TenantComplianceAuditFailure = getModel('TenantComplianceAuditFailure');
        const created = await TenantComplianceAuditFailure.create(payload, { transaction: options.transaction });
        return toPlain(created);
    },

    async listAuditLogsByTenantId(tenantId, { limit = 100 } = {}) {
        const TenantComplianceAuditLog = getModel('TenantComplianceAuditLog');
        const rows = await TenantComplianceAuditLog.findAll({
            where: { tenant_id: tenantId },
            order: [['created_at', 'DESC']],
            limit: Math.min(Number(limit) || 100, 500)
        });
        return rows.map(toPlain);
    },

    async getFiscalAccumulatorState() {
        const PosInvoiceCounter = getModel('PosInvoiceCounter');
        if (!PosInvoiceCounter) {
            return {
                ready: false,
                lifetime_grand_total_cents: 0
            };
        }

        try {
            const counter = await PosInvoiceCounter.findByPk('POS_FISCAL_LIFETIME_TOTAL_CENTS');
            return {
                ready: true,
                lifetime_grand_total_cents: Number.parseInt(counter?.current_value || 0, 10) || 0
            };
        } catch {
            return {
                ready: false,
                lifetime_grand_total_cents: 0
            };
        }
    },

    async getComplianceAuditAppendOnlyState() {
        const TenantComplianceAuditLog = getModel('TenantComplianceAuditLog');
        const sequelize = TenantComplianceAuditLog?.sequelize;
        if (!sequelize) {
            return {
                ready: false,
                trigger_names: []
            };
        }

        try {
            const [rows] = await sequelize.query(`
                SELECT
                    TRIGGER_NAME AS trigger_name,
                    EVENT_MANIPULATION AS event_manipulation,
                    ACTION_STATEMENT AS action_statement
                FROM information_schema.TRIGGERS
                WHERE TRIGGER_SCHEMA = DATABASE()
                  AND EVENT_OBJECT_TABLE = 'tenant_compliance_audit_logs'
                  AND ACTION_TIMING = 'BEFORE'
                  AND EVENT_MANIPULATION IN ('UPDATE', 'DELETE')
            `);

            const normalizedRows = Array.isArray(rows) ? rows : [];
            const hasUpdateBlock = normalizedRows.some((row) => (
                String(row?.event_manipulation || '').toUpperCase() === 'UPDATE'
                && /SIGNAL\s+SQLSTATE/i.test(String(row?.action_statement || ''))
            ));
            const hasDeleteBlock = normalizedRows.some((row) => (
                String(row?.event_manipulation || '').toUpperCase() === 'DELETE'
                && /SIGNAL\s+SQLSTATE/i.test(String(row?.action_statement || ''))
            ));

            return {
                ready: hasUpdateBlock && hasDeleteBlock,
                trigger_names: normalizedRows
                    .map((row) => String(row?.trigger_name || '').trim())
                    .filter(Boolean)
            };
        } catch {
            return {
                ready: false,
                trigger_names: []
            };
        }
    },

    async getSubmissionArtifactReadiness() {
        const configuredSubmissionRoot = String(process.env.COMPLIANCE_SUBMISSION_DOCS_ROOT || '').trim();
        const configuredEvidenceRoot = String(process.env.COMPLIANCE_EVIDENCE_DOCS_ROOT || '').trim();
        const evidenceMaxAgeDays = normalizePositiveInt(process.env.COMPLIANCE_EVIDENCE_MAX_AGE_DAYS, 45);

        const submissionRoot = resolveExistingPath([
            configuredSubmissionRoot || null,
            path.resolve(process.cwd(), 'docs', 'compliance', 'submission'),
            path.resolve(process.cwd(), '..', 'docs', 'compliance', 'submission')
        ]) || path.resolve(process.cwd(), 'docs', 'compliance', 'submission');
        const evidenceRoot = resolveExistingPath([
            configuredEvidenceRoot || null,
            path.resolve(process.cwd(), 'docs', 'compliance', 'evidence', 'drills'),
            path.resolve(process.cwd(), '..', 'docs', 'compliance', 'evidence', 'drills')
        ]) || path.resolve(process.cwd(), 'docs', 'compliance', 'evidence', 'drills');

        const requiredArtifacts = [
            {
                code: 'submission.system_flow_diagram',
                label: 'System flow diagram (Mermaid source)',
                absolute_path: path.resolve(submissionRoot, 'system-flow-diagram.mmd'),
                evaluateQuality: evaluateSystemFlowDiagramQuality
            },
            {
                code: 'submission.system_flow_diagram_image',
                label: 'System flow diagram (exported image)',
                absolute_path: path.resolve(submissionRoot, 'system-flow-diagram.png')
            },
            {
                code: 'submission.software_specification',
                label: 'Software specification packet',
                absolute_path: path.resolve(submissionRoot, 'software-specification-dgfy.md'),
                evaluateQuality: (entry) => evaluateSubmissionMarkdownQuality({
                    absolutePath: entry.absolute_path,
                    requiredTokens: [
                        '# DGFY Software Specification Packet',
                        '## 1. Product Scope',
                        '## 6. Filing Evidence References',
                        '## 7. Sign-off Metadata',
                        '- Engineering lead:',
                        '- Compliance lead:'
                    ]
                })
            },
            {
                code: 'submission.backup_disaster_recovery_plan',
                label: 'Data backup and disaster recovery plan',
                absolute_path: path.resolve(submissionRoot, 'backup-disaster-recovery-plan.md'),
                evaluateQuality: (entry) => evaluateSubmissionMarkdownQuality({
                    absolutePath: entry.absolute_path,
                    requiredTokens: [
                        '## 2. Recovery Targets',
                        '## 4. Encryption Controls',
                        '## 6. Drill and Verification Cadence',
                        '## 9. Sign-off Metadata',
                        '- Platform engineering approver:',
                        '- Compliance approver:'
                    ]
                })
            },
            {
                code: 'submission.filing_instructions',
                label: 'Filing instructions',
                absolute_path: path.resolve(submissionRoot, 'filing-instructions.md'),
                evaluateQuality: (entry) => evaluateSubmissionMarkdownQuality({
                    absolutePath: entry.absolute_path,
                    requiredTokens: [
                        '# Filing Instructions',
                        '## Submission package contents',
                        '## Sign-off checklist',
                        '## 5. Sign-off metadata',
                        '- Engineering approver:',
                        '- Compliance approver:'
                    ]
                })
            },
            {
                code: 'submission.restore_drill_evidence',
                label: 'Latest restore drill evidence',
                absolute_path: path.resolve(evidenceRoot, 'latest-restore-drill.json'),
                evaluateQuality: (entry) => evaluateJsonEvidenceQuality({
                    absolutePath: entry.absolute_path,
                    requiredRootKeys: ['drill_id', 'executed_at', 'result'],
                    freshnessDateKey: 'executed_at',
                    maxAgeDays: evidenceMaxAgeDays
                })
            },
            {
                code: 'submission.encryption_verification_evidence',
                label: 'Latest encryption verification evidence',
                absolute_path: path.resolve(evidenceRoot, 'latest-encryption-verification.json'),
                evaluateQuality: (entry) => evaluateJsonEvidenceQuality({
                    absolutePath: entry.absolute_path,
                    requiredRootKeys: ['verification_id', 'verified_at', 'transport', 'at_rest'],
                    freshnessDateKey: 'verified_at',
                    maxAgeDays: evidenceMaxAgeDays
                })
            }
        ];

        const items = requiredArtifacts.map((entry) => {
            const exists = fs.existsSync(entry.absolute_path);
            const qualityResult = exists && typeof entry.evaluateQuality === 'function'
                ? entry.evaluateQuality(entry)
                : { quality_ok: exists, quality_issues: exists ? [] : ['file_missing'], fresh: null, age_days: null };
            const ready = exists && qualityResult.quality_ok === true;

            return {
                code: entry.code,
                label: entry.label,
                absolute_path: entry.absolute_path,
                ready,
                exists,
                quality_ok: qualityResult.quality_ok === true,
                quality_issues: Array.isArray(qualityResult.quality_issues) ? qualityResult.quality_issues : [],
                fresh: qualityResult.fresh == null ? null : qualityResult.fresh === true,
                age_days: Number.isFinite(qualityResult.age_days) ? qualityResult.age_days : null
            };
        });
        const complete = items.filter((entry) => entry.ready).length;

        return {
            docs_root: submissionRoot,
            evidence_root: evidenceRoot,
            evidence_max_age_days: evidenceMaxAgeDays,
            complete,
            total: items.length,
            missing: Math.max(0, items.length - complete),
            ready: complete === items.length,
            items
        };
    },

    async getEncryptionPolicyPrerequisitesState() {
        const backupEncryptionAlgorithm = String(process.env.BACKUP_ENCRYPTION_ALGORITHM || 'AES-256').trim().toUpperCase();
        const backupTransportTlsMinVersion = String(process.env.BACKUP_TRANSPORT_TLS_MIN_VERSION || '1.2').trim();
        const exportEncryptionRequired = String(process.env.EXPORT_ENCRYPTION_REQUIRED || 'true').trim().toLowerCase() !== 'false';
        const keyManagementExternalized = String(process.env.BACKUP_KEY_MANAGEMENT_EXTERNALIZED || 'true').trim().toLowerCase() !== 'false';

        const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
        const enforceHttpsRequested = String(process.env.ENFORCE_HTTPS || '').trim().toLowerCase() === 'true';
        const disableHttpsRequested = String(process.env.ENFORCE_HTTPS || '').trim().toLowerCase() === 'false';
        const httpsEnforcementActive = (isProduction || enforceHttpsRequested) && !disableHttpsRequested;
        const hstsPolicyExpected = httpsEnforcementActive;

        const tlsVersionNumeric = normalizeNumeric(backupTransportTlsMinVersion, NaN);
        const tlsPolicyReady = Number.isFinite(tlsVersionNumeric) && tlsVersionNumeric >= 1.2;
        const encryptionAlgorithmReady = backupEncryptionAlgorithm === 'AES-256';

        const checks = {
            backup_encryption_algorithm: backupEncryptionAlgorithm,
            backup_transport_tls_min_version: backupTransportTlsMinVersion,
            export_encryption_required: exportEncryptionRequired,
            key_management_externalized: keyManagementExternalized,
            https_enforcement_active: httpsEnforcementActive,
            hsts_policy_expected: hstsPolicyExpected
        };

        const issues = [];
        if (!encryptionAlgorithmReady) issues.push('backup_encryption_algorithm must be AES-256');
        if (!tlsPolicyReady) issues.push('backup_transport_tls_min_version must be >= 1.2');
        if (!exportEncryptionRequired) issues.push('export_encryption_required must not be disabled');
        if (!keyManagementExternalized) issues.push('backup_key_management_externalized must be true');
        if (isProduction && !httpsEnforcementActive) issues.push('https_enforcement_active must be true in production');

        return {
            ready: issues.length === 0,
            checks,
            issues
        };
    }
};
