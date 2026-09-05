#!/usr/bin/env node
/**
 * Tag-immutability guard -- ADR 0081 Decision 7 (the ADR's one `[binding]` clause), #1575 (epic
 * #1548 Wave 3, Phase 277).
 *
 * A published version tag (`<app>:X.Y.Z[-channel]`) must never be silently overwritten with a
 * different revision. Before a builder workflow publishes a version tag, this script:
 *
 *   1. Queries the registry for the tag's *current* published image (`docker buildx imagetools
 *      inspect`), if any.
 *   2. Reads that image's `org.opencontainers.image.revision` label.
 *   3. Compares it against the revision (`github.sha`) this build is about to publish.
 *
 * Four outcomes:
 *   - the tag doesn't exist yet                                -> push (first publish)
 *   - it exists and carries the SAME revision                  -> push (idempotent re-dispatch, allowed)
 *   - it exists and carries a DIFFERENT revision                -> refuse, fail loudly (the invariant)
 *   - inspect fails for a reason that isn't "not found" (auth, network, registry outage) -> refuse
 *     and fail loudly too -- treating an unclassified error as "doesn't exist" would silently
 *     defeat the whole guard the one time it's needed most (a real registry hiccup racing a real
 *     conflicting push).
 *
 * On a "push" verdict, the script itself performs the publish -- a cheap, registry-side
 * `docker buildx imagetools create` that retags an *already-pushed* digest (this build's moving-tag
 * + sha-tag push, which ran moments earlier in the same job) as the version tag. No rebuild, no
 * layer re-upload. This deliberately decouples the version-tag publish from the moving-tag/sha-tag
 * publish (ADR 0081 Decision 2: "nothing on the deploy path changes as a result of this ADR
 * alone") -- a refused version tag fails this script/step, but the moving tag and sha tag it ran
 * after have already landed and are unaffected by the refusal.
 *
 * The label-extraction (`collectRevisionLabelInfo`/`resolveRevisionLabels`) and verdict logic
 * (`decideImmutability`) below are pure and exported for tests -- tests inject canned `docker buildx
 * imagetools inspect` JSON/stderr fixtures rather than hitting a real registry. `docker buildx
 * imagetools inspect --format '{{json .}}'` output shape differs between a single-platform image
 * (dgfy-api, dgfy-ims, dgfy-pos, dgfy-storefront -- one `Labels` object, at `.Image.Config.Labels`)
 * and a multi-platform index (dgfy-migration-runner, built `linux/amd64,linux/arm64` -- `.Image` is
 * keyed per platform, one `Labels` object per platform, e.g. `.Image["linux/amd64"].config.Labels`
 * and `.Image["linux/arm64"].config.Labels` separately). `collectRevisionLabelInfo` walks the whole
 * parsed structure and collects the revision label from *every* `Labels`/`labels` object it finds,
 * not just the first (PR #1577 review, RF-2 -- picking only the first let a second, differently-
 * revisioned platform slip past undetected, which defeats Decision 7 for exactly the multi-platform
 * case the ADR calls out). `resolveRevisionLabels` then classifies that collection into one verdict:
 * no label anywhere, a label missing/empty on at least one platform ("unreadable"), the platforms'
 * labels disagreeing with each other ("disagree"), or a single value every platform agrees on
 * ("agree") -- the first three all refuse regardless of what `currentRevision` is; only "agree" goes
 * on to the same same/different-from-`currentRevision` comparison as before.
 *
 * CLI:
 *   node scripts/check-tag-immutability.js --image <ref, no tag> --tag <X.Y.Z[-channel]> \
 *     --revision <current build's github.sha> --digest <this build's already-pushed digest, e.g.
 *     "sha256:..." or "ghcr.io/sieitzz/dgfy-api@sha256:..."> [--skip-create]
 *
 *   --skip-create prints the verdict and exits 0/1 without ever running `imagetools create` --
 *   for local/manual smoke checks, never used by a real CI dispatch (which always needs the actual
 *   publish to happen on a push verdict).
 */

const { spawnSync } = require('node:child_process');

const REVISION_LABEL = 'org.opencontainers.image.revision';

const NOT_FOUND_PATTERNS = [
  /not found/i,
  /\b404\b/,
  /manifest unknown/i,
  /no such manifest/i,
];

// 401/403 are deliberately NOT treated as "safe to push" -- an auth failure means we genuinely
// don't know whether the tag exists, which is the "unclassified error" case that must refuse, not
// the "confirmed absent" case that may push. Checked first so a message that happens to also
// contain a NOT_FOUND_PATTERNS substring (unlikely, but not impossible from a registry's own error
// prose) still refuses rather than pushes.
const AUTH_FAILURE_PATTERNS = [/\b401\b/, /\b403\b/, /unauthorized/i, /forbidden/i];

function isNotFoundError(stderr) {
  const text = String(stderr || '');
  if (AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Recursively walks a parsed `docker buildx imagetools inspect --format '{{json .}}'` structure and
 * collects `labelKey` from *every* `Labels`/`labels` object it finds anywhere in the tree (not just
 * the first) -- see the file header for why (multi-platform images carry one such object per
 * platform). Accumulates into `acc` rather than returning a fresh array per call, so recursion stays
 * a single pass: `found` collects each non-empty label value seen; `unreadableCount` counts each
 * `Labels`/`labels` object encountered that does NOT carry a non-empty value for `labelKey` (present
 * key with falsy/empty value, or key absent from that particular Labels object) -- a platform whose
 * own image config exists but never got labeled is exactly the "unreadable" case RF-2 asks to
 * refuse on, distinct from "no Labels object exists anywhere at all" (see `resolveRevisionLabels`).
 */
function collectRevisionLabelInfo(node, labelKey = REVISION_LABEL, acc = { found: [], unreadableCount: 0 }) {
  if (node === null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectRevisionLabelInfo(item, labelKey, acc);
    return acc;
  }
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'Labels' || key === 'labels') && value && typeof value === 'object' && !Array.isArray(value)) {
      if (value[labelKey]) {
        acc.found.push(value[labelKey]);
      } else {
        acc.unreadableCount += 1;
      }
    }
    if (value && typeof value === 'object') {
      collectRevisionLabelInfo(value, labelKey, acc);
    }
  }
  return acc;
}

/**
 * Classifies `collectRevisionLabelInfo`'s accumulation into exactly one verdict:
 *   { status: 'none' }                    -- no Labels object carrying labelKey found anywhere
 *   { status: 'unreadable', found }        -- at least one Labels object was missing/empty for
 *                                             labelKey, even if others had it (`found` lists what
 *                                             the readable ones said, for the refusal message)
 *   { status: 'disagree', revisions }      -- two or more Labels objects, with DIFFERENT values
 *   { status: 'agree', revision }          -- one or more Labels objects, all the SAME value
 * Only 'agree' is ever eligible to push -- 'none'/'unreadable'/'disagree' all refuse regardless of
 * currentRevision (see decideImmutability).
 */
function resolveRevisionLabels(node, labelKey = REVISION_LABEL) {
  const { found, unreadableCount } = collectRevisionLabelInfo(node, labelKey);
  if (found.length === 0 && unreadableCount === 0) {
    return { status: 'none' };
  }
  if (unreadableCount > 0) {
    return { status: 'unreadable', found: [...new Set(found)] };
  }
  const unique = [...new Set(found)];
  if (unique.length > 1) {
    return { status: 'disagree', revisions: unique };
  }
  return { status: 'agree', revision: unique[0] };
}

/**
 * Pure verdict function -- takes the raw result of attempting `docker buildx imagetools inspect`
 * (never the shelling-out itself) plus the current build's revision, and returns one of:
 *   { action: 'push',   reason, existingRevision? }  -- tag absent, or present with the same revision
 *   { action: 'refuse', reason, existingRevision? }  -- present with a different revision (the invariant)
 *   { action: 'error',  reason }                     -- inspect failed for an unclassified reason,
 *                                                        or no current revision was supplied at all
 */
function decideImmutability({ inspectStatus, inspectStdout, inspectStderr, currentRevision }) {
  if (!currentRevision) {
    return { action: 'error', reason: 'no current revision (github.sha) was provided -- refusing to guess' };
  }

  if (inspectStatus !== 0) {
    if (isNotFoundError(inspectStderr)) {
      return {
        action: 'push',
        reason: `tag does not exist yet (inspect: ${String(inspectStderr || '').trim().slice(0, 200)})`,
      };
    }
    return {
      action: 'error',
      reason: `docker buildx imagetools inspect failed for a reason that is not "tag not found" -- refusing rather than assuming absence: ${String(inspectStderr || '').trim().slice(0, 500)}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(inspectStdout);
  } catch (error) {
    return { action: 'error', reason: `could not parse "docker buildx imagetools inspect" JSON output: ${error.message}` };
  }

  const resolved = resolveRevisionLabels(parsed);

  if (resolved.status === 'none') {
    return {
      action: 'refuse',
      reason: `tag exists but its "${REVISION_LABEL}" label could not be read -- refusing rather than risking a silent overwrite`,
      existingRevision: null,
    };
  }

  if (resolved.status === 'unreadable') {
    return {
      action: 'refuse',
      reason: `tag exists but its "${REVISION_LABEL}" label is missing/empty on at least one platform or config entry (readable elsewhere: ${resolved.found.length ? resolved.found.join(', ') : 'none'}) -- refusing rather than risking a partial overwrite`,
      existingRevision: null,
    };
  }

  if (resolved.status === 'disagree') {
    return {
      action: 'refuse',
      reason: `tag exists but its "${REVISION_LABEL}" label disagrees across platforms/config entries (${resolved.revisions.join(', ')}) -- refusing rather than risking an inconsistent overwrite (ADR 0081 Decision 7)`,
      existingRevision: null,
    };
  }

  const existingRevision = resolved.revision;

  if (existingRevision === currentRevision) {
    return { action: 'push', reason: `idempotent re-dispatch of the same revision (${existingRevision})`, existingRevision };
  }

  return {
    action: 'refuse',
    reason: `tag already published for revision ${existingRevision}, this build is ${currentRevision} -- ADR 0081 Decision 7 refuses the overwrite`,
    existingRevision,
  };
}

function parseArgs(argv) {
  const options = { image: '', tag: '', revision: '', digest: '', skipCreate: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--image') { options.image = argv[i + 1] || ''; i += 1; }
    else if (arg === '--tag') { options.tag = argv[i + 1] || ''; i += 1; }
    else if (arg === '--revision') { options.revision = argv[i + 1] || ''; i += 1; }
    else if (arg === '--digest') { options.digest = argv[i + 1] || ''; i += 1; }
    else if (arg === '--skip-create') { options.skipCreate = true; }
    else { throw new Error(`Unknown argument: ${arg}`); }
  }
  for (const key of ['image', 'tag', 'revision']) {
    if (!options[key]) throw new Error(`--${key} is required`);
  }
  return options;
}

function runInspect(imageRef) {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', imageRef, '--format', '{{json .}}'], {
    encoding: 'utf8',
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function runCreate(targetTag, digestRef) {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'create', '--tag', targetTag, digestRef], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  return result.status === 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const imageRef = `${options.image}:${options.tag}`;
  const inspectResult = runInspect(imageRef);
  const verdict = decideImmutability({
    inspectStatus: inspectResult.status,
    inspectStdout: inspectResult.stdout,
    inspectStderr: inspectResult.stderr,
    currentRevision: options.revision,
  });

  console.log(`[check-tag-immutability] ${imageRef}: ${verdict.action} -- ${verdict.reason}`);

  if (verdict.action !== 'push') {
    console.error(`::error::Refusing to publish version tag "${imageRef}": ${verdict.reason}`);
    process.exit(1);
  }

  if (options.skipCreate) {
    console.log('[check-tag-immutability] --skip-create set, not calling `docker buildx imagetools create`.');
    return;
  }

  if (!options.digest) {
    console.error('::error::--digest is required to actually publish the version tag (omit only with --skip-create).');
    process.exit(1);
  }

  const digestRef = options.digest.includes('@') ? options.digest : `${options.image}@${options.digest}`;
  const created = runCreate(imageRef, digestRef);
  if (!created) {
    console.error(`::error::"docker buildx imagetools create --tag ${imageRef} ${digestRef}" failed.`);
    process.exit(1);
  }
  console.log(`[check-tag-immutability] published ${imageRef} -> ${digestRef}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  REVISION_LABEL,
  isNotFoundError,
  collectRevisionLabelInfo,
  resolveRevisionLabels,
  decideImmutability,
  parseArgs,
  // #1610: exported so scripts/resolve-build-skip-plan.js reuses the actual `docker buildx
  // imagetools inspect` call, not just this file's pure decision logic -- no behavior change.
  runInspect,
};
