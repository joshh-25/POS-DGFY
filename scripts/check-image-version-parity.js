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
 * Three outcomes per app, matching #1588's own spec:
 *   - both images exist and the label agrees             -> pass ("match")
 *   - the prod image exists but has no staging predecessor
 *     carrying this label                                -> pass ("no-staging-predecessor" --
 *                                                             expected evidence of a #1007 expedited
 *                                                             promotion or a main hotfix, not a
 *                                                             defect, per Decision 8's own text)
 *   - both images exist and the label disagrees           -> fail ("mismatch")
 * Plus two non-blocking/error states: the prod tag has not been published at all yet ("skip" -- there
 * is nothing to verify), and an inspect call failing for a reason that is not "tag not found" (auth,
 * network, registry outage -- "error", refusing to guess rather than silently passing).
 *
 * Read-only: only ever runs `docker buildx imagetools inspect`, never a push -- same classification
 * as `scripts/check-tag-immutability.js`'s own inspect step, no new checkpoint (see
 * `.agents/skills/promoter/SKILL.md`'s "Unattended vs. checkpoint" table).
 *
 * The multi-platform label-collection logic (`collectRevisionLabelInfo`/`resolveRevisionLabels`) is
 * reused directly from `check-tag-immutability.js` rather than re-implemented -- both scripts read
 * OCI labels out of the same `docker buildx imagetools inspect --format '{{json .}}'` shape, and
 * `resolveRevisionLabels` already takes an arbitrary `labelKey`, not just the revision label it was
 * originally written for.
 *
 * CLI:
 *   node scripts/check-image-version-parity.js --manifest <candidate.json> [--project-root <dir>]
 *     [--apps dgfy-api,dgfy-pos,...]
 *
 *   Reads and validates the candidate manifest (same shape check-promotion-candidate.js validates),
 *   resolves its `current_staging_sha` as the candidate source identity, then for every app (all
 *   five by default) reads that app's package.json version at that SHA and inspects both
 *   `ghcr.io/sieitzz/<app>:<version>-staging` and `ghcr.io/sieitzz/<app>:<version>`.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { validatePromotionCandidate, PromotionCandidateError } = require('./check-promotion-candidate');
const { isNotFoundError, collectRevisionLabelInfo, resolveRevisionLabels } = require('./check-tag-immutability');
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
 * Returns { ref, state: 'ok'|'not-found'|'unreadable'|'error', value?, reason? }.
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

  const resolved = resolveRevisionLabels(parsed, labelKey);
  if (resolved.status === 'none') {
    return { ref, state: 'unreadable', reason: `"${labelKey}" label not present anywhere on ${ref}` };
  }
  if (resolved.status === 'unreadable') {
    return { ref, state: 'unreadable', reason: `"${labelKey}" is missing/empty on at least one platform of ${ref} (readable elsewhere: ${resolved.found.length ? resolved.found.join(', ') : 'none'})` };
  }
  if (resolved.status === 'disagree') {
    return { ref, state: 'unreadable', reason: `"${labelKey}" disagrees across platforms of ${ref} (${resolved.revisions.join(', ')})` };
  }
  return { ref, state: 'ok', value: resolved.revision };
}

/**
 * Pure verdict function for one app, given its already-inspected prod and staging label results.
 * Returns { verdict: 'pass'|'fail'|'skip'|'error', code, detail }.
 */
function decideParity({ prod, staging }) {
  if (prod.state === 'not-found') {
    return { verdict: 'skip', code: 'prod-not-found', detail: `${prod.ref} has not been published yet -- nothing to verify.` };
  }
  if (prod.state === 'error') {
    return { verdict: 'error', code: 'prod-inspect-error', detail: prod.reason };
  }
  if (prod.state === 'unreadable') {
    return {
      verdict: 'fail',
      code: 'prod-unreadable',
      detail: `production image exists but ${prod.reason} -- cannot establish candidate source identity (ADR 0081 Decision 8).`,
    };
  }

  // prod.state === 'ok' from here on.
  if (staging.state === 'error') {
    return { verdict: 'error', code: 'staging-inspect-error', detail: staging.reason };
  }
  if (staging.state === 'not-found' || staging.state === 'unreadable') {
    return {
      verdict: 'pass',
      code: 'no-staging-predecessor',
      detail: `${prod.ref} (candidate-source-sha ${prod.value}) has no comparable staging predecessor under this identity (${staging.reason}) -- expected evidence of a #1007 expedited promotion or a main hotfix, not a defect (ADR 0081 Decision 8).`,
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

/** Orchestrates one app's version read + both inspects + the verdict. */
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
    candidate_id: candidate.candidate_id,
    candidate_source_sha: candidateSha,
    results,
    ok: results.every((entry) => entry.verdict === 'pass' || entry.verdict === 'skip'),
  };
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), manifestPath: '', apps: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifestPath = argv[++index] || '';
    } else if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else if (arg === '--apps') {
      const raw = argv[++index] || '';
      options.apps = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      throw new ImageVersionParityError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  if (!options.manifestPath) throw new ImageVersionParityError('Missing required option: --manifest', 'INVALID_ARGS');
  return options;
}

function printResult(result) {
  for (const entry of result.results) {
    const label = entry.verdict === 'pass' ? 'PASS' : entry.verdict === 'skip' ? 'SKIP' : entry.verdict === 'error' ? 'ERROR' : 'FAIL';
    const version = entry.version ? ` version=${entry.version}` : '';
    console.log(`[check-image-version-parity] [${label}] ${entry.app}${version} (${entry.code}): ${entry.detail}`);
  }
  if (result.ok) {
    console.log(`[check-image-version-parity] PASS. candidate=${result.candidate_id} candidate_source_sha=${result.candidate_source_sha}`);
  } else {
    console.error(`[check-image-version-parity] FAIL. candidate=${result.candidate_id} candidate_source_sha=${result.candidate_source_sha} -- see FAIL/ERROR rows above.`);
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifestPath = path.resolve(options.projectRoot, options.manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const result = runParityCheck({
      manifest,
      repoRoot: options.projectRoot,
      apps: options.apps || undefined,
    });
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
  checkApp,
  runParityCheck,
  parseArgs,
};
