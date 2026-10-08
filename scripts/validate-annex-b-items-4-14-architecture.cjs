#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_ARCHITECTURE_PATH = path.resolve(
  __dirname,
  '..',
  'docs/compliance/evidence/annex-b-items-4-14-architecture-contract-v1.json'
);

const EXPECTED_SOURCE_IDS = Object.freeze([
  'PLAN-SECTION-03',
  'PLAN-SECTION-02',
  'REQUIREMENTS-REGISTRY',
  'ARCHITECTURE-BOUNDARIES',
  'ARCHITECTURE-GOVERNANCE',
  'ADR-0007',
  'ADR-0014',
  'ADR-0033',
  'ADR-0042',
  'ADR-0045',
  'ADR-0081',
  'POS-ROUTES',
  'COMPLIANCE-ROUTES',
  'POS-USECASES',
  'POS-REPOSITORY',
  'COMPLIANCE-USECASES',
  'COMPLIANCE-REPOSITORY',
  'REPORT-REGISTRY',
  'BUSINESS-ADMIN-FISCAL-REPOSITORY',
  'FINAL-REVIEW-DOCUMENT-MODEL',
  'FINAL-REVIEW-SIGNOFF-MODEL',
  'Z-READING-SNAPSHOT-MODEL',
  'RECEIPT-RENDERER',
  'POS-SHELL',
  'FINAL-REVIEW-MIGRATION',
]);

const EXPECTED_MODULE_SURFACES = Object.freeze([
  'pos_fiscal_runtime',
  'compliance_readiness',
  'reports',
  'pos_ui',
  'migrations',
  'evidence_docs',
]);

const EXPECTED_SOURCE_ENTITIES = Object.freeze([
  'issued_fiscal_document',
  'adjustment',
  'x_z_reading',
  'report',
  'audit',
  'version_and_connectivity',
  'evidence_review',
]);

const EXPECTED_REQUIREMENT_IDS = Object.freeze([
  'BR-401',
  'BR-402',
  'DATA-401',
  'SEC-401',
  'NFR-401',
  'ADR-401',
]);

const EXPECTED_TEST_IDS = Object.freeze(['TEST-430', 'TEST-431', 'TEST-432', 'TEST-433']);
const EXPECTED_ACCEPTANCE_IDS = Object.freeze(['AC-430', 'AC-431', 'AC-432', 'AC-433']);
const EXPECTED_LAYER_ORDER = Object.freeze(['routes', 'controllers', 'usecases', 'repositories', 'models']);
const REQUIRED_SURFACE_METADATA = Object.freeze(['owner', 'permission', 'source_of_truth', 'rollback']);
const VALID_EXECUTION_STATUSES = new Set([
  'NOT STARTED',
  'IN PROGRESS',
  'IMPLEMENTED',
  'TESTING',
  'VERIFIED',
  'BLOCKED',
  'FAILED',
  'DEFERRED BY PLAN',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stringsOnly(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === 'string' && entry.trim());
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function repoPath(relativePath) {
  return path.resolve(__dirname, '..', relativePath);
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.trim()
    && !path.isAbsolute(value)
    && !value.includes('..')
    && !/(^|[\\/])(backend|frontend)([\\/]|$)/.test(value);
}

function pathExists(relativePath) {
  return isSafeRelativePath(relativePath) && fs.existsSync(repoPath(relativePath));
}

function listJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(fullPath);
    return /\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function findForbiddenBackendImports() {
  const backendRoot = repoPath('apps/dgfy-api/src');
  const forbidden = ['@sieitzz/pos-receipt', 'packages/pos-receipt', 'packages/web-core'];
  const matches = [];
  for (const filePath of listJavaScriptFiles(backendRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const token of forbidden) {
      if (content.includes(token)) matches.push(`${path.relative(repoPath('.'), filePath)} contains ${token}`);
    }
  }
  return matches;
}

function computeSummary(contract) {
  const entries = Array.isArray(contract.execution_manifest) ? contract.execution_manifest : [];
  const implementedCount = entries.filter((entry) => entry?.status === 'IMPLEMENTED').length;
  const deferredRuntimeCount = entries.filter((entry) => entry?.runtime_status === 'DEFERRED BY PLAN').length;
  const failedCount = entries.filter((entry) => entry?.status === 'FAILED' || entry?.status === 'BLOCKED').length;
  return {
    total_requirements: entries.length,
    implemented_count: implementedCount,
    deferred_runtime_count: deferredRuntimeCount,
    failed_or_blocked_count: failedCount,
    contract_complete: entries.length === EXPECTED_REQUIREMENT_IDS.length
      && implementedCount === EXPECTED_REQUIREMENT_IDS.length
      && failedCount === 0,
    runtime_complete: entries.length === EXPECTED_REQUIREMENT_IDS.length
      && entries.every((entry) => entry?.runtime_status === 'VERIFIED'),
  };
}

function validateSourceRegister(contract, errors) {
  if (!Array.isArray(contract.source_register)) {
    errors.push('source_register must be an array.');
    return;
  }
  const ids = contract.source_register.map((entry) => entry?.id);
  if (!arraysEqual(ids, EXPECTED_SOURCE_IDS)) {
    errors.push('source_register must contain the exact Section 03 source IDs in order.');
  }
  for (const entry of contract.source_register) {
    const label = `source_register ${entry?.id || '<missing id>'}`;
    if (!isObject(entry) || !entry.id || !entry.path || !entry.description) {
      errors.push(`${label} must define id, path, and description.`);
      continue;
    }
    if (!isSafeRelativePath(entry.path)) {
      errors.push(`${label} uses an unsafe or obsolete repository path.`);
      continue;
    }
    const absolutePath = repoPath(entry.path);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      errors.push(`${label} references a missing file ${entry.path}.`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/.test(String(entry.sha256 || ''))) {
      errors.push(`${label} must contain a lowercase 64-character sha256.`);
    } else if (sha256File(absolutePath) !== entry.sha256) {
      errors.push(`${label} sha256 does not match ${entry.path}.`);
    }
  }
}

function validateBoundaries(contract, errors) {
  const boundaries = contract.architecture_boundaries;
  if (!isObject(boundaries)) {
    errors.push('architecture_boundaries must be an object.');
    return;
  }
  if (!arraysEqual(boundaries.layer_order, EXPECTED_LAYER_ORDER)) {
    errors.push('architecture_boundaries.layer_order must preserve routes/controllers/usecases/repositories/models.');
  }
  if (!stringsOnly(boundaries.current_flow) || boundaries.current_flow.length < EXPECTED_LAYER_ORDER.length) {
    errors.push('architecture_boundaries.current_flow must describe the current layered flow.');
  }
  if (!Array.isArray(boundaries.target_flow) || boundaries.target_flow.length !== 7) {
    errors.push('architecture_boundaries.target_flow must contain exactly seven target-flow steps.');
    return;
  }
  boundaries.target_flow.forEach((step, index) => {
    const label = `target_flow step ${index + 1}`;
    if (!isObject(step) || step.step !== index + 1) errors.push(`${label} must have the expected sequence number.`);
    for (const field of ['action', 'owner', 'source_of_truth', 'evidence_output']) {
      if (typeof step?.[field] !== 'string' || !step[field].trim()) errors.push(`${label}.${field} must be non-empty.`);
    }
  });
}

function validateModulePlacement(contract, errors) {
  if (!Array.isArray(contract.module_placement)) {
    errors.push('module_placement must be an array.');
    return;
  }
  const surfaces = contract.module_placement.map((entry) => entry?.surface);
  if (!arraysEqual(surfaces, EXPECTED_MODULE_SURFACES)) {
    errors.push('module_placement must contain the exact Section 03 surfaces in order.');
  }
  contract.module_placement.forEach((surface) => {
    const label = `module_placement ${surface?.surface || '<missing surface>'}`;
    if (!isObject(surface)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    for (const field of ['owner', 'permission_contract', 'rollback']) {
      if (typeof surface[field] !== 'string' || !surface[field].trim()) errors.push(`${label}.${field} must be non-empty.`);
    }
    if (!stringsOnly(surface.source_of_truth) || !stringsOnly(surface.evidence_outputs) || !stringsOnly(surface.paths)) {
      errors.push(`${label} must define non-empty source_of_truth, evidence_outputs, and paths arrays.`);
    }
    for (const sourcePath of surface.paths || []) {
      if (!pathExists(sourcePath)) errors.push(`${label} references missing or obsolete path ${sourcePath}.`);
    }
  });
}

function validateSourceTruth(contract, errors) {
  if (!Array.isArray(contract.source_of_truth_contract)) {
    errors.push('source_of_truth_contract must be an array.');
    return;
  }
  const entities = contract.source_of_truth_contract.map((entry) => entry?.entity);
  if (!arraysEqual(entities, EXPECTED_SOURCE_ENTITIES)) {
    errors.push('source_of_truth_contract must contain the exact source entities in order.');
  }
  contract.source_of_truth_contract.forEach((source) => {
    const label = `source_of_truth_contract ${source?.entity || '<missing entity>'}`;
    if (!isObject(source)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    for (const field of ['authoritative_source_paths', 'derived_outputs']) {
      if (!stringsOnly(source[field])) errors.push(`${label}.${field} must be a non-empty string array.`);
    }
    for (const field of ['immutable', 'read_only_for_evidence', 'tenant_scoped', 'location_scoped']) {
      if (typeof source[field] !== 'boolean') errors.push(`${label}.${field} must be boolean.`);
    }
    for (const sourcePath of source.authoritative_source_paths || []) {
      if (sourcePath.includes(' ') || !pathExists(sourcePath)) errors.push(`${label} references missing or non-repository source ${sourcePath}.`);
    }
    if (source.entity !== 'evidence_review' && (source.immutable !== true || source.read_only_for_evidence !== true)) {
      errors.push(`${label} must be immutable and read-only for evidence.`);
    }
    if (source.tenant_scoped !== true) errors.push(`${label} must be tenant-scoped.`);
  });
}

function validateGuardrails(contract, errors) {
  const guardrails = contract.guardrails;
  if (!isObject(guardrails)) {
    errors.push('guardrails must be an object.');
    return;
  }
  for (const token of ['@sieitzz/pos-receipt', 'packages/pos-receipt', 'packages/web-core']) {
    if (!guardrails.backend_forbidden_imports?.includes(token)) errors.push(`guardrails must forbid backend import ${token}.`);
  }
  for (const behavior of [
    'mutate fiscal source records',
    'create a duplicate fiscal ledger or mutable fiscal transaction source',
    'cross tenant or location boundary',
    'infer fiscal status from an invoice-number prefix',
    'claim external BIR, provider, or tax-practitioner approval',
  ]) {
    if (!guardrails.evidence_forbidden_behaviors?.includes(behavior)) errors.push(`guardrails must forbid ${behavior}.`);
  }
  if (!arraysEqual(guardrails.new_surface_metadata, REQUIRED_SURFACE_METADATA)) {
    errors.push('guardrails.new_surface_metadata must require owner, permission, source_of_truth, and rollback.');
  }
  if (!isObject(guardrails.route_contract)
    || !arraysEqual(guardrails.route_contract.layer_order, EXPECTED_LAYER_ORDER)
    || !arraysEqual(guardrails.route_contract.new_route_required_metadata, REQUIRED_SURFACE_METADATA)
    || guardrails.route_contract.current_section_adds_routes !== false) {
    errors.push('guardrails.route_contract must preserve the layer and route metadata contract.');
  }
  const determinism = guardrails.determinism;
  if (!isObject(determinism)
    || !arraysEqual(determinism.inputs, ['source_snapshot', 'policy_version', 'serializer_version'])
    || !arraysEqual(determinism.outputs, ['artifact_bytes', 'record_order', 'sha256'])
    || determinism.same_inputs_same_outputs !== true
    || typeof determinism.ordering_rule !== 'string') {
    errors.push('guardrails.determinism must define source, policy, serializer, bytes, order, and SHA-256 contracts.');
  }
  const store = guardrails.no_duplicate_readiness_store;
  if (!isObject(store) || store.required !== true || store.reuse_existing_final_review_store !== true || store.new_schema_requires_review !== true) {
    errors.push('guardrails.no_duplicate_readiness_store must require reuse of the existing final-review store and schema review for extensions.');
  }
  for (const sourcePath of store?.existing_paths || []) {
    if (!pathExists(sourcePath)) errors.push(`no_duplicate_readiness_store references missing path ${sourcePath}.`);
  }
  const adrImpact = guardrails.adr_impact;
  if (!isObject(adrImpact)
    || adrImpact.current_decision !== 'NO_CHANGE_REQUIRED_FOR_SECTION_03'
    || !stringsOnly(adrImpact.trigger_conditions)
    || !String(adrImpact.required_path || '').includes('ADR 0039')) {
    errors.push('guardrails.adr_impact must define the Section 03 decision, triggers, and ADR 0039 path.');
  }
}

function validateCatalog(contract, errors) {
  if (!isObject(contract.requirement_catalog) || !arraysEqual(Object.keys(contract.requirement_catalog), EXPECTED_REQUIREMENT_IDS)) {
    errors.push('requirement_catalog must contain the exact Section 03 requirement IDs in order.');
  } else {
    for (const requirementId of EXPECTED_REQUIREMENT_IDS) {
      const requirement = contract.requirement_catalog[requirementId];
      const label = `requirement_catalog ${requirementId}`;
      if (!isObject(requirement)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      for (const field of ['description', 'plan_section', 'priority', 'status', 'runtime_status']) {
        if (typeof requirement[field] !== 'string' || !requirement[field].trim()) errors.push(`${label}.${field} must be non-empty.`);
      }
      if (requirement.plan_section !== '03') errors.push(`${label}.plan_section must be 03.`);
      if (requirement.status !== 'IMPLEMENTED') errors.push(`${label}.status must be IMPLEMENTED for the Section 03 contract.`);
      if (requirement.runtime_status !== 'DEFERRED BY PLAN') errors.push(`${label}.runtime_status must be DEFERRED BY PLAN.`);
      for (const field of ['affected_components', 'business_rules', 'adrs', 'test_ids', 'acceptance_criteria', 'evidence']) {
        if (!stringsOnly(requirement[field])) errors.push(`${label}.${field} must be a non-empty string array.`);
      }
      for (const adrPath of requirement.adrs || []) {
        if (adrPath.startsWith('docs/') && !pathExists(adrPath)) errors.push(`${label} references missing ADR or architecture source ${adrPath}.`);
      }
      for (const testId of requirement.test_ids || []) {
        if (!EXPECTED_TEST_IDS.includes(testId)) errors.push(`${label} references unknown test ${testId}.`);
      }
      for (const acceptanceId of requirement.acceptance_criteria || []) {
        if (!EXPECTED_ACCEPTANCE_IDS.includes(acceptanceId)) errors.push(`${label} references unknown acceptance ${acceptanceId}.`);
      }
    }
  }

  if (!isObject(contract.test_catalog) || !arraysEqual(Object.keys(contract.test_catalog), EXPECTED_TEST_IDS)) {
    errors.push('test_catalog must contain TEST-430 through TEST-433 in order.');
  } else {
    for (const testId of EXPECTED_TEST_IDS) {
      const test = contract.test_catalog[testId];
      if (!isObject(test) || typeof test.description !== 'string' || typeof test.command !== 'string' || !stringsOnly(test.assertions)) {
        errors.push(`test_catalog ${testId} must define description, command, and assertions.`);
      }
    }
  }

  if (!isObject(contract.acceptance_catalog) || !arraysEqual(Object.keys(contract.acceptance_catalog), EXPECTED_ACCEPTANCE_IDS)) {
    errors.push('acceptance_catalog must contain AC-430 through AC-433 in order.');
  } else {
    for (const acceptanceId of EXPECTED_ACCEPTANCE_IDS) {
      const acceptance = contract.acceptance_catalog[acceptanceId];
      if (!isObject(acceptance) || acceptance.result !== 'PASS' || typeof acceptance.description !== 'string' || !stringsOnly(acceptance.evidence)) {
        errors.push(`acceptance_catalog ${acceptanceId} must be a PASS with description and evidence.`);
      }
    }
  }
}

function validateExecutionManifest(contract, errors) {
  if (!Array.isArray(contract.execution_manifest) || !arraysEqual(contract.execution_manifest.map((entry) => entry?.requirement_id), EXPECTED_REQUIREMENT_IDS)) {
    errors.push('execution_manifest must contain one entry for each Section 03 requirement in catalog order.');
    return;
  }
  const knownPaths = new Set([
    'docs/compliance/evidence/annex-b-items-4-14-architecture-contract-v1.json',
    'docs/compliance/evidence/annex-b-items-4-14-architecture-contract-v1.md',
    'scripts/validate-annex-b-items-4-14-architecture.cjs',
    'scripts/validate-annex-b-items-4-14-architecture.test.cjs',
    'apps/dgfy-api/src/routes/compliance.js',
  ]);
  const knownAnchors = new Set([
    'architecture_boundaries',
    'module_placement',
    'source_of_truth_contract',
    'source_of_truth_contract.issued_fiscal_document',
    'guardrails.determinism',
    'guardrails.evidence_forbidden_behaviors',
    'guardrails.route_contract',
    'guardrails.adr_impact',
    'source_register',
    'test_catalog.TEST-433',
  ]);
  contract.execution_manifest.forEach((entry, index) => {
    const label = `execution_manifest ${entry?.requirement_id || `index ${index}`}`;
    if (!isObject(entry)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (entry.plan_section !== '03') errors.push(`${label}.plan_section must be 03.`);
    if (!arraysEqual(entry.implementation_phases, [353])) errors.push(`${label}.implementation_phases must be [353].`);
    for (const field of ['affected_components', 'dependencies', 'business_rules', 'adrs', 'test_ids', 'acceptance_criteria', 'evidence']) {
      if (!stringsOnly(entry[field])) errors.push(`${label}.${field} must be a non-empty string array.`);
    }
    if (!VALID_EXECUTION_STATUSES.has(entry.status)) errors.push(`${label}.status is invalid.`);
    if (entry.status !== 'IMPLEMENTED') errors.push(`${label}.status must be IMPLEMENTED.`);
    if (entry.section_03_status !== 'IMPLEMENTED') errors.push(`${label}.section_03_status must be IMPLEMENTED.`);
    if (entry.runtime_status !== 'DEFERRED BY PLAN') errors.push(`${label}.runtime_status must be DEFERRED BY PLAN.`);
    for (const testId of entry.test_ids || []) {
      if (!EXPECTED_TEST_IDS.includes(testId)) errors.push(`${label} references unknown test ${testId}.`);
    }
    for (const acceptanceId of entry.acceptance_criteria || []) {
      if (!EXPECTED_ACCEPTANCE_IDS.includes(acceptanceId)) errors.push(`${label} references unknown acceptance ${acceptanceId}.`);
    }
    for (const evidence of entry.evidence || []) {
      if (knownPaths.has(evidence)) {
        if (!pathExists(evidence)) errors.push(`${label} references missing evidence path ${evidence}.`);
      } else if (!knownAnchors.has(evidence)) {
        errors.push(`${label} evidence ${evidence} is not a contract anchor or repository path.`);
      }
    }
  });
}

function validateVerificationSummary(contract, errors) {
  const summary = contract.verification_summary;
  if (!isObject(summary)) {
    errors.push('verification_summary must be an object.');
    return;
  }
  if (summary.architecture_contract_status !== 'VERIFIED') errors.push('verification_summary.architecture_contract_status must be VERIFIED.');
  if (summary.runtime_behavior_status !== 'DEFERRED_BY_PLAN') errors.push('verification_summary.runtime_behavior_status must be DEFERRED_BY_PLAN.');
  if (summary.section_status !== 'IMPLEMENTED_AND_LOCALLY_VERIFIED') errors.push('verification_summary.section_status must be IMPLEMENTED_AND_LOCALLY_VERIFIED.');
  for (const field of ['db_changes', 'runtime_code_changes', 'route_changes', 'migration_changes', 'ui_changes']) {
    if (summary[field] !== false) errors.push(`verification_summary.${field} must be false for architecture-only Section 03.`);
  }
  if (summary.external_approval_claim !== 'NOT_CLAIMED') errors.push('verification_summary must not claim external approval.');
  if (!Array.isArray(summary.non_blocking_risks) || summary.non_blocking_risks.length !== 4) errors.push('verification_summary.non_blocking_risks must list R-030 through R-033.');
  if (summary.next_eligible_phase !== 354) errors.push('verification_summary.next_eligible_phase must be 354.');
  if (!stringsOnly(summary.verification_commands)) errors.push('verification_summary.verification_commands must be a non-empty string array.');
}

function validateArchitecture(contract) {
  const errors = [];
  if (!isObject(contract)) return { valid: false, errors: ['Architecture contract must be a JSON object.'] };
  if (contract.schema_version !== 'annex-b-items-4-14-architecture-v1') errors.push('schema_version must be annex-b-items-4-14-architecture-v1.');
  if (!isObject(contract.plan)) {
    errors.push('plan must be an object.');
  } else {
    if (contract.plan.section !== '03') errors.push('plan.section must be 03.');
    if (contract.plan.phase !== 353) errors.push('plan.phase must be 353.');
    if (contract.plan.execution_mode !== 'LOCAL_ONLY') errors.push('plan.execution_mode must be LOCAL_ONLY.');
    if (contract.plan.external_approval_claim !== 'NOT_CLAIMED') errors.push('plan.external_approval_claim must be NOT_CLAIMED.');
    if (contract.plan.runtime_implementation_in_scope !== false || contract.plan.external_release_in_scope !== false) {
      errors.push('Section 03 must keep runtime implementation and external release out of scope.');
    }
    if (!/^[0-9a-f]{40}$/.test(String(contract.plan.source_commit || ''))) errors.push('plan.source_commit must be a 40-character commit SHA.');
  }

  validateSourceRegister(contract, errors);
  validateBoundaries(contract, errors);
  validateModulePlacement(contract, errors);
  validateSourceTruth(contract, errors);
  validateGuardrails(contract, errors);
  validateCatalog(contract, errors);
  validateExecutionManifest(contract, errors);
  validateVerificationSummary(contract, errors);

  const forbiddenImports = findForbiddenBackendImports();
  forbiddenImports.forEach((match) => errors.push(`Backend forbidden import found: ${match}.`));

  const complianceRoutes = repoPath('apps/dgfy-api/src/routes/compliance.js');
  const posRoutes = repoPath('apps/dgfy-api/src/routes/pos.js');
  if (!fs.readFileSync(complianceRoutes, 'utf8').includes('checkPermission(')) errors.push('Compliance routes must retain explicit permission middleware.');
  if (!fs.readFileSync(posRoutes, 'utf8').includes('checkPermission(')) errors.push('POS routes must retain explicit permission middleware.');

  return {
    valid: errors.length === 0,
    errors,
    summary: computeSummary(contract),
  };
}

function loadArchitecture(filePath = DEFAULT_ARCHITECTURE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const filePath = path.resolve(process.argv[2] || DEFAULT_ARCHITECTURE_PATH);
  try {
    const result = validateArchitecture(loadArchitecture(filePath));
    if (!result.valid) {
      console.error(JSON.stringify({ status: 'BLOCKED', file: filePath, errors: result.errors, summary: result.summary }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ status: 'PASS', file: filePath, summary: result.summary }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAILED', file: filePath, error: error.message }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_ARCHITECTURE_PATH,
  EXPECTED_LAYER_ORDER,
  EXPECTED_MODULE_SURFACES,
  EXPECTED_REQUIREMENT_IDS,
  computeSummary,
  loadArchitecture,
  validateArchitecture,
};
