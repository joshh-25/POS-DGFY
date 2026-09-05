#!/usr/bin/env node
/**
 * Build-skip plan for `deploy-main.yml` (PROD) -- #1610, ADR 0081 Decision 7 residue.
 *
 * `deploy-main.yml` rebuilds every app on every dispatch by default (its four `build_*` inputs are
 * manual, and the promoter's own documented runbook never sets them -- see #1610's own investigation
 * and ADR 0081's matching Amendment). A retry after a partial failure (one app's tag already
 * published at a different revision, tripping Decision 7's guard) re-rebuilds every app that
 * already succeeded too, tripping the SAME guard for each of them in turn -- the exact incident this
 * script exists to prevent.
 *
 * This script computes, per app, whether it is safe to SKIP a build entirely -- never whether it is
 * safe to PUBLISH. Decision 7's guard (`scripts/check-tag-immutability.js`) is reused unmodified and
 * still runs, unconditionally, in every build that is actually attempted; this only decides whether
 * an attempt is made at all. Three outcomes per app (plan §1):
 *
 *   1. The version tag isn't published yet                              -> build normally (nothing
 *      to skip).
 *   2. The tag IS published, under the CURRENT revision (idempotent     -> skip, trivially -- no
 *      re-dispatch of the same commit)                                     content diff needed.
 *   3. The tag IS published, under a DIFFERENT revision, and this app's -> skip -- the rebuild would
 *      tracked build inputs are byte-for-byte unchanged between that       be a content-identical
 *      revision and the current one                                       no-op anyway.
 *   4. The tag IS published, under a DIFFERENT revision, and this app's -> do NOT skip. Build
 *      tracked build inputs genuinely differ                               normally -- the existing,
 *                                                                          unmodified Decision 7
 *                                                                          guard refuses it at the
 *                                                                          end, exactly as it does
 *                                                                          today. No new failure path
 *                                                                          is invented for this case.
 *
 * Fail-closed asymmetry (plan §2), deliberate, stated here rather than left implicit: a per-app
 * indeterminate read -- the registry inspect errors, the label is unreadable/disagreeing, no current
 * revision was supplied, or the content diff itself can't be computed (unresolvable SHA, shallow
 * git history, an unreadable package.json at either revision) -- degrades to `{ skip: false }`,
 * i.e. BUILD, never skip. Skipping when it shouldn't have means PROD silently runs stale code with
 * no visible failure; building when it didn't need to means, at worst, wasted CI minutes and the
 * SAME Decision 7 refusal that already fires today -- a known, already-loud outcome. Only a genuine
 * CRASH of this script (a bug, not a per-app indeterminate read) is allowed to halt the whole
 * dispatch -- the CLI lets an uncaught exception propagate and exit non-zero, so the calling
 * `resolve-build-plan` job fails outright and every downstream build job is transitively skipped via
 * its own `needs: resolve-build-plan` / `if: needs.resolve-build-plan.result == 'success'` gate, the
 * same way a `guard-branch` failure already halts the dispatch today. Per-app reads never throw --
 * `resolveBuildSkipPlan()` below catches per-app and folds an unexpected exception into the same
 * fail-closed shape, so one app's freak failure can't crash the whole plan for every other app.
 *
 * Content-equivalence path scope (plan §3, §7) is APP DIR + its resolved `file:` dependency
 * packages + `infrastructure/docker/<app>/` -- deliberately WIDER than
 * `check-app-version-bump.js`'s own `detectChangedApps()` scope, which has no reason to include the
 * Dockerfile directory (a version-bump *requirement* is about source changes, not build-recipe
 * changes). A Dockerfile-only edit (an entrypoint fix, a base-image bump, a build-stage change)
 * genuinely changes the built image without touching `apps/<app>/` and without requiring a version
 * bump under Decision 6 -- omitting `infrastructure/docker/<app>/` here would make this script
 * wrongly skip a build that actually needs to happen.
 *
 * Reuses, does not reimplement:
 *   - `decideImmutability` / `runInspect` from `check-tag-immutability.js` (Decision 7's own pure
 *     verdict logic and its real `docker buildx imagetools inspect` call).
 *   - `resolveFileDependencyPackages` / `readVersionAt` / `APPS` from `check-app-version-bump.js`.
 *   - `IMAGE_NAME_BY_APP` from `check-image-version-parity.js`.
 *
 * CLI:
 *   node scripts/resolve-build-skip-plan.js --revision <github.sha> [--apps app1,app2,...]
 *     [--project-root <path>]
 *
 *   Prints one JSON blob on its own stdout line (mirrors `check-promotion-candidate.js
 *   --resolve-app-shas`'s own "machine-readable, on its own stdout line" convention):
 *     {"dgfy-api":{"skip":true,"code":"content-equivalent","detail":"..."}, ...}
 *   and, when `GITHUB_OUTPUT` is set in the environment (a real CI dispatch), also appends one
 *   `should_build_<app>=true|false` line per app to it, so the calling workflow job can read each
 *   verdict as a normal job output without parsing JSON in bash.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { decideImmutability, runInspect } = require('./check-tag-immutability');
const { APPS, resolveFileDependencyPackages, readVersionAt } = require('./check-app-version-bump');
const { IMAGE_NAME_BY_APP } = require('./check-image-version-parity');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Content-equivalence path scope for one app, resolved AT `ref` (the current build's revision --
 * the `file:` dependency fan-out is read from that app's package.json as it exists right now, same
 * convention `check-app-version-bump.js`'s own `detectChangedApps()` uses). See the file header for
 * why `infrastructure/docker/<app>/` is included here but not in that script's own scope.
 */
function buildInputPathsForApp(repoRoot, ref, app) {
  const appDir = `apps/${app}`;
  const dockerDir = `infrastructure/docker/${app}`;
  const depPackages = resolveFileDependencyPackages(repoRoot, ref, appDir);
  return [appDir, dockerDir, ...depPackages];
}

/**
 * `git diff --name-only <fromRevision> <toRevision> -- <paths...>` -- a plain two-revision diff
 * (not `A...B`/merge-base), since `fromRevision` is an already-published tag's recorded revision
 * and `toRevision` is the current build's revision; we want exactly what changed between those two
 * trees, not a symmetric/merge-base comparison. Returns `null`, not `[]`, on any git failure
 * (unresolvable SHA -- e.g. history too shallow to contain it -- or any other error) so callers can
 * fail closed distinctly from "the diff succeeded and found zero changed files".
 */
function gitDiffChangedFiles({ repoRoot, fromRevision, toRevision, paths }) {
  const result = spawnSync('git', ['diff', '--name-only', fromRevision, toRevision, '--', ...paths], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return null;
  }
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Pure per-app verdict. See the file header for the four-outcome table and the fail-closed
 * reasoning. `inspectFn`/`diffFn` are injectable so tests never shell out to `docker`/`git`.
 *
 * options:
 *   - app (required): one of APPS, used only for path scoping and error messages.
 *   - image (required): `IMAGE_NAME_BY_APP(app)`, passed explicitly rather than re-derived so a
 *     caller can override it in a test.
 *   - versionTag (required): the PROD (bare, no channel suffix) `X.Y.Z` tag this app would publish.
 *   - currentRevision (required): `github.sha` for this build.
 *   - repoRoot (default: this repo).
 *   - inspectFn (default: runInspect from check-tag-immutability.js).
 *   - diffFn (default: gitDiffChangedFiles above).
 *
 * Returns { skip: boolean, code, detail }.
 */
function decideBuildSkip({ app, image, versionTag, currentRevision, repoRoot = REPO_ROOT, inspectFn = runInspect, diffFn = gitDiffChangedFiles }) {
  const imageRef = `${image}:${versionTag}`;
  const inspectResult = inspectFn(imageRef);
  const verdict = decideImmutability({
    inspectStatus: inspectResult.status,
    inspectStdout: inspectResult.stdout,
    inspectStderr: inspectResult.stderr,
    currentRevision,
  });

  // decideImmutability's own fail-closed verdict (no currentRevision supplied, inspect errored for
  // an unclassified reason, or the JSON/label couldn't be parsed) -- degrade to BUILD, per §2.
  if (verdict.action === 'error') {
    return { skip: false, code: 'unreadable-fail-closed', detail: verdict.reason };
  }

  // Outcome 1: tag not published yet -- nothing to skip.
  if (verdict.action === 'push' && verdict.existingRevision === undefined) {
    return { skip: false, code: 'not-published', detail: verdict.reason };
  }

  // Outcome 2: idempotent re-dispatch of the SAME revision -- trivially skip-eligible. No diff call
  // is made at all here (asserted by the test suite: the injected diffFn must never be invoked for
  // this case), since there is nothing to diff -- it's the literal same commit.
  if (verdict.action === 'push' && verdict.existingRevision === currentRevision) {
    return { skip: true, code: 'idempotent-same-revision', detail: verdict.reason };
  }

  // verdict.action === 'refuse' from here on -- tag published under a DIFFERENT revision (or the
  // label itself is missing/disagreeing, in which case existingRevision is null and there is
  // nothing to diff against -- fail closed the same as an unreadable inspect above).
  const existingRevision = verdict.existingRevision;
  if (!existingRevision) {
    return { skip: false, code: 'unreadable-fail-closed', detail: verdict.reason };
  }

  const paths = buildInputPathsForApp(repoRoot, currentRevision, app);
  const changedFiles = diffFn({ repoRoot, fromRevision: existingRevision, toRevision: currentRevision, paths });

  if (changedFiles === null) {
    // The diff itself couldn't be computed (unresolvable SHA, shallow git history, dep-graph
    // undeterminable) -- fail closed, mirroring §2's reasoning applied inside this content-
    // equivalence step specifically, not just at the registry-read layer above.
    return {
      skip: false,
      code: 'diff-unavailable-fail-closed',
      detail: `could not diff ${existingRevision}..${currentRevision} for ${app}'s tracked build inputs (${paths.join(', ')}) -- refusing to guess whether content is unchanged`,
    };
  }

  if (changedFiles.length === 0) {
    // Outcome 3: content-equivalent -- provably safe to skip. The existing, unmodified Decision 7
    // guard is never even invoked for this app on this dispatch.
    return {
      skip: true,
      code: 'content-equivalent',
      detail: `${existingRevision}..${currentRevision}: no changes under ${paths.join(', ')} -- tag already published for this content, skipping`,
    };
  }

  // Outcome 4: content genuinely differs -- do NOT skip. Build normally; the existing, unmodified
  // Decision 7 guard refuses it at the end, exactly as it does today. This is not a new failure
  // path -- "don't skip" already produces the required "fail loudly" behavior (plan §1).
  return {
    skip: false,
    code: 'content-changed',
    detail: `${existingRevision}..${currentRevision}: ${changedFiles.length} changed file(s) under tracked build inputs (e.g. "${changedFiles[0]}") -- building normally so Decision 7's guard can refuse the conflicting publish`,
  };
}

/**
 * Resolves the build-skip plan for every requested app. PROD (deploy-main.yml) always uses the bare
 * `X.Y.Z` version tag (ADR 0081 Decision 1's PROD channel suffix is "") -- `versionTag` is read from
 * each app's own `apps/<app>/package.json` at `currentRevision`, never hardcoded.
 *
 * A per-app resolution that throws unexpectedly (a bug, not an anticipated indeterminate read --
 * those are already handled inside decideBuildSkip itself) is caught here and folded into the same
 * fail-closed shape, so one app's freak failure never crashes the plan for every other app. This is
 * distinct from -- and does not substitute for -- the whole-job-crash fail-closed path: an
 * exception escaping resolveBuildSkipPlan() itself (e.g. a bug in this loop, not in one app's
 * resolution) is still allowed to propagate out of the CLI and fail the calling CI job, per §2/§7.
 */
function resolveBuildSkipPlan({ apps = APPS, currentRevision, repoRoot = REPO_ROOT, inspectFn = runInspect, diffFn = gitDiffChangedFiles } = {}) {
  const plan = {};
  for (const app of apps) {
    try {
      const image = IMAGE_NAME_BY_APP(app);
      const versionTag = readVersionAt(repoRoot, currentRevision, `apps/${app}`);
      if (!versionTag) {
        plan[app] = {
          skip: false,
          code: 'version-unreadable-fail-closed',
          detail: `could not read apps/${app}/package.json version at ${currentRevision} -- refusing to guess, building normally`,
        };
        continue;
      }
      plan[app] = decideBuildSkip({ app, image, versionTag, currentRevision, repoRoot, inspectFn, diffFn });
    } catch (error) {
      plan[app] = {
        skip: false,
        code: 'unexpected-error-fail-closed',
        detail: `resolving ${app}'s build-skip verdict threw unexpectedly (${error.message}) -- refusing to guess, building normally`,
      };
    }
  }
  return plan;
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const options = { revision: '', apps: null, projectRoot: REPO_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--revision') {
      options.revision = argv[++index] || '';
    } else if (arg === '--apps') {
      const raw = argv[++index] || '';
      options.apps = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.revision) {
    throw new Error('--revision is required (github.sha for this build)');
  }
  return options;
}

function printPlan(plan) {
  for (const [app, result] of Object.entries(plan)) {
    const label = result.skip ? 'SKIP' : 'BUILD';
    console.log(`[resolve-build-skip-plan] [${label}] ${app} (${result.code}): ${result.detail}`);
  }
  // Machine-readable, on its own stdout line -- mirrors check-promotion-candidate.js
  // --resolve-app-shas's convention so a caller parses this line, not the human-readable ones above.
  console.log(JSON.stringify(plan));
}

function writeGithubOutput(plan) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(plan)
    .map(([app, result]) => `should_build_${app.replace(/-/g, '_')}=${result.skip ? 'false' : 'true'}`)
    .join('\n');
  fs.appendFileSync(outputPath, `${lines}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = resolveBuildSkipPlan({
    apps: options.apps || undefined,
    currentRevision: options.revision,
    repoRoot: options.projectRoot,
  });
  printPlan(plan);
  writeGithubOutput(plan);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildInputPathsForApp,
  gitDiffChangedFiles,
  decideBuildSkip,
  resolveBuildSkipPlan,
  parseArgs,
};
