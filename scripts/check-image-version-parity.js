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
 * staging repairs, or the latest `staging_repair` revision's `sha` once repairs have landed).
 * `.github/workflows/{deploy-api,deploy-migration-runner,deploy-frontend}.yml` stamp this identity
 * into the `CANDIDATE_SOURCE_LABEL` OCI label below at build time, sourced from a
 * `candidate_source_sha` input the promoter threads through `deploy.yml`/`deploy-main.yml` (see
 * `.agents/skills/promoter/references/promotion-runbook.md`).
 *
 * **Resolved PER APP, not as one manifest-wide value (#1610, ADR 0081 Decision 8 amendment).** A
 * staging repair can touch only some apps (`build_api=false` etc. on that repair's STAGING
 * redeploy) -- an app never named in any repair's `apps_touched` never advances past the initial
 * revision's SHA, even after `current_staging_sha` itself moves on for other apps. PROD always
 * rebuilds every app (there is no bare `X.Y.Z` tag to skip rebuilding), so blindly stamping every
 * app with the manifest's single `current_staging_sha` mislabels any app a later repair didn't
 * touch -- its STAGING image still carries the OLDER identity, so PROD must match that, not the
 * candidate's latest one. `check-promotion-candidate.js`'s `resolveCandidateSourceShaByApp()` does
 * this per-app walk; this script calls it once per `runParityCheck()` and compares each app against
 * its own resolved value instead of a single shared one.
 *
 * Two CLI modes, and a shared per-image inspection state machine underneath both:
 *
 *   --manifest <candidate.json>  Normal promotion mode (default `develop -> staging -> main` flow).
 *     Reads and validates the candidate manifest (same shape check-promotion-candidate.js
 *     validates), resolves each app's OWN candidate source identity via
 *     resolveCandidateSourceShaByApp() (#1610 -- not one shared current_staging_sha, see the header
 *     comment above), then for every app (all five by default) reads that app's package.json
 *     version at its own resolved SHA and compares `ghcr.io/sieitzz/<app>:<version>-staging` against
 *     `ghcr.io/sieitzz/<app>:<version>`.
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
 * `decideParity` (manifest mode) outcomes, matching #1588's own spec, the PR #1590 review
 * corrections (RF-2, RF-3), and PR #1612's review (RF-2), which restricts the "no tracked candidate
 * identity" evidence-pass exclusively to decideDirectParity/--source-sha mode -- manifest mode
 * implies a real candidate.json with a to-staging/<id> leg, which always stamps a labeled image on
 * both PROD and STAGING, so an unlabeled/missing image here means a broken dispatch, not #1007/
 * hotfix evidence:
 *   - prod 'ok', staging 'ok', values agree                -> pass ("match")
 *   - prod 'ok', staging 'not-found'                       -> fail ("staging-not-found-in-manifest-
 *                                                              mode", PR #1612 RF-2 -- manifest mode
 *                                                              expects the to-staging/<id> leg's own
 *                                                              staging image to exist; #1007/hotfix
 *                                                              evidence belongs to decideDirectParity
 *                                                              instead, which never reaches here)
 *   - prod 'no-label' (regardless of staging)               -> fail ("prod-no-label-in-manifest-
 *                                                              mode", PR #1612 RF-2 -- same
 *                                                              reasoning, detected on the PROD side;
 *                                                              supersedes PR #1590's RF-2 fix, which
 *                                                              incorrectly passed this in manifest
 *                                                              mode too)
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
 * #1977 (Phase 342) adds a revision-aware layer on top of both modes, without changing the
 * legacy behavior underneath:
 *   - Manifest mode with a `release_revision` resolves each app's matrix tags via
 *     `scripts/resolve-release-tags.js` (frontend staging `X.Y.Z-rN-staging` vs production
 *     `X.Y.Z-rN`; backend the environment-neutral `X.Y.Z-rN` on both sides, i.e. the same
 *     digest reused), compares the candidate-source labels as before, and additionally
 *     verifies each bare production floor alias (`X.Y.Z`) references the same digest as its
 *     revision tag with agreeing `org.dgfy-platform.release-revision` labels
 *     (`decideRevisionParity`/`checkAppRevision`). A manifest with no release revision yet
 *     keeps the legacy `X.Y.Z-staging`/`X.Y.Z` comparison verbatim.
 *   - Direct mode accepts an optional `--revision`: the PROD tag under test becomes the
 *     revision tag and the paired bare alias must reference the same digest (a direct
 *     hotfix increments the patch and still publishes both tags). Without it, the legacy
 *     bare-tag behavior applies. `--revision` with `--manifest` is rejected -- the manifest
 *     is authoritative for its own revision.
 *
 * #2055 (Phase 346) makes the manifest-mode revision per-app, not candidate-wide: a v2
 * manifest's `release_revision` is an apps map (`{ "<app>": { revision, ... } }`), so each
 * app is verified against its OWN allocated `rN` (an app the candidate never rebuilds is
 * absent from the map and reports `skip/app-not-in-candidate` -- it keeps its
 * last-published artifact, nothing new to verify). v1 manifests keep the #1977
 * candidate-wide behavior verbatim.
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

const { validatePromotionCandidate, resolveCandidateSourceShaByApp, PromotionCandidateError } = require('./check-promotion-candidate');
const { isNotFoundError, collectRevisionLabelInfo } = require('./check-tag-immutability');
const { APPS, readVersionAt } = require('./check-app-version-bump');
// #1977 (Phase 342): revision-aware tag matrix (X.Y.Z floor + rN revision tags) and the
// release-revision label the alias check compares.
const { resolveReleaseTags, ReleaseTagsError } = require('./resolve-release-tags');
const { RELEASE_REVISION_LABEL } = require('./promote-image-alias');

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
  // PR #1612 review RF-2: the #1007/hotfix "no tracked candidate identity" case is now covered
  // exclusively by decideDirectParity (--source-sha mode, added by PR #1590's own RF-2). Manifest
  // mode means a real candidate.json exists -- a candidate that went through to-staging/<id> always
  // gets a real per-app candidate_source_sha label stamped on PROD by deploy-main.yml, so an
  // unlabeled PROD image here is not legitimate hotfix evidence, it means the normal-dispatch input
  // was empty/wrong and the parity gate would otherwise wave through unlabeled provenance. Fails
  // instead of silently passing.
  if (prod.state === 'no-label') {
    return {
      verdict: 'fail',
      code: 'prod-no-label-in-manifest-mode',
      detail: `${prod.ref} carries no candidate-source-identity label at all, but manifest mode expects one (a real candidate.json implies a to-staging/<id> leg that always stamps this label) -- this looks like a normal dispatch run with an empty/incorrect candidate_source_sha input, not a #1007/hotfix path (which has its own --source-sha mode and would not reach here). Not a silent pass (ADR 0081 Decision 8).`,
    };
  }

  // prod.state === 'ok' from here on.
  if (staging.state === 'error') {
    return { verdict: 'error', code: 'staging-inspect-error', detail: staging.reason };
  }
  // PR #1612 review RF-2 (supersedes PR #1590's own RF-3 fix): same reasoning as the prod-side
  // no-label case above -- manifest mode implies a real to-staging/<id> leg, which always publishes
  // a labeled staging image at this version. A missing staging predecessor here is not #1007/hotfix
  // evidence (that path has no candidate manifest and uses decideDirectParity instead); it means the
  // expected staging image was never published or was mis-tagged. Fails instead of silently passing.
  if (staging.state === 'not-found') {
    return {
      verdict: 'fail',
      code: 'staging-not-found-in-manifest-mode',
      detail: `${prod.ref} (candidate-source-sha ${prod.value}) has no staging predecessor published at all (${staging.reason}), but manifest mode expects one -- the normal to-staging/<id> leg this candidate manifest implies always publishes a labeled staging image at this version. Not a silent pass (ADR 0081 Decision 8).`,
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

/**
 * Reads one `<image>:<tag>` ref's manifest digest out of `docker buildx imagetools inspect`
 * JSON output. Pure aside from the injected `inspectFn`. Returns
 * { ref, state: 'ok'|'not-found'|'error', digest?, reason? }.
 *
 * #1977 (Phase 342): the production floor alias (`X.Y.Z`) and the revision tag (`X.Y.Z-rN`)
 * must reference the same digest -- this is the read half of that comparison (and of the
 * backend same-digest-reuse check); `decideRevisionParity` below is the verdict half.
 */
function inspectImageDigest({ image, tag, inspectFn }) {
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
  const digest = typeof parsed.digest === 'string' && parsed.digest.trim() ? parsed.digest.trim() : null;
  if (!digest) {
    return { ref, state: 'error', reason: `inspect output for ${ref} carries no image digest -- refusing to compare digests against a digest-less manifest` };
  }
  return { ref, state: 'ok', digest };
}

/**
 * Reads one `<image>:<tag>` ref's agreed release-revision label
 * (`org.dgfy-platform.release-revision`, Phase 342). Pure aside from the injected
 * `inspectFn`. Returns { ref, state: 'ok'|'not-found'|'no-label'|'inconsistent'|'error',
 * value?, reason? } -- same state vocabulary as `inspectImageLabel`, so the verdict
 * function below can treat both uniformly.
 */
function inspectImageRevision({ image, tag, inspectFn }) {
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
  const { found, unreadableCount } = collectRevisionLabelInfo(parsed, RELEASE_REVISION_LABEL);
  const uniqueFound = [...new Set(found)];
  if (uniqueFound.length === 0) {
    return { ref, state: 'no-label', reason: `"${RELEASE_REVISION_LABEL}" label not present anywhere on ${ref}` };
  }
  if (unreadableCount > 0 || uniqueFound.length > 1) {
    return { ref, state: 'inconsistent', reason: `"${RELEASE_REVISION_LABEL}" is missing on at least one platform or disagrees across platforms of ${ref}` };
  }
  return { ref, state: 'ok', value: uniqueFound[0] };
}

/**
 * Pure verdict for one app in manifest mode once the candidate carries a release revision
 * (#1977, Phase 342 -- `release_revision.revision` is the authoritative `rN`).
 *
 * Compares frontend staging `X.Y.Z-rN-staging` to production `X.Y.Z-rN` (backend: the
 * environment-neutral `X.Y.Z-rN` tag on both sides, i.e. the same-digest reuse), then
 * verifies the bare production floor alias (`X.Y.Z`) references the same digest as the
 * revision tag with agreeing revision labels. Outcomes:
 *   - prod 'ok', staging 'ok', values agree, alias digest == prod digest, revisions agree -> pass
 *   - prod 'not-found'                                                                  -> skip
 *   - either label side 'error', or either digest read 'error'                          -> error
 *   - prod 'inconsistent' / 'no-label'                                                  -> fail
 *   - staging 'not-found' / 'no-label' / 'inconsistent', or values disagree             -> fail
 *   - alias 'not-found'                                                                 -> fail ("alias-not-found")
 *   - alias digest differs from prod digest                                             -> fail ("alias-digest-mismatch")
 *   - alias revision missing/disagreeing with prod's                                    -> fail ("alias-revision-mismatch")
 *   - prod revision label naming a different rN than the candidate released             -> fail ("revision-label-mismatch")
 */
function decideRevisionParity({ prod, staging, prodDigest, aliasDigest, prodRevision, aliasRevision, expectedRevision }) {
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
      detail: `production revision image exists but ${prod.reason} -- cannot establish candidate source identity (ADR 0081 Decision 8).`,
    };
  }
  if (prod.state === 'no-label') {
    return {
      verdict: 'fail',
      code: 'prod-no-label-in-manifest-mode',
      detail: `${prod.ref} carries no candidate-source-identity label at all, but manifest mode expects one (ADR 0081 Decision 8).`,
    };
  }
  if (staging.state === 'error') {
    return { verdict: 'error', code: 'staging-inspect-error', detail: staging.reason };
  }
  if (staging.state === 'not-found') {
    return {
      verdict: 'fail',
      code: 'staging-not-found-in-manifest-mode',
      detail: `${prod.ref} (candidate-source-sha ${prod.value}) has no staging predecessor published at all (${staging.reason}) -- the candidate staging dispatch should have published it (#1977).`,
    };
  }
  if (staging.state === 'no-label' || staging.state === 'inconsistent') {
    return {
      verdict: 'fail',
      code: 'staging-unreadable',
      detail: `staging image ${staging.ref} exists but ${staging.reason} -- the candidate staging dispatch always stamps a candidate-source-sha, so this is a label-stamping regression (#1977).`,
    };
  }
  if (staging.value !== prod.value) {
    return {
      verdict: 'fail',
      code: 'mismatch',
      detail: `${staging.ref} carries candidate-source-sha ${staging.value}, but ${prod.ref} carries ${prod.value} -- these should be the same frozen candidate (ADR 0081 Decision 8).`,
    };
  }
  if (prodDigest.state === 'error') {
    return { verdict: 'error', code: 'prod-digest-error', detail: prodDigest.reason };
  }
  if (prodDigest.state === 'not-found') {
    return { verdict: 'error', code: 'prod-digest-error', detail: `production revision tag vanished between label and digest reads (${prodDigest.reason}) -- refusing to guess.` };
  }
  if (aliasDigest.state === 'not-found') {
    return {
      verdict: 'fail',
      code: 'alias-not-found',
      detail: `bare production alias ${aliasDigest.ref} has not been published -- every PROD revision tag must gain its immutable X.Y.Z alias from the same digest (#1977).`,
    };
  }
  if (aliasDigest.state === 'error') {
    return { verdict: 'error', code: 'alias-inspect-error', detail: aliasDigest.reason };
  }
  if (aliasDigest.digest !== prodDigest.digest) {
    return {
      verdict: 'fail',
      code: 'alias-digest-mismatch',
      detail: `bare production alias ${aliasDigest.ref} references ${aliasDigest.digest}, but revision tag ${prodDigest.ref} references ${prodDigest.digest} -- alias and revision tag must reference the same digest (#1977).`,
    };
  }
  if (prodRevision.state !== 'ok') {
    return {
      verdict: 'fail',
      code: 'alias-revision-mismatch',
      detail: `production revision tag ${prodRevision.ref} carries no agreed release-revision label (${prodRevision.reason || prodRevision.state}) -- cannot prove alias identity (#1977).`,
    };
  }
  // The revision label must name THIS candidate's own revision -- an image stamped with a
  // different rN is a different candidate's artifact, not this one's, even when every digest
  // above happens to line up.
  if (expectedRevision && prodRevision.value !== expectedRevision) {
    return {
      verdict: 'fail',
      code: 'revision-label-mismatch',
      detail: `production revision tag ${prodRevision.ref} carries release-revision "${prodRevision.value}", but the candidate released ${expectedRevision} -- this image belongs to a different candidate revision (#1977).`,
    };
  }
  if (aliasRevision.state !== 'ok' || aliasRevision.value !== prodRevision.value) {
    return {
      verdict: 'fail',
      code: 'alias-revision-mismatch',
      detail: `bare production alias ${aliasRevision.ref} carries revision "${aliasRevision.value || aliasRevision.state}", but revision tag carries "${prodRevision.value}" -- alias and revision tag must agree (#1977).`,
    };
  }
  return { verdict: 'pass', code: 'match', detail: `${staging.ref} and ${prod.ref} share candidate-source-sha ${prod.value}; alias ${aliasDigest.ref} references the same digest ${prodDigest.digest} (${prodRevision.value}).` };
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

  // candidate_source_sha here is THIS app's own resolved identity (#1610) -- may differ from the
  // top-level runParityCheck() result's candidate_source_sha, which is only overall candidate
  // context (the manifest's latest current_staging_sha), not what every app was compared against.
  return { app, version: versionRaw, candidate_source_sha: candidateSha, ...result };
}

/**
 * Orchestrates one app's revision-aware parity (manifest mode with a release revision --
 * #1977, Phase 342). Reads the bare floor version at the app's own resolved candidate SHA,
 * derives the matrix tags via `resolveReleaseTags`, then runs the label + digest + alias
 * verdict above. Returns { app, version, revision, candidate_source_sha, verdict, code,
 * detail }.
 */
function checkAppRevision({ repoRoot, app, revision, candidateSha, inspectFn }) {
  const versionRaw = readVersionAt(repoRoot, candidateSha, `apps/${app}`);
  if (!versionRaw) {
    return {
      app,
      verdict: 'error',
      code: 'version-unreadable',
      detail: `could not read apps/${app}/package.json version at ${candidateSha} -- is that SHA available locally (git fetch --depth may be too shallow)?`,
    };
  }
  let tags;
  try {
    tags = resolveReleaseTags({ app, version: versionRaw, environment: 'PROD', revision });
  } catch (error) {
    return {
      app,
      version: versionRaw,
      verdict: 'error',
      code: 'revision-tags-invalid',
      detail: `could not resolve #1977 revision tags for ${app}@${versionRaw} r${revision}: ${error.message}`,
    };
  }
  const image = IMAGE_NAME_BY_APP(app);
  const prod = inspectImageLabel({ image, tag: tags.productionTag, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
  const staging = inspectImageLabel({ image, tag: tags.stagingTag, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
  const prodDigest = inspectImageDigest({ image, tag: tags.productionTag, inspectFn });
  const aliasDigest = inspectImageDigest({ image, tag: tags.canonicalAlias, inspectFn });
  const prodRevision = inspectImageRevision({ image, tag: tags.productionTag, inspectFn });
  const aliasRevision = inspectImageRevision({ image, tag: tags.canonicalAlias, inspectFn });
  const result = decideRevisionParity({ prod, staging, prodDigest, aliasDigest, prodRevision, aliasRevision, expectedRevision: `r${revision}` });

  return { app, version: versionRaw, revision, candidate_source_sha: candidateSha, ...result };
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
  // #1610: per-app resolution, not one shared current_staging_sha -- see the file header comment.
  const candidateShaByApp = resolveCandidateSourceShaByApp(manifest, apps);

  // #1977 (Phase 342): once the candidate carries a release revision, the manifest's
  // `release_revision.revision` is the authoritative candidate-wide `rN` -- compare frontend
  // staging `X.Y.Z-rN-staging` to production `X.Y.Z-rN`, the backend candidate digest reused
  // across environments, and each bare production alias against its revision tag. A candidate
  // with no release revision yet (still in staging qualification) keeps the legacy
  // `X.Y.Z-staging`/`X.Y.Z` comparison -- nothing revision-tagged exists to verify.
  //
  // #2055 (Phase 346): a v2 manifest's `release_revision` is a per-app map, so each app is
  // verified against its OWN allocated revision. Apps absent from the map were never
  // rebuilt by this candidate -- skip, don't fail: their last-published artifact stands.
  const releaseRevision = candidate.release_revision;
  const perAppRevisions = (manifest.schema === 'sku-release-candidate/v2' && releaseRevision !== null) ? releaseRevision : null;
  const results = apps.map((app) => {
    if (perAppRevisions) {
      const entry = perAppRevisions[app];
      if (!entry) {
        return {
          app,
          version: null,
          revision: null,
          candidate_source_sha: candidateShaByApp[app],
          verdict: 'skip',
          code: 'app-not-in-candidate',
          detail: `${app} is absent from this candidate's per-app release_revision map -- the candidate never rebuilt it, so its last-published artifact stands and there is nothing new to verify (#2055).`,
        };
      }
      return checkAppRevision({ repoRoot, app, revision: entry.revision, candidateSha: candidateShaByApp[app], inspectFn });
    }
    return releaseRevision === null
      ? checkApp({ repoRoot, app, candidateSha: candidateShaByApp[app], inspectFn })
      : checkAppRevision({ repoRoot, app, revision: releaseRevision, candidateSha: candidateShaByApp[app], inspectFn });
  });

  return {
    mode: 'manifest',
    candidate_id: candidate.candidate_id,
    // Overall candidate context only -- NOT necessarily what any individual app was compared
    // against; see each result entry's own candidate_source_sha for that (#1610).
    candidate_source_sha: candidate.current_staging_sha,
    release_revision: releaseRevision,
    results,
    ok: results.every((entry) => entry.verdict === 'pass' || entry.verdict === 'skip'),
  };
}

/**
 * Orchestrates one app's version read + PROD-only inspect + the direct-mode verdict -- RF-2, PR
 * #1590 review. No staging inspect at all: the `--source-sha` mode exists precisely for the path
 * that never has a staging predecessor to compare against.
 */
function checkAppDirect({ repoRoot, app, sourceSha, revision, inspectFn }) {
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
  // #1977 (Phase 342): a direct production hotfix increments the patch and uses the same
  // paired revision/canonical tags (`X.Y.Z-rN` + alias `X.Y.Z`) without a staging parity
  // predecessor. When --revision is supplied, the PROD tag under test is the revision tag
  // and the bare alias must reference the same digest; without it, the legacy bare-tag
  // behavior applies (a hotfix cut before revision threading existed).
  let prodTag = versionRaw;
  let aliasCheck = null;
  if (revision !== undefined && revision !== null) {
    let tags;
    try {
      tags = resolveReleaseTags({ app, version: versionRaw, environment: 'PROD', revision });
    } catch (error) {
      return {
        app,
        version: versionRaw,
        verdict: 'error',
        code: 'revision-tags-invalid',
        detail: `could not resolve #1977 revision tags for ${app}@${versionRaw} r${revision}: ${error.message}`,
      };
    }
    prodTag = tags.productionTag;
    aliasCheck = { aliasTag: tags.canonicalAlias, revisionTag: tags.productionTag };
  }
  const prod = inspectImageLabel({ image, tag: prodTag, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
  const result = decideDirectParity({ prod, expectedSha: sourceSha });
  if (!aliasCheck || (result.verdict !== 'pass' && result.verdict !== 'fail')) {
    return { app, version: versionRaw, revision: revision ?? null, ...result };
  }
  if (result.verdict === 'fail') {
    return { app, version: versionRaw, revision: revision ?? null, ...result };
  }
  const prodDigest = inspectImageDigest({ image, tag: aliasCheck.revisionTag, inspectFn });
  const aliasDigest = inspectImageDigest({ image, tag: aliasCheck.aliasTag, inspectFn });
  if (prodDigest.state === 'error' || aliasDigest.state === 'error') {
    return {
      app,
      version: versionRaw,
      revision: revision ?? null,
      verdict: 'error',
      code: 'alias-inspect-error',
      detail: (prodDigest.reason || aliasDigest.reason),
    };
  }
  if (aliasDigest.state === 'not-found') {
    return {
      app,
      version: versionRaw,
      revision: revision ?? null,
      verdict: 'fail',
      code: 'alias-not-found',
      detail: `bare production alias ${aliasDigest.ref} has not been published -- a direct hotfix must still publish the paired X.Y.Z alias from the same digest (#1977).`,
    };
  }
  if (prodDigest.state === 'ok' && aliasDigest.state === 'ok' && aliasDigest.digest !== prodDigest.digest) {
    return {
      app,
      version: versionRaw,
      revision: revision ?? null,
      verdict: 'fail',
      code: 'alias-digest-mismatch',
      detail: `bare production alias ${aliasDigest.ref} references ${aliasDigest.digest}, but revision tag ${prodDigest.ref} references ${prodDigest.digest} -- alias and revision tag must reference the same digest (#1977).`,
    };
  }

  return { app, version: versionRaw, revision: revision ?? null, ...result };
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
function runDirectParityCheck({ sourceSha, revision, repoRoot = REPO_ROOT, apps = APPS, inspectFn = runInspect } = {}) {
  if (!sourceSha) {
    throw new ImageVersionParityError('--source-sha is required for direct/no-staging mode', 'INVALID_ARGS');
  }

  const results = apps.map((app) => checkAppDirect({ repoRoot, app, sourceSha, revision, inspectFn }));

  return {
    mode: 'direct',
    candidate_id: null,
    candidate_source_sha: sourceSha,
    revision: revision ?? null,
    results,
    ok: results.every((entry) => entry.verdict === 'pass' || entry.verdict === 'skip'),
  };
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), manifestPath: '', sourceSha: '', revision: null, apps: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifestPath = argv[++index] || '';
    } else if (arg === '--source-sha') {
      options.sourceSha = argv[++index] || '';
    } else if (arg === '--revision') {
      options.revision = argv[++index] || '';
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
  // #1977 (Phase 342): the candidate manifest is authoritative for its own revision -- an
  // explicit --revision alongside --manifest would let a caller verify against a different rN
  // than the candidate actually released. Pair --revision with --source-sha only.
  if (options.manifestPath && options.revision !== null) {
    throw new ImageVersionParityError('--revision is only valid with --source-sha (manifest mode reads the authoritative release_revision.revision from the manifest itself)', 'INVALID_ARGS');
  }
  return options;
}

function printResult(result) {
  for (const entry of result.results) {
    const label = entry.verdict === 'pass' ? 'PASS' : entry.verdict === 'skip' ? 'SKIP' : entry.verdict === 'error' ? 'ERROR' : 'FAIL';
    const version = entry.version ? ` version=${entry.version}` : '';
    // entry.candidate_source_sha (manifest mode only, #1610) is THIS app's own resolved identity --
    // print it so a mismatch is immediately legible without cross-referencing the manifest by hand.
    const candidateSha = result.mode === 'manifest' && entry.candidate_source_sha ? ` candidate_source_sha=${entry.candidate_source_sha}` : '';
    // #1977: the revision under test, when the run is revision-aware.
    const revision = entry.revision !== undefined && entry.revision !== null ? ` revision=r${entry.revision}` : '';
    console.log(`[check-image-version-parity] [${label}] ${entry.app}${version}${candidateSha}${revision} (${entry.code}): ${entry.detail}`);
  }
  // #2055: a v2 manifest's release_revision is a per-app map -- summarize per app instead of
  // stringifying the object into the context line.
  const releaseRevision = result.release_revision;
  const revisionContext = releaseRevision === undefined || releaseRevision === null ? ''
    : typeof releaseRevision === 'object'
      ? ` release_revision={${Object.entries(releaseRevision).map(([app, entry]) => `${app}:r${entry.revision}`).join(',')}}`
      : ` release_revision=r${releaseRevision}`;
  const directRevision = result.revision !== undefined && result.revision !== null ? ` revision=r${result.revision}` : '';
  const context = result.mode === 'direct'
    ? `mode=direct source_sha=${result.candidate_source_sha}${directRevision}`
    : `candidate=${result.candidate_id} candidate_source_sha=${result.candidate_source_sha}${revisionContext}`;
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
        revision: options.revision,
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
    if (error instanceof ImageVersionParityError || error instanceof PromotionCandidateError || error instanceof ReleaseTagsError || error instanceof SyntaxError || error.code === 'ENOENT') {
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
  inspectImageDigest,
  inspectImageRevision,
  decideParity,
  decideDirectParity,
  decideRevisionParity,
  checkApp,
  checkAppRevision,
  checkAppDirect,
  runParityCheck,
  runDirectParityCheck,
  parseArgs,
};
