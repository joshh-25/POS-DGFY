#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { PromotionCandidateError, validatePromotionCandidate } = require('./check-promotion-candidate');

class StagingObservationError extends Error {
  constructor(message, code = 'STAGING_OBSERVATION_INVALID') {
    super(message);
    this.name = 'StagingObservationError';
    this.code = code;
  }
}

function assert(condition, message, code) {
  if (!condition) throw new StagingObservationError(message, code);
}

function validateStagingObservation(observation, candidateManifest) {
  assert(observation && typeof observation === 'object' && !Array.isArray(observation), 'Observation must be an object', 'INVALID_OBSERVATION');
  assert(observation.schema === 'sku-staging-observation/v1', 'Observation schema must be sku-staging-observation/v1', 'INVALID_SCHEMA');
  let candidate;
  try {
    candidate = validatePromotionCandidate(candidateManifest);
  } catch (error) {
    if (error instanceof PromotionCandidateError) throw new StagingObservationError(`Candidate manifest is invalid: ${error.message}`, 'CANDIDATE_MANIFEST_INVALID');
    throw error;
  }
  assert(observation.candidate_id === candidate.candidate_id, 'Observation candidate_id does not match the candidate manifest', 'CANDIDATE_ID_MISMATCH');
  assert(observation.candidate_sha === candidate.current_staging_sha, 'Observation candidate_sha does not match current_staging_sha', 'CANDIDATE_SHA_MISMATCH');
  assert(observation.runtime_sha === candidate.current_staging_sha, 'Staging runtime_sha does not match the candidate SHA', 'RUNTIME_SHA_MISMATCH');
  assert(observation.result === 'pass', 'Staging observation result must be pass', 'OBSERVATION_FAILED');
  for (const [name, check] of Object.entries(observation.checks || {})) {
    assert(check && check.status === 'pass', `Staging observation check failed: ${name}`, 'CHECK_FAILED');
  }
  assert(Object.keys(observation.checks || {}).length >= 3, 'Observation must include at least three checks', 'CHECKS_INCOMPLETE');
  assert(observation.operational_mutation === false, 'Staging observation must not perform operational mutations', 'MUTATION_NOT_ALLOWED');
  return {
    candidate_id: candidate.candidate_id,
    candidate_sha: candidate.current_staging_sha,
    checks: Object.keys(observation.checks),
    observed_at: observation.observed_at || null,
  };
}

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), observation: '', manifest: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--observation') options.observation = argv[++index] || '';
    else if (arg === '--candidate-manifest') options.manifest = argv[++index] || '';
    else if (arg === '--project-root') options.projectRoot = path.resolve(argv[++index] || '');
    else throw new StagingObservationError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
  }
  assert(options.observation && options.manifest, 'Required options: --observation and --candidate-manifest', 'INVALID_ARGS');
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const read = (file) => JSON.parse(fs.readFileSync(path.resolve(options.projectRoot, file), 'utf8'));
    const result = validateStagingObservation(read(options.observation), read(options.manifest));
    console.log(`[staging-observation] PASS candidate=${result.candidate_id} sha=${result.candidate_sha} checks=${result.checks.join(',')}`);
  } catch (error) {
    if (error instanceof StagingObservationError || error instanceof SyntaxError || error.code === 'ENOENT') {
      console.error(`[staging-observation] ${error.code || 'INVALID_OBSERVATION'}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { StagingObservationError, validateStagingObservation };
