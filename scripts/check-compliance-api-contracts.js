const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const docsSpec = read('docs/api/specification.md');
const posValidator = read('apps/dgfy-api/src/validators/posValidator.js');
const complianceUseCases = read('apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js');
const compliancePolicyEngine = read('apps/dgfy-api/src/modules/compliance/policy/compliancePolicyEngine.js');
const reportService = read('apps/dgfy-api/src/services/reportService.js');

const checks = [
    {
        id: 'DOC-02-POS-SHIFT-OPEN-IDEMPOTENCY',
        validator: /const openTerminalShiftSchema[\s\S]*?idempotency_key:\s*Joi\.string\(\)\.trim\(\)\.min\(8\)\.max\(120\)\.optional\(\)/m,
        docs: /### POST \/pos\/terminal\/shifts\/open[\s\S]*?idempotency_key/m,
        validatorSource: posValidator,
        docsSource: docsSpec,
        message: 'Shift-open idempotency key must be present in validator and API specification.'
    },
    {
        id: 'DOC-02-POS-CASH-EVENT-IDEMPOTENCY',
        validator: /const cashDrawerEventSchema[\s\S]*?idempotency_key:\s*Joi\.string\(\)\.trim\(\)\.min\(8\)\.max\(120\)\.optional\(\)/m,
        docs: /### POST \/pos\/terminal\/shifts\/:id\/cash-events[\s\S]*?idempotency_key/m,
        validatorSource: posValidator,
        docsSource: docsSpec,
        message: 'Cash-event idempotency key must be present in validator and API specification.'
    },
    {
        id: 'DOC-02-POS-SHIFT-CLOSE-IDEMPOTENCY',
        validator: /const closeTerminalShiftSchema[\s\S]*?idempotency_key:\s*Joi\.string\(\)\.trim\(\)\.min\(8\)\.max\(120\)\.optional\(\)/m,
        docs: /### POST \/pos\/terminal\/shifts\/:id\/close[\s\S]*?idempotency_key/m,
        validatorSource: posValidator,
        docsSource: docsSpec,
        message: 'Shift-close idempotency key must be present in validator and API specification.'
    },
    {
        id: 'DOC-02-POS-ORDER-STATUS-IDEMPOTENCY',
        validator: /const updateOnlineOrderStatusSchema[\s\S]*?idempotency_key:\s*Joi\.string\(\)\.trim\(\)\.min\(8\)\.max\(120\)\.optional\(\)/m,
        docs: /### PATCH \/pos\/orders\/:id\/status[\s\S]*?idempotency_key/m,
        validatorSource: posValidator,
        docsSource: docsSpec,
        message: 'Order-status idempotency key must be present in validator and API specification.'
    },
    {
        id: 'DOC-02-POS-REPLAY-METADATA',
        validator: /idempotency_key/m,
        docs: /data\.idempotent_replay[\s\S]*data\.replay_outcome/m,
        validatorSource: posValidator,
        docsSource: docsSpec,
        message: 'API specification must describe replay metadata fields for idempotent terminal operations.'
    },
    {
        id: 'DOC-03-CHECKLIST-EVIDENCE-ENCRYPTION',
        validator: /encryption_policy_prerequisites_ready/m,
        docs: /evidence\.encryption_policy_prerequisites_ready/m,
        validatorSource: compliancePolicyEngine,
        docsSource: docsSpec,
        message: 'Checklist encryption evidence field must be aligned between runtime policy and docs.'
    },
    {
        id: 'DOC-03-CHECKLIST-DOCUMENTARY-QUALITY',
        validator: /submission_artifacts/m,
        docs: /quality_ok[\s\S]*quality_issues\[\][\s\S]*fresh[\s\S]*age_days/m,
        validatorSource: compliancePolicyEngine,
        docsSource: docsSpec,
        message: 'Checklist documentary quality/freshness fields must be documented.'
    },
    {
        id: 'INC-01-SECURITY-INCIDENT-DISPATCH-METADATA',
        validator: /dispatch_attempt_append_result/m,
        docs: /dispatch_attempt_append_result/m,
        validatorSource: complianceUseCases,
        docsSource: docsSpec,
        message: 'Incident dispatch append metadata must be aligned between usecase output and docs.'
    },
    {
        id: 'INC-01-SECURITY-INCIDENT-DISPATCH-TARGET-METADATA',
        validator: /target_configured[\s\S]*dispatch_reference/m,
        docs: /target_configured[\s\S]*dispatch_reference/m,
        validatorSource: complianceUseCases,
        docsSource: docsSpec,
        message: 'Incident dispatch target metadata must be aligned between runtime usecase output and API documentation.'
    },
    {
        id: 'DOC-03-COMPLIANCE-PACKAGE-DOCUMENTARY-CHECKSUMS',
        validator: /system_flow_diagram_sha256[\s\S]*encryption_verification_evidence_sha256/m,
        docs: /system_flow_diagram_sha256[\s\S]*encryption_verification_evidence_sha256/m,
        validatorSource: reportService,
        docsSource: docsSpec,
        message: 'Compliance package documentary checksum fields must stay aligned between runtime manifest and API documentation.'
    }
];

const failures = [];

checks.forEach((entry) => {
    const validatorOk = entry.validator.test(entry.validatorSource);
    const docsOk = entry.docs.test(entry.docsSource);
    if (!validatorOk || !docsOk) {
        failures.push({
            id: entry.id,
            validatorOk,
            docsOk,
            message: entry.message
        });
    }
});

if (failures.length > 0) {
    console.error('[check:compliance:api-contracts] FAIL');
    failures.forEach((failure) => {
        console.error(`- ${failure.id}: ${failure.message}`);
        console.error(`  validator: ${failure.validatorOk ? 'ok' : 'missing'} | docs: ${failure.docsOk ? 'ok' : 'missing'}`);
    });
    process.exit(1);
}

console.log('[check:compliance:api-contracts] PASS');
console.log(`[check:compliance:api-contracts] Checked ${checks.length} compliance-sensitive doc/contract rules`);
