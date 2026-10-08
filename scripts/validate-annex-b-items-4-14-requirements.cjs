#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED_ITEM_NUMBERS = Object.freeze(Array.from({ length: 11 }, (_, index) => index + 4));
const EXPECTED_IMPLEMENTATION_PHASES = Object.freeze({
  4: 354,
  5: 355,
  6: 356,
  7: 357,
  8: 358,
  9: 359,
  10: 359,
  11: 359,
  12: 360,
  13: 360,
  14: 360,
});
const VALID_INTERNAL_STATUSES = new Set([
  'INTERNAL_PASS',
  'EXTERNAL_REVIEW_REQUIRED',
  'BLOCKED',
  'NOT_APPLICABLE',
]);
const VALID_EXTERNAL_STATUSES = new Set([
  'PENDING',
  'EXTERNAL_REVIEW_REQUIRED',
  'ACCEPTED',
  'NOT_APPLICABLE',
]);
const VALID_APPLICABILITY_DECISIONS = new Set([
  'APPLICABLE',
  'REVIEW_REQUIRED',
  'NOT_APPLICABLE_WITH_RATIONALE',
]);
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
const REQUIRED_SOURCE_REGISTER_IDS = Object.freeze([
  'ANNEX-B-PDF',
  'PLAN-INDEX',
  'PLAN-SECTION-01',
  'PLAN-SECTION-02',
  'BASELINE-SECTION-01',
  'BIR-RMO-24-2023-OFFICIAL',
  'EJOURNAL-READINESS-GRAMMAR-0.1',
  'EJOURNAL-READINESS-FIXTURE-0.1',
  'RETURN-READINESS-CONTRACT-0.1',
]);
const REQUIRED_REQUIREMENT_IDS = Object.freeze([
  'FR-401',
  'FR-402',
  'FR-403',
  'FR-404',
  'FR-405',
  'FR-406',
  'BR-401',
  'BR-402',
  'BR-403',
  'REP-401',
]);
const REQUIRED_TEST_IDS = Object.freeze(['TEST-420', 'TEST-421', 'TEST-422', 'TEST-423']);
const REQUIRED_ACCEPTANCE_IDS = Object.freeze(['AC-420', 'AC-421', 'AC-422', 'AC-423']);
const REQUIRED_EVIDENCE_METADATA = Object.freeze([
  'fixture_id',
  'tenant_scope',
  'location_id',
  'terminal_id',
  'date_range',
  'generator_version',
  'source_commit',
  'sha256',
]);
const DEFAULT_REQUIREMENTS_PATH = path.resolve(
  __dirname,
  '..',
  'docs/compliance/evidence/annex-b-items-4-14-requirements-registry.json'
);

const EXPECTED_FIXTURES_BY_ITEM = Object.freeze({
  4: ['R4-REGULAR', 'R4-SENIOR', 'R4-PWD', 'R4-ATHLETE', 'R4-SOLO', 'R4-CHARGES', 'R4-NONFISCAL'],
  5: ['R5-CANCEL', 'R5-VOID', 'R5-CASH-REFUND', 'R5-EXTERNAL-REFUND', 'R5-PROVIDER-REFUND', 'R5-RETURN', 'R5-REPRINT', 'R5-REVERSAL'],
  6: ['R6-X-READING', 'R6-Z-READING', 'R6-DAY-CLOSE'],
  7: ['R7-SALES-SUMMARY', 'R7-DISCOUNTS', 'R7-REFUNDS-VOIDS', 'R7-PAYMENTS', 'R7-REGISTERS', 'R7-XZ', 'R7-ESALES', 'R7-AUDIT'],
  8: ['R8-ISSUED-RECEIPTS', 'R8-ADJUSTMENTS', 'R8-PROVISIONAL-EXCLUSION', 'R8-RECONCILIATION'],
  9: ['E9-SYSTEM-NARRATIVE', 'E9-SYSTEM-FLOW'],
  10: ['E10-LOGIN', 'E10-HOME', 'E10-SPLASH-NA-REVIEW'],
  11: ['E11-ONLINE', 'E11-OFFLINE', 'E11-API-UNREACHABLE', 'E11-RECONNECTED'],
  12: ['E12-OPERATOR-MANUAL', 'E12-HARDWARE-APPLICABILITY'],
  13: ['E13-AUDIT-SALE', 'E13-AUDIT-ADJUSTMENT', 'E13-AUDIT-EXPORT', 'E13-AUDIT-REDACTION'],
  14: ['E14-BACKUP', 'E14-RESTORE-DRILL', 'E14-ENCRYPTION', 'E14-FISCAL-HASH-RESTORE'],
});
const EXPECTED_REQUIREMENTS_BY_ITEM = Object.freeze({
  4: ['FR-401', 'BR-401', 'REP-401'],
  5: ['FR-402', 'BR-402', 'REP-401'],
  6: ['FR-403', 'BR-402', 'REP-401'],
  7: ['FR-404', 'BR-401', 'REP-401'],
  8: ['FR-405', 'BR-402', 'BR-403', 'REP-401'],
  9: ['FR-406', 'BR-401', 'REP-401'],
  10: ['FR-406', 'BR-401', 'REP-401'],
  11: ['FR-406', 'BR-401', 'BR-403', 'REP-401'],
  12: ['FR-406', 'BR-401', 'REP-401'],
  13: ['FR-406', 'BR-401', 'BR-402', 'REP-401'],
  14: ['FR-406', 'BR-401', 'BR-402', 'REP-401'],
});
const EXPECTED_TESTS_BY_ITEM = Object.freeze({
  4: ['TEST-420', 'TEST-421', 'TEST-423'],
  5: ['TEST-420', 'TEST-422', 'TEST-423'],
  6: ['TEST-420', 'TEST-423'],
  7: ['TEST-420', 'TEST-423'],
  8: ['TEST-420', 'TEST-421', 'TEST-422', 'TEST-423'],
  9: ['TEST-420', 'TEST-423'],
  10: ['TEST-420', 'TEST-423'],
  11: ['TEST-420', 'TEST-423'],
  12: ['TEST-420', 'TEST-423'],
  13: ['TEST-420', 'TEST-423'],
  14: ['TEST-420', 'TEST-423'],
});
const EXPECTED_ACCEPTANCE_BY_ITEM = Object.freeze({
  4: ['AC-420', 'AC-421', 'AC-423'],
  5: ['AC-420', 'AC-422', 'AC-423'],
  6: ['AC-420', 'AC-423'],
  7: ['AC-420', 'AC-423'],
  8: ['AC-420', 'AC-421', 'AC-422', 'AC-423'],
  9: ['AC-420', 'AC-423'],
  10: ['AC-420', 'AC-423'],
  11: ['AC-420', 'AC-423'],
  12: ['AC-420', 'AC-423'],
  13: ['AC-420', 'AC-423'],
  14: ['AC-420', 'AC-423'],
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stringsOnly(values) {
  return Array.isArray(values)
    && values.length > 0
    && values.every((value) => typeof value === 'string' && value.trim());
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function computeSummary(items) {
  const internalPassCount = items.filter((item) => item.internal_status === 'INTERNAL_PASS').length;
  const internalCompleteCount = items.filter((item) => (
    item.internal_status === 'INTERNAL_PASS' || item.internal_status === 'NOT_APPLICABLE'
  )).length;
  const blockedCount = items.filter((item) => item.internal_status === 'BLOCKED').length;
  const notApplicableCount = items.filter((item) => item.internal_status === 'NOT_APPLICABLE').length;
  const externalReviewRequiredCount = items.filter((item) => (
    item.external_status === 'EXTERNAL_REVIEW_REQUIRED'
  )).length;

  return {
    total_items: items.length,
    internal_pass_count: internalPassCount,
    internal_complete_count: internalCompleteCount,
    blocked_count: blockedCount,
    external_review_required_count: externalReviewRequiredCount,
    not_applicable_count: notApplicableCount,
    score_percent: (internalCompleteCount / items.length) * 100,
    eligible_for_100_percent: internalCompleteCount === items.length && blockedCount === 0,
  };
}

function validateSourceRegister(registry, errors) {
  if (!Array.isArray(registry.source_register) || registry.source_register.length < REQUIRED_SOURCE_REGISTER_IDS.length) {
    errors.push('source_register must contain every approved plan, source-lock, and normative source entry.');
    return;
  }

  const entries = new Map();
  registry.source_register.forEach((entry) => {
    if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id.trim()) {
      errors.push('Every source_register entry must have a non-empty id.');
      return;
    }
    if (entries.has(entry.id)) errors.push(`source_register contains duplicate id ${entry.id}.`);
    entries.set(entry.id, entry);

    if (entry.path) {
      const absolutePath = path.resolve(__dirname, '..', entry.path);
      if (!fs.existsSync(absolutePath)) {
        errors.push(`source_register entry ${entry.id} references missing path ${entry.path}.`);
      } else if (!/^[0-9a-f]{64}$/.test(String(entry.sha256 || ''))) {
        errors.push(`source_register entry ${entry.id} must carry a lowercase 64-character sha256 for path sources.`);
      } else if (sha256File(absolutePath) !== entry.sha256) {
        errors.push(`source_register entry ${entry.id} sha256 does not match ${entry.path}.`);
      }
    }
  });

  REQUIRED_SOURCE_REGISTER_IDS.forEach((id) => {
    if (!entries.has(id)) errors.push(`source_register is missing required entry ${id}.`);
  });
}

function validateCatalog(registry, errors) {
  if (!isObject(registry.requirement_catalog)) {
    errors.push('requirement_catalog must be an object.');
  } else if (!arraysEqual(Object.keys(registry.requirement_catalog), REQUIRED_REQUIREMENT_IDS)) {
    errors.push('requirement_catalog must contain the exact Section 02 requirement IDs in order.');
  }

  if (!isObject(registry.test_catalog)) {
    errors.push('test_catalog must be an object.');
  } else if (!arraysEqual(Object.keys(registry.test_catalog), REQUIRED_TEST_IDS)) {
    errors.push('test_catalog must contain TEST-420 through TEST-423 in order.');
  }

  if (!isObject(registry.acceptance_catalog)) {
    errors.push('acceptance_catalog must be an object.');
  } else if (!arraysEqual(Object.keys(registry.acceptance_catalog), REQUIRED_ACCEPTANCE_IDS)) {
    errors.push('acceptance_catalog must contain AC-420 through AC-423 in order.');
  }

  if (!isObject(registry.evidence_contract)) {
    errors.push('evidence_contract must define the evidence gate.');
  } else {
    if (!arraysEqual(registry.evidence_contract.required_metadata, REQUIRED_EVIDENCE_METADATA)) {
      errors.push('evidence_contract.required_metadata must preserve REP-401 metadata in order.');
    }
    if (!arraysEqual(registry.evidence_contract.obligation_completion, ['generated', 'reviewed', 'checksums_verified'])) {
      errors.push('evidence_contract.obligation_completion must require generated, reviewed, and checksums_verified.');
    }
    if (registry.evidence_contract.review_state_for_completion !== 'REVIEWED') {
      errors.push('evidence_contract.review_state_for_completion must be REVIEWED.');
    }
  }
}

function validateExecutionManifest(registry, errors) {
  if (!Array.isArray(registry.execution_manifest) || registry.execution_manifest.length !== REQUIRED_REQUIREMENT_IDS.length) {
    errors.push('execution_manifest must contain one entry for each Section 02 requirement ID.');
    return;
  }

  const manifestIds = registry.execution_manifest.map((entry) => entry && entry.requirement_id);
  if (!arraysEqual(manifestIds, REQUIRED_REQUIREMENT_IDS)) {
    errors.push('execution_manifest must contain the exact Section 02 requirement IDs in catalog order.');
  }

  registry.execution_manifest.forEach((entry, index) => {
    const label = `Execution manifest entry ${entry && entry.requirement_id ? entry.requirement_id : `at index ${index}`}`;
    if (!isObject(entry)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (entry.plan_section !== '02') errors.push(`${label}.plan_section must be 02.`);
    if (!Array.isArray(entry.implementation_phases) || entry.implementation_phases.length === 0 || entry.implementation_phases.some((phase) => !Number.isInteger(phase) || phase < 354 || phase > 362)) {
      errors.push(`${label}.implementation_phases must contain valid downstream phase numbers 354 through 362.`);
    }
    for (const field of ['affected_components', 'dependencies', 'business_rules', 'adrs', 'test_ids', 'acceptance_criteria', 'evidence']) {
      if (!stringsOnly(entry[field])) errors.push(`${label}.${field} must be a non-empty string array.`);
    }
    if (!VALID_EXECUTION_STATUSES.has(entry.status)) errors.push(`${label}.status is not a supported execution status.`);
    if (entry.section_02_status !== 'IMPLEMENTED') errors.push(`${label}.section_02_status must be IMPLEMENTED.`);
    if (!VALID_EXECUTION_STATUSES.has(entry.runtime_status)) errors.push(`${label}.runtime_status is not a supported execution status.`);
    if (Array.isArray(entry.adrs)) {
      entry.adrs.forEach((adrPath) => {
        if (!fs.existsSync(path.resolve(__dirname, '..', adrPath))) errors.push(`${label} references missing ADR ${adrPath}.`);
      });
    }
    if (Array.isArray(entry.test_ids)) {
      entry.test_ids.forEach((testId) => {
        if (!REQUIRED_TEST_IDS.includes(testId)) errors.push(`${label} references unknown test ${testId}.`);
      });
    }
    if (Array.isArray(entry.acceptance_criteria)) {
      entry.acceptance_criteria.forEach((acceptanceId) => {
        if (!REQUIRED_ACCEPTANCE_IDS.includes(acceptanceId)) errors.push(`${label} references unknown acceptance criterion ${acceptanceId}.`);
      });
    }
  });
}

function validateItems(registry, errors) {
  if (!Array.isArray(registry.items)) {
    errors.push('items must be an array.');
    return;
  }

  const itemNumbers = registry.items.map((item) => item && item.annex_item);
  if (!arraysEqual(itemNumbers, EXPECTED_ITEM_NUMBERS)) {
    errors.push(`items must contain exactly Annex B Items ${EXPECTED_ITEM_NUMBERS[0]} through ${EXPECTED_ITEM_NUMBERS.at(-1)} in order.`);
  }

  const fixtureIds = new Set();
  const obligationIds = new Set();
  const catalogFixtureIds = new Set(Array.isArray(registry.fixture_catalog)
    ? registry.fixture_catalog.map((fixture) => fixture && fixture.id)
    : []);

  registry.items.forEach((item, index) => {
    const label = `Item ${item && item.annex_item !== undefined ? item.annex_item : `at index ${index}`}`;
    if (!isObject(item)) {
      errors.push(`${label} must be an object.`);
      return;
    }

    const itemNumber = item.annex_item;
    if (!VALID_INTERNAL_STATUSES.has(item.internal_status)) errors.push(`${label} has invalid internal_status.`);
    if (!VALID_EXTERNAL_STATUSES.has(item.external_status)) errors.push(`${label} has invalid external_status.`);
    if (!item.checklist_requirement || !item.implementation_target || !item.status_reason) {
      errors.push(`${label} must include checklist_requirement, implementation_target, and status_reason.`);
    }
    if (item.implementation_phase !== EXPECTED_IMPLEMENTATION_PHASES[itemNumber]) {
      errors.push(`${label}.implementation_phase must be ${EXPECTED_IMPLEMENTATION_PHASES[itemNumber]}.`);
    }
    if (!isObject(item.owners) || !item.owners.implementation || !item.owners.evidence || !item.owners.external_review) {
      errors.push(`${label} must identify implementation, evidence, and external-review owners.`);
    }
    for (const field of ['requirement_ids', 'test_ids', 'acceptance_criteria', 'fixture_ids', 'source_paths']) {
      if (!stringsOnly(item[field])) errors.push(`${label}.${field} must be a non-empty string array.`);
    }
    if (Array.isArray(item.requirement_ids) && !arraysEqual(item.requirement_ids, EXPECTED_REQUIREMENTS_BY_ITEM[itemNumber])) {
      errors.push(`${label}.requirement_ids do not match the Section 02 control assignment.`);
    }
    if (Array.isArray(item.test_ids) && !arraysEqual(item.test_ids, EXPECTED_TESTS_BY_ITEM[itemNumber])) {
      errors.push(`${label}.test_ids do not include the required Section 02 tests in order.`);
    }
    if (Array.isArray(item.acceptance_criteria) && !arraysEqual(item.acceptance_criteria, EXPECTED_ACCEPTANCE_BY_ITEM[itemNumber])) {
      errors.push(`${label}.acceptance_criteria do not include the required Section 02 gates in order.`);
    }
    if (Array.isArray(item.fixture_ids)) {
      if (!arraysEqual(item.fixture_ids, EXPECTED_FIXTURES_BY_ITEM[itemNumber])) {
        errors.push(`${label}.fixture_ids do not match the approved fixture matrix.`);
      }
      item.fixture_ids.forEach((fixtureId) => {
        if (fixtureIds.has(fixtureId)) errors.push(`Fixture ID ${fixtureId} is duplicated across items.`);
        fixtureIds.add(fixtureId);
        if (!catalogFixtureIds.has(fixtureId)) errors.push(`${label} fixture ${fixtureId} is absent from fixture_catalog.`);
      });
    }
    if (Array.isArray(item.source_paths)) {
      item.source_paths.forEach((sourcePath) => {
        if (/(^|[\\/])(backend|frontend)([\\/]|$)/.test(sourcePath)) {
          errors.push(`${label} contains an obsolete backend/ or frontend/ source path.`);
        }
        if (!fs.existsSync(path.resolve(__dirname, '..', sourcePath))) {
          errors.push(`${label} references missing source path ${sourcePath}.`);
        }
      });
    }

    if (!isObject(item.applicability) || !VALID_APPLICABILITY_DECISIONS.has(item.applicability.decision) || !item.applicability.rule) {
      errors.push(`${label}.applicability must define a decision and rule.`);
    }
    if (item.applicability && item.applicability.decision === 'NOT_APPLICABLE_WITH_RATIONALE') {
      if (!item.applicability.rationale || !item.applicability.reviewer || !item.applicability.review_date) {
        errors.push(`${label} NOT_APPLICABLE_WITH_RATIONALE requires rationale, reviewer, and review_date.`);
      }
    }
    if (item.internal_status === 'NOT_APPLICABLE' && item.applicability?.decision !== 'NOT_APPLICABLE_WITH_RATIONALE') {
      errors.push(`${label} marked NOT_APPLICABLE must have a reviewer-authored N/A applicability decision.`);
    }

    if (!Array.isArray(item.evidence_obligations) || item.evidence_obligations.length === 0) {
      errors.push(`${label}.evidence_obligations must identify at least one planned evidence gate.`);
    } else {
      item.evidence_obligations.forEach((obligation) => {
        if (!isObject(obligation) || !obligation.id || !obligation.description) {
          errors.push(`${label} has an evidence obligation without id and description.`);
          return;
        }
        if (obligationIds.has(obligation.id)) errors.push(`Evidence obligation ${obligation.id} is duplicated.`);
        obligationIds.add(obligation.id);
        if (!stringsOnly(obligation.artifact_paths)) errors.push(`${label} obligation ${obligation.id} must identify artifact_paths.`);
        if (!stringsOnly(obligation.required_metadata)) errors.push(`${label} obligation ${obligation.id} must identify required_metadata.`);
        REQUIRED_EVIDENCE_METADATA.forEach((metadataKey) => {
          if (!obligation.required_metadata?.includes(metadataKey)) {
            errors.push(`${label} obligation ${obligation.id} must include ${metadataKey}.`);
          }
        });
        for (const completionKey of ['generated', 'reviewed', 'checksums_verified']) {
          if (typeof obligation[completionKey] !== 'boolean') {
            errors.push(`${label} obligation ${obligation.id}.${completionKey} must be boolean.`);
          }
        }
        if (!['NOT_REVIEWED', 'REVIEWED'].includes(obligation.review_state)) {
          errors.push(`${label} obligation ${obligation.id}.review_state must be NOT_REVIEWED or REVIEWED.`);
        }
      });

      if (item.internal_status === 'INTERNAL_PASS') {
        const complete = item.evidence_obligations.every((obligation) => (
          obligation.generated === true
          && obligation.reviewed === true
          && obligation.checksums_verified === true
          && obligation.review_state === 'REVIEWED'
        ));
        if (!complete) errors.push(`${label} cannot be INTERNAL_PASS without generated, reviewed, and checksum-verified obligations.`);
      }
    }

    if (item.annex_item === 5) {
      if (!isObject(item.decision) || item.decision.priority !== 'P0') errors.push('Item 5 must carry a P0 Return-semantics decision.');
      if (isObject(item.decision) && item.decision.state !== 'INTERNAL_READINESS_LOCKED' && item.decision.state !== 'APPROVED') {
        errors.push('Item 5 decision.state must be INTERNAL_READINESS_LOCKED or APPROVED.');
      }
      if (isObject(item.decision) && item.decision.contract_version !== 'RETURN-READINESS-0.1') errors.push('Item 5 must reference RETURN-READINESS-0.1.');
    }
    if (item.annex_item === 8) {
      if (!isObject(item.decision) || (item.decision.state !== 'INTERNAL_READINESS_LOCKED' && item.decision.state !== 'APPROVED')) {
        errors.push('Item 8 must carry an INTERNAL_READINESS_LOCKED or APPROVED e-Journal contract decision.');
      }
      if (isObject(item.decision) && item.decision.contract_version !== 'EJOURNAL-READINESS-0.1') errors.push('Item 8 must reference EJOURNAL-READINESS-0.1.');
    }
  });

  if (!Array.isArray(registry.fixture_catalog) || registry.fixture_catalog.length !== fixtureIds.size) {
    errors.push('fixture_catalog must contain one unique entry for every matrix fixture.');
  }
}

function validateRequirements(registry) {
  const errors = [];

  if (!isObject(registry)) return { valid: false, errors: ['Requirements registry must be a JSON object.'] };
  if (registry.schema_version !== 'annex-b-items-4-14-requirements-v1') errors.push('schema_version must be annex-b-items-4-14-requirements-v1.');

  if (!isObject(registry.plan)) {
    errors.push('plan must be an object.');
  } else {
    if (registry.plan.section !== '02') errors.push('plan.section must be 02.');
    if (registry.plan.phase !== 353) errors.push('plan.phase must be 353.');
    if (registry.plan.execution_mode !== 'LOCAL_ONLY') errors.push('plan.execution_mode must be LOCAL_ONLY.');
    if (registry.plan.external_approval_claim !== 'NOT_CLAIMED') errors.push('The registry must not claim external BIR or provider approval.');
    if (!/^[0-9a-f]{40}$/.test(String(registry.plan.source_commit || ''))) errors.push('plan.source_commit must be a 40-character commit SHA.');
  }

  if (!isObject(registry.execution_boundary) || registry.execution_boundary.runtime_implementation_in_scope !== false || registry.execution_boundary.external_release_in_scope !== false) {
    errors.push('execution_boundary must keep runtime implementation and external release out of Section 02 scope.');
  }
  if (!isObject(registry.status_model) || registry.status_model.internal_pass_rule !== 'Every evidence obligation must be generated, reviewed, and checksum-verified before an item may be INTERNAL_PASS.') {
    errors.push('status_model must preserve the evidence-gated internal-pass rule.');
  }

  validateSourceRegister(registry, errors);
  validateCatalog(registry, errors);
  validateExecutionManifest(registry, errors);
  validateItems(registry, errors);

  if (!isObject(registry.readiness_summary)) {
    errors.push('readiness_summary must be an object.');
  } else if (Array.isArray(registry.items)) {
    const computed = computeSummary(registry.items);
    Object.keys(computed).forEach((key) => {
      if (registry.readiness_summary[key] !== computed[key]) errors.push(`readiness_summary.${key} does not match the item statuses.`);
    });
    if (!computed.eligible_for_100_percent && registry.readiness_summary.score_percent === 100) {
      errors.push('A registry with blocked or incomplete items must not report score_percent 100.');
    }
    if (computed.eligible_for_100_percent && registry.readiness_summary.score_percent !== 100) {
      errors.push('A fully complete registry must report score_percent 100.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: Array.isArray(registry.items) ? computeSummary(registry.items) : undefined,
  };
}

function loadRequirements(filePath = DEFAULT_REQUIREMENTS_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const filePath = path.resolve(process.argv[2] || DEFAULT_REQUIREMENTS_PATH);
  try {
    const result = validateRequirements(loadRequirements(filePath));
    if (!result.valid) {
      console.error(JSON.stringify({ status: 'BLOCKED', file: filePath, errors: result.errors }, null, 2));
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
  DEFAULT_REQUIREMENTS_PATH,
  EXPECTED_ITEM_NUMBERS,
  computeSummary,
  loadRequirements,
  validateRequirements,
};
