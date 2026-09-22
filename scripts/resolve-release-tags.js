#!/usr/bin/env node
/**
 * Release tag resolver -- issue #1977 (Phase 342).
 *
 * Centralizes the release-version tag matrix so app type and environment cannot drift between
 * workflows. ADR 0081 Decision 1 used to apply `-dev`/`-staging`/bare uniformly to all five
 * images; #1977 amends that contract: `X.Y.Z` remains the per-app production floor while
 * candidate revisions (`rN`, the candidate-wide `release_revision.revision` from
 * `scripts/check-promotion-candidate.js`'s manifest -- one greater than the latest staging
 * repair revision) identify the exact artifact that reached production.
 *
 * Tag matrix (`version` below is always the bare per-app floor from `apps/<app>/package.json`):
 *
 * | Artifact     | DEV          | STAGING candidate    | PROD                                    |
 * | ---          | ---          | ---                  | ---                                     |
 * | Frontend     | `X.Y.Z-dev`  | `X.Y.Z-rN-staging`   | `X.Y.Z-rN` + immutable alias `X.Y.Z`    |
 * | API + runner | `X.Y.Z-dev`  | `X.Y.Z-rN`           | reuse staging `X.Y.Z-rN` digest + alias |
 *
 * Frontends keep environment-qualified tags because they bake `VITE_*` values at build time;
 * `dgfy-api` and `dgfy-migration-runner` bake only `APP_VERSION` (runtime config is external),
 * so their staging candidate tag is environment-neutral and PROD promotes the same digest
 * instead of rebuilding. The production alias and revision tag reference the same digest.
 * Existing published tags are historical and are never rewritten by this script (it only
 * computes strings; publishing stays with the builder workflows and
 * `scripts/check-tag-immutability.js`'s guard).
 *
 * Docker tags forbid `+`, so the revision separator is `-rN`, never `+rN`/`+build`.
 * Ordinary DEV behavior is unchanged: no revision is required or consumed there.
 *
 * Pure functions (`parseFloorVersion`, `parseReleaseRevision`, `resolveReleaseTags`) are
 * exported for tests and for reuse by `scripts/check-image-version-parity.js` and
 * `scripts/resolve-build-skip-plan.js`. The CLI prints one JSON blob on its own stdout line
 * (mirroring `check-promotion-candidate.js --resolve-app-shas`'s convention).
 *
 * CLI:
 *   node scripts/resolve-release-tags.js --app <app> --version <X.Y.Z> --environment <DEV|STAGING|PROD> [--revision <rN|N>]
 */

const FRONTEND_APPS = Object.freeze(['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']);
const BACKEND_APPS = Object.freeze(['dgfy-api', 'dgfy-migration-runner']);
const RELEASE_APPS = Object.freeze([...BACKEND_APPS, ...FRONTEND_APPS]);

const FLOOR_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_PATTERN = /^\d+\.\d+\.\d+(-r\d+)?(-dev|-staging)?$/;

class ReleaseTagsError extends Error {
  constructor(message, code = 'RELEASE_TAGS_INVALID') {
    super(message);
    this.name = 'ReleaseTagsError';
    this.code = code;
  }
}

function isFrontendApp(app) {
  return FRONTEND_APPS.includes(app);
}

function isBackendApp(app) {
  return BACKEND_APPS.includes(app);
}

/**
 * Validates the bare per-app production floor (`apps/<app>/package.json` version). Must be
 * exactly `X.Y.Z` -- no channel suffix, no revision fragment, no `+` build metadata (Docker
 * tags forbid `+`, and a suffixed input here would mean the caller already mixed a publish-time
 * artifact into the source-tree fact ADR 0081 Decision 3 keeps separate).
 */
function parseFloorVersion(version) {
  const raw = String(version || '').trim();
  if (!raw) {
    throw new ReleaseTagsError('version is required (bare X.Y.Z floor from apps/<app>/package.json)', 'MISSING_VERSION');
  }
  if (raw.includes('+')) {
    throw new ReleaseTagsError(`version "${raw}" must not contain "+" build metadata -- Docker tags forbid "+"`, 'INVALID_VERSION');
  }
  const match = FLOOR_PATTERN.exec(raw);
  if (!match) {
    throw new ReleaseTagsError(`version "${raw}" must be a bare X.Y.Z floor (no suffix, no revision fragment)`, 'INVALID_VERSION');
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/**
 * Validates the candidate revision. Accepts `16`, `"16"`, or `"r16"` (the manifest's
 * `release_revision.revision` is candidate-wide, not a Docker build-attempt count). Returns
 * the positive integer. Throws for missing/invalid input -- callers for candidate
 * staging/production dispatches must reject those, per #1977's interface contract.
 */
function parseReleaseRevision(revision) {
  if (revision === undefined || revision === null || String(revision).trim() === '') {
    throw new ReleaseTagsError('revision is required for candidate staging/production tags (candidate-wide release_revision.revision, e.g. r16)', 'MISSING_REVISION');
  }
  const raw = String(revision).trim();
  const match = /^r?(\d+)$/.exec(raw);
  if (!match) {
    throw new ReleaseTagsError(`revision "${raw}" must look like r16 or 16 (positive integer, optional r prefix)`, 'INVALID_REVISION');
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ReleaseTagsError(`revision "${raw}" must be a positive integer revision (got ${match[1]})`, 'INVALID_REVISION');
  }
  return parsed;
}

function assertDockerSafe(tag) {
  if (tag.includes('+')) {
    throw new ReleaseTagsError(`resolved tag "${tag}" must not contain "+" -- Docker tags forbid "+"`, 'UNSAFE_TAG');
  }
  if (!TAG_PATTERN.test(tag)) {
    throw new ReleaseTagsError(`resolved tag "${tag}" is not a valid release tag (expected X.Y.Z[-rN][-dev|-staging])`, 'UNSAFE_TAG');
  }
  return tag;
}

/**
 * Resolves every tag in the matrix for one app at one environment.
 *
 * options:
 *   - app (required): one of the five release apps.
 *   - version (required): bare `X.Y.Z` floor.
 *   - environment (required): DEV, STAGING, or PROD.
 *   - revision (required for STAGING/PROD): candidate-wide `release_revision.revision`
 *     (`rN`/`N`). Accepted and ignored for DEV (ordinary DEV behavior is unchanged).
 *
 * Returns:
 *   { app, frontend, floor, revision, revisionTag, stagingTag, productionTag,
 *     canonicalAlias, tag }
 * where `tag` is what THIS environment build publishes, `stagingTag`/`productionTag` are
 * the matrix columns for cross-environment comparison, `revisionTag` is the immutable
 * artifact identity (`APP_VERSION` / `org.opencontainers.image.version`), and
 * `canonicalAlias` is the bare floor alias (PROD only, else null).
 */
function resolveReleaseTags({ app, version, environment, revision } = {}) {
  if (!RELEASE_APPS.includes(app)) {
    throw new ReleaseTagsError(`unknown app "${app}" -- expected one of ${RELEASE_APPS.join(', ')}`, 'UNKNOWN_APP');
  }
  const floor = parseFloorVersion(version);
  const env = String(environment || '').trim().toUpperCase();
  if (env !== 'DEV' && env !== 'STAGING' && env !== 'PROD') {
    throw new ReleaseTagsError(`unknown environment "${environment}" -- expected DEV, STAGING, or PROD`, 'UNKNOWN_ENVIRONMENT');
  }
  const frontend = isFrontendApp(app);

  if (env === 'DEV') {
    const tag = assertDockerSafe(`${floor}-dev`);
    return {
      app,
      frontend,
      floor,
      revision: null,
      revisionTag: null,
      stagingTag: null,
      productionTag: null,
      canonicalAlias: null,
      tag,
    };
  }

  const revisionNumber = parseReleaseRevision(revision);
  const revisionTag = assertDockerSafe(`${floor}-r${revisionNumber}`);
  // Frontend staging stays environment-qualified (baked VITE_* differ per environment);
  // backend staging is environment-neutral (same digest promotes to PROD).
  const stagingTag = frontend ? assertDockerSafe(`${revisionTag}-staging`) : revisionTag;
  const productionTag = revisionTag;
  const canonicalAlias = floor;
  return {
    app,
    frontend,
    floor,
    revision: revisionNumber,
    revisionTag,
    stagingTag,
    productionTag,
    canonicalAlias,
    tag: env === 'STAGING' ? stagingTag : productionTag,
  };
}

function parseArgs(argv) {
  const options = { app: '', version: '', environment: '', revision: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--app') {
      options.app = argv[++index] || '';
    } else if (arg === '--version') {
      options.version = argv[++index] || '';
    } else if (arg === '--environment') {
      options.environment = argv[++index] || '';
    } else if (arg === '--revision') {
      options.revision = argv[++index] || '';
    } else {
      throw new ReleaseTagsError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  if (!options.app) throw new ReleaseTagsError('--app is required', 'INVALID_ARGS');
  if (!options.version) throw new ReleaseTagsError('--version is required', 'INVALID_ARGS');
  if (!options.environment) throw new ReleaseTagsError('--environment is required', 'INVALID_ARGS');
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const resolved = resolveReleaseTags({
      app: options.app,
      version: options.version,
      environment: options.environment,
      revision: options.revision === '' ? undefined : options.revision,
    });
    console.log(JSON.stringify(resolved));
  } catch (error) {
    if (error instanceof ReleaseTagsError) {
      console.error(`[resolve-release-tags] ${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  FRONTEND_APPS,
  BACKEND_APPS,
  RELEASE_APPS,
  ReleaseTagsError,
  isFrontendApp,
  isBackendApp,
  parseFloorVersion,
  parseReleaseRevision,
  resolveReleaseTags,
  parseArgs,
};
