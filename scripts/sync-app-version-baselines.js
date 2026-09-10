#!/usr/bin/env node
/**
 * Develop version-baseline sync -- #1807 (Option A), epic #1548.
 *
 * Read-only comparison between `origin/develop` and `origin/main`'s per-app `package.json`
 * `version` field. Closes the version-baseline-lag gap ADR 0081 Decision 6's pre-cut floor step
 * (`check-app-version-bump.js --floor`) doesn't cover: the floor step only fires the moment a
 * *promotion* actually touches an app, and the per-fix backport obligation (#1611, #861) only
 * fires the moment a *specific* staging repair or main hotfix touches an app -- neither is a
 * periodic reconciliation. A backport that's missed, delayed, or only partially applied can leave
 * `develop`'s source-tree version genuinely behind what's already running in production, even
 * though nothing about production safety depends on it -- ADR 0081 Decision 6's own floor check
 * still forces the correct (larger) leapfrogged bump the moment `develop` next actually touches
 * that app, per that Decision's own `[snapshot]` sub-clause on accepted numeric overlap between
 * channels. This script is a hygiene/reconciliation pass, not a safety mechanism.
 *
 * This script does not open the PR itself -- it only computes and reports which apps, if any,
 * need their `develop` baseline raised. Opening the PR is a promoter-run step
 * (`.agents/skills/promoter/references/promotion-runbook.md`'s "Sync develop's version baselines
 * from main" section), same tier as the pre-cut floor bump PR: an ordinary `develop`-base PR,
 * unattended per the promoter's own checkpoint table.
 *
 * **Additive only, never a downgrade (#1807's own explicit constraint).** An app is only ever
 * reported as needing sync when `main`'s version is a real semver increase over `develop`'s --
 * `develop.version >= main.version` is always left alone and reported separately, never bumped
 * down and never bumped at all.
 *
 * **Deliberately a separate script from `check-app-version-bump.js`, not a mode added to it.**
 * That script has had two recent regressions from scope creep in its `--floor` mode (#1740,
 * #1802) -- this is a distinct concern (baseline drift reconciliation against `main`, unconditional
 * on all five apps) from floor enforcement (a minimum bump required for an app a promotion is
 * actively touching, scoped to changed apps only, compared against `staging`). Conflating the two
 * is exactly the shape of mistake #1740/#1802 grew out of. This script instead *reuses*
 * `check-app-version-bump.js`'s exported `APPS`/`readVersionAt`/`parseVersion`/
 * `compareVersionTuples` rather than re-deriving app-list/version-read/semver-compare logic a
 * second time -- the same reuse pattern `resolve-build-skip-plan.js` already established for its
 * own sibling concern (reusing `check-tag-immutability.js`'s registry read and this same script's
 * dependency-fan-out/version-read logic instead of writing a second one). The reuse here is
 * strictly one-directional and read-only: this file adds nothing to, and is never `require()`-d
 * by, `check-app-version-bump.js`.
 *
 * **Interaction with #1610 (ADR 0081 Decisions 7/8 tag-immutability vs. candidate-identity
 * conflict): none.** #1610 is a build-time OCI-label/image-provenance mismatch on already
 * *published* image tags, surfaced by the promotion parity gate. This script only ever edits a
 * `package.json` `version` field in the source tree on `develop`, after `main` has already
 * deployed, and never builds or pushes an image. It does not read, write, or reason about the
 * `org.dgfy-platform.candidate-source-sha` label, does not trigger Decision 7's tag-immutability
 * guard (nothing here ever pushes an image tag, so there is no tag to collide with), and does not
 * change `check-image-version-parity.js`'s per-app comparison logic in any way. A future
 * promotion that later publishes a version this script wrote is still governed by Decision 6's
 * ordinary bump-mode rules (a `to-staging/*` candidate must clear the minor floor above `staging`
 * for any app it actually changed) exactly as if that version had been reached by a normal PR --
 * this script does not create, remove, or shortcut any of those checks. See the PR this script
 * ships in for the full statement.
 *
 * CLI:
 *   node scripts/sync-app-version-baselines.js [--develop-ref <ref>] [--main-ref <ref>] [--json]
 *     Defaults: --develop-ref origin/develop, --main-ref origin/main -- both must already be
 *     fetched locally (this script never fetches; same convention as check-app-version-bump.js's
 *     --floor mode, which likewise assumes the caller/runbook fetched first). Prints a
 *     human-readable report by default; --json prints the same data as JSON instead, for a caller
 *     that wants to consume it programmatically without re-parsing text (the promoter's own
 *     runbook instead `require()`s computeBaselineSync() directly -- see the runbook).
 *
 * Exit code: non-zero ONLY on a real read/parse failure (an app's version couldn't be read or
 * parsed at either ref) -- deliberately NOT on a non-empty needsSync list. Unlike
 * check-app-version-bump.js's --floor mode (a real go/no-go gate the promoter stops and resolves
 * before cutting a branch), this script's job is to propose, not to gate -- the promoter always
 * reads its output and decides whether to open a PR; it never treats "sync needed" as a failure to
 * fix before proceeding with anything else.
 */

const path = require('path');

const {
    APPS,
    readVersionAt,
    parseVersion,
    compareVersionTuples,
} = require('./check-app-version-bump');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Pure comparison across the five apps. `developRef`/`mainRef` are already-fetched git refs (e.g.
 * `origin/develop` / `origin/main`); `repoRoot` defaults to this repo. Every one of the five apps
 * is always evaluated -- unlike check-app-version-bump.js's --floor mode, there is no "changed
 * apps only" scoping here, because there is no diff to scope against: this compares two absolute
 * version numbers directly, not a set of changed files, and an app that has drifted needs exactly
 * the same reconciliation whether or not it happened to also change.
 */
function computeBaselineSync({ repoRoot = REPO_ROOT, developRef, mainRef }) {
    const results = APPS.map((app) => {
        const appDir = `apps/${app}`;
        const developVersionRaw = readVersionAt(repoRoot, developRef, appDir);
        const mainVersionRaw = readVersionAt(repoRoot, mainRef, appDir);
        const developVersion = parseVersion(developVersionRaw);
        const mainVersion = parseVersion(mainVersionRaw);

        if (!developVersion || !mainVersion) {
            return {
                app,
                appDir,
                developVersion: developVersionRaw,
                mainVersion: mainVersionRaw,
                needsSync: false,
                unparseable: true,
            };
        }

        // Strictly greater -- equal or develop-ahead never needs sync (additive only, #1807).
        const needsSync = compareVersionTuples(mainVersion, developVersion) > 0;

        return {
            app,
            appDir,
            developVersion: developVersionRaw,
            mainVersion: mainVersionRaw,
            needsSync,
            unparseable: false,
        };
    });

    return {
        results,
        needsSync: results.filter((entry) => entry.needsSync),
        upToDate: results.filter((entry) => !entry.needsSync && !entry.unparseable),
        invalid: results.filter((entry) => entry.unparseable),
        developRef,
        mainRef,
    };
}

// --- CLI ---------------------------------------------------------------------

function printResult(result) {
    if (result.needsSync.length > 0) {
        console.log(`[sync-app-version-baselines] Apps below main's baseline (develop < main -- would be raised to match main):`);
        for (const entry of result.needsSync) {
            console.log(`  - ${entry.app}: develop ${entry.developVersion} -> main ${entry.mainVersion}`);
        }
    } else {
        console.log("[sync-app-version-baselines] No apps below main's baseline -- nothing to sync.");
    }

    if (result.upToDate.length > 0) {
        const listed = result.upToDate
            .map((entry) => `${entry.app} (develop ${entry.developVersion} >= main ${entry.mainVersion})`)
            .join(', ');
        console.log(`[sync-app-version-baselines] Apps already at or above main's baseline (left untouched): ${listed}`);
    }

    if (result.invalid.length > 0) {
        console.error('[sync-app-version-baselines] Apps whose versions could not be read/parsed at one or both refs (treat as FAILED, not skipped):');
        for (const entry of result.invalid) {
            console.error(`  - ${entry.app}: develop="${entry.developVersion}" main="${entry.mainVersion}"`);
        }
    }
}

function parseArgs(argv) {
    const getFlag = (name, fallback) => {
        const idx = argv.indexOf(name);
        return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : fallback;
    };

    return {
        developRef: getFlag('--develop-ref', 'origin/develop'),
        mainRef: getFlag('--main-ref', 'origin/main'),
        json: argv.includes('--json'),
    };
}

function main() {
    const { developRef, mainRef, json } = parseArgs(process.argv.slice(2));
    const result = computeBaselineSync({ repoRoot: REPO_ROOT, developRef, mainRef });

    if (json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        printResult(result);
    }

    process.exitCode = result.invalid.length > 0 ? 1 : 0;
}

if (require.main === module) {
    main();
}

module.exports = {
    computeBaselineSync,
};
