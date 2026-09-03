#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CANDIDATE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const STATUS_VALUES = new Set([
  'created',
  'staging_soak',
  'repair_needed',
  'repair_in_progress',
  'qualified',
  'promoted_main',
  'production_verified',
  'blocked',
]);

class PromotionCandidateError extends Error {
  constructor(message, code = 'PROMOTION_CANDIDATE_INVALID') {
    super(message);
    this.name = 'PromotionCandidateError';
    this.code = code;
  }
}

function assert(condition, message, code) {
  if (!condition) throw new PromotionCandidateError(message, code);
}

function assertSha(value, label) {
  assert(typeof value === 'string' && SHA_PATTERN.test(value), `${label} must be a lowercase 40-character Git SHA`, 'INVALID_SHA');
}

function assertCandidateBranch(branch, candidateId) {
  assert(branch === `to-staging/${candidateId}`, `Initial candidate branch must be to-staging/${candidateId}`, 'INVALID_INITIAL_BRANCH');
}

function assertRepairBranch(branch, candidateId, revision) {
  assert(branch === `fix/staging/${candidateId}-r${revision}`, `Repair revision ${revision} must use fix/staging/${candidateId}-r${revision}`, 'INVALID_REPAIR_BRANCH');
}

function assertReleaseBranch(branch, candidateId, revision) {
  assert(branch === `release/${candidateId}-r${revision}`, `Release revision ${revision} must use release/${candidateId}-r${revision}`, 'INVALID_RELEASE_BRANCH');
}

function validatePromotionCandidate(manifest) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Candidate manifest must be an object', 'INVALID_MANIFEST');
  assert(manifest.schema === 'sku-release-candidate/v1', 'Candidate manifest schema must be sku-release-candidate/v1', 'INVALID_SCHEMA');
  assert(typeof manifest.candidate_id === 'string' && CANDIDATE_ID_PATTERN.test(manifest.candidate_id), 'candidate_id must use YYYY-MM-DD-NN', 'INVALID_CANDIDATE_ID');
  assert(STATUS_VALUES.has(manifest.status), `Unsupported candidate status: ${manifest.status || '<missing>'}`, 'INVALID_STATUS');
  assertSha(manifest.source_develop_sha, 'source_develop_sha');
  assert(Array.isArray(manifest.revisions) && manifest.revisions.length > 0, 'Candidate must contain at least one revision', 'MISSING_REVISIONS');

  const { candidate_id: candidateId, revisions } = manifest;
  const first = revisions[0];
  assert(first && first.kind === 'initial', 'The first candidate revision must be kind=initial', 'INVALID_INITIAL_REVISION');
  assertSha(first.sha, 'initial revision sha');
  assert(first.sha === manifest.source_develop_sha, 'Initial revision SHA must equal source_develop_sha', 'SOURCE_SHA_MISMATCH');
  assertCandidateBranch(first.branch, candidateId);
  assert(first.parent_sha === null, 'Initial revision parent_sha must be null', 'INVALID_INITIAL_PARENT');

  let previousSha = first.sha;
  let repairRevision = 0;
  const seenShas = new Set([first.sha]);

  revisions.slice(1).forEach((revision, index) => {
    const position = index + 2;
    assert(revision && revision.kind === 'staging_repair', `Revision ${position} must be kind=staging_repair`, 'INVALID_REVISION_KIND');
    assertSha(revision.sha, `revision ${position} sha`);
    assertSha(revision.parent_sha, `revision ${position} parent_sha`);
    assert(revision.parent_sha === previousSha, `Revision ${position} must point to the previous candidate SHA`, 'REVISION_PARENT_MISMATCH');
    assert(!seenShas.has(revision.sha), `Revision ${position} reuses an earlier candidate SHA`, 'DUPLICATE_REVISION_SHA');
    repairRevision += 1;
    assert(revision.revision === repairRevision, `Repair revisions must be sequential; expected ${repairRevision}`, 'INVALID_REPAIR_REVISION');
    assertRepairBranch(revision.branch, candidateId, repairRevision);
    assert(Number.isInteger(revision.pr) && revision.pr > 0, `Repair revision ${repairRevision} must identify its PR`, 'MISSING_REPAIR_PR');
    assert(Number.isInteger(revision.issue) && revision.issue > 0, `Repair revision ${repairRevision} must identify its issue`, 'MISSING_REPAIR_ISSUE');
    previousSha = revision.sha;
    seenShas.add(revision.sha);
  });

  assert(manifest.current_staging_sha === previousSha, 'current_staging_sha must equal the latest candidate revision SHA', 'CURRENT_STAGING_SHA_MISMATCH');
  if (manifest.release_revision === null) {
    assert(['created', 'staging_soak', 'repair_needed', 'repair_in_progress'].includes(manifest.status), 'A candidate without a release revision must still be in staging qualification', 'INVALID_RELEASE_STATUS');
    return {
      candidate_id: candidateId,
      status: manifest.status,
      source_develop_sha: manifest.source_develop_sha,
      current_staging_sha: manifest.current_staging_sha,
      repair_count: repairRevision,
      release_revision: null,
    };
  }
  assert(manifest.release_revision && typeof manifest.release_revision === 'object', 'release_revision is required', 'MISSING_RELEASE_REVISION');
  assert(['qualified', 'repair_needed', 'repair_in_progress', 'promoted_main', 'production_verified', 'blocked'].includes(manifest.status), 'A candidate with a release revision must be qualified, repairing, promoted, verified, or blocked', 'INVALID_RELEASE_STATUS');
  const release = manifest.release_revision;
  assert(Number.isInteger(release.revision) && release.revision === repairRevision + 1, 'release_revision must immediately follow the latest staging revision', 'INVALID_RELEASE_REVISION');
  assertSha(release.source_staging_sha, 'release source_staging_sha');
  assert(release.source_staging_sha === manifest.current_staging_sha, 'Release branch must be cut from the current staging SHA', 'RELEASE_SOURCE_MISMATCH');
  assertReleaseBranch(release.branch, candidateId, release.revision);
  assert(Number.isInteger(release.pr) && release.pr > 0, 'Release revision must identify its PR', 'MISSING_RELEASE_PR');

  return {
    candidate_id: candidateId,
    status: manifest.status,
    source_develop_sha: manifest.source_develop_sha,
    current_staging_sha: manifest.current_staging_sha,
    repair_count: repairRevision,
    release_revision: release.revision,
  };
}

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), manifestPath: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifestPath = argv[++index] || '';
    } else if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else {
      throw new PromotionCandidateError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  assert(options.manifestPath, 'Missing required option: --manifest', 'INVALID_ARGS');
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifestPath = path.resolve(options.projectRoot, options.manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const result = validatePromotionCandidate(manifest);
    console.log(`[promotion-candidate] PASS candidate=${result.candidate_id} staging_sha=${result.current_staging_sha} repairs=${result.repair_count} release_revision=${result.release_revision}`);
  } catch (error) {
    if (error instanceof PromotionCandidateError || error instanceof SyntaxError || error.code === 'ENOENT') {
      const message = error instanceof SyntaxError ? `Invalid candidate manifest JSON: ${error.message}` : error.message;
      console.error(`[promotion-candidate] ${error.code || 'INVALID_MANIFEST'}: ${message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  CANDIDATE_ID_PATTERN,
  PromotionCandidateError,
  validatePromotionCandidate,
};
