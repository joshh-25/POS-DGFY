#!/usr/bin/env node
/**
 * Digest-based image-alias promotion -- issue #1977 (Phase 341).
 *
 * Backend PROD reuses the staging candidate digest instead of rebuilding
 * (`X.Y.Z-rN` is environment-neutral for `dgfy-api`/`dgfy-migration-runner`), and every
 * app's bare production floor alias (`X.Y.Z`) must reference the same digest as its
 * revision tag (`X.Y.Z-rN`). This script creates such an alias safely:
 *
 *   1. Inspects the source (revision tag) manifest: digest + revision labels.
 *   2. Inspects the target (alias) tag, if it exists.
 *   3. Refuses when the target already exists with a DIFFERENT digest or revision
 *      (an overwrite would rewrite history -- the same fail-closed instinct as ADR 0081
 *      Decision 7's guard, applied to alias creation rather than version-tag publishing).
 *   4. Creates the alias (registry-side `docker buildx imagetools create`, no rebuild,
 *      no layer re-upload) only when the target is absent or already identical.
 *
 * Read-only until the final create: both inspects are `docker buildx imagetools inspect`,
 * the same classification as `scripts/check-tag-immutability.js`'s inspect step.
 *
 * Label contract (stamped by the builder workflows, Phase 341):
 *   - `org.opencontainers.image.version` -- the immutable revision tag (e.g. `1.13.0-r16`).
 *   - `org.dgfy-platform.release-floor` -- the bare production floor (e.g. `1.13.0`).
 *   - `org.dgfy-platform.release-revision` -- the candidate revision fragment (e.g. `r16`).
 *
 * Pure functions (`resolveAliasTargetState`, `decideImageAlias`) are exported for tests;
 * tests inject canned inspect fixtures instead of shelling out to `docker`.
 *
 * CLI:
 *   node scripts/promote-image-alias.js --source <image:revision-tag> --target <image:alias> [--revision <rN|N>] [--skip-create]
 *
 *   --revision asserts the SOURCE carries that revision (floor/revision labels must agree
 *   with it); --skip-create prints the verdict and exits 0/1 without running
 *   `imagetools create` (local/manual smoke checks, never used by a real CI dispatch).
 */

const { spawnSync } = require('node:child_process');

const { isNotFoundError, collectRevisionLabelInfo } = require('./check-tag-immutability');

const VERSION_LABEL = 'org.opencontainers.image.version';
const RELEASE_FLOOR_LABEL = 'org.dgfy-platform.release-floor';
const RELEASE_REVISION_LABEL = 'org.dgfy-platform.release-revision';

class ImageAliasError extends Error {
  constructor(message, code = 'IMAGE_ALIAS_INVALID') {
    super(message);
    this.name = 'ImageAliasError';
    this.code = code;
  }
}

function runInspect(imageRef) {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', imageRef, '--format', '{{json .}}'], {
    encoding: 'utf8',
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function runCreate({ target, sourceDigest }) {
  return spawnSync('docker', ['buildx', 'imagetools', 'create', '--tag', target, sourceDigest], {
    encoding: 'utf8',
  });
}

/**
 * Reads one label's agreed value out of a parsed inspect structure. Returns:
 *   { status: 'agree', value }      -- every Labels object agrees on one value.
 *   { status: 'none' }              -- no Labels object carries the key at all.
 *   { status: 'unreadable', found } -- partial/disagreeing coverage (always suspect for an
 *                                      alias source that SHOULD be uniformly labeled).
 */
function readAgreedLabel(parsed, labelKey) {
  const { found, unreadableCount } = collectRevisionLabelInfo(parsed, labelKey);
  const unique = [...new Set(found)];
  if (unique.length === 0) return { status: 'none', found: [] };
  if (unreadableCount > 0) return { status: 'unreadable', found: unique };
  if (unique.length > 1) return { status: 'unreadable', found: unique };
  return { status: 'agree', value: unique[0] };
}

/**
 * Extracts the source manifest identity: image digest + revision labels. Pure aside from
 * the injected `inspectFn`. Returns { ref, state, digest?, floor?, revision?, reason? }.
 * `state` is 'ok', 'not-found', or 'error' -- a source with partial/disagreeing labels is
 * 'error' (refuses to alias from a manifest that cannot prove what it is).
 */
function inspectAliasSource({ ref, inspectFn }) {
  const result = inspectFn(ref);
  if (result.status !== 0) {
    if (isNotFoundError(result.stderr)) {
      return { ref, state: 'not-found', reason: `source tag does not exist (inspect: ${String(result.stderr || '').trim().slice(0, 200)})` };
    }
    return {
      ref,
      state: 'error',
      reason: `docker buildx imagetools inspect failed for source ${ref} for a reason that is not "tag not found" -- refusing to guess: ${String(result.stderr || '').trim().slice(0, 500)}`,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return { ref, state: 'error', reason: `could not parse inspect JSON output for source ${ref}: ${error.message}` };
  }
  const digest = typeof parsed.digest === 'string' && parsed.digest.trim() ? parsed.digest.trim() : null;
  if (!digest) {
    return { ref, state: 'error', reason: `source ${ref} inspect output carries no image digest -- cannot alias a digest-less manifest` };
  }
  const floor = readAgreedLabel(parsed, RELEASE_FLOOR_LABEL);
  const revision = readAgreedLabel(parsed, RELEASE_REVISION_LABEL);
  if (floor.status !== 'agree') {
    return { ref, state: 'error', reason: `source ${ref} has no agreed "${RELEASE_FLOOR_LABEL}" label (${floor.status}) -- refusing to alias an unlabeled manifest` };
  }
  if (revision.status !== 'agree') {
    return { ref, state: 'error', reason: `source ${ref} has no agreed "${RELEASE_REVISION_LABEL}" label (${revision.status}) -- refusing to alias an unlabeled manifest` };
  }
  return { ref, state: 'ok', digest, floor: floor.value, revision: revision.value };
}

/**
 * Classifies the alias target against the source identity. Pure.
 *   - target missing                        -> { state: 'absent' }
 *   - same digest AND same revision         -> { state: 'identical' }
 *   - same digest, different revision label -> { state: 'revision-mismatch' } (refuse)
 *   - different digest                      -> { state: 'digest-mismatch' } (refuse)
 * An unreadable target label set is a mismatch, never a pass -- same fail-closed
 * asymmetry as the build-skip plan: aliasing over an unknown target hides history.
 */
function resolveAliasTargetState({ sourceDigest, sourceRevision, targetDigest, targetRevision }) {
  if (!targetDigest) return { state: 'absent' };
  if (targetDigest !== sourceDigest) return { state: 'digest-mismatch' };
  if (!targetRevision || targetRevision !== sourceRevision) return { state: 'revision-mismatch' };
  return { state: 'identical' };
}

/**
 * Pure verdict over an inspected source and target. Returns
 * { verdict: 'create'|'skip'|'refuse'|'error', code, detail }.
 */
function decideImageAlias({ source, target }) {
  if (source.state === 'not-found') {
    return { verdict: 'error', code: 'source-not-found', detail: `source ${source.ref} does not exist -- nothing to alias: ${source.reason}` };
  }
  if (source.state === 'error') {
    return { verdict: 'error', code: 'source-unreadable', detail: source.reason };
  }
  if (target.state === 'error') {
    return { verdict: 'error', code: 'target-inspect-error', detail: target.reason };
  }
  if (target.state === 'absent') {
    return { verdict: 'create', code: 'target-absent', detail: `${target.ref} does not exist yet -- aliasing to ${source.digest} (${source.revision}).` };
  }
  const classification = resolveAliasTargetState({
    sourceDigest: source.digest,
    sourceRevision: source.revision,
    targetDigest: target.digest,
    targetRevision: target.revision,
  });
  if (classification.state === 'identical') {
    return { verdict: 'skip', code: 'already-identical', detail: `${target.ref} already references ${source.digest} (${source.revision}) -- idempotent, nothing to do.` };
  }
  if (classification.state === 'digest-mismatch') {
    return {
      verdict: 'refuse',
      code: 'target-digest-mismatch',
      detail: `${target.ref} already exists at digest ${target.digest}, but source ${source.ref} is ${source.digest} -- refusing to overwrite an existing alias with a different digest.`,
    };
  }
  return {
    verdict: 'refuse',
    code: 'target-revision-mismatch',
    detail: `${target.ref} references the same digest ${source.digest} but carries revision "${target.revision || '<none>'}" while source carries "${source.revision}" -- refusing to relabel revision identity.`,
  };
}

/**
 * Inspects the alias target tag. Pure aside from the injected `inspectFn`. Returns
 * { ref, state: 'absent'|'ok'|'error', digest?, revision?, reason? }.
 */
function inspectAliasTarget({ ref, inspectFn }) {
  const result = inspectFn(ref);
  if (result.status !== 0) {
    if (isNotFoundError(result.stderr)) {
      return { ref, state: 'absent', reason: `target tag does not exist (inspect: ${String(result.stderr || '').trim().slice(0, 200)})` };
    }
    return {
      ref,
      state: 'error',
      reason: `docker buildx imagetools inspect failed for target ${ref} for a reason that is not "tag not found" -- refusing to guess: ${String(result.stderr || '').trim().slice(0, 500)}`,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return { ref, state: 'error', reason: `could not parse inspect JSON output for target ${ref}: ${error.message}` };
  }
  const digest = typeof parsed.digest === 'string' && parsed.digest.trim() ? parsed.digest.trim() : null;
  if (!digest) {
    return { ref, state: 'error', reason: `target ${ref} inspect output carries no image digest -- refusing to compare against a digest-less manifest` };
  }
  const revision = readAgreedLabel(parsed, RELEASE_REVISION_LABEL);
  return {
    ref,
    state: 'ok',
    digest,
    revision: revision.status === 'agree' ? revision.value : null,
    revisionStatus: revision.status,
  };
}

function parseArgs(argv) {
  const options = { source: '', target: '', revision: '', skipCreate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') {
      options.source = argv[++index] || '';
    } else if (arg === '--target') {
      options.target = argv[++index] || '';
    } else if (arg === '--revision') {
      options.revision = argv[++index] || '';
    } else if (arg === '--skip-create') {
      options.skipCreate = true;
    } else {
      throw new ImageAliasError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  if (!options.source) throw new ImageAliasError('--source is required (<image>:<revision-tag>)', 'INVALID_ARGS');
  if (!options.target) throw new ImageAliasError('--target is required (<image>:<alias>)', 'INVALID_ARGS');
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const source = inspectAliasSource({ ref: options.source, inspectFn: runInspect });
    const target = inspectAliasTarget({ ref: options.target, inspectFn: runInspect });
    if (options.revision) {
      const expected = String(options.revision).trim().replace(/^r/, 'r');
      const normalized = expected.startsWith('r') ? expected : `r${expected}`;
      if (source.state === 'ok' && source.revision !== normalized) {
        console.error(`[promote-image-alias] REVISION_MISMATCH: source ${source.ref} carries revision "${source.revision}", expected "${normalized}" -- refusing.`);
        process.exitCode = 1;
        return;
      }
    }
    const decision = decideImageAlias({ source, target });
    if (decision.verdict === 'create') {
      console.log(`[promote-image-alias] [CREATE] ${decision.detail}`);
      if (!options.skipCreate) {
        const created = runCreate({ target: options.target, sourceDigest: source.digest });
        if (created.status !== 0) {
          console.error(`[promote-image-alias] CREATE_FAILED: docker buildx imagetools create failed for ${options.target}: ${String(created.stderr || '').trim().slice(0, 500)}`);
          process.exitCode = 1;
          return;
        }
        console.log(`[promote-image-alias] PASS. ${options.target} now references ${source.digest}.`);
      }
      return;
    }
    if (decision.verdict === 'skip') {
      console.log(`[promote-image-alias] [SKIP] ${decision.detail}`);
      return;
    }
    console.error(`[promote-image-alias] ${decision.code}: ${decision.detail}`);
    process.exitCode = 1;
  } catch (error) {
    if (error instanceof ImageAliasError) {
      console.error(`[promote-image-alias] ${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  VERSION_LABEL,
  RELEASE_FLOOR_LABEL,
  RELEASE_REVISION_LABEL,
  ImageAliasError,
  readAgreedLabel,
  inspectAliasSource,
  inspectAliasTarget,
  resolveAliasTargetState,
  decideImageAlias,
  parseArgs,
};
