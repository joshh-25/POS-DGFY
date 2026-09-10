#!/usr/bin/env node
/**
 * Conventional-Commits-derived version-level proposal (advisory) -- #1568, Wave 2 of epic #1548.
 *
 * scripts/check-app-version-bump.js (#1560) already enforces that a per-app version
 * *increased* by the correct magnitude for the PR's (base, head) mode, but it has no
 * opinion on which level (major/minor/patch) the diff's own commits actually call for
 * -- that's this script's job. It never reimplements "which app changed" detection:
 * every changed-app fact here comes from check-app-version-bump.js's own exported
 * detectChangedApps()/resolveFileDependencyPackages(), and the mode + pass/fail
 * columns come from its own exported runCheck() -- both imported, never re-derived.
 *
 * Level proposal, per ADR 0081 (pinned in #1568's own body):
 *   - major: a `!` after the Conventional Commits type, or a `BREAKING CHANGE:` /
 *     `BREAKING-CHANGE:` footer anywhere in the commit message
 *   - minor: a bare `feat` commit
 *   - patch: everything else, including a commit message that doesn't parse as
 *     Conventional Commits at all ("no parseable commits" is a default, not a skip)
 * A changed app's proposed level is the highest level among the commits attributable
 * to it -- a commit that touches apps/<app>/ directly, or touches a `file:` package
 * that app depends on (fan-out, same dependency read as check-app-version-bump.js).
 *
 * This script is purely advisory/informational: it never fails the build on its own
 * (see the CLI's exit code below) -- it exists to be read by a human/pr-reviewer, or
 * called as a function from pr-reviewer's own audit step or scripts/pr-checks.js.
 *
 * CLI:
 *   node scripts/propose-version-level.js --base <ref> --head <ref>
 *     Prints one row per changed app: proposed level | actual bump magnitude
 *     (comparing package.json versions at base vs head) | whether that actual bump
 *     satisfies the (base, head) mode check-app-version-bump.js would apply (its own
 *     pass/fail, reused wholesale). --head defaults to 'HEAD' if omitted.
 */

const { execSync } = require('child_process');
const path = require('path');

const {
    detectChangedApps,
    resolveFileDependencyPackages,
    parseVersion,
    runCheck,
} = require('./check-app-version-bump');

const REPO_ROOT = path.resolve(__dirname, '..');

const LEVEL_RANK = Object.freeze({ patch: 1, minor: 2, major: 3 });

const runCommand = (command, { allowFail = false, cwd = REPO_ROOT } = {}) => {
    try {
        return execSync(command, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd,
            maxBuffer: 1024 * 1024 * 32,
        }).trim();
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

// Per the Conventional Commits spec, a breaking-change footer is written either
// `BREAKING CHANGE:` or `BREAKING-CHANGE:`, anywhere in the commit message (not just
// the subject) -- checked case-insensitively against the whole message.
const BREAKING_FOOTER_RE = /^BREAKING[ -]CHANGE:/im;

// `type(scope)?(!)?: subject` -- matched against the subject line only. A subject
// that doesn't match (no colon-delimited type at all) yields type: null, which
// classifies as patch below, same as an unrecognized/non-feat type would.
const CONVENTIONAL_SUBJECT_RE = /^([A-Za-z]+)(\([^)]*\))?(!)?:\s*.*$/;

/**
 * Classifies one commit's full message (subject + body + footers) into the
 * Conventional-Commits type it carries (or null if unparseable) and the level that
 * commit, alone, calls for.
 */
function classifyCommitMessage(message) {
    const text = String(message || '');
    const subject = (text.split(/\r?\n/)[0] || '').trim();
    const match = CONVENTIONAL_SUBJECT_RE.exec(subject);
    const type = match ? match[1].toLowerCase() : null;
    const bang = Boolean(match && match[3]);
    const breakingFooter = BREAKING_FOOTER_RE.test(text);
    const breaking = bang || breakingFooter;

    let level;
    if (breaking) level = 'major';
    else if (type === 'feat') level = 'minor';
    else level = 'patch';

    return { type, bang, breakingFooter, breaking, level };
}

// Highest of two levels by LEVEL_RANK; either side may be null/undefined (no opinion
// yet), in which case the other side wins outright.
function higherLevel(a, b) {
    if (!a) return b;
    if (!b) return a;
    return LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a;
}

// One git log pass to list the commit SHAs in range, then one `git show` (full
// message) and one `git diff-tree` (changed files) per commit. Costs scale with
// commit count, same trade-off check-app-version-bump.js already makes elsewhere in
// this repo's PR-check scripts -- PRs are small, this is not a hot path.
function collectCommits(repoRoot, baseGitRef, headGitRef) {
    const shas = splitLines(runCommand(`git log ${baseGitRef}...${headGitRef} --format=%H`, { cwd: repoRoot, allowFail: true }));
    return shas.map((sha) => ({
        sha,
        message: runCommand(`git show -s --format=%B ${sha}`, { cwd: repoRoot, allowFail: true }),
        files: splitLines(runCommand(`git diff-tree --no-commit-id --name-only -r ${sha}`, { cwd: repoRoot, allowFail: true })),
    }));
}

// Actual bump magnitude between two package.json versions: the highest differing
// component ('major' | 'minor' | 'patch'), 'none' if identical, or null if either
// side is missing/unparseable (e.g. a new app with no base version at all).
function classifyVersionDelta(baseVersionRaw, headVersionRaw) {
    const base = parseVersion(baseVersionRaw);
    const head = parseVersion(headVersionRaw);
    if (!base || !head) return null;
    if (head.major > base.major) return 'major';
    if (head.minor > base.minor) return 'minor';
    if (head.patch > base.patch) return 'patch';
    return 'none';
}

/**
 * Proposes a Conventional-Commits-derived bump level per changed app for the
 * (baseGitRef, headGitRef) range, alongside check-app-version-bump.js's own
 * mode + pass/fail for the same range (reused, not re-derived).
 *
 * options:
 *   - repoRoot (default: this repo)
 *   - baseGitRef (required), headGitRef (default: 'HEAD')
 *   - changedFiles (default: `git diff --name-only base...head`) -- override for tests
 *   - commits (default: collectCommits(...)) -- override for tests;
 *     shape [{ sha, message, files }]
 *   - baseBranchName / headBranchName (default: GITHUB_BASE_REF / GITHUB_HEAD_REF env,
 *     forwarded to check-app-version-bump.js's runCheck() for the mode column -- this
 *     script never re-derives resolveMode()/evaluateBump() itself)
 *
 * Returns { baseGitRef, headGitRef, mode, rows }, rows: [{
 *   app, reason, proposedLevel, attributedCommits, actualBumpLevel, mode, modeSatisfied
 * }]. rows is [] when no app changed in range.
 *
 * Async since #1809 (Phase 324): check-app-version-bump.js's runCheck() (called below) is now
 * async, since it narrows through resolve-web-core-reachability.js's reachability oracle. This
 * script's own `detectChangedApps()` call (immediately below, line 168 pre-#1809) stays UNCHANGED
 * and unnarrowed, deliberately -- #1592 set this same precedent for its own sibling flip ("do not
 * touch scripts/propose-version-level.js"); this is a pure `await`/signature-follow migration, not
 * a logic change. See #1809's own residual-gap list: pr-reviewer's "Version level" audit could show
 * a proposed level for an app the now-narrowed runCheck() correctly excludes -- named, not fixed
 * here.
 */
async function proposeVersionLevels(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const baseGitRef = options.baseGitRef;
    const headGitRef = options.headGitRef || 'HEAD';

    if (!baseGitRef) {
        throw new Error('proposeVersionLevels requires options.baseGitRef');
    }

    const changedFiles = options.changedFiles !== undefined
        ? options.changedFiles
        : splitLines(runCommand(`git diff --name-only ${baseGitRef}...${headGitRef}`, { cwd: repoRoot, allowFail: true }));

    const changedApps = detectChangedApps(repoRoot, headGitRef, changedFiles).filter((entry) => entry.changed);

    // Reused wholesale for the mode + per-app pass/fail column -- same repoRoot,
    // baseGitRef, headGitRef, and changedFiles as above, so its own internal
    // detectChangedApps() call is guaranteed to land on the same changed-app set
    // computed just above (identical inputs, identical pure function).
    const bumpCheck = await runCheck({
        repoRoot,
        baseGitRef,
        headGitRef,
        changedFiles,
        baseBranchName: options.baseBranchName,
        headBranchName: options.headBranchName,
    });
    const bumpByApp = new Map(bumpCheck.appResults.map((entry) => [entry.app, entry]));

    if (changedApps.length === 0) {
        return { baseGitRef, headGitRef, mode: bumpCheck.mode, rows: [] };
    }

    const commits = options.commits !== undefined ? options.commits : collectCommits(repoRoot, baseGitRef, headGitRef);
    const classifiedCommits = commits.map((commit) => ({ ...commit, ...classifyCommitMessage(commit.message) }));

    const rows = changedApps.map((entry) => {
        const depPackages = resolveFileDependencyPackages(repoRoot, headGitRef, entry.appDir);

        let proposedLevel = null;
        let attributedCommits = 0;
        for (const commit of classifiedCommits) {
            const direct = commit.files.some((file) => file.startsWith(`${entry.appDir}/`));
            const fanOut = !direct && depPackages.some((pkgDir) => commit.files.some((file) => file.startsWith(`${pkgDir}/`)));
            if (!direct && !fanOut) continue;
            attributedCommits += 1;
            proposedLevel = higherLevel(proposedLevel, commit.level);
        }
        // No attributable/parseable commits (e.g. a squash-merged range with no
        // Conventional Commits history reachable) still gets a proposal -- patch,
        // per #1568's own "patch (otherwise, or no parseable commits)" rule.
        if (!proposedLevel) proposedLevel = 'patch';

        const bumpEntry = bumpByApp.get(entry.app) || null;
        const actualBumpLevel = bumpEntry ? classifyVersionDelta(bumpEntry.baseVersion, bumpEntry.headVersion) : null;

        return {
            app: entry.app,
            reason: entry.reason,
            proposedLevel,
            attributedCommits,
            actualBumpLevel,
            mode: bumpCheck.mode,
            modeSatisfied: bumpEntry ? bumpEntry.ok : null,
        };
    });

    return { baseGitRef, headGitRef, mode: bumpCheck.mode, rows };
}

// --- CLI / printing ------------------------------------------------------------

function formatBoolean(value) {
    if (value === null || value === undefined) return 'n/a';
    return value ? 'y' : 'n';
}

function printTable(result) {
    if (result.rows.length === 0) {
        console.log('[propose-version-level] No changed apps in this range -- nothing to propose.');
        return;
    }

    console.log(`[propose-version-level] mode: ${result.mode} (${result.baseGitRef}...${result.headGitRef})`);
    console.log('app | proposed level | actual bump | matches mode requirement y/n');
    for (const row of result.rows) {
        const actualBump = row.actualBumpLevel || 'n/a';
        console.log(`${row.app} | ${row.proposedLevel} | ${actualBump} | ${formatBoolean(row.modeSatisfied)}`);
    }
}

function parseArgs(argv) {
    const baseIdx = argv.indexOf('--base');
    const headIdx = argv.indexOf('--head');
    return {
        baseGitRef: baseIdx !== -1 ? argv[baseIdx + 1] : null,
        headGitRef: headIdx !== -1 ? argv[headIdx + 1] : 'HEAD',
    };
}

async function main() {
    const { baseGitRef, headGitRef } = parseArgs(process.argv.slice(2));
    if (!baseGitRef) {
        console.error('[propose-version-level] --base <ref> is required (--head defaults to HEAD).');
        process.exitCode = 1;
        return;
    }

    const result = await proposeVersionLevels({ repoRoot: REPO_ROOT, baseGitRef, headGitRef });
    printTable(result);
    // Advisory only -- this script never fails the build on its own, see header.
    process.exitCode = 0;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    LEVEL_RANK,
    classifyCommitMessage,
    classifyVersionDelta,
    collectCommits,
    higherLevel,
    proposeVersionLevels,
};
