#!/usr/bin/env node
/**
 * Promotion parity gate -- ADR 0081 Decision 8, #1588 (epic #1548 Wave 4, Phase 279).
 *
 * For a given app, the image published as `X.Y.Z-staging` and the later image published as bare
 * `X.Y.Z` must share the same **candidate source identity** -- not `org.opencontainers.image.revision`
 * as-is, which the deploy path stamps from the triggering merge commit's `github.sha` and therefore
 * differs between the `to-staging/<candidate_id>` -> `staging` merge commit and the
 * `release/<candidate_id>-rN` -> `main` merge commit even when both carry byte-identical candidate
 * content. The candidate source identity is instead the frozen promotion candidate's own tracked SHA
 * (`scripts/check-promotion-candidate.js`'s manifest: `source_develop_sha` for a candidate with no
 * staging repairs, or the latest `staging_repair` revision's `sha` -- equivalently
 * `current_staging_sha` once repairs have landed; `validatePromotionCandidate()` already resolves
 * this to a single `current_staging_sha` field regardless of repair count, so this script never has
 * to pick between the two itself). `.github/workflows/{deploy-api,deploy-migration-runner,
 * deploy-frontend}.yml` stamp this identity into the `CANDIDATE_SOURCE_LABEL` OCI label below at
 * build time, sourced from a `candidate_source_sha` input the promoter threads through
 * `deploy.yml`/`deploy-main.yml` (see `.agents/skills/promoter/references/promotion-runbook.md`).
 *
 * Two CLI modes, and a shared per-image inspection state machine underneath both:
 *
 *   --manifest <candidate.json>  Normal promotion mode (default `develop -> staging -> main` flow).
 *     Reads and validates the candidate manifest (same shape check-promotion-candidate.js
 *     validates), resolves its `current_staging_sha` as the candidate source identity, then for
 *     every app (all five by default) reads that app's package.json version at that SHA and
 *     compares `ghcr.io/sieitzz/<app>:<version>-staging` against `ghcr.io/sieitzz/<app>:<version>`.
 *
 *   --source-sha <sha>  Direct/no-staging mode (#1007's expedited `develop -> main` override, or a
 *     main hotfix cut with a known source SHA) -- RF-2, PR #1590 review. This path never cuts
 *     `to-staging/<candidate_id>` and so never produces a candidate manifest at all (`--manifest`
 *     would have nothing to point at); this mode reads app versions straight from `<sha>` and
 *     inspects only the PROD tag, confirming its stamped candidate-source-sha label (if any) equals
 *     `<sha>` -- no staging comparison, because none exists for this path by construction.
 *
 * Per-image inspection states (`inspectImageLabel`), and how each CLI mode's verdict function reads
 * them:
 *   - 'ok'           label present and internally consistent -> its `value` is comparable.
 *   - 'not-found'    the tag does not exist at all.
 *   - 'no-label'     the tag exists, but the candidate-source-sha label is absent everywhere on it
 *                    -- the legitimate "this image was never part of a tracked candidate" case (an
 *                    empty `candidate_source_sha` build input). Distinguished from 'inconsistent'
 *                    (below) precisely so an untracked-by-design image (PROD on the #1007/hotfix
 *                    path) is never confused with a broken stamp on an image that SHOULD carry one
 *                    (any STAGING image on the normal promotion path always gets a
 *                    `candidate_source_sha` -- see the runbook -- so 'no-label' there is a real
 *                    regression, not evidence).
 *   - 'inconsistent' the tag exists and the label is present on at least one platform, but is
 *                    missing on another or disagrees across platforms -- always a real defect,
 *                    regardless of which side of the comparison it's on.
 *   - 'error'        the inspect call itself failed for a reason that is not "tag not found" (auth,
 *                    network, registry outage) -- refuses to guess rather than silently passing.
 *
 * `decideParity` (manifest mode) outcomes, matching #1588's own spec plus the PR #1590 review
 * corrections (RF-2, RF-3):
 *   - prod 'ok', staging 'ok', values agree                -> pass ("match")
 *   - prod 'ok', staging 'not-found'                       -> pass ("no-staging-predecessor" --
 *                                                              expected evidence of a #1007
 *                                                              expedited promotion or a main hotfix,
 *                                                              not a defect, per Decision 8's own
 *                                                              text). RF-3: this is the ONLY staging
 *                                                              state that passes -- 'no-label' and
 *                                                              'inconsistent' both fail now (below).
 *   - prod 'no-label' (regardless of staging)               -> pass ("no-candidate-identity" -- same
 *                                                              expected-evidence case as above, just
 *                                                              detected on the PROD side; RF-2's own
 *                                                              bug was this case previously falling
 *                                                              through to 'prod-unreadable'/fail)
 *   - prod 'ok', staging 'ok', values disagree              -> fail ("mismatch")
 *   - prod 'ok', staging 'no-label' or 'inconsistent'       -> fail ("staging-unreadable", RF-3 --
 *                                                              the normal promotion path always
 *                                                              stamps STAGING, so a missing/broken
 *                                                              label there is a real regression)
 *   - prod 'inconsistent'                                   -> fail ("prod-unreadable")
 *   - prod 'not-found'                                      -> skip (nothing published yet)
 *   - either side 'error'                                   -> error (refuses to guess)
 *
 * `decideDirectParity` (`--source-sha` mode) outcomes:
 *   - prod 'ok', value equals the given `--source-sha`      -> pass ("match")
 *   - prod 'no-label'                                       -> pass ("no-candidate-identity" --
 *                                                              same expected-evidence case; this is
 *                                                              the ordinary result for a hotfix with
 *                                                              no candidate tracking at all)
 *   - prod 'ok', value differs from `--source-sha`          -> fail ("mismatch")
 *   - prod 'inconsistent'                                   -> fail ("prod-unreadable")
 *   - prod 'not-found'                                      -> skip
 *   - prod 'error'                                           -> error
 *
 * Read-only: only ever runs `docker buildx imagetools inspect`, never a push -- same classification
 * as `scripts/check-tag-immutability.js`'s own inspect step, no new checkpoint (see
 * `.agents/skills/promoter/SKILL.md`'s "Unattended vs. checkpoint" table).
 *
 * The multi-platform label-collection walk (`collectRevisionLabelInfo`) is reused directly from
 * `check-tag-immutability.js` rather than re-implemented -- both scripts read OCI labels out of the
 * same `docker buildx imagetools inspect --format '{{json .}}'` shape, and it already takes an
 * arbitrary `labelKey`, not just the revision label it was originally written for. Its sibling
 * `resolveRevisionLabels` is deliberately NOT reused here, unlike in an earlier version of this
 * file: that function's `'none'` vs `'unreadable'` split conflates two states that mean different
 * things for an OPTIONAL label like this one -- "no Labels object exists anywhere" and "a Labels
 * object exists but simply lacks this one key" both collapse to distinct-looking outcomes there,
 * but for a real single-platform image (four of this repo's five apps) the second shape is the
 * ordinary, expected result of an empty `candidate_source_sha` build input, not a defect. This file
 * classifies `collectRevisionLabelInfo`'s raw `{ found, unreadableCount }` itself instead -- see
 * `inspectImageLabel` below.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { validatePromotionCandidate, PromotionCandidateError } = require('./check-promotion-candidate');
const { isNotFoundError, collectRevisionLabelInfo } = require('./check-tag-immutability');
const { APPS, readVersionAt } = require('./check-app-version-bump');

const REPO_ROOT = path.resolve(__dirname, '..');

// Distinct from org.opencontainers.image.revision (Decision 1/7's build-commit SHA) and from
// org.opencontainers.image.version (Decision 3's X.Y.Z[-channel] tag string) -- naming and
// mechanics were left to this phase by ADR 0081 Decision 8 ("naming and mechanics are that phase's
// job, not this ADR's").
const CANDIDATE_SOURCE_LABEL = 'org.dgfy-platform.candidate-source-sha';

const IMAGE_NAME_BY_APP = (app) => `ghcr.io/sieitzz/${app}`;

class ImageVersionParityError extends Error {
  constructor(message, code = 'PARITY_CHECK_INVALID') {
    super(message);
    this.name = 'ImageVersionParityError';
    this.code = code;
  }
}

function runInspect(imageRef) {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', imageRef, '--format', '{{json .}}'], {
    encoding: 'utf8',
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

/**
 * Inspects one `<image>:<tag>` ref for `labelKey` and classifies the result -- pure aside from the
 * injected `inspectFn`, so tests supply canned inspect fixtures instead of shelling out to `docker`.
 * Returns { ref, state: 'ok'|'not-found'|'no-label'|'inconsistent'|'error', value?, reason? }.
 *
 * Classifies `collectRevisionLabelInfo`'s raw `{ found, unreadableCount }` directly (not via
 * `resolveRevisionLabels` -- see the file header for why) so 'no-label' (the label is absent on
 * EVERY platform/config entry this image has -- the ordinary shape of an untracked build) and
 * 'inconsistent' (present on at least one platform but missing or disagreeing on another -- always a
 * real defect) are distinguished correctly even for a single-platform image, where "the one Labels
 * object lacks this key" must mean 'no-label', not 'inconsistent' (there is nothing else it could be
 * inconsistent WITH). Both verdict functions below (RF-2/RF-3, PR #1590 review) depend on this split.
 */
function inspectImageLabel({ image, tag, labelKey, inspectFn }) {
  const ref = `${image}:${tag}`;
  const result = inspectFn(ref);

  if (result.status !== 0) {
    if (isNotFoundError(result.stderr)) {
      return { ref, state: 'not-found', reason: `tag does not exist (inspect: ${String(result.stderr || '').trim().slice(0, 200)})` };
    }
    return {
      ref,
      state: 'error',
      reason: `docker buildx imagetools inspect failed for a reason that is not "tag not found" -- refusing to guess: ${String(result.stderr || '').trim().slice(0, 500)}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return { ref, state: 'error', reason: `could not parse "docker buildx imagetools inspect" JSON output for ${ref}: ${error.message}` };
  }

  const { found, unreadableCount } = collectRevisionLabelInfo(parsed, labelKey);
  const uniqueFound = [...new Set(found)];

  if (uniqueFound.length === 0) {
    // No platform/config entry carries this label at all -- whether because no Labels object was
    // found anywhere, or because every Labels object found simply lacks this specific key. Either
    // way, nobody stamped it; for an OPTIONAL label this is the expected shape of an untracked
    // build, not evidence of a broken partial stamp.
    return { ref, state: 'no-label', reason: `"${labelKey}" label not present anywhere on ${ref}` };
  }
  if (unreadableCount > 0) {
    return { ref, state: 'inconsistent', reason: `"${labelKey}" is missing/empty on at least one platform of ${ref} (readable elsewhere: ${uniqueFound.join(', ')})` };
  }
  if (uniqueFound.length > 1) {
    return { ref, state: 'inconsistent', reason: `"${labelKey}" disagrees across platforms of ${ref} (${uniqueFound.join(', ')})` };
  }
  return { ref, state: 'ok', value: uniqueFound[0] };
}

/**
 * Pure verdict function for one app, given its already-inspected prod and staging label results
 * (manifest mode). Returns { verdict: 'pass'|'fail'|'skip'|'error', code, detail }. See the file
 * header's "decideParity (manifest mode) outcomes" list for the full outcome table.
 */
function decideParity({ prod, staging }) {
  if (prod.state === 'not-found') {
    return { verdict: 'skip', code: 'prod-not-found', detail: `${prod.ref} has not been published yet -- nothing to verify.` };
  }
  if (prod.state === 'error') {
    return { verdict: 'error', code: 'prod-inspect-error', detail: prod.reason };
  }
  if (prod.state === 'inconsistent') {
    return {
      verdict: 'fail',
      code: 'prod-unreadable',
      detail: `production image exists but ${prod.reason} -- cannot establish candidate source identity (ADR 0081 Decision 8).`,
    };
  }
  // RF-2 fix (PR #1590 review): a PROD image built with no candidate_source_sha at all (the
  // #1007/hotfix path -- no to-staging leg, no candidate manifest) is expected evidence, not a
  // defect, regardless of whatever a staging tag at this version happens to carry. Checked before
  // looking at staging at all, since there is nothing meaningful to compare against once PROD
  // itself carries no tracked identity.
  if (prod.state === 'no-label') {
    return {
      verdict: 'pass',
      code: 'no-candidate-identity',
      detail: `${prod.ref} carries no candidate-source-identity label at all -- expected evidence of a #1007 expedited promotion or a main hotfix with no tracked staging leg (ADR 0081 Decision 8), not a defect.`,
    };
  }

  // prod.state === 'ok' from here on.
  if (staging.state === 'error') {
    return { verdict: 'error', code: 'staging-inspect-error', detail: staging.reason };
  }
  // RF-3 fix (PR #1590 review): 'no-staging-predecessor' now fires ONLY when the staging tag does
  // not exist at all. On the normal promotion path a staging image at this exact version was always
  // built with a real candidate_source_sha (see the runbook), so an existing staging image with a
  // missing/inconsistent label is a real label-stamping regression, not evidence of anything --
  // treated as a failure below instead of silently passing.
  if (staging.state === 'not-found') {
    return {
      verdict: 'pass',
      code: 'no-staging-predecessor',
      detail: `${prod.ref} (candidate-source-sha ${prod.value}) has no staging predecessor published at all (${staging.reason}) -- expected evidence of a #1007 expedited promotion or a main hotfix, not a defect (ADR 0081 Decision 8).`,
    };
  }
  if (staging.state === 'no-label' || staging.state === 'inconsistent') {
    return {
      verdict: 'fail',
      code: 'staging-unreadable',
      detail: `staging image ${staging.ref} exists but ${staging.reason} -- the normal promotion path always stamps a candidate-source-sha on STAGING, so a missing or inconsistent label here is a label-stamping regression, not evidence of a #1007/hotfix path (ADR 0081 Decision 8).`,
    };
  }

  // staging.state === 'ok' from here on.
  if (staging.value === prod.value) {
    return { verdict: 'pass', code: 'match', detail: `${staging.ref} and ${prod.ref} share candidate-source-sha ${prod.value}.` };
  }
  return {
    verdict: 'fail',
    code: 'mismatch',
    detail: `${staging.ref} carries candidate-source-sha ${staging.value}, but ${prod.ref} carries ${prod.value} -- these should be the same frozen candidate (ADR 0081 Decision 8).`,
  };
}

/**
 * Pure verdict function for one app in `--source-sha` (direct/no-staging) mode -- RF-2, PR #1590
 * review. There is no staging image to compare against by construction (the #1007/hotfix path never
 * cuts `to-staging/<candidate_id>`), so this compares the PROD image's own label directly against
 * the caller-supplied `expectedSha` instead. See the file header's "decideDirectParity" outcome list.
 */
function decideDirectParity({ prod, expectedSha }) {
  if (prod.state === 'not-found') {
    return { verdict: 'skip', code: 'prod-not-found', detail: `${prod.ref} has not been published yet -- nothing to verify.` };
  }
  if (prod.state === 'error') {
    return { verdict: 'error', code: 'prod-inspect-error', detail: prod.reason };
  }
  if (prod.state === 'inconsistent') {
    return {
      verdict: 'fail',
      code: 'prod-unreadable',
      detail: `production image exists but ${prod.reason} -- cannot establish candidate source identity (ADR 0081 Decision 8).`,
    };
  }
  if (prod.state === 'no-label') {
    return {
      verdict: 'pass',
      code: 'no-candidate-identity',
      detail: `${prod.ref} carries no candidate-source-identity label at all -- the ordinary result for a #1007 expedited promotion or a main hotfix dispatched with no candidate_source_sha, not a defect (ADR 0081 Decision 8).`,
    };
  }

  // prod.state === 'ok' from here on.
  if (prod.value === expectedSha) {
    return { verdict: 'pass', code: 'match', detail: `${prod.ref} carries candidate-source-sha ${prod.value}, matching the expected direct-promotion source SHA.` };
  }
  return {
    verdict: 'fail',
    code: 'mismatch',
    detail: `${prod.ref} carries candidate-source-sha ${prod.value}, but the expected direct-promotion source SHA is ${expectedSha} -- these should match (ADR 0081 Decision 8).`,
  };
}

/** Orchestrates one app's version read + both inspects + the verdict (manifest mode). */
function checkApp({ repoRoot, app, candidateSha, inspectFn }) {
  const versionRaw = readVersionAt(repoRoot, candidateSha, `apps/${app}`);
  if (!versionRaw) {
    return {
      app,
      verdict: 'error',
      code: 'version-unreadable',
      detail: `could not read apps/${app}/package.json version at ${candidateSha} -- is that SHA available locally (git fetch --depth may be too shallow)?`,
    };
  }

  const image = IMAGE_NAME_BY_APP(app);
  const prod = inspectImageLabel({ image, tag: versionRaw, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
  const staging = inspectImageLabel({ image, tag: `${versionRaw}-staging`, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
  const result = decideParity({ prod, staging });

  return { app, version: versionRaw, ...result };
}

/**
 * options:
 *   - manifest (required): the already-parsed candidate manifest object
 *   - repoRoot (default: this repo)
 *   - apps (default: all five APPS)
 *   - inspectFn (default: runInspect) -- override lets tests skip shelling out to docker
 */
function runParityCheck({ manifest, repoRoot = REPO_ROOT, apps = APPS, inspectFn = runInspect } = {}) {
  const candidate = validatePromotionCandidate(manifest);
  const candidateSha = candidate.current_staging_sha;

  const results = apps.map((app) => checkApp({ repoRoot, app, candidateSha, inspectFn }));

  return {
    mode: 'manifest',
    candidate_id: candidate.candidate_id,
    candidate_source_sha: candidateSha,
    results,
    ok: results.every((entry) => entry.verdict === 'pass' || entry.verdict === 'skip'),
  };
}

/**
 * Orchestrates one app's version read + PROD-only inspect + the direct-mode verdict -- RF-2, PR
 * #1590 review. No staging inspect at all: the `--source-sha` mode exists precisely for the path
 * that never has a staging predecessor to compare against.
 */
function checkAppDirect({ repoRoot, app, sourceSha, inspectFn }) {
  const versionRaw = readVersionAt(repoRoot, sourceSha, `apps/${app}`);
  if (!versionRaw) {
    return {
      app,
      verdict: 'error',
      code: 'version-unreadable',
      detail: `could not read apps/${app}/package.json version at ${sourceSha} -- is that SHA available locally (git fetch --depth may be too shallow)?`,
    };
  }

  const image = IMAGE_NAME_BY_APP(app);
  const prod = inspectImageLabel({ image, tag: versionRaw, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
  const result = decideDirectParity({ prod, expectedSha: sourceSha });

  return { app, version: versionRaw, ...result };
}

/**
 * Direct/no-staging mode entry point (`--source-sha`) -- RF-2, PR #1590 review. Covers the #1007
 * expedited `develop -> main` override and a main hotfix cut with a known source SHA: neither
 * produces a `to-staging/<candidate_id>` candidate manifest, so `runParityCheck`'s `--manifest`
 * requirement made this path impossible to actually run before this fix.
 *
 * options:
 *   - sourceSha (required): the develop/release SHA this direct promotion was cut from
 *   - repoRoot (default: this repo)
 *   - apps (default: all five APPS)
 *   - inspectFn (default: runInspect) -- override lets tests skip shelling out to docker
 */
function runDirectParityCheck({ sourceSha, repoRoot = REPO_ROOT, apps = APPS, inspectFn = runInspect } = {}) {
  if (!sourceSha) {
    throw new ImageVersionParityError('--source-sha is required for direct/no-staging mode', 'INVALID_ARGS');
  }

  const results = apps.map((app) => checkAppDirect({ repoRoot, app, sourceSha, inspectFn }));

  return {
    mode: 'direct',
    candidate_id: null,
    candidate_source_sha: sourceSha,
    results,
    ok: results.every((entry) => entry.verdict === 'pass' || entry.verdict === 'skip'),
  };
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), manifestPath: '', sourceSha: '', apps: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifestPath = argv[++index] || '';
    } else if (arg === '--source-sha') {
      options.sourceSha = argv[++index] || '';
    } else if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else if (arg === '--apps') {
      const raw = argv[++index] || '';
      options.apps = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      throw new ImageVersionParityError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  if (options.manifestPath && options.sourceSha) {
    throw new ImageVersionParityError('--manifest and --source-sha are mutually exclusive -- pick one mode', 'INVALID_ARGS');
  }
  if (!options.manifestPath && !options.sourceSha) {
    throw new ImageVersionParityError(
      'Missing required option: --manifest <candidate.json> (normal promotion mode) or --source-sha <sha> (direct/#1007/hotfix mode, no staging leg)',
      'INVALID_ARGS',
    );
  }
  return options;
}

function printResult(result) {
  for (const entry of result.results) {
    const label = entry.verdict === 'pass' ? 'PASS' : entry.verdict === 'skip' ? 'SKIP' : entry.verdict === 'error' ? 'ERROR' : 'FAIL';
    const version = entry.version ? ` version=${entry.version}` : '';
    console.log(`[check-image-version-parity] [${label}] ${entry.app}${version} (${entry.code}): ${entry.detail}`);
  }
  const context = result.mode === 'direct'
    ? `mode=direct source_sha=${result.candidate_source_sha}`
    : `candidate=${result.candidate_id} candidate_source_sha=${result.candidate_source_sha}`;
  if (result.ok) {
    console.log(`[check-image-version-parity] PASS. ${context}`);
  } else {
    console.error(`[check-image-version-parity] FAIL. ${context} -- see FAIL/ERROR rows above.`);
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    let result;
    if (options.sourceSha) {
      result = runDirectParityCheck({
        sourceSha: options.sourceSha,
        repoRoot: options.projectRoot,
        apps: options.apps || undefined,
      });
    } else {
      const manifestPath = path.resolve(options.projectRoot, options.manifestPath);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      result = runParityCheck({
        manifest,
        repoRoot: options.projectRoot,
        apps: options.apps || undefined,
      });
    }
    printResult(result);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof ImageVersionParityError || error instanceof PromotionCandidateError || error instanceof SyntaxError || error.code === 'ENOENT') {
      const message = error instanceof SyntaxError ? `Invalid candidate manifest JSON: ${error.message}` : error.message;
      console.error(`[check-image-version-parity] ${error.code || 'PARITY_CHECK_INVALID'}: ${message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  CANDIDATE_SOURCE_LABEL,
  IMAGE_NAME_BY_APP,
  ImageVersionParityError,
  inspectImageLabel,
  decideParity,
  decideDirectParity,
  checkApp,
  checkAppDirect,
  runParityCheck,
  runDirectParityCheck,
  parseArgs,
};
