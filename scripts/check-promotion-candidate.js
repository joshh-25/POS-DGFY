#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { APPS } = require('./check-app-version-bump');

const CANDIDATE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
// #2055 (Phase 346): per-app artifact lineage records image digests -- strict `sha256:<hex>`.
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
// Manifest schemas: v1 is the Phase 342 candidate-wide shape (frozen legacy -- still accepted
// so in-flight/older manifests validate, but never written anymore); v2 is the #2055
// per-app shape (per-app `release_revision` map, cosmetic `repair_seq` ordinals).
const CANDIDATE_SCHEMAS = Object.freeze(['sku-release-candidate/v1', 'sku-release-candidate/v2', 'sku-release-candidate/v3']);
const RELEASE_ORIGINS = Object.freeze(['dev', 'promotion', 'staging_repair']);
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

// #2055 (Phase 346): v2 repairs carry a cosmetic `repair_seq` ordinal only -- branch-naming
// and ordering (`fix/staging/<candidate_id>-<repair_seq>`), never an artifact-identity
// claim. The bare `-<seq>` (no `r` prefix) is deliberate: per-app artifact revisions are
// `rN` everywhere (tags, labels, manifests), and reusing the prefix here would conflate
// the two again.
function assertRepairSeqBranch(branch, candidateId, repairSeq) {
  assert(branch === `fix/staging/${candidateId}-${repairSeq}`, `Repair sequence ${repairSeq} must use fix/staging/${candidateId}-${repairSeq}`, 'INVALID_REPAIR_BRANCH');
}

function assertDigest(value, label) {
  assert(typeof value === 'string' && DIGEST_PATTERN.test(value), `${label} must be a sha256:<64-hex> image digest`, 'INVALID_DIGEST');
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

// #2055 (Phase 346): v2 release branches carry no numeric suffix at all -- only one release
// cut exists per candidate, and the candidate-wide `rN` the old suffix named no longer
// exists. A failed pre-main cut is deleted and re-cut under the same name from the new
// staging head (the manifest's updated `source_staging_sha` records the recut).
function assertReleaseCutBranch(branch, candidateId) {
  assert(branch === `release/${candidateId}`, `Release cut must use release/${candidateId}`, 'INVALID_RELEASE_BRANCH');
}

/**
 * #2055 (Phase 346): validates one v2 `dev_artifacts` entry -- the already-published DEV
 * artifact a candidate selects per app as its starting point (`{ app, revision, sha,
 * digest }`). `dgfy-api` and `dgfy-migration-runner` are independent entries here (DEV
 * builds them as separate images with separate per-app revisions); the paired-unit rule
 * applies only to `apps_touched` stamping, not to artifact selection.
 */
function assertDevArtifact(entry, position) {
  assert(entry && typeof entry === 'object' && !Array.isArray(entry), `Initial revision dev_artifacts[${position}] must be an object`, 'INVALID_DEV_ARTIFACT');
  assert(typeof entry.app === 'string' && APPS.includes(entry.app), `Initial revision dev_artifacts[${position}] names an unrecognized app: ${entry.app}`, 'INVALID_DEV_ARTIFACT_APP');
  assert(Number.isInteger(entry.revision) && entry.revision > 0, `Initial revision dev_artifacts[${position}] revision must be a positive integer (the app's allocated per-app artifact revision)`, 'INVALID_DEV_ARTIFACT_REVISION');
  assertSha(entry.sha, `Initial revision dev_artifacts[${position}] sha`);
  assertDigest(entry.digest, `Initial revision dev_artifacts[${position}] digest`);
}

function assertDevArtifacts(value) {
  assert(Array.isArray(value) && value.length > 0, 'The initial revision must select at least one published DEV artifact (dev_artifacts)', 'MISSING_DEV_ARTIFACTS');
  const seen = new Set();
  value.forEach((entry, index) => {
    assertDevArtifact(entry, index);
    assert(!seen.has(entry.app), `Initial revision dev_artifacts lists ${entry.app} more than once`, 'DUPLICATE_DEV_ARTIFACT_APP');
    seen.add(entry.app);
  });
}

/**
 * #2055 (Phase 346): validates one v2 `release_revision.apps` entry -- each touched app's
 * latest allocated revision at release-cut time, read off that app's STAGING revision tag
 * (GHCR is the source of truth, not the manifest). `origin` records where the revision
 * was allocated: the selected DEV artifact (`dev`) or a later staging repair
 * (`staging_repair`). Apps the candidate never rebuilds are absent -- they keep their
 * last-published artifact/revision unchanged and no new tag is cut for them.
 */
function assertReleaseAppEntry(app, entry, allowedOrigins = RELEASE_ORIGINS) {
  assert(entry && typeof entry === 'object' && !Array.isArray(entry), `release_revision.apps["${app}"] must be an object`, 'INVALID_RELEASE_APP_ENTRY');
  assert(Number.isInteger(entry.revision) && entry.revision > 0, `release_revision.apps["${app}"].revision must be a positive integer (the app's latest allocated artifact revision)`, 'INVALID_RELEASE_APP_REVISION');
  assertSha(entry.source_sha, `release_revision.apps["${app}"].source_sha`);
  assertDigest(entry.digest, `release_revision.apps["${app}"].digest`);
  assert(allowedOrigins.includes(entry.origin), `release_revision.apps["${app}"].origin must be one of ${allowedOrigins.join(', ')}`, 'INVALID_RELEASE_APP_ORIGIN');
}

function assertReleaseApps(value, allowedOrigins = RELEASE_ORIGINS) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'release_revision.apps must be a per-app map', 'INVALID_RELEASE_APPS');
  const apps = Object.keys(value);
  assert(apps.length > 0, 'release_revision.apps must name at least one app the candidate actually rebuilds', 'MISSING_RELEASE_APPS');
  for (const app of apps) {
    assert(APPS.includes(app), `release_revision.apps names an unrecognized app: ${app}`, 'INVALID_RELEASE_APP');
    assertReleaseAppEntry(app, value[app], allowedOrigins);
  }
}

function validatePromotionCandidate(manifest) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Candidate manifest must be an object', 'INVALID_MANIFEST');
  assert(typeof manifest.schema === 'string' && CANDIDATE_SCHEMAS.includes(manifest.schema), `Candidate manifest schema must be one of ${CANDIDATE_SCHEMAS.join(', ')}`, 'INVALID_SCHEMA');
  if (manifest.schema === 'sku-release-candidate/v2') {
    return validatePromotionCandidateV2(manifest);
  }
  if (manifest.schema === 'sku-release-candidate/v3') {
    return validatePromotionCandidateV3(manifest);
  }
  return validatePromotionCandidateV1(manifest);
}

/**
 * Phase 342 shape, frozen. Still accepted so in-flight and historical v1 manifests
 * validate, but never written anymore -- new candidates use
 * `validatePromotionCandidateV2` below (#2055).
 */
function validatePromotionCandidateV1(manifest) {
  assert(manifest.schema === 'sku-release-candidate/v1', 'Candidate manifest schema must be sku-release-candidate/v1', 'INVALID_SCHEMA');
  assert(typeof manifest.candidate_id === 'string' && CANDIDATE_ID_PATTERN.test(manifest.candidate_id), 'candidate_id must use YYYY-MM-DD-NN', 'INVALID_CANDIDATE_ID');
  assert(STATUS_VALUES.has(manifest.status), `Unsupported candidate status: ${manifest.status || '<missing>'}`, 'INVALID_STATUS');
  assertSha(manifest.source_develop_sha, 'source_develop_sha');
  if (manifest.staging_head_sha != null) assertSha(manifest.staging_head_sha, 'staging_head_sha');
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
      staging_head_sha: manifest.staging_head_sha || null,
      repair_count: repairRevision,
      release_revision: null,
    };
  }
  assert(manifest.release_revision && typeof manifest.release_revision === 'object', 'release_revision is required', 'MISSING_RELEASE_REVISION');
  assert(['qualified', 'repair_needed', 'repair_in_progress', 'promoted_main', 'production_verified', 'blocked'].includes(manifest.status), 'A candidate with a release revision must be qualified, repairing, promoted, verified, or blocked', 'INVALID_RELEASE_STATUS');
  const release = manifest.release_revision;
  assert(Number.isInteger(release.revision) && release.revision === repairRevision + 1, 'release_revision must immediately follow the latest staging revision', 'INVALID_RELEASE_REVISION');
  assertSha(release.source_staging_sha, 'release source_staging_sha');
  assert(manifest.staging_head_sha, 'A released candidate must record the actual staging head used for the release cut', 'MISSING_STAGING_HEAD_SHA');
  assert(release.source_staging_sha === manifest.staging_head_sha, 'Release branch must be cut from the recorded staging head', 'RELEASE_SOURCE_MISMATCH');
  assertReleaseBranch(release.branch, candidateId, release.revision);
  assert(Number.isInteger(release.pr) && release.pr > 0, 'Release revision must identify its PR', 'MISSING_RELEASE_PR');

  return {
    candidate_id: candidateId,
    status: manifest.status,
    source_develop_sha: manifest.source_develop_sha,
    current_staging_sha: manifest.current_staging_sha,
    staging_head_sha: manifest.staging_head_sha,
    repair_count: repairRevision,
    release_revision: release.revision,
  };
}

/**
 * #2055 (Phase 346) shape. Differences from v1, all deliberate reversals of Phase 342's
 * candidate-wide-uniform-`rN` design:
 *   - `revisions[0]` (`initial`) selects the already-published per-app DEV artifacts
 *     (`dev_artifacts: [{ app, revision, sha, digest }]`) the candidate starts from.
 *   - `staging_repair` entries carry a cosmetic `repair_seq` ordinal (branch-naming and
 *     ordering only -- `fix/staging/<candidate_id>-<repair_seq>`), never doubling as an
 *     artifact-identity claim.
 *   - `release_revision` is a per-app map (`apps: { "<app>": { revision, source_sha,
 *     digest, origin } }`), populated at release-cut time from each touched app's latest
 *     allocated revision; the cut-level `source_staging_sha`/`branch`/`pr` stay alongside
 *     it. The release branch itself is the plain `release/<candidate_id>`.
 *   - `current_staging_sha` keeps its v1 meaning (latest revision SHA, overall candidate
 *     context); per-app candidate source identity still resolves via
 *     `resolveCandidateSourceShaByApp` below (unchanged -- repairs keep `apps_touched`).
 */
function validatePromotionCandidateV2(manifest, versionlessDev = false) {
  assert(typeof manifest.candidate_id === 'string' && CANDIDATE_ID_PATTERN.test(manifest.candidate_id), 'candidate_id must use YYYY-MM-DD-NN', 'INVALID_CANDIDATE_ID');
  assert(STATUS_VALUES.has(manifest.status), `Unsupported candidate status: ${manifest.status || '<missing>'}`, 'INVALID_STATUS');
  assertSha(manifest.source_develop_sha, 'source_develop_sha');
  if (manifest.staging_head_sha != null) assertSha(manifest.staging_head_sha, 'staging_head_sha');
  assert(Array.isArray(manifest.revisions) && manifest.revisions.length > 0, 'Candidate must contain at least one revision', 'MISSING_REVISIONS');

  const { candidate_id: candidateId, revisions } = manifest;
  const first = revisions[0];
  assert(first && first.kind === 'initial', 'The first candidate revision must be kind=initial', 'INVALID_INITIAL_REVISION');
  assertSha(first.sha, 'initial revision sha');
  assert(first.sha === manifest.source_develop_sha, 'Initial revision SHA must equal source_develop_sha', 'SOURCE_SHA_MISMATCH');
  assertCandidateBranch(first.branch, candidateId);
  assert(first.parent_sha === null, 'Initial revision parent_sha must be null', 'INVALID_INITIAL_PARENT');
  if (versionlessDev) {
    assert(!Object.hasOwn(first, 'dev_artifacts'), 'A v3 candidate must not select DEV artifacts (dev_artifacts)', 'FORBIDDEN_DEV_ARTIFACTS');
    assertAppsTouched(first.apps_touched, 'initial');
  }
  else assertDevArtifacts(first.dev_artifacts);

  let previousSha = first.sha;
  let repairSeq = 0;
  const seenShas = new Set([first.sha]);

  revisions.slice(1).forEach((revision, index) => {
    const position = index + 2;
    assert(revision && revision.kind === 'staging_repair', `Revision ${position} must be kind=staging_repair`, 'INVALID_REVISION_KIND');
    assertSha(revision.sha, `revision ${position} sha`);
    assertSha(revision.parent_sha, `revision ${position} parent_sha`);
    assert(revision.parent_sha === previousSha, `Revision ${position} must point to the previous candidate SHA`, 'REVISION_PARENT_MISMATCH');
    assert(!seenShas.has(revision.sha), `Revision ${position} reuses an earlier candidate SHA`, 'DUPLICATE_REVISION_SHA');
    repairSeq += 1;
    assert(revision.repair_seq === repairSeq, `Repair sequences must be sequential; expected ${repairSeq}`, 'INVALID_REPAIR_SEQ');
    assert(!('revision' in revision) || revision.revision === undefined, `Revision ${position} must not carry the v1 candidate-wide revision field -- repair_seq is cosmetic only (#2055)`, 'FORBIDDEN_REPAIR_REVISION');
    assertRepairSeqBranch(revision.branch, candidateId, repairSeq);
    assert(Number.isInteger(revision.pr) && revision.pr > 0, `Repair sequence ${repairSeq} must identify its PR`, 'MISSING_REPAIR_PR');
    assert(Number.isInteger(revision.issue) && revision.issue > 0, `Repair sequence ${repairSeq} must identify its issue`, 'MISSING_REPAIR_ISSUE');
    assertAppsTouched(revision.apps_touched, repairSeq);
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
      staging_head_sha: manifest.staging_head_sha || null,
      repair_count: repairSeq,
      release_revision: null,
    };
  }
  assert(manifest.release_revision && typeof manifest.release_revision === 'object', 'release_revision is required', 'MISSING_RELEASE_REVISION');
  assert(['qualified', 'repair_needed', 'repair_in_progress', 'promoted_main', 'production_verified', 'blocked'].includes(manifest.status), 'A candidate with a release revision must be qualified, repairing, promoted, verified, or blocked', 'INVALID_RELEASE_STATUS');
  const release = manifest.release_revision;
  assertSha(release.source_staging_sha, 'release source_staging_sha');
  assert(manifest.staging_head_sha, 'A released candidate must record the actual staging head used for the release cut', 'MISSING_STAGING_HEAD_SHA');
  assert(release.source_staging_sha === manifest.staging_head_sha, 'Release branch must be cut from the recorded staging head', 'RELEASE_SOURCE_MISMATCH');
  assertReleaseCutBranch(release.branch, candidateId);
  assert(Number.isInteger(release.pr) && release.pr > 0, 'Release cut must identify its PR', 'MISSING_RELEASE_PR');
  assertReleaseApps(release.apps, versionlessDev ? ['promotion', 'staging_repair'] : ['dev', 'staging_repair']);

  return {
    candidate_id: candidateId,
    status: manifest.status,
    source_develop_sha: manifest.source_develop_sha,
    current_staging_sha: manifest.current_staging_sha,
    staging_head_sha: manifest.staging_head_sha,
    repair_count: repairSeq,
    release_revision: release.apps,
  };
}

/**
 * #2071 versionless DEV candidate shape: the frozen develop SHA is built directly on STAGING.
 * Initial apps_touched records the deployable app set for this candidate: apps changed at promotion
 * start plus any explicitly carried forward from an earlier partial PROD release. No DEV image
 * selection or deployment participates in the candidate. Repair and per-app release lineage
 * retain the v2 structure, with `promotion` replacing the old DEV artifact origin.
 */
function validatePromotionCandidateV3(manifest) {
  assert(manifest.schema === 'sku-release-candidate/v3', 'Candidate manifest schema must be sku-release-candidate/v3', 'INVALID_SCHEMA');
  const result = validatePromotionCandidateV2(manifest, true);
  if (Object.hasOwn(manifest, 'quality_check')) {
    const qualityCheck = manifest.quality_check;
    assert(qualityCheck && typeof qualityCheck === 'object' && !Array.isArray(qualityCheck), 'quality_check must be an object when present', 'INVALID_QUALITY_CHECK');
    assertSha(qualityCheck.sha, 'quality_check.sha');
    assert(Number.isInteger(qualityCheck.run_id) && qualityCheck.run_id > 0, 'quality_check.run_id must be a positive integer', 'INVALID_QUALITY_CHECK_RUN_ID');
    assert(typeof qualityCheck.run_url === 'string' && /^https:\/\//.test(qualityCheck.run_url), 'quality_check.run_url must be an HTTPS URL', 'INVALID_QUALITY_CHECK_URL');
    assert(typeof qualityCheck.dispatched_at === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(qualityCheck.dispatched_at) && !Number.isNaN(Date.parse(qualityCheck.dispatched_at)), 'quality_check.dispatched_at must be an ISO-8601 date-time', 'INVALID_QUALITY_CHECK_TIME');
    assert(['clean', 'had-advisory-failures'].includes(qualityCheck.result), 'quality_check.result must be clean or had-advisory-failures', 'INVALID_QUALITY_CHECK_RESULT');
    result.quality_check_current = qualityCheck.sha === getActiveCandidateSha(manifest);
  }
  const apps = manifest.release_revision && manifest.release_revision.apps;
  if (apps) {
    const touchedApps = new Set(
      manifest.revisions.flatMap((revision) => revision.apps_touched || [])
    );
    assert(
      Object.hasOwn(apps, 'dgfy-api') === Object.hasOwn(apps, 'dgfy-migration-runner'),
      'A v3 candidate must include dgfy-api and dgfy-migration-runner in release_revision.apps together or omit both (paired backend release)',
      'ONE_SIDED_API_MIGRATION_RELEASE_PAIR'
    );
    const missingTouchedApps = [...touchedApps].filter((app) => !Object.hasOwn(apps, app));
    const missingAppNames = missingTouchedApps.join(', ') || '<none>';
    assert(
      missingTouchedApps.length === 0,
      'A v3 release candidate must include a revisioned STAGING artifact for every app in its ' +
        `apps_touched history; missing: ${missingAppNames}`,
      'MISSING_TOUCHED_RELEASE_APP'
    );
    const sourceShaByApp = resolveCandidateSourceShaByApp(manifest);
    for (const [app, entry] of Object.entries(apps)) {
      assert(entry.origin !== 'dev', `release_revision.apps["${app}"].origin must not be dev in a v3 candidate`, 'INVALID_RELEASE_APP_ORIGIN');
      assert(
        entry.source_sha === sourceShaByApp[app],
        `release_revision.apps["${app}"].source_sha must match its candidate apps_touched lineage (${sourceShaByApp[app]})`,
        'RELEASE_APP_SOURCE_MISMATCH'
      );
    }
  }
  return result;
}

function getActiveCandidateSha(manifest) {
  return manifest.release_revision?.source_staging_sha ||
    manifest.staging_head_sha ||
    manifest.current_staging_sha ||
    manifest.source_develop_sha;
}

/**
 * #2055 (Phase 346): reads one app's release-cut lineage from a v2 manifest's per-app
 * `release_revision.apps` map. Returns `{ revision, source_sha, digest, origin }`, or
 * null when the app is absent (an app the candidate never rebuilds keeps its
 * last-published artifact -- no new tag, nothing to verify) or the manifest is v1
 * (candidate-wide legacy -- callers use the integer `release_revision` instead).
 */
function getAppRevision(manifest, app) {
  if (!manifest || !['sku-release-candidate/v2', 'sku-release-candidate/v3'].includes(manifest.schema)) return null;
  const apps = manifest.release_revision && manifest.release_revision.apps;
  if (!apps || typeof apps !== 'object') return null;
  return Object.hasOwn(apps, app) ? apps[app] : null;
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
    // v2 carries a per-app release_revision map (not a printable integer) -- summarize it
    // per app instead of stringifying the object into the PASS line.
    const releaseSummary = result.release_revision === null
      ? null
      : (typeof result.release_revision === 'object'
        ? Object.entries(result.release_revision).map(([app, entry]) => `${app}=r${entry.revision}/${entry.origin}`).join(',')
        : `r${result.release_revision}`);
    console.log(`[promotion-candidate] PASS candidate=${result.candidate_id} staging_sha=${result.current_staging_sha} repairs=${result.repair_count} release_revision=${releaseSummary}`);
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
  CANDIDATE_SCHEMAS,
  RELEASE_ORIGINS,
  DIGEST_PATTERN,
  PromotionCandidateError,
  validatePromotionCandidate,
  validatePromotionCandidateV1,
  validatePromotionCandidateV2,
  validatePromotionCandidateV3,
  getActiveCandidateSha,
  getAppRevision,
  resolveCandidateSourceShaByApp,
};
