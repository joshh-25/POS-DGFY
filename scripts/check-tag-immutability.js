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
 * The label-extraction (`findRevisionLabel`) and verdict logic (`decideImmutability`) below are
 * pure and exported for tests -- tests inject canned `docker buildx imagetools inspect` JSON/stderr
 * fixtures rather than hitting a real registry. `docker buildx imagetools inspect --format
 * '{{json .}}'` output shape differs between a single-platform image (dgfy-api, dgfy-ims, dgfy-pos,
 * dgfy-storefront -- labels sit at `.Image.Config.Labels`) and a multi-platform index
 * (dgfy-migration-runner, built `linux/amd64,linux/arm64` -- `.Image` is keyed per platform, e.g.
 * `.Image["linux/amd64"].config.Labels`). `findRevisionLabel` searches the whole parsed structure
 * for any `Labels`/`labels` object carrying the revision key instead of hardcoding one shape, so it
 * doesn't need to track buildx's exact template-output schema per version or per platform-count.
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
 * Recursively searches a parsed `docker buildx imagetools inspect --format '{{json .}}'` structure
 * for the first `Labels`/`labels` object that carries `labelKey`, and returns its value. See the
 * file header for why this is shape-agnostic rather than keyed to one fixed path.
 */
function findRevisionLabel(node, labelKey = REVISION_LABEL) {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRevisionLabel(item, labelKey);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      (key === 'Labels' || key === 'labels') &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, labelKey)
    ) {
      return value[labelKey] || null;
    }
  }
  for (const value of Object.values(node)) {
    const found = findRevisionLabel(value, labelKey);
    if (found) return found;
  }
  return null;
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

  const existingRevision = findRevisionLabel(parsed);
  if (!existingRevision) {
    return {
      action: 'refuse',
      reason: `tag exists but its "${REVISION_LABEL}" label could not be read -- refusing rather than risking a silent overwrite`,
      existingRevision: null,
    };
  }

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
  findRevisionLabel,
  decideImmutability,
  parseArgs,
};
