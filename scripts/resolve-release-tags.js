#!/usr/bin/env node
/**
 * Release tag resolver -- issue #1977 (Phase 342), extended by issue #2055 (Phase 346).
 *
 * Centralizes the release-version tag matrix so app type and environment cannot drift between
 * workflows. ADR 0081 Decision 1 used to apply `-dev`/`-staging`/bare uniformly to all five
 * images; #1977 amends that contract: `X.Y.Z` remains the per-app production floor while
 * candidate revisions (`rN`) identify the exact artifact that reached production. #2055 extends
 * the revision history back into DEV: revisions are allocated per app (GHCR is the durable
 * source of truth -- see scripts/allocate-artifact-revision.js), so DEV builds carry their own
 * immutable `X.Y.Z-rN-dev` identity instead of colliding on the bare `X.Y.Z-dev` tag.
 *
 * Tag matrix (`version` below is always the bare per-app floor from `apps/<app>/package.json`):
 *
 * | Artifact     | DEV (`develop`)      | DEV ad-hoc (feature branch) | STAGING candidate    | PROD                                    |
 * | ---          | ---                  | ---                           | ---                  | ---                                     |
 * | Frontend     | `X.Y.Z-rN-dev`       | `X.Y.Z-<slug>-dev`           | `X.Y.Z-rN-staging`   | `X.Y.Z-rN` + immutable alias `X.Y.Z`    |
 * | API + runner | `X.Y.Z-rN-dev`       | `X.Y.Z-<slug>-dev`           | `X.Y.Z-rN`           | reuse staging `X.Y.Z-rN` digest + alias |
 *
 * Only a revisioned DEV tag (`X.Y.Z-rN-dev`, built from `develop`) is promotion-eligible --
 * a candidate selects its per-app starting artifacts from those. Ad-hoc DEV tags
 * (`X.Y.Z-pr123-dev` from a PR dispatch, or `X.Y.Z-<branch-slug>-dev` with no PR context)
 * are deliberately non-selectable, so a feature-branch build can never enter the promotion
 * path. The legacy bare `X.Y.Z-dev` still resolves (historical tags are never rewritten or
 * relabeled), but no workflow emits it anymore and it is never candidate-selectable.
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
 *
 * Pure functions (`parseFloorVersion`, `parseReleaseRevision`, `sanitizePrRef`,
 * `parseRevisionTag`, `resolveReleaseTags`) are exported for tests and for reuse by
 * `scripts/check-image-version-parity.js`, `scripts/resolve-build-skip-plan.js`, and
 * `scripts/allocate-artifact-revision.js`. The CLI prints one JSON blob on its own stdout line
 * (mirroring `check-promotion-candidate.js --resolve-app-shas`'s convention).
 *
 * CLI:
 *   node scripts/resolve-release-tags.js --app <app> --version <X.Y.Z> --environment <DEV|STAGING|PROD> [--revision <rN|N>] [--pr-ref <pr123|branch-name>]
 *
 *   `--revision` and `--pr-ref` are mutually exclusive, DEV-only in combination terms:
 *   `--revision` on DEV resolves the promotion-eligible `X.Y.Z-rN-dev`; `--pr-ref` resolves
 *   the non-eligible ad-hoc shape. Neither is accepted for STAGING/PROD (`--pr-ref` there
 *   throws); STAGING/PROD still require `--revision` and fail closed without it.
 */

const FRONTEND_APPS = Object.freeze(['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']);
const BACKEND_APPS = Object.freeze(['dgfy-api', 'dgfy-migration-runner']);
const RELEASE_APPS = Object.freeze([...BACKEND_APPS, ...FRONTEND_APPS]);

const FLOOR_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
// #2055 (Phase 346): revision-qualified DEV (`X.Y.Z-rN-dev`) and ad-hoc DEV
// (`X.Y.Z-<slug>-dev`, e.g. `X.Y.Z-pr123-dev`) shapes alongside the #1977 matrix.
const TAG_PATTERN = /^\d+\.\d+\.\d+(-r\d+)?(-[A-Za-z0-9][A-Za-z0-9._-]*)?(-dev|-staging)?$/;
// Matches one `<floor>-r<N>` tag with an optional `-dev`/`-staging` channel suffix -- the
// shape scripts/allocate-artifact-revision.js scans when computing max-plus-one. Ad-hoc
// (`-pr123-`, branch-slug) and legacy bare-dev tags never match, so they never advance the
// per-app revision counter.
const REVISION_TAG_PATTERN = /^(\d+\.\d+\.\d+)-r(\d+)(-dev|-staging)?$/;

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
 * Validates the candidate revision. Accepts `16`, `"16"`, or `"r16"` (a per-app artifact
 * revision -- #1977's candidate-wide `release_revision.revision`, #2055's per-app GHCR-sourced
 * sequence -- never a Docker build-attempt count). Returns the positive integer. Throws for
 * missing/invalid input -- callers for candidate staging/production dispatches must reject
 * those, per #1977's interface contract.
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

/**
 * Normalizes an ad-hoc DEV marker into a Docker-safe tag fragment (#2055, Phase 346).
 *
 * Accepts a PR reference (`"123"`, `"pr123"`, `"PR-123"`, `"#123"` -- all normalize to
 * `"pr123"`) or a branch name (`"feat/foo"` -> `"feat-foo"`). Branch slugs are lowercased,
 * runs of non-`[a-z0-9]` collapse to one `-`, leading/trailing separators are stripped, and
 * the result is capped at 48 characters (the full tag must stay well under Docker's 128
 * limit once floor + suffixes are added). Throws when nothing Docker-safe remains.
 */
function sanitizePrRef(prRef) {
  const raw = String(prRef || '').trim();
  if (!raw) {
    throw new ReleaseTagsError('pr-ref must not be empty', 'INVALID_PR_REF');
  }
  const prNumber = /^#?(?:pr-?)?(\d+)$/i.exec(raw);
  if (prNumber) {
    return `pr${prNumber[1]}`;
  }
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(slug)) {
    throw new ReleaseTagsError(`pr-ref "${raw}" has no Docker-safe slug form (needs at least one [a-z0-9], separators only inside)`, 'INVALID_PR_REF');
  }
  return slug;
}

/**
 * Parses one `<floor>-r<N>` tag with an optional `-dev`/`-staging` channel suffix (#2055).
 * Returns `{ floor, revision }`, or `null` when the tag is not a revision tag at all
 * (legacy bare `X.Y.Z-dev`, ad-hoc `X.Y.Z-<slug>-dev`, bare floor alias, anything else).
 * Pure -- scripts/allocate-artifact-revision.js maps a tag listing through this to compute
 * the per-app max-plus-one without re-deriving the pattern.
 */
function parseRevisionTag(tag) {
  const match = REVISION_TAG_PATTERN.exec(String(tag || '').trim());
  if (!match) return null;
  return { floor: match[1], revision: Number.parseInt(match[2], 10) };
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
 *   - revision (required for STAGING/PROD; optional for DEV): per-app artifact revision
 *     (`rN`/`N`). On DEV it resolves the promotion-eligible `X.Y.Z-rN-dev` -- the
 *     allocated per-app revision (#2055), not a Docker build-attempt count.
 *   - prRef (DEV only, mutually exclusive with revision): ad-hoc marker -- a PR number
 *     (`123`/`pr123`) or branch name -- resolving the non-promotion-eligible
 *     `X.Y.Z-<slug>-dev` shape. Rejected for STAGING/PROD.
 *
 * Returns:
 *   { app, frontend, floor, revision, revisionTag, stagingTag, productionTag,
 *     canonicalAlias, tag, prRef, promotionEligible }
 * where `tag` is what THIS environment build publishes, `stagingTag`/`productionTag` are
 * the matrix columns for cross-environment comparison, `revisionTag` is the immutable
 * artifact identity (`APP_VERSION` / `org.opencontainers.image.version`),
 * `canonicalAlias` is the bare floor alias (PROD only, else null), `prRef` is the
 * sanitized ad-hoc marker (ad-hoc DEV only, else null), and `promotionEligible` is true
 * only for revisioned DEV (candidate-selectable) and STAGING/PROD candidate artifacts --
 * legacy bare-dev and ad-hoc DEV tags are never eligible.
 */
function resolveReleaseTags({ app, version, environment, revision, prRef } = {}) {
  if (!RELEASE_APPS.includes(app)) {
    throw new ReleaseTagsError(`unknown app "${app}" -- expected one of ${RELEASE_APPS.join(', ')}`, 'UNKNOWN_APP');
  }
  const floor = parseFloorVersion(version);
  const env = String(environment || '').trim().toUpperCase();
  if (env !== 'DEV' && env !== 'STAGING' && env !== 'PROD') {
    throw new ReleaseTagsError(`unknown environment "${environment}" -- expected DEV, STAGING, or PROD`, 'UNKNOWN_ENVIRONMENT');
  }
  const frontend = isFrontendApp(app);
  const hasRevision = revision !== undefined && revision !== null && String(revision).trim() !== '';
  const hasPrRef = prRef !== undefined && prRef !== null && String(prRef).trim() !== '';

  if (env === 'DEV') {
    if (hasRevision && hasPrRef) {
      throw new ReleaseTagsError('revision and pr-ref are mutually exclusive -- a DEV build is either a promotion-eligible revisioned build (X.Y.Z-rN-dev) or an ad-hoc build (X.Y.Z-<slug>-dev), never both', 'CONFLICTING_DEV_IDENTITY');
    }
    if (hasRevision) {
      const revisionNumber = parseReleaseRevision(revision);
      const revisionTag = assertDockerSafe(`${floor}-r${revisionNumber}`);
      const tag = assertDockerSafe(`${revisionTag}-dev`);
      return {
        app,
        frontend,
        floor,
        revision: revisionNumber,
        revisionTag,
        stagingTag: null,
        productionTag: null,
        canonicalAlias: null,
        tag,
        prRef: null,
        promotionEligible: true,
      };
    }
    if (hasPrRef) {
      const slug = sanitizePrRef(prRef);
      const tag = assertDockerSafe(`${floor}-${slug}-dev`);
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
        prRef: slug,
        promotionEligible: false,
      };
    }
    // Legacy bare X.Y.Z-dev -- historical tags are never rewritten or relabeled, so the
    // resolver still resolves the shape, but no workflow emits it anymore and it is never
    // candidate-selectable (#2055).
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
      prRef: null,
      promotionEligible: false,
    };
  }

  if (hasPrRef) {
    throw new ReleaseTagsError(`pr-ref is DEV-only -- ${env} builds carry a per-app artifact revision, never an ad-hoc marker`, 'PR_REF_WRONG_ENVIRONMENT');
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
    prRef: null,
    promotionEligible: true,
  };
}

function parseArgs(argv) {
  const options = { app: '', version: '', environment: '', revision: '', prRef: '' };
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
    } else if (arg === '--pr-ref') {
      options.prRef = argv[++index] || '';
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
      prRef: options.prRef === '' ? undefined : options.prRef,
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
  sanitizePrRef,
  parseRevisionTag,
  resolveReleaseTags,
  parseArgs,
};
