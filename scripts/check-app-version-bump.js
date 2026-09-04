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
 *     to-staging/<candidate_id>. Lists every app below floor with its current
 *     (head) version and the minimum acceptable one (X.(Y+1).0). Exits non-zero
 *     iff at least one app is below floor.
 */

const { execSync } = require('child_process');
const path = require('path');

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
function resolveBaseGitRef(repoRoot, { baseBranchName } = {}) {
    const branch = baseBranchName !== undefined ? baseBranchName : process.env.GITHUB_BASE_REF;
    if (branch) {
        runCommand(`git fetch --no-tags --prune --depth=200 origin ${branch}`, { cwd: repoRoot, allowFail: true });
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
        baseGitRef = staged ? 'HEAD' : resolveBaseGitRef(repoRoot, { baseBranchName });
    }

    if (!baseGitRef) {
        return { ok: true, skipped: true, reason: 'no-base-ref', mode: null, baseGitRef: null, headGitRef, appResults: [] };
    }

    const changedFiles = options.changedFiles !== undefined
        ? options.changedFiles
        : splitLines(runCommand(
            staged ? 'git diff --cached --name-only' : `git diff --name-only ${baseGitRef}...${headGitRef}`,
            { cwd: repoRoot, allowFail: true },
        ));

    const mode = resolveMode(baseBranchName, headBranchName);
    const changedApps = detectChangedApps(repoRoot, headGitRef, changedFiles).filter((entry) => entry.changed);

    if (changedApps.length === 0) {
        return { ok: true, skipped: true, reason: 'no-app-changed', mode, baseGitRef, headGitRef, appResults: [] };
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
        appResults,
    };
}

/**
 * Standalone --floor mode: for every app (regardless of "changed" status -- there is
 * no PR diff in this mode), is headGitRef's version at least a minor above
 * baseGitRef's? Used by the promoter ahead of cutting to-staging/<candidate_id>.
 */
function runFloor({ repoRoot = REPO_ROOT, baseGitRef, headGitRef }) {
    const results = APPS.map((app) => {
        const appDir = `apps/${app}`;
        const baseVersionRaw = readVersionAt(repoRoot, baseGitRef, appDir);
        const headVersionRaw = readVersionAt(repoRoot, headGitRef, appDir);
        const base = parseVersion(baseVersionRaw);
        const head = parseVersion(headVersionRaw);

        if (!base || !head) {
            return {
                app, appDir, baseVersion: baseVersionRaw, headVersion: headVersionRaw,
                floorTarget: null, belowFloor: false, unparseable: true,
            };
        }

        const floorTarget = `${base.major}.${base.minor + 1}.0`;
        const meetsFloor = head.major > base.major || (head.major === base.major && head.minor > base.minor);

        return {
            app, appDir, baseVersion: baseVersionRaw, headVersion: headVersionRaw,
            floorTarget, belowFloor: !meetsFloor, unparseable: false,
        };
    });

    return { results, belowFloor: results.filter((entry) => entry.belowFloor) };
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
    if (result.belowFloor.length === 0) {
        console.log('[check:app-versions --floor] All apps at or above the minor floor.');
    } else {
        console.error('[check:app-versions --floor] Apps below the minor floor:');
        for (const entry of result.belowFloor) {
            console.error(`  - ${entry.app}: current ${entry.headVersion} -- minimum acceptable ${entry.floorTarget}`);
        }
    }

    const unparseable = result.results.filter((entry) => entry.unparseable);
    for (const entry of unparseable) {
        console.error(`[check:app-versions --floor] ${entry.app}: could not parse base="${entry.baseVersion}" head="${entry.headVersion}" -- skipped.`);
    }
}

function main() {
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
        process.exitCode = result.belowFloor.length > 0 ? 1 : 0;
        return;
    }

    const result = runCheck({ repoRoot: REPO_ROOT, staged: argv.includes('--staged') });
    printCheckResult(result);
    process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) main();

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
};
