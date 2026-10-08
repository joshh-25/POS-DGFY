#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const EXPECTED_ITEM_NUMBERS = Object.freeze(Array.from({ length: 11 }, (_, index) => index + 4));
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
const REQUIRED_EVIDENCE_METADATA = new Set(['fixture_id', 'source_commit', 'sha256']);
const VALID_INTERNAL_DECISION_STATES = new Set(['INTERNAL_READINESS_LOCKED', 'APPROVED']);
const DEFAULT_BASELINE_PATH = path.resolve(
  __dirname,
  '..',
  'docs/compliance/evidence/annex-b-items-4-14-readiness-baseline.json'
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function validateAnnexBReadiness(baseline) {
  const errors = [];

  if (!isObject(baseline)) {
    return { valid: false, errors: ['Baseline must be a JSON object.'] };
  }

  if (baseline.schema_version !== 'annex-b-readiness-v1') {
    errors.push('schema_version must be annex-b-readiness-v1.');
  }

  if (!isObject(baseline.plan)) {
    errors.push('plan must be an object.');
  } else {
    if (baseline.plan.section !== '01') errors.push('plan.section must be 01.');
    if (baseline.plan.phase !== 353) errors.push('plan.phase must be 353.');
    if (baseline.plan.execution_mode !== 'LOCAL_ONLY') errors.push('execution_mode must be LOCAL_ONLY.');
    if (baseline.plan.external_approval_claim !== 'NOT_CLAIMED') {
      errors.push('The baseline must not claim external BIR or provider approval.');
    }
    if (!/^[0-9a-f]{40}$/.test(String(baseline.plan.source_commit || ''))) {
      errors.push('plan.source_commit must be a 40-character commit SHA.');
    }
  }

  if (!Array.isArray(baseline.source_register) || baseline.source_register.length < 3) {
    errors.push('source_register must contain the Annex B PDF and both approved plan documents.');
  }

  if (!isObject(baseline.source_lock)) {
    errors.push('source_lock must record the internal readiness contract state.');
  } else {
    if (baseline.source_lock.state !== 'INTERNAL_READINESS_LOCKED') {
      errors.push('source_lock.state must be INTERNAL_READINESS_LOCKED.');
    }
    if (baseline.source_lock.external_status !== 'PENDING') {
      errors.push('source_lock.external_status must remain PENDING until external review occurs.');
    }
    for (const field of ['ejournal_contract', 'return_contract']) {
      const contract = baseline.source_lock[field];
      if (!isObject(contract) || !contract.version || !contract.path || contract.status !== 'INTERNAL_READINESS_CONTRACT' || contract.external_review !== 'PENDING') {
        errors.push(`source_lock.${field} must identify a versioned internal contract with external review PENDING.`);
      } else if (!fs.existsSync(path.resolve(__dirname, '..', contract.path))) {
        errors.push(`source_lock.${field} references missing contract path ${contract.path}.`);
      } else if (contract.fixture_path && !fs.existsSync(path.resolve(__dirname, '..', contract.fixture_path))) {
        errors.push(`source_lock.${field} references missing fixture path ${contract.fixture_path}.`);
      }
    }
  }

  if (!Array.isArray(baseline.items)) {
    errors.push('items must be an array.');
    return { valid: false, errors };
  }

  const itemNumbers = baseline.items.map((item) => item && item.annex_item);
  if (!arraysEqual(itemNumbers, EXPECTED_ITEM_NUMBERS)) {
    errors.push(`items must contain exactly Annex B Items ${EXPECTED_ITEM_NUMBERS[0]} through ${EXPECTED_ITEM_NUMBERS.at(-1)} in order.`);
  }

  const seenFixtureIds = new Set();
  baseline.items.forEach((item, index) => {
    const label = `Item ${item && item.annex_item !== undefined ? item.annex_item : `at index ${index}`}`;
    if (!isObject(item)) {
      errors.push(`${label} must be an object.`);
      return;
    }

    if (!VALID_INTERNAL_STATUSES.has(item.internal_status)) {
      errors.push(`${label} has invalid internal_status.`);
    }
    if (!VALID_EXTERNAL_STATUSES.has(item.external_status)) {
      errors.push(`${label} has invalid external_status.`);
    }
    if (!item.requirement_summary || !item.root_cause || !item.status_reason) {
      errors.push(`${label} must include requirement_summary, root_cause, and status_reason.`);
    }
    if (!isObject(item.owner) || !item.owner.implementation || !item.owner.evidence || !item.owner.external_review) {
      errors.push(`${label} must identify implementation, evidence, and external-review owners.`);
    }
    for (const field of ['requirement_ids', 'test_ids', 'acceptance_criteria', 'fixture_ids', 'source_paths']) {
      if (!Array.isArray(item[field]) || item[field].length === 0 || item[field].some((value) => typeof value !== 'string' || !value.trim())) {
        errors.push(`${label}.${field} must be a non-empty string array.`);
      }
    }
    if (Array.isArray(item.fixture_ids)) {
      item.fixture_ids.forEach((fixtureId) => {
        if (seenFixtureIds.has(fixtureId)) errors.push(`Fixture ID ${fixtureId} is duplicated.`);
        seenFixtureIds.add(fixtureId);
      });
    }
    if (Array.isArray(item.source_paths) && item.source_paths.some((sourcePath) => /(^|[\\/])(backend|frontend)([\\/]|$)/.test(sourcePath))) {
      errors.push(`${label} contains an obsolete backend/ or frontend/ source path.`);
    }
    if (Array.isArray(item.source_paths)) {
      item.source_paths.forEach((sourcePath) => {
        if (!fs.existsSync(path.resolve(__dirname, '..', sourcePath))) {
          errors.push(`${label} references missing source path ${sourcePath}.`);
        }
      });
    }

    if (!isObject(item.evidence)) {
      errors.push(`${label}.evidence must be an object.`);
    } else {
      if (!Array.isArray(item.evidence.artifact_paths) || item.evidence.artifact_paths.length === 0) {
        errors.push(`${label}.evidence.artifact_paths must identify the planned evidence output.`);
      }
      if (!Array.isArray(item.evidence.required_metadata)) {
        errors.push(`${label}.evidence.required_metadata must be an array.`);
      } else {
        for (const metadataKey of REQUIRED_EVIDENCE_METADATA) {
          if (!item.evidence.required_metadata.includes(metadataKey)) {
            errors.push(`${label}.evidence.required_metadata must include ${metadataKey}.`);
          }
        }
      }
      if (item.internal_status === 'INTERNAL_PASS') {
        if (item.evidence.generated !== true || item.evidence.reviewed !== true || item.evidence.review_state !== 'REVIEWED') {
          errors.push(`${label} cannot be INTERNAL_PASS without generated and reviewed evidence.`);
        }
      }
    }

    if (item.internal_status === 'NOT_APPLICABLE' && !item.not_applicable_rationale) {
      errors.push(`${label} marked NOT_APPLICABLE must include not_applicable_rationale.`);
    }

    if (item.annex_item === 5) {
      if (!isObject(item.decision) || !['P0', 'P1'].includes(item.decision.priority)) {
        errors.push('Item 5 must carry a P0 or P1 Return-semantics decision.');
      }
      if (isObject(item.decision) && !VALID_INTERNAL_DECISION_STATES.has(item.decision.state)) {
        errors.push('Item 5 decision.state must be INTERNAL_READINESS_LOCKED or APPROVED.');
      }
      if (item.internal_status === 'INTERNAL_PASS' && !VALID_INTERNAL_DECISION_STATES.has(item.decision.state)) {
        errors.push('Item 5 cannot be INTERNAL_PASS while the Return readiness contract is open.');
      }
    }

    if (item.annex_item === 8) {
      if (!isObject(item.decision) || !VALID_INTERNAL_DECISION_STATES.has(item.decision.state)) {
        errors.push('Item 8 must carry an INTERNAL_READINESS_LOCKED or APPROVED e-Journal contract decision.');
      }
    }
  });

  const computed = computeSummary(baseline.items);
  if (!isObject(baseline.readiness_summary)) {
    errors.push('readiness_summary must be an object.');
  } else {
    for (const key of Object.keys(computed)) {
      if (baseline.readiness_summary[key] !== computed[key]) {
        errors.push(`readiness_summary.${key} does not match the item statuses.`);
      }
    }
    if (computed.eligible_for_100_percent && baseline.readiness_summary.score_percent !== 100) {
      errors.push('A fully complete baseline must report score_percent 100.');
    }
    if (!computed.eligible_for_100_percent && baseline.readiness_summary.score_percent === 100) {
      errors.push('A baseline with blocked or incomplete items must not report score_percent 100.');
    }
  }

  return { valid: errors.length === 0, errors, summary: computed };
}

function loadBaseline(filePath = DEFAULT_BASELINE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const filePath = path.resolve(process.argv[2] || DEFAULT_BASELINE_PATH);
  try {
    const result = validateAnnexBReadiness(loadBaseline(filePath));
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
  DEFAULT_BASELINE_PATH,
  EXPECTED_ITEM_NUMBERS,
  computeSummary,
  loadBaseline,
  validateAnnexBReadiness,
};
