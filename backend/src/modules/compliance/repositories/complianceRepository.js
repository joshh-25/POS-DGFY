import fs from 'fs';
import path from 'path';
import dbStore from '../../../utils/dbStore.js';

const COMPLIANCE_TRANSITIONS = Object.freeze({
    non_compliant_active: new Set(['non_compliant_active', 'compliant_pending']),
    compliant_pending: new Set(['non_compliant_active', 'compliant_pending', 'compliant_active']),
    compliant_active: new Set(['non_compliant_active', 'compliant_active'])
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

const COMPLIANCE_DOCUMENT_REQUIREMENTS = Object.freeze([
    {
        requirement_code: 'submission_system_flow_diagram_mmd',
        code: 'submission.system_flow_diagram',
        label: 'System flow diagram (Mermaid source)',
        source_category: 'submission',
        requires_freshness: false
    },
    {
        requirement_code: 'submission_system_flow_diagram_png',
        code: 'submission.system_flow_diagram_image',
        label: 'System flow diagram (exported image)',
        source_category: 'submission',
        requires_freshness: false
    },
    {
        requirement_code: 'submission_software_specification',
        code: 'submission.software_specification',
        label: 'Software specification packet',
        source_category: 'submission',
        requires_freshness: false
    },
    {
        requirement_code: 'submission_backup_dr_plan',
        code: 'submission.backup_disaster_recovery_plan',
        label: 'Data backup and disaster recovery plan',
        source_category: 'submission',
        requires_freshness: false
    },
    {
        requirement_code: 'submission_filing_instructions',
        code: 'submission.filing_instructions',
        label: 'Filing instructions',
        source_category: 'submission',
        requires_freshness: false
    },
    {
        requirement_code: 'evidence_restore_drill',
        code: 'submission.restore_drill_evidence',
        label: 'Latest restore drill evidence',
        source_category: 'evidence',
        requires_freshness: true
    },
    {
        requirement_code: 'evidence_encryption_verification',
        code: 'submission.encryption_verification_evidence',
        label: 'Latest encryption verification evidence',
        source_category: 'evidence',
        requires_freshness: true
    },
    {
        requirement_code: 'rmo_24_2023_control_matrix',
        code: 'rmo.control_matrix',
        label: 'RMO 24-2023 control matrix',
        source_category: 'rmo',
        requires_freshness: false
    },
    {
        requirement_code: 'rmo_24_2023_filing_authority_decision',
        code: 'rmo.filing_authority_decision',
        label: 'RMO filing authority and responsibility decision',
        source_category: 'rmo',
        requires_freshness: false
    },
    {
        requirement_code: 'rmo_24_2023_receipt_sample_pack',
        code: 'rmo.receipt_sample_pack',
        label: 'RMO fiscal receipt/invoice sample pack',
        source_category: 'rmo',
        requires_freshness: false
    },
    {
        requirement_code: 'rmo_24_2023_fiscal_integrity_evidence',
        code: 'rmo.fiscal_integrity_evidence',
        label: 'RMO fiscal event integrity evidence',
        source_category: 'rmo',
        requires_freshness: true
    },
    {
        requirement_code: 'rmo_24_2023_esales_reporting_plan',
        code: 'rmo.esales_reporting_plan',
        label: 'RMO eSales reporting plan and rehearsal evidence',
        source_category: 'rmo',
        requires_freshness: true
    }
]);

const RMO_24_2023_REQUIREMENT_CODES = Object.freeze(
    COMPLIANCE_DOCUMENT_REQUIREMENTS
        .filter((requirement) => requirement.source_category === 'rmo')
        .map((requirement) => requirement.code)
);

const normalizeComplianceDocumentarySource = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'tenant_only') return 'tenant_only';
    if (normalized === 'repo_only') return 'repo_only';
    return 'hybrid';
};

const DOCUMENT_UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'compliance-final-review');

const sanitizeFilename = (value = '') => String(value)
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);

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

    async listFinalReviewDocumentsByTenantId(tenantId, options = {}) {
        const TenantComplianceFinalReviewDocument = getModel('TenantComplianceFinalReviewDocument');
        const rows = await TenantComplianceFinalReviewDocument.findAll({
            where: { tenant_id: tenantId },
            order: [['updated_at', 'DESC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async upsertFinalReviewDocument(tenantId, requirementCode, payload = {}, options = {}) {
        const TenantComplianceFinalReviewDocument = getModel('TenantComplianceFinalReviewDocument');
        const existing = await TenantComplianceFinalReviewDocument.findOne({
            where: { tenant_id: tenantId, requirement_code: requirementCode },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        if (existing) {
            await existing.update(payload, { transaction: options.transaction });
            return toPlain(existing);
        }

        const created = await TenantComplianceFinalReviewDocument.create({
            tenant_id: tenantId,
            requirement_code: requirementCode,
            ...payload
        }, { transaction: options.transaction });
        return toPlain(created);
    },

    async getFinalReviewDocumentById(documentId, options = {}) {
        const TenantComplianceFinalReviewDocument = getModel('TenantComplianceFinalReviewDocument');
        const row = await TenantComplianceFinalReviewDocument.findByPk(documentId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async updateFinalReviewDocumentById(documentId, payload = {}, options = {}) {
        const TenantComplianceFinalReviewDocument = getModel('TenantComplianceFinalReviewDocument');
        const row = await TenantComplianceFinalReviewDocument.findByPk(documentId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async getFinalReviewSignoffByTenantId(tenantId, options = {}) {
        const TenantComplianceFinalReviewSignoff = getModel('TenantComplianceFinalReviewSignoff');
        const row = await TenantComplianceFinalReviewSignoff.findOne({
            where: { tenant_id: tenantId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async upsertFinalReviewSignoffByTenantId(tenantId, payload = {}, options = {}) {
        const TenantComplianceFinalReviewSignoff = getModel('TenantComplianceFinalReviewSignoff');
        const row = await TenantComplianceFinalReviewSignoff.findOne({
            where: { tenant_id: tenantId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        if (row) {
            await row.update(payload, { transaction: options.transaction });
            return toPlain(row);
        }

        const created = await TenantComplianceFinalReviewSignoff.create({
            tenant_id: tenantId,
            ...payload
        }, { transaction: options.transaction });
        return toPlain(created);
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

    async resolveFinalReviewDocumentUploadPath({ tenantId, requirementCode, originalName = '' }) {
        const safeName = sanitizeFilename(originalName || `${requirementCode}.bin`);
        const tenantDir = path.join(DOCUMENT_UPLOAD_ROOT, String(tenantId || 'unknown'));
        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }
        const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        return path.join(tenantDir, `${uniquePrefix}-${safeName}`);
    },

    async storeFinalReviewUpload({ tenantId, requirementCode, file = {} }) {
        const sourcePath = String(file.path || '').trim();
        if (!sourcePath || !fs.existsSync(sourcePath)) {
            return null;
        }

        const destinationPath = await this.resolveFinalReviewDocumentUploadPath({
            tenantId,
            requirementCode,
            originalName: file.originalname || file.filename || `${requirementCode}.bin`
        });
        fs.copyFileSync(sourcePath, destinationPath);

        return {
            file_name: file.originalname || path.basename(destinationPath),
            file_path: destinationPath,
            mime_type: file.mimetype || null,
            file_size_bytes: Number.isFinite(Number(file.size)) ? Number(file.size) : null
        };
    },

    evaluateTenantDocumentQuality({ requirement, row, evidenceMaxAgeDays }) {
        const issues = [];
        const sourceType = String(row?.source_type || '').trim();
        const hasUpload = sourceType === 'upload' && String(row?.file_path || '').trim().length > 0;
        const hasExternal = sourceType === 'external_url' && String(row?.external_url || '').trim().length > 0;
        const hasAnySource = hasUpload || hasExternal;
        if (!hasAnySource) issues.push('source_missing');
        if (sourceType === 'external_url' && !/^https?:\/\//i.test(String(row?.external_url || '').trim())) {
            issues.push('external_url_invalid');
        }

        let freshnessDate = row?.freshness_date || row?.parsed_metadata?.freshness_date || null;
        if (!freshnessDate && requirement.requires_freshness) {
            const parsedMeta = row?.parsed_metadata && typeof row.parsed_metadata === 'object' ? row.parsed_metadata : {};
            freshnessDate = parsedMeta.executed_at || parsedMeta.verified_at || null;
        }
        const freshnessAgeDays = freshnessDate ? computeAgeInDays(freshnessDate) : null;
        const isFresh = requirement.requires_freshness
            ? Number.isFinite(freshnessAgeDays) && freshnessAgeDays <= evidenceMaxAgeDays
            : null;
        if (requirement.requires_freshness && freshnessAgeDays == null) issues.push('invalid_freshness_date');
        if (requirement.requires_freshness && Number.isFinite(freshnessAgeDays) && freshnessAgeDays > evidenceMaxAgeDays) {
            issues.push(`stale:${freshnessAgeDays}d`);
        }
        if (String(row?.status || '').trim() === 'revoked') {
            issues.push('status_revoked');
        }

        return {
            quality_ok: issues.length === 0,
            quality_issues: issues,
            fresh: isFresh,
            age_days: Number.isFinite(freshnessAgeDays) ? freshnessAgeDays : null
        };
    },

    async getTenantSubmissionArtifactReadiness(tenantId) {
        const evidenceMaxAgeDays = normalizePositiveInt(process.env.COMPLIANCE_EVIDENCE_MAX_AGE_DAYS, 45);
        const [rows, signoff] = await Promise.all([
            this.listFinalReviewDocumentsByTenantId(tenantId),
            this.getFinalReviewSignoffByTenantId(tenantId)
        ]);
        const byRequirement = new Map(rows.map((row) => [row.requirement_code, row]));

        const signoffReady = hasRequiredTokens(
            `${String(signoff?.engineering_approver || '').trim()}|${String(signoff?.compliance_approver || '').trim()}|${String(signoff?.filing_batch_id || '').trim()}`,
            ['|', '|']
        ) && String(signoff?.engineering_approver || '').trim().length > 0
            && String(signoff?.compliance_approver || '').trim().length > 0
            && String(signoff?.filing_batch_id || '').trim().length > 0;

        const items = COMPLIANCE_DOCUMENT_REQUIREMENTS.map((requirement) => {
            const row = byRequirement.get(requirement.requirement_code) || null;
            const quality = this.evaluateTenantDocumentQuality({
                requirement,
                row,
                evidenceMaxAgeDays
            });
            const ready = Boolean(row) && quality.quality_ok;
            return {
                code: requirement.code,
                requirement_code: requirement.requirement_code,
                label: requirement.label,
                source_type: row?.source_type || null,
                ready,
                exists: Boolean(row),
                quality_ok: quality.quality_ok,
                quality_issues: quality.quality_issues,
                fresh: quality.fresh,
                age_days: quality.age_days,
                external_url: row?.external_url || null,
                file_name: row?.file_name || null,
                review_state: row?.review_state || null,
                review_note: row?.review_note || null,
                requires_platform_followup: row?.review_state === 'revoked'
            };
        });

        const signoffItem = {
            code: 'submission.signoff_metadata',
            requirement_code: 'submission_signoff_metadata',
            label: 'Sign-off metadata',
            source_type: 'form',
            ready: signoffReady,
            exists: Boolean(signoff),
            quality_ok: signoffReady,
            quality_issues: signoffReady ? [] : ['signoff_metadata_incomplete'],
            fresh: null,
            age_days: null,
            review_state: null,
            review_note: null,
            requires_platform_followup: false
        };
        const itemsWithSignoff = [...items, signoffItem];
        const complete = itemsWithSignoff.filter((entry) => entry.ready).length;

        return {
            source: 'tenant',
            evidence_max_age_days: evidenceMaxAgeDays,
            complete,
            total: itemsWithSignoff.length,
            missing: Math.max(0, itemsWithSignoff.length - complete),
            ready: complete === itemsWithSignoff.length,
            items: itemsWithSignoff
        };
    },

    async getRepoSubmissionArtifactReadiness() {
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
            },
            {
                code: 'rmo.control_matrix',
                label: 'RMO 24-2023 control matrix',
                absolute_path: path.resolve(submissionRoot, 'rmo-24-2023-control-matrix.md'),
                evaluateQuality: (entry) => evaluateSubmissionMarkdownQuality({
                    absolutePath: entry.absolute_path,
                    requiredTokens: ['# RMO 24-2023 Control Matrix']
                })
            },
            {
                code: 'rmo.filing_authority_decision',
                label: 'RMO filing authority and responsibility decision',
                absolute_path: path.resolve(submissionRoot, 'rmo-24-2023-filing-authority-decision.md'),
                evaluateQuality: (entry) => evaluateSubmissionMarkdownQuality({
                    absolutePath: entry.absolute_path,
                    requiredTokens: ['# RMO Filing Authority Decision']
                })
            },
            {
                code: 'rmo.receipt_sample_pack',
                label: 'RMO fiscal receipt/invoice sample pack',
                absolute_path: path.resolve(submissionRoot, 'rmo-24-2023-receipt-sample-pack.md'),
                evaluateQuality: (entry) => evaluateSubmissionMarkdownQuality({
                    absolutePath: entry.absolute_path,
                    requiredTokens: ['# RMO Receipt Sample Pack']
                })
            },
            {
                code: 'rmo.fiscal_integrity_evidence',
                label: 'RMO fiscal event integrity evidence',
                absolute_path: path.resolve(evidenceRoot, 'latest-rmo-fiscal-integrity.json'),
                evaluateQuality: (entry) => evaluateJsonEvidenceQuality({
                    absolutePath: entry.absolute_path,
                    requiredRootKeys: ['verification_id', 'verified_at', 'result'],
                    freshnessDateKey: 'verified_at',
                    maxAgeDays: evidenceMaxAgeDays
                })
            },
            {
                code: 'rmo.esales_reporting_plan',
                label: 'RMO eSales reporting plan and rehearsal evidence',
                absolute_path: path.resolve(evidenceRoot, 'latest-rmo-esales-rehearsal.json'),
                evaluateQuality: (entry) => evaluateJsonEvidenceQuality({
                    absolutePath: entry.absolute_path,
                    requiredRootKeys: ['rehearsal_id', 'verified_at', 'result'],
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
            source: 'repo',
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

    async getSubmissionArtifactReadiness(tenantId = null) {
        const sourceMode = normalizeComplianceDocumentarySource(process.env.COMPLIANCE_DOCUMENTARY_SOURCE || 'hybrid');
        if (sourceMode === 'repo_only' || !tenantId) {
            return this.getRepoSubmissionArtifactReadiness();
        }

        const tenantReadiness = await this.getTenantSubmissionArtifactReadiness(tenantId);
        if (sourceMode === 'tenant_only') {
            return tenantReadiness;
        }

        if (tenantReadiness.ready) {
            return tenantReadiness;
        }

        const repoReadiness = await this.getRepoSubmissionArtifactReadiness();
        if (repoReadiness.ready) {
            return {
                ...repoReadiness,
                source: 'repo_fallback'
            };
        }

        return tenantReadiness;
    },

    async getRmoFilingReadiness(tenantId = null) {
        const readiness = await this.getSubmissionArtifactReadiness(tenantId);
        const allItems = Array.isArray(readiness?.items) ? readiness.items : [];
        const rmoItems = allItems
            .filter((item) => RMO_24_2023_REQUIREMENT_CODES.includes(item?.code))
            .map((item) => ({
                ...item,
                action_target: `/settings?tab=compliance#final-review-doc-${String(item.code || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
            }));
        const complete = rmoItems.filter((entry) => entry.ready === true).length;

        return {
            source: readiness?.source || null,
            complete,
            total: RMO_24_2023_REQUIREMENT_CODES.length,
            missing: Math.max(0, RMO_24_2023_REQUIREMENT_CODES.length - complete),
            ready: rmoItems.length === RMO_24_2023_REQUIREMENT_CODES.length
                && complete === RMO_24_2023_REQUIREMENT_CODES.length,
            items: rmoItems
        };
    },

    async getFiscalTerminalRegistrationReadiness() {
        let PosFiscalTerminalRegistration;
        try {
            PosFiscalTerminalRegistration = dbStore.get('PosFiscalTerminalRegistration');
        } catch {
            // Model is optional until fiscal terminal registration is enabled.
        }
        if (!PosFiscalTerminalRegistration) {
            return {
                ready: false,
                verified_count: 0,
                total_count: 0,
                action_target: '/settings?tab=pos#fiscal-terminal-registration'
            };
        }
        const [verifiedCount, totalCount] = await Promise.all([
            PosFiscalTerminalRegistration.count({ where: { accreditation_status: 'verified' } }),
            PosFiscalTerminalRegistration.count()
        ]);
        return {
            ready: verifiedCount > 0,
            verified_count: verifiedCount,
            total_count: totalCount,
            action_target: '/settings?tab=pos#fiscal-terminal-registration'
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
