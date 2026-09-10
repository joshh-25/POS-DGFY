#!/usr/bin/env node
/**
 * Per-app container SemVer bump check (advisory) -- #1560, Wave 1 of epic #1548.
 *
 * Generalizes scripts/check-pos-receipt-version-bump.js's "did the version change" check
 * to all five deployable apps, with two upgrades that script doesn't have:
 *   1. a real semver *increase* (parsed X.Y.Z tuple compare), not mere inequality;
 *   2. a mode switch on the PR's (base, head) pair -- the required bump level differs
 *      between an ordinary develop PR, a develop->staging promotion, a staging hotfix,
 *      a staging->main release, and a main hotfix. See ADR 0081 (issue #1559, pinned
 *      verbatim in #1560's own body so this file doesn't need that ADR merged first).
 *
 * "Changed app" is direct apps/<app>/ changes, or a changed packages/<pkg>/ that <app>'s
 * own package.json lists as a `file:` dependency -- read from package.json, never
 * hardcoded, so a new fan-out (or a dropped one) self-describes.
 *
 * Root package.json, packages/web-core, packages/shared-constants, and
 * packages/pos-receipt are out of scope for *this* check's own version requirement --
 * pos-receipt keeps its separate, existing check unchanged (do not touch that file).
 *
 * CLI:
 *   node scripts/check-app-version-bump.js [--staged]
 *     PR-check mode (the shape scripts/pr-checks.js and shared-changed-paths.yml use).
 *     Resolves the base ref the same way check-pos-receipt-version-bump.js does
 *     (GITHUB_BASE_REF merge-base -> GITHUB_EVENT_BEFORE/CI_COMMIT_BEFORE_SHA -> HEAD~1),
 *     and the required mode from GITHUB_BASE_REF/GITHUB_HEAD_REF. --staged compares
 *     HEAD against the index instead (mirrors check-compliance-impact.js's --staged
 *     shape; not wired into .husky/pre-commit by this issue, just not blocked either).
 *
 *   node scripts/check-app-version-bump.js --floor --base <ref> --head <ref>
 *     Standalone minor-floor report, outside any PR context -- e.g.
 *     `--base origin/staging --head origin/develop` before cutting
 *     to-staging/<candidate_id>. Scoped to apps that actually changed between the two
 *     refs (#1740 -- reuses detectChangedApps(), same scope runCheck() uses; an
 *     unchanged app is never listed as below floor, per ADR 0081 Decision 6's own
 *     "apps with no changes keep their version untouched"). Lists every in-scope app
 *     below floor with its current (head) version and the minimum acceptable one
 *     (X.(Y+1).0). Exits non-zero iff at least one in-scope app is below floor, an
 *     in-scope app's version couldn't be parsed, or the changed-file diff itself
 *     couldn't be computed.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
    REACHABILITY_SCOPE_DIRS,
    ENTRY_FILE_BY_APP,
    computeAppReachableModules,
    auditReachabilitySafety,
} = require('./resolve-web-core-reachability');

const REPO_ROOT = path.resolve(__dirname, '..');

const APPS = Object.freeze([
    'dgfy-api',
    'dgfy-migration-runner',
    'dgfy-ims',
    'dgfy-pos',
    'dgfy-storefront',
]);

// Same prefix-table shape as check-compliance-impact.js's PROMOTION_HEAD_BY_BASE /
// PROMOTION_HEAD_PREFIX_BY_BASE (lines ~206-233 there), mapped to a required bump
// mode instead of an exemption -- per #1560's own pinned copy of ADR 0081's table.
const PROMOTION_HEAD_PREFIX_BY_BASE = Object.freeze({
    staging: /^to-staging\//,
    main: /^release\//,
});

const runCommand = (command, { allowFail = false, cwd = REPO_ROOT } = {}) => {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd }).trim();
    } catch (error) {
        if (allowFail) return '';
        throw error;
    }
};

const splitLines = (raw) => (
    String(raw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
);

const unique = (values) => [...new Set(values)];

// Mirrors check-pos-receipt-version-bump.js's resolveBaseRef() fallback chain
// verbatim, minus the --staged mode (handled separately here, at the runCheck
// level, since --staged also changes what "changed files" and "head version"
// mean -- not just which ref anchors the diff).
function resolveBaseGitRef(repoRoot, { baseBranchName, headBranchName } = {}) {
    const branch = baseBranchName !== undefined ? baseBranchName : process.env.GITHUB_BASE_REF;
    const head = headBranchName !== undefined ? headBranchName : process.env.GITHUB_HEAD_REF;
    if (branch) {
        runCommand(`git fetch --no-tags --prune --depth=200 origin ${branch}`, { cwd: repoRoot, allowFail: true });
        // For promotion into staging (to-staging/* -> staging) or main (release/* -> main), we want
        // to compare directly against the target branch tip (origin/staging or origin/main), matching
        // ADR 0081 Decision 6 ("at least one minor above staging's current version" / "increase vs main").
        // A merge-base against an older cut point would misread cherry-picked staging repairs as new candidate changes.
        if (branch === 'staging' && head && PROMOTION_HEAD_PREFIX_BY_BASE.staging.test(head)) {
            const stagingRef = runCommand(`git rev-parse --verify origin/${branch}`, { cwd: repoRoot, allowFail: true });
            if (stagingRef) return stagingRef;
        }
        if (branch === 'main' && head && PROMOTION_HEAD_PREFIX_BY_BASE.main.test(head)) {
            const mainRef = runCommand(`git rev-parse --verify origin/${branch}`, { cwd: repoRoot, allowFail: true });
            if (mainRef) return mainRef;
        }
        const mergeBase = runCommand(`git merge-base HEAD origin/${branch}`, { cwd: repoRoot, allowFail: true });
        if (mergeBase) return mergeBase;
    }

    const beforeSha = process.env.GITHUB_EVENT_BEFORE || process.env.CI_COMMIT_BEFORE_SHA;
    if (beforeSha && !/^0+$/.test(beforeSha)) return beforeSha;

    return runCommand('git rev-parse HEAD~1', { cwd: repoRoot, allowFail: true }) || null;
}

// Mirrors check-pos-receipt-version-bump.js's readVersionAt() `git show <ref>:<path>`
// pattern. `ref === ''` reads the index (`git show :path`) -- used by --staged.
function readJsonAt(repoRoot, ref, relativePath) {
    const raw = runCommand(`git show ${ref}:${relativePath}`, { cwd: repoRoot, allowFail: true });
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function readVersionAt(repoRoot, ref, appDir) {
    const pkg = readJsonAt(repoRoot, ref, `${appDir}/package.json`);
    return pkg && typeof pkg.version === 'string' ? pkg.version : null;
}

// Reads the `file:` dependency fan-out for one app from its own package.json at the
// given ref -- never hardcoded, so shared-constants fanning out to all five apps (or
// a future package fanning out to a different subset) self-describes from the source
// of truth instead of drifting out of sync with a second, hand-maintained list here.
function resolveFileDependencyPackages(repoRoot, ref, appDir) {
    const pkg = readJsonAt(repoRoot, ref, `${appDir}/package.json`);
    if (!pkg) return [];

    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const packages = [];
    for (const spec of Object.values(deps)) {
        if (typeof spec !== 'string' || !spec.startsWith('file:')) continue;
        const target = spec.slice('file:'.length);
        packages.push(path.posix.normalize(path.posix.join(appDir, target)));
    }
    return unique(packages);
}

// Bare X.Y.Z is what a source-tree package.json is expected to carry at this stage
// (ADR 0081 Decision 3) -- strip an incidental pre-release/build suffix rather than
// choke on one, but still reject anything whose numeric core isn't exactly 3 parts.
function parseVersion(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const bare = text.split(/[-+]/)[0];
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(bare);
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersionTuples(a, b) {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

// The mode-switch table from #1560's body (verbatim copy of ADR 0081's pinned
// decision), keyed on the raw GITHUB_BASE_REF / GITHUB_HEAD_REF branch *names* --
// distinct from baseGitRef/headGitRef, which are the git refs the diff itself runs
// against. Falls back to the least restrictive mode ('any-increase', develop's own
// mode) for any base this table doesn't recognize, or when branch names aren't
// available at all (not a real PR context) -- matching "patch is the expected
// default, level not policed" rather than inventing a stricter unnamed mode.
function resolveMode(baseBranchName, headBranchName) {
    const base = String(baseBranchName || '').trim();
    const head = String(headBranchName || '').trim();

    if (base === 'staging') {
        return PROMOTION_HEAD_PREFIX_BY_BASE.staging.test(head) ? 'minor-floor' : 'patch-only';
    }
    if (base === 'main') {
        return PROMOTION_HEAD_PREFIX_BY_BASE.main.test(head) ? 'any-increase' : 'patch-only';
    }
    return 'any-increase';
}

function describeModeRequirement(mode) {
    if (mode === 'minor-floor') return 'at least a minor bump above the base version (head.major > base.major, or head.minor > base.minor)';
    if (mode === 'patch-only') return 'major and minor unchanged, with patch strictly increased';
    return 'a strict semver increase over the base version (any component)';
}

// Pure evaluation of one app's (baseVersion, headVersion) pair against a mode.
// No git/fs access -- takes raw version strings so it's directly unit-testable.
function evaluateBump(mode, baseVersionRaw, headVersionRaw) {
    if (!baseVersionRaw) {
        return {
            ok: true,
            code: 'new-app',
            detail: `no version found at the base ref (new app or package) -- nothing to compare, head=${headVersionRaw ?? '(missing)'}`,
        };
    }

    if (!headVersionRaw) {
        return { ok: false, code: 'missing-head', detail: 'could not read a version from package.json at HEAD' };
    }

    const base = parseVersion(baseVersionRaw);
    const head = parseVersion(headVersionRaw);

    if (!base) {
        return { ok: false, code: 'unparseable-base', detail: `base version "${baseVersionRaw}" is not a parseable X.Y.Z semver` };
    }
    if (!head) {
        return { ok: false, code: 'unparseable-head', detail: `head version "${headVersionRaw}" is not a parseable X.Y.Z semver` };
    }

    let ok;
    if (mode === 'minor-floor') {
        ok = head.major > base.major || (head.major === base.major && head.minor > base.minor);
    } else if (mode === 'patch-only') {
        ok = head.major === base.major && head.minor === base.minor && head.patch > base.patch;
    } else {
        ok = compareVersionTuples(head, base) > 0;
    }

    return {
        ok,
        code: ok ? 'ok' : 'insufficient-bump',
        detail: ok
            ? `${baseVersionRaw} -> ${headVersionRaw} (mode "${mode}")`
            : `${baseVersionRaw} -> ${headVersionRaw} does not satisfy mode "${mode}" (needs ${describeModeRequirement(mode)})`,
    };
}

// Direct apps/<app>/ change, or a change under any `file:` package that app depends
// on (per its own package.json at headGitRef) -- evaluated against the supplied
// changedFiles list so this stays a pure function of its inputs.
function detectChangedApps(repoRoot, headGitRef, changedFiles) {
    return APPS.map((app) => {
        const appDir = `apps/${app}`;
        const directChange = changedFiles.some((file) => file.startsWith(`${appDir}/`));
        const depPackages = resolveFileDependencyPackages(repoRoot, headGitRef, appDir);
        const fanOutPackage = depPackages.find((pkgDir) => changedFiles.some((file) => file.startsWith(`${pkgDir}/`)));

        return {
            app,
            appDir,
            changed: directChange || Boolean(fanOutPackage),
            reason: directChange ? 'direct' : (fanOutPackage ? `fan-out:${fanOutPackage}` : 'unchanged'),
        };
    });
}

// --- Phase 303 (#1695): import-graph-aware reachability, SHADOW MODE ONLY --------------------
//
// detectChangedApps() above is UNCHANGED by this section -- it stays the sole source of the real,
// gating "changed" verdict (directory containment, not reachability). Everything below is an
// additive, log-only companion: for every app whose "changed: true" verdict came from a fan-out
// package (never a direct apps/<app>/ change -- that verdict is unconditional and has nothing to
// narrow), compute what the #1695 plan's reachability oracle WOULD have said, and print it
// alongside the old verdict. This never feeds back into detectChangedApps()/runCheck()'s own `ok`/
// `changed` results -- see runReachabilityShadowAudit()'s call site in main() for the isolation.
//
// A changed file that no longer exists at headGitRef (deleted between base and head) can never
// appear in a reachability graph built from the working tree -- §3.4's conservative default
// applies: treat it as an automatic "changed" rather than silently reading its absence from the
// graph as "not reachable".
function fileExistsAtRef(repoRoot, ref, relativePath) {
    try {
        execSync(`git cat-file -e ${ref}:${relativePath}`, { cwd: repoRoot, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// Pure-ish (one git call for deletion checks) per-app shadow verdict. `entry` is one of
// detectChangedApps()'s own returned objects (already filtered to `changed: true` by the caller);
// `changedFiles` is the same list runCheck() already computed. Never throws -- any unexpected
// failure degrades to the same conservative "changed" the old verdict already reached, logged as
// its own code so a shadow-mode disagreement is never silently swallowed as agreement.
async function computeReachabilityShadowVerdict(repoRoot, headGitRef, entry, changedFiles) {
    if (!entry.reason.startsWith('fan-out:')) {
        return { applicable: false, reason: 'not-fan-out-triggered (direct app change -- nothing to narrow)' };
    }

    const fanOutPackage = entry.reason.slice('fan-out:'.length);
    const entryFile = ENTRY_FILE_BY_APP[entry.app];
    if (!entryFile) {
        return { applicable: false, reason: `no known bundler entry for ${entry.app} (backend app -- Node module resolution, out of scope per the #1695 plan's §3.5)` };
    }

    try {
        const scopeDirs = REACHABILITY_SCOPE_DIRS.filter((dir) => fs.existsSync(path.join(repoRoot, dir)));
        // RF-2 (PR #1708 review): the safety-net audit must also cover this app's own source tree
        // and packages/pos-receipt, not just packages/web-core/packages/shared-constants -- a
        // self-referential `@/...`/`@sieitzz/...` alias this module can't resolve can appear in
        // either. See resolve-web-core-reachability.js's ALIAS_EDGE_SCAN_DIRS header comment.
        const aliasScanDirs = [...scopeDirs, 'packages/pos-receipt', `apps/${entry.app}`]
            .filter((dir) => fs.existsSync(path.join(repoRoot, dir)));
        const audit = auditReachabilitySafety(repoRoot, scopeDirs, aliasScanDirs);
        if (!audit.safe) {
            return {
                applicable: true,
                changed: true,
                code: 'safety-net-tripped',
                safetyNetPassed: false,
                violations: audit.violations,
                detail: `safety net found ${audit.violations.length} disqualifying pattern(s) in ${aliasScanDirs.join(', ')} -- falling back to conservative "changed" (matches the old verdict)`,
            };
        }

        const reachable = await computeAppReachableModules(repoRoot, entryFile);
        const relevantChangedFiles = changedFiles.filter((file) => file.startsWith(`${fanOutPackage}/`));
        const reachableHits = relevantChangedFiles.filter((file) => reachable.has(file));
        // §3.4: a file deleted between base and head can never appear in a graph built from HEAD's
        // working tree -- its absence there must not be silently read as "not reachable, therefore
        // not obligating a bump". Tracked separately from reachableHits so the two are
        // distinguishable in the printed code/detail, not folded into one ambiguous "reachable".
        const deletedHits = relevantChangedFiles.filter((file) => !reachable.has(file) && !fileExistsAtRef(repoRoot, headGitRef, file));
        const changed = reachableHits.length > 0 || deletedHits.length > 0;
        const code = reachableHits.length > 0 ? 'reachable' : (deletedHits.length > 0 ? 'deleted-file-fail-closed' : 'not-reachable');

        return {
            applicable: true,
            changed,
            code,
            safetyNetPassed: true,
            reachableCount: reachable.size,
            hitFiles: [...reachableHits, ...deletedHits],
            detail: changed
                ? `${reachableHits.length > 0 ? `reachability hit: ${reachableHits.slice(0, 3).join(', ')}${reachableHits.length > 3 ? ', ...' : ''}` : ''}`
                  + `${reachableHits.length > 0 && deletedHits.length > 0 ? '; ' : ''}`
                  + `${deletedHits.length > 0 ? `${deletedHits.length} deleted file(s) can't be checked for reachability, conservatively counted as changed: ${deletedHits.slice(0, 3).join(', ')}${deletedHits.length > 3 ? ', ...' : ''}` : ''}`
                : `none of ${relevantChangedFiles.length} changed file(s) under ${fanOutPackage} are reachable from ${entryFile} (${reachable.size} web-core/shared-constants modules reachable in total)`,
        };
    } catch (error) {
        return {
            applicable: true,
            changed: true,
            code: 'shadow-error-fail-closed',
            safetyNetPassed: false,
            detail: `reachability shadow computation threw unexpectedly (${error.message}) -- falling back to conservative "changed" (matches the old verdict)`,
        };
    }
}

// LOG-ONLY: prints the old directory-level verdict and the new reachability verdict side by side
// for every fan-out-triggered changed app, plus whether the safety-net audit passed. Never mutates
// `result`, never throws past its own boundary (see main()'s try/catch around this call), and has
// zero influence on process.exitCode -- CI still gates on the OLD verdict only.
async function runReachabilityShadowAudit(result) {
    if (result.skipped || result.appResults.length === 0) return;

    for (const entry of result.appResults) {
        if (!entry.reason.startsWith('fan-out:')) continue;

        const shadow = await computeReachabilityShadowVerdict(result.repoRoot, result.headGitRef, entry, result.changedFiles);
        if (!shadow.applicable) {
            console.log(`[check:app-versions] [SHADOW] ${entry.app}: old=changed (${entry.reason}) new=n/a -- ${shadow.reason}`);
            continue;
        }

        const agreement = shadow.changed === entry.changed ? 'AGREE' : 'DISAGREE';
        console.log(
            `[check:app-versions] [SHADOW] ${entry.app}: old=changed (${entry.reason}) `
            + `new=${shadow.changed ? 'changed' : 'unchanged'} (${shadow.code}) `
            + `safety-net=${shadow.safetyNetPassed ? 'PASS' : 'FAIL'} agreement=${agreement} -- ${shadow.detail}`,
        );
    }
}

/**
 * PR-check mode: for every changed app, require the bump level the (base, head)
 * mode demands. options:
 *   - repoRoot (default: this repo)
 *   - staged (default: false) -- compare HEAD against the index instead of a base ref
 *   - baseBranchName / headBranchName (default: GITHUB_BASE_REF / GITHUB_HEAD_REF env)
 *   - baseGitRef / headGitRef (default: resolved via resolveBaseGitRef() / 'HEAD',
 *     or 'HEAD' / '' for --staged) -- override lets tests skip remote resolution
 *   - changedFiles (default: computed via `git diff --name-only`) -- override lets
 *     tests skip building a real diff
 */
function runCheck(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const staged = Boolean(options.staged);
    const baseBranchName = options.baseBranchName !== undefined ? options.baseBranchName : process.env.GITHUB_BASE_REF;
    const headBranchName = options.headBranchName !== undefined ? options.headBranchName : process.env.GITHUB_HEAD_REF;

    const headGitRef = options.headGitRef !== undefined ? options.headGitRef : (staged ? '' : 'HEAD');
    let baseGitRef = options.baseGitRef;
    if (baseGitRef === undefined) {
        baseGitRef = staged ? 'HEAD' : resolveBaseGitRef(repoRoot, { baseBranchName, headBranchName });
    }

    if (!baseGitRef) {
        return { ok: true, skipped: true, reason: 'no-base-ref', mode: null, baseGitRef: null, headGitRef, repoRoot, changedFiles: [], appResults: [] };
    }

    const changedFiles = options.changedFiles !== undefined
        ? options.changedFiles
        : splitLines(runCommand(
            staged ? 'git diff --cached --name-only' : `git diff --name-only ${baseGitRef}..${headGitRef}`,
            { cwd: repoRoot, allowFail: true },
        ));

    const mode = resolveMode(baseBranchName, headBranchName);
    const changedApps = detectChangedApps(repoRoot, headGitRef, changedFiles).filter((entry) => entry.changed);

    if (changedApps.length === 0) {
        return { ok: true, skipped: true, reason: 'no-app-changed', mode, baseGitRef, headGitRef, repoRoot, changedFiles, appResults: [] };
    }

    const appResults = changedApps.map((entry) => {
        const baseVersion = readVersionAt(repoRoot, baseGitRef, entry.appDir);
        const headVersion = readVersionAt(repoRoot, headGitRef, entry.appDir);
        const bump = evaluateBump(mode, baseVersion, headVersion);
        return { ...entry, baseVersion, headVersion, ...bump };
    });

    return {
        ok: appResults.every((entry) => entry.ok),
        skipped: false,
        reason: null,
        mode,
        baseGitRef,
        headGitRef,
        repoRoot,
        changedFiles,
        appResults,
    };
}

/**
 * Standalone --floor mode: for every app whose files changed between baseGitRef and
 * headGitRef -- directly under apps/<app>/, or via a changed `file:` dependency
 * package, the same scope detectChangedApps() gives runCheck() -- is headGitRef's
 * version at least a minor above baseGitRef's? Used by the promoter ahead of cutting
 * to-staging/<candidate_id>.
 *
 * #1740: this used to iterate the full, hardcoded APPS list unconditionally, with no
 * change detection at all -- flagging (and forcing a bump on) an app whose version
 * simply hadn't moved because nothing in it changed, the exact case ADR 0081
 * Decision 6 says to skip ("Apps with no changes keep their version untouched"). Now
 * reuses detectChangedApps() -- the same function runCheck() already uses -- so an
 * app is only ever evaluated against the floor when it's actually in scope for this
 * promotion; `file:` fan-out (e.g. a packages/web-core change bumping every frontend
 * that depends on it) is preserved exactly as-is, since detectChangedApps() is the
 * single source of truth for that already.
 *
 * `changedFiles` may be supplied directly (tests); by default this diffs
 * baseGitRef..headGitRef (two-dot) directly between the two branch tips. #1802:
 * this previously used a three-dot merge-base diff (baseGitRef...headGitRef),
 * which diffed from git merge-base base head to head. When staging repairs or
 * hotfixes are cherry-picked back to develop, the git merge-base remains before
 * those repairs, falsely flagging backported (content-identical) apps as changed
 * and demanding an unnecessary minor bump. Two-dot diff directly measures tree
 * content divergence between the two refs. A
 * failure computing that diff (unresolvable ref, shallow history, etc.) must never
 * silently read as "zero files changed" -- that would degrade to a false "floor
 * clear" on exactly the gate a promotion depends on -- so it's surfaced as its own
 * `diffError` instead of an empty change set.
 */
function runFloor({ repoRoot = REPO_ROOT, baseGitRef, headGitRef, changedFiles: changedFilesOverride }) {
    let changedFiles;
    let diffError = null;
    if (changedFilesOverride !== undefined) {
        changedFiles = changedFilesOverride;
    } else {
        try {
            changedFiles = splitLines(runCommand(`git diff --name-only ${baseGitRef}..${headGitRef}`, { cwd: repoRoot }));
        } catch (error) {
            changedFiles = [];
            diffError = error.message || String(error);
        }
    }

    const changedApps = diffError
        ? []
        : detectChangedApps(repoRoot, headGitRef, changedFiles).filter((entry) => entry.changed);

    const results = changedApps.map(({ app, appDir, reason }) => {
        const baseVersionRaw = readVersionAt(repoRoot, baseGitRef, appDir);
        const headVersionRaw = readVersionAt(repoRoot, headGitRef, appDir);
        const base = parseVersion(baseVersionRaw);
        const head = parseVersion(headVersionRaw);

        if (!base || !head) {
            return {
                app, appDir, reason, baseVersion: baseVersionRaw, headVersion: headVersionRaw,
                floorTarget: null, belowFloor: false, unparseable: true,
            };
        }

        const floorTarget = `${base.major}.${base.minor + 1}.0`;
        const meetsFloor = head.major > base.major || (head.major === base.major && head.minor > base.minor);

        return {
            app, appDir, reason, baseVersion: baseVersionRaw, headVersion: headVersionRaw,
            floorTarget, belowFloor: !meetsFloor, unparseable: false,
        };
    });

    // #1560 PR #1562 review RF-2: an unparseable/missing version used to report
    // belowFloor: false and be invisible to the caller's exit-code check (which only
    // looked at belowFloor.length) -- the floor for that app was never actually
    // established, but the command still exited 0 as if it had been. `invalid` is a
    // distinct collection so a caller (main() below, or the promoter script this is
    // built for) can treat "couldn't establish the floor" as its own failure, not a
    // silent skip folded into a false "floor met". Scoped to in-scope (changed) apps
    // only, same as `results` above (#1740) -- an unchanged app has no floor
    // obligation, so an unparseable version there is not a failure.
    return {
        results,
        belowFloor: results.filter((entry) => entry.belowFloor),
        invalid: results.filter((entry) => entry.unparseable),
        // #1740: apps skipped because nothing in them changed -- informational only,
        // never gates the exit code.
        unchanged: diffError ? [] : APPS.filter((app) => !changedApps.some((entry) => entry.app === app)),
        changedFiles,
        diffError,
    };
}

// --- CLI ---------------------------------------------------------------------

function printCheckResult(result) {
    if (result.skipped) {
        const message = result.reason === 'no-base-ref'
            ? 'No base ref resolvable -- skipping (not a PR context).'
            : 'No changed-app version-bump requirements apply (no apps/* or fan-out package changes).';
        console.log(`[check:app-versions] ${message}`);
        return;
    }

    for (const entry of result.appResults) {
        const label = entry.ok ? 'PASS' : 'FAIL';
        console.log(`[check:app-versions] [${label}] ${entry.app} (${entry.reason}): ${entry.detail}`);
    }

    if (result.ok) {
        console.log(`[check:app-versions] PASS. All changed apps satisfy mode "${result.mode}".`);
    } else {
        console.error(`[check:app-versions] FAIL. One or more changed apps do not satisfy mode "${result.mode}".`);
    }
}

function printFloorResult(result) {
    // #1740: a broken diff must read as a failure, never as a silent "nothing changed"
    // pass -- printed and returned before any of the (now-empty) scoping output below.
    if (result.diffError) {
        console.error(`[check:app-versions --floor] Could not compute the changed-file diff between the given refs -- treat as FAILED, not a clean floor pass: ${result.diffError}`);
        return;
    }

    // #1740: report scope before verdict, so a promoter reading this output can see
    // *why* an app is or isn't being evaluated, not just the pass/fail outcome.
    if (result.results.length === 0) {
        console.log('[check:app-versions --floor] No apps changed between the given refs -- nothing to bump.');
    } else {
        const scoped = result.results.map((entry) => `${entry.app} (${entry.reason})`).join(', ');
        console.log(`[check:app-versions --floor] Apps in scope (changed between the given refs): ${scoped}`);
    }
    if (result.unchanged.length > 0) {
        console.log(`[check:app-versions --floor] Apps skipped (unchanged -- no floor obligation): ${result.unchanged.join(', ')}`);
    }

    if (result.belowFloor.length === 0 && result.invalid.length === 0) {
        console.log('[check:app-versions --floor] All changed apps are at or above the minor floor.');
        return;
    }

    if (result.belowFloor.length > 0) {
        console.error('[check:app-versions --floor] Apps below the minor floor:');
        for (const entry of result.belowFloor) {
            console.error(`  - ${entry.app}: current ${entry.headVersion} -- minimum acceptable ${entry.floorTarget}`);
        }
    }

    // RF-2: printed as a failure, not "skipped" -- a version this command can't parse
    // means the floor for that app was never established, which is exactly the state
    // the promoter must not treat as "cleared".
    if (result.invalid.length > 0) {
        console.error('[check:app-versions --floor] Apps whose floor could not be established (malformed/missing version -- treat as FAILED, not skipped):');
        for (const entry of result.invalid) {
            console.error(`  - ${entry.app}: could not parse base="${entry.baseVersion}" head="${entry.headVersion}"`);
        }
    }
}

async function main() {
    const argv = process.argv.slice(2);

    if (argv.includes('--floor')) {
        const baseIdx = argv.indexOf('--base');
        const headIdx = argv.indexOf('--head');
        const baseGitRef = baseIdx !== -1 ? argv[baseIdx + 1] : null;
        const headGitRef = headIdx !== -1 ? argv[headIdx + 1] : null;

        if (!baseGitRef || !headGitRef) {
            console.error('[check:app-versions] --floor requires --base <ref> and --head <ref>.');
            process.exitCode = 1;
            return;
        }

        const result = runFloor({ repoRoot: REPO_ROOT, baseGitRef, headGitRef });
        printFloorResult(result);
        process.exitCode = (result.diffError || result.belowFloor.length > 0 || result.invalid.length > 0) ? 1 : 0;
        return;
    }

    const result = runCheck({ repoRoot: REPO_ROOT, staged: argv.includes('--staged') });

    // Phase 303 (#1695), LOG-ONLY: computed and printed BEFORE the old verdict below so both
    // appear together in the run's own output, but wrapped so nothing it does -- including a bug
    // in the reachability walk itself -- can ever change process.exitCode. CI still gates on
    // `result.ok` alone, exactly as it did before this shadow step existed.
    try {
        await runReachabilityShadowAudit(result);
    } catch (error) {
        console.error(`[check:app-versions] [SHADOW] audit threw unexpectedly (log-only, does not affect the gating verdict): ${error.message}`);
    }

    printCheckResult(result);
    process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    APPS,
    resolveBaseGitRef,
    readVersionAt,
    resolveFileDependencyPackages,
    parseVersion,
    compareVersionTuples,
    resolveMode,
    evaluateBump,
    detectChangedApps,
    runCheck,
    runFloor,
    // Phase 303 (#1695) shadow-mode exports -- kept separate from the functions above (which stay
    // untouched, sync, zero-behavior-change) so tests can exercise the reachability shadow step in
    // isolation without going through the CLI.
    fileExistsAtRef,
    computeReachabilityShadowVerdict,
    runReachabilityShadowAudit,
};
