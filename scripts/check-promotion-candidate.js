#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { APPS } = require('./check-app-version-bump');

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

// #1610 (ADR 0081 Decision 8 amendment): every staging_repair revision must declare which apps it
// actually rebuilt/relabeled on STAGING -- the same apps whose build_* flag was true on that
// repair's STAGING redeploy. dgfy-api and dgfy-migration-runner are always rebuilt as one paired
// unit (a single build_api flag covers both -- see deploy.yml's/deploy-main.yml's own pairing
// comment), so a repair that touches either always lists both. This is what
// resolveCandidateSourceShaByApp below walks to answer "which SHA is THIS app's candidate source
// identity" per app, instead of assuming every app advanced to the same current_staging_sha.
function assertAppsTouched(value, position) {
  assert(Array.isArray(value) && value.length > 0, `Repair revision ${position} must declare a non-empty apps_touched array`, 'MISSING_APPS_TOUCHED');
  const seen = new Set();
  for (const app of value) {
    assert(typeof app === 'string' && APPS.includes(app), `Repair revision ${position}'s apps_touched contains an unrecognized app: ${app}`, 'INVALID_APPS_TOUCHED');
    assert(!seen.has(app), `Repair revision ${position}'s apps_touched lists ${app} more than once`, 'DUPLICATE_APPS_TOUCHED');
    seen.add(app);
  }
  // PR #1612 review RF-1: dgfy-api and dgfy-migration-runner are always rebuilt/relabeled as one
  // paired unit -- a single build_api flag covers both (deploy.yml's/deploy-main.yml's own pairing
  // comment), and deploy-main.yml exposes only one candidate_source_sha_api input for the pair. A
  // one-sided apps_touched (only one of the two listed) would make resolveCandidateSourceShaByApp
  // return different SHAs for dgfy-api vs dgfy-migration-runner while PROD actually stamps both
  // with the same API-group SHA -- incorrect provenance, or an avoidable parity failure. Reject it
  // outright rather than silently accepting a manifest that can't be honestly resolved per-app.
  assert(
    seen.has('dgfy-api') === seen.has('dgfy-migration-runner'),
    `Repair revision ${position}'s apps_touched must list dgfy-api and dgfy-migration-runner together or not at all (they are always rebuilt as one paired unit) -- got: ${value.join(', ')}`,
    'ONE_SIDED_API_MIGRATION_PAIR'
  );
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
    assertAppsTouched(revision.apps_touched, repairRevision);
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

/**
 * #1610 (ADR 0081 Decision 8 amendment) -- resolves each app's own candidate source identity
 * instead of assuming every app shares the manifest-wide current_staging_sha. An app never named
 * in any staging_repair's apps_touched keeps the initial revision's SHA (== source_develop_sha)
 * for the life of the candidate, even after later repairs advance current_staging_sha for other
 * apps -- that's exactly the bug this resolves: a repair touching only some apps must not make the
 * untouched apps' PROD build claim a candidate identity their STAGING image never actually carried.
 *
 * Expects an already-validated manifest (call validatePromotionCandidate first) -- this function
 * does not re-validate, it just walks revisions.apps_touched.
 */
function resolveCandidateSourceShaByApp(manifest, apps = APPS) {
  const initialSha = manifest.revisions[0].sha;
  const byApp = {};
  for (const app of apps) {
    let sha = initialSha;
    for (const revision of manifest.revisions.slice(1)) {
      if (Array.isArray(revision.apps_touched) && revision.apps_touched.includes(app)) {
        sha = revision.sha;
      }
    }
    byApp[app] = sha;
  }
  return byApp;
}

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), manifestPath: '', resolveAppShas: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifestPath = argv[++index] || '';
    } else if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else if (arg === '--resolve-app-shas') {
      options.resolveAppShas = true;
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
    if (options.resolveAppShas) {
      // Machine-readable only, on its own stdout line -- the promoter's runbook parses this with
      // `node -e`/JSON.parse rather than screen-scraping the PASS line below.
      console.log(JSON.stringify(resolveCandidateSourceShaByApp(manifest)));
      return;
    }
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
  resolveCandidateSourceShaByApp,
};
