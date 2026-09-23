#!/usr/bin/env node
/**
 * Per-app artifact revision allocator -- issue #2055 (Phase 346).
 *
 * DEV builds (and staging repairs) need an immutable per-app revision identity (`rN`) that
 * exists BEFORE any candidate manifest does -- so no manifest counter can hand one out. GHCR
 * is the durable source of truth instead: at publish time, this script finds the highest
 * existing `<app>:<floor>-r<N>*` tag across all channels for that app+floor and allocates
 * `N = max + 1`. Scoping the query to `<floor>-r*` means a floor bump naturally resets `N`
 * to 1 for the new floor -- no separate reset logic. No new counter file or ledger.
 *
 * Two allocation rules, in order:
 *   1. Same-source reuse (idempotent retry): when the highest `rN` tag already carrying THIS
 *      build's revision (`org.opencontainers.image.revision`) exists, that `N` is reused --
 *      a re-dispatch of an already-published build is ADR 0081 Decision 7's idempotent
 *      no-op, not a new allocation. Without this, every retry would burn a new revision
 *      number for byte-identical content.
 *   2. Otherwise max-plus-one across every channel (`-dev`, `-staging`, bare `rN`) -- a
 *      revision identifies the artifact lineage, not the channel it was first published to.
 *
 * Concurrency safety net (not implemented here -- enforced by the registry): two builds
 * racing on the same `N` get the loser's push refused by Decision 7's guard (tag exists,
 * `org.opencontainers.image.revision` mismatch). The caller re-runs this script (re-query,
 * +1, re-push); each dispatch is one bounded attempt, a re-dispatch re-queries from the
 * new max. Same-source retries converge via rule 1 instead of racing.
 *
 * Only revision tags (`<floor>-rN` + optional channel, per
 * `resolve-release-tags.js:parseRevisionTag`) advance the counter. Legacy bare
 * `<floor>-dev` tags and ad-hoc `<floor>-<slug>-dev` tags never match the pattern, so
 * they can neither be reallocated nor collide with the sequence -- they stay historical
 * and untouched.
 *
 * Registry reads reuse `check-tag-immutability.js`'s own `runInspect` primitive (the same
 * `docker buildx imagetools inspect` the Decision 7 guard itself performs) -- no second
 * GHCR inspector. An inspect failure that is not "tag not found" (auth, network, registry
 * outage) throws fail-closed: allocating blind could hand out an already-taken `N`, so
 * the dispatch fails loudly instead of guessing.
 *
 * Pure functions (`nextRevisionFromTags`, `allocateRevision`) are exported for tests;
 * `probeExistingSightings` takes an injectable `inspectFn` so tests never touch a registry.
 *
 * CLI:
 *   node scripts/allocate-artifact-revision.js --image <ghcr.io/sieitzz/<app>> --floor <X.Y.Z> --revision <current build's github.sha> [--max-probe <N>]
 *   node scripts/allocate-artifact-revision.js --floor <X.Y.Z> --revision <sha> --tags-json '["1.13.0-r1-dev", ...]' [--image <ref>]
 *   node scripts/allocate-artifact-revision.js --select-dev --image <ghcr.io/sieitzz/<app>> --floor <X.Y.Z> [--max-probe <N>]
 *
 *   `--tags-json` skips the registry probe and allocates from a caller-supplied tag list
 *   (local/promoter use without docker). Label info is unavailable there, so same-source
 *   reuse never applies in that mode -- always max-plus-one, never a collision, at most a
 *   gap on retry. Prints one JSON blob on its own stdout line.
 *
 *   `--select-dev` does not allocate at all: it prints the latest published revisioned DEV
 *   artifact (`{ revision, sha, digest }`) for the promoter's candidate-selection step. No
 *   `--revision` needed (nothing is published); fails when no revisioned DEV tag exists.
 */

const { runInspect, isNotFoundError, collectRevisionLabelInfo, REVISION_LABEL } = require('./check-tag-immutability');
const { parseRevisionTag, parseFloorVersion } = require('./resolve-release-tags');

const DEFAULT_MAX_PROBE = 512;
// Probe suffixes covering every channel a revision tag can exist on: revisioned DEV,
// frontend STAGING, and the environment-neutral revision tag backends publish on STAGING
// and frontends/backends publish on PROD.
const REVISION_TAG_SUFFIXES = Object.freeze(['-dev', '-staging', '']);

class ArtifactRevisionError extends Error {
  constructor(message, code = 'ARTIFACT_REVISION_INVALID') {
    super(message);
    this.name = 'ArtifactRevisionError';
    this.code = code;
  }
}

/**
 * Pure max-plus-one over a flat tag listing. Parses each entry with
 * `parseRevisionTag`, keeps only this floor's revision tags, returns
 * `max + 1` (or 1 when none exist). Legacy/ad-hoc/other-floor tags never match
 * the pattern and are ignored -- they cannot advance or collide with the sequence.
 */
function nextRevisionFromTags(tags, floor) {
  const normalizedFloor = parseFloorVersion(floor);
  let max = 0;
  for (const tag of tags || []) {
    const parsed = parseRevisionTag(tag);
    if (parsed && parsed.floor === normalizedFloor && Number.isSafeInteger(parsed.revision) && parsed.revision > max) {
      max = parsed.revision;
    }
  }
  return max + 1;
}

/**
 * Pure allocation verdict over registry sightings.
 *
 * sightings: [{ tag, revision }] where `revision` is the tag's agreed
 * `org.opencontainers.image.revision` label value, or null when the tag exists but its
 * label is missing/unreadable/disagreeing (still counts toward the max -- its NAME proves
 * the number is taken -- but can never prove same-sourceness for reuse).
 *
 * Returns { revision, reused } -- `reused: true` exactly when an existing tag already
 * carries `currentRevision` (the highest such `N` wins when several do).
 */
function allocateRevision({ floor, currentRevision, sightings } = {}) {
  const normalizedFloor = parseFloorVersion(floor);
  if (!currentRevision || typeof currentRevision !== 'string') {
    throw new ArtifactRevisionError('currentRevision (github.sha) is required -- refusing to allocate blind', 'MISSING_REVISION');
  }
  let max = 0;
  let reuse = 0;
  for (const sighting of sightings || []) {
    const parsed = parseRevisionTag(sighting && sighting.tag);
    if (!parsed || parsed.floor !== normalizedFloor) continue;
    if (parsed.revision > max) max = parsed.revision;
    if (sighting.revision === currentRevision && parsed.revision > reuse) reuse = parsed.revision;
  }
  if (reuse > 0) {
    return { revision: reuse, reused: true };
  }
  return { revision: max + 1, reused: false };
}

/**
 * Reads one probe ref's agreed revision label. Returns { state, revision? } with state
 * 'ok' (agreed label), 'absent' (tag not found), 'unreadable' (tag exists, label
 * missing/disagreeing/unparseable -- counts toward the max, never toward reuse), and
 * throws fail-closed on any unclassified inspect failure.
 */
function probeRevisionLabel({ image, tag, inspectFn }) {
  const ref = `${image}:${tag}`;
  const result = inspectFn(ref);
  if (result.status !== 0) {
    if (isNotFoundError(result.stderr)) {
      return { state: 'absent' };
    }
    throw new ArtifactRevisionError(
      `docker buildx imagetools inspect failed for ${ref} for a reason that is not "tag not found" -- refusing to allocate blind: ${String(result.stderr || '').trim().slice(0, 500)}`,
      'INSPECT_FAILED',
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return { state: 'unreadable' };
  }
  const { found, unreadableCount } = collectRevisionLabelInfo(parsed, REVISION_LABEL);
  const unique = [...new Set(found)];
  if (unique.length === 1 && unreadableCount === 0) {
    return { state: 'ok', revision: unique[0] };
  }
  return { state: 'unreadable' };
}

/**
 * Probes GHCR for every `<floor>-r<N>*` tag, N = 1 upward, across all channel suffixes.
 * Stops at the first N with no tag on ANY channel (tags are immutable and never deleted,
 * so no gap can exist below the max) and caps the scan at `maxProbe` (fail-closed beyond
 * it -- an unbounded probe against a runaway sequence would hang the dispatch).
 *
 * Returns { sightings, maxSeen } where sightings is the `allocateRevision` input shape.
 * `inspectFn` defaults to the real `runInspect`; tests inject canned fixtures.
 */
function probeExistingSightings({ image, floor, currentRevision, inspectFn = runInspect, maxProbe = DEFAULT_MAX_PROBE } = {}) {
  const normalizedFloor = parseFloorVersion(floor);
  if (!image || typeof image !== 'string') {
    throw new ArtifactRevisionError('--image is required (e.g. ghcr.io/sieitzz/dgfy-pos)', 'INVALID_ARGS');
  }
  const sightings = [];
  let maxSeen = 0;
  for (let n = 1; n <= maxProbe; n += 1) {
    let seenThisN = false;
    for (const suffix of REVISION_TAG_SUFFIXES) {
      const tag = `${normalizedFloor}-r${n}${suffix}`;
      const probed = probeRevisionLabel({ image, tag, inspectFn });
      if (probed.state !== 'absent') {
        seenThisN = true;
        sightings.push({ tag, revision: probed.state === 'ok' ? probed.revision : null });
      }
    }
    if (seenThisN) {
      maxSeen = n;
    } else {
      break;
    }
  }
  if (maxSeen >= maxProbe) {
    throw new ArtifactRevisionError(`revision sequence for ${image}:${normalizedFloor}-r* reached the probe cap (${maxProbe}) -- refusing to allocate blind past it`, 'PROBE_CAP_EXCEEDED');
  }
  return { sightings, maxSeen, currentRevision };
}

/**
 * Full allocation: probe GHCR, then apply the reuse/max-plus-one rules.
 * Returns { revision, reused, maxSeen }.
 */
function resolveDevRevision({ image, floor, currentRevision, inspectFn = runInspect, maxProbe = DEFAULT_MAX_PROBE } = {}) {
  const { sightings, maxSeen } = probeExistingSightings({ image, floor, currentRevision, inspectFn, maxProbe });
  const { revision, reused } = allocateRevision({ floor, currentRevision, sightings });
  return { revision, reused, maxSeen };
}

/**
 * Candidate-selection read: returns the latest published revisioned DEV artifact for
 * one app+floor -- `{ revision, sha, digest }` of the highest `<floor>-rN-dev` tag with
 * a readable revision label. Throws when none exists (a candidate cannot select what was
 * never published -- dispatch a DEV build first). Read-only: only ever runs
 * `docker buildx imagetools inspect`, never a push -- same classification as
 * `check-tag-immutability.js`'s own inspect step.
 *
 * Digest comes from the same inspect output (`parsed.digest`), so the promoter records
 * the exact artifact without a second registry round-trip. Only the `-dev` channel
 * counts: the candidate starts from DEV artifacts, never from a staging repair's tag.
 */
function selectLatestDevArtifact({ image, floor, inspectFn = runInspect, maxProbe = DEFAULT_MAX_PROBE } = {}) {
  const normalizedFloor = parseFloorVersion(floor);
  if (!image || typeof image !== 'string') {
    throw new ArtifactRevisionError('--image is required (e.g. ghcr.io/sieitzz/dgfy-pos)', 'INVALID_ARGS');
  }
  const { sightings } = probeExistingSightings({ image, floor: normalizedFloor, currentRevision: 'selection-only', inspectFn, maxProbe });
  let best = null;
  for (const sighting of sightings) {
    if (!sighting.tag.endsWith('-dev') || !sighting.revision) continue;
    const parsed = parseRevisionTag(sighting.tag);
    if (!parsed || parsed.floor !== normalizedFloor) continue;
    if (!best || parsed.revision > best.revision) {
      best = { revision: parsed.revision, sha: sighting.revision, tag: sighting.tag };
    }
  }
  if (!best) {
    throw new ArtifactRevisionError(`no published revisioned DEV tag (${normalizedFloor}-rN-dev with a readable revision label) found for ${image} -- dispatch a DEV build on develop first, then cut the candidate`, 'NO_DEV_ARTIFACT');
  }
  const digest = readProbedDigest({ image, tag: best.tag, inspectFn });
  return { revision: best.revision, sha: best.sha, digest, tag: best.tag };
}

/**
 * Reads one already-probed ref's image digest out of a fresh inspect (kept separate from
 * the label probe above so the common allocate path never pays for a digest it doesn't
 * need -- only the --select-dev path calls this, once, for the winning tag).
 */
function readProbedDigest({ image, tag, inspectFn }) {
  const result = inspectFn(`${image}:${tag}`);
  if (result.status !== 0) {
    throw new ArtifactRevisionError(`could not re-inspect ${image}:${tag} for its digest: ${String(result.stderr || '').trim().slice(0, 200)}`, 'INSPECT_FAILED');
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new ArtifactRevisionError(`could not parse inspect output for ${image}:${tag}: ${error.message}`, 'INSPECT_FAILED');
  }
  const digest = typeof parsed.digest === 'string' && parsed.digest.trim() ? parsed.digest.trim() : null;
  if (!digest) {
    throw new ArtifactRevisionError(`inspect output for ${image}:${tag} carries no image digest -- refusing to select a digest-less artifact`, 'INSPECT_FAILED');
  }
  return digest;
}

function parseArgs(argv) {
  const options = { image: '', floor: '', revision: '', maxProbe: `${DEFAULT_MAX_PROBE}`, tagsJson: '', selectDev: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--image') {
      options.image = argv[++index] || '';
    } else if (arg === '--floor') {
      options.floor = argv[++index] || '';
    } else if (arg === '--revision') {
      options.revision = argv[++index] || '';
    } else if (arg === '--max-probe') {
      options.maxProbe = argv[++index] || '';
    } else if (arg === '--tags-json') {
      options.tagsJson = argv[++index] || '';
    } else if (arg === '--select-dev') {
      options.selectDev = true;
    } else {
      throw new ArtifactRevisionError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  if (!options.floor) throw new ArtifactRevisionError('--floor is required (bare X.Y.Z from apps/<app>/package.json)', 'INVALID_ARGS');
  if (!options.selectDev && !options.revision) throw new ArtifactRevisionError('--revision is required (current build github.sha)', 'INVALID_ARGS');
  const maxProbe = Number.parseInt(options.maxProbe, 10);
  if (!Number.isSafeInteger(maxProbe) || maxProbe <= 0) {
    throw new ArtifactRevisionError(`--max-probe must be a positive integer (got "${options.maxProbe}")`, 'INVALID_ARGS');
  }
  return { ...options, maxProbe };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const floor = parseFloorVersion(options.floor);
    if (!options.image) throw new ArtifactRevisionError('--image is required (e.g. ghcr.io/sieitzz/dgfy-pos)', 'INVALID_ARGS');
    if (options.selectDev) {
      if (options.tagsJson) throw new ArtifactRevisionError('--select-dev reads the registry, it cannot combine with --tags-json', 'INVALID_ARGS');
      const selected = selectLatestDevArtifact({ image: options.image, floor, maxProbe: options.maxProbe });
      console.log(JSON.stringify({ image: options.image, floor, ...selected }));
      return;
    }
    let verdict;
    if (options.tagsJson) {
      let tags;
      try {
        tags = JSON.parse(options.tagsJson);
      } catch (error) {
        throw new ArtifactRevisionError(`--tags-json is not valid JSON: ${error.message}`, 'INVALID_ARGS');
      }
      if (!Array.isArray(tags)) {
        throw new ArtifactRevisionError('--tags-json must be a JSON array of tag strings', 'INVALID_ARGS');
      }
      // Label-free mode: no same-source reuse possible (see the file header) -- pure
      // max-plus-one over the listing.
      verdict = { revision: nextRevisionFromTags(tags, floor), reused: false, maxSeen: null };
    } else {
      if (!options.image) throw new ArtifactRevisionError('--image is required unless --tags-json is given', 'INVALID_ARGS');
      verdict = resolveDevRevision({ image: options.image, floor, currentRevision: options.revision, maxProbe: options.maxProbe });
    }
    console.log(JSON.stringify({
      image: options.image || null,
      floor,
      revision: verdict.revision,
      devTag: `${floor}-r${verdict.revision}-dev`,
      reused: verdict.reused,
    }));
  } catch (error) {
    if (error instanceof ArtifactRevisionError) {
      console.error(`[allocate-artifact-revision] ${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  REVISION_TAG_SUFFIXES,
  DEFAULT_MAX_PROBE,
  ArtifactRevisionError,
  nextRevisionFromTags,
  allocateRevision,
  probeRevisionLabel,
  probeExistingSightings,
  resolveDevRevision,
  selectLatestDevArtifact,
  readProbedDigest,
  parseArgs,
};
